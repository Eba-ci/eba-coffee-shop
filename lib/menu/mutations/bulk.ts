// Modifications en lot de produits (outils MCP `bulk_*`).
//
// Une seule transaction : on valide TOUT en amont (produits, catégorie et
// planning cibles) puis on écrit. Un id inconnu → rien n'est écrit. Valeurs
// ABSOLUES uniquement (rejouable sans effet), jamais de bascule ni de delta.

import { z } from 'zod';
import { BULK_PRODUCTS_MAX } from '@/config/constants';
import prisma from '@/lib/prisma';
import { triggerRestockAlerts } from '@/lib/restock-alerts';
import { reserveForScheduledOrdersSafe } from '@/lib/orders/stock-holds';
import { logStockSet } from '@/lib/stock-history/record';
import { productUpdateSchema } from './schemas';

const idField = z.string().min(1, 'Identifiant requis');

// Champs scalaires modifiables en lot. `supplementGroups` est exclu exprès
// (remplacement en masse trop risqué) ; `available` n'est pas dans
// `productUpdateSchema` (il a sa propre mutation unitaire).
export const bulkPatchSchema = productUpdateSchema
  .pick({
    price: true,
    featured: true,
    categoryId: true,
    requiresDeposit: true,
    preorderable: true,
    scheduleId: true,
    advanceOrderDays: true,
    unavailableUntil: true,
  })
  .extend({ available: z.boolean().optional() })
  .strict();

type BulkPatch = z.infer<typeof bulkPatchSchema>;

const nonEmpty = (p: BulkPatch) =>
  Object.values(p).some((v) => v !== undefined);
const NO_FIELD = 'Au moins un champ à modifier.';

const noDuplicateIds = (ids: string[]) => new Set(ids).size === ids.length;

export const bulkUpdateProductsSchema = z
  .object({
    dryRun: z.boolean().optional(),
    target: z
      .object({
        ids: z.array(idField).min(1).max(BULK_PRODUCTS_MAX).optional(),
        categoryId: idField.optional(),
      })
      .refine((t) => Boolean(t.ids) !== Boolean(t.categoryId), {
        message: 'Fournis soit `ids`, soit `categoryId`.',
      })
      .optional(),
    patch: bulkPatchSchema.refine(nonEmpty, NO_FIELD).optional(),
    items: z
      .array(bulkPatchSchema.extend({ id: idField }).refine(nonEmpty, NO_FIELD))
      .min(1)
      .max(BULK_PRODUCTS_MAX)
      .optional(),
  })
  .refine((v) => Boolean(v.target && v.patch) !== Boolean(v.items), {
    message: 'Fournis soit `target` + `patch`, soit `items`.',
  })
  .refine((v) => !v.items || noDuplicateIds(v.items.map((i) => i.id)), {
    message: 'Un produit ne peut apparaître qu’une fois dans `items`.',
  })
  .refine((v) => !v.target?.ids || noDuplicateIds(v.target.ids), {
    message: 'Un produit ne peut apparaître qu’une fois dans `target.ids`.',
  });

export type BulkUpdateProductsInput = z.infer<typeof bulkUpdateProductsSchema>;

export const bulkSetProductStockSchema = z.object({
  dryRun: z.boolean().optional(),
  items: z
    .array(
      z.object({
        id: idField,
        quantity: z.number().int().nonnegative().nullable(),
      })
    )
    .min(1)
    .max(BULK_PRODUCTS_MAX)
    .refine((items) => noDuplicateIds(items.map((i) => i.id)), {
      message: 'Un produit ne peut apparaître qu’une fois.',
    }),
});

export type BulkSetProductStockInput = z.infer<
  typeof bulkSetProductStockSchema
>;

type Change = { from: unknown; to: unknown };

function fail(prefix: string, ids: string[]): never {
  throw new Error(`${prefix} : ${ids.join(', ')}. Rien n’a été modifié.`);
}

/** Produits actifs pour ces ids ; lève (avant toute écriture) si l'un manque. */
async function loadByIds(ids: string[]) {
  const rows = await prisma.product.findMany({
    where: { id: { in: ids }, deletedAt: null },
  });
  const found = new Set(rows.map((r) => r.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) fail('Produits introuvables ou supprimés', missing);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)!);
}

async function assertTargets(patches: BulkPatch[]) {
  const categoryIds = new Set(
    patches.map((p) => p.categoryId).filter((v): v is string => !!v)
  );
  for (const id of categoryIds) {
    const c = await prisma.menuCategory.findUnique({
      where: { id },
      select: { deletedAt: true },
    });
    if (!c || c.deletedAt) fail('Catégorie cible introuvable', [id]);
  }
  const scheduleIds = new Set(
    patches.map((p) => p.scheduleId).filter((v): v is string => !!v)
  );
  for (const id of scheduleIds) {
    const s = await prisma.productSchedule.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!s) fail('Planning cible introuvable', [id]);
  }
}

const same = (a: unknown, b: unknown) =>
  (a instanceof Date ? a.toISOString() : (a ?? null)) ===
  (b instanceof Date ? b.toISOString() : (b ?? null));

function diff(row: Record<string, unknown>, patch: BulkPatch) {
  const changes: Record<string, Change> = {};
  for (const [key, to] of Object.entries(patch)) {
    if (to === undefined) continue;
    const from = row[key];
    const target =
      key === 'unavailableUntil' && to ? new Date(to as string) : to;
    if (!same(from, target)) {
      changes[key] = {
        from: from instanceof Date ? from.toISOString() : (from ?? null),
        to,
      };
    }
  }
  return changes;
}

export async function bulkUpdateProducts(input: BulkUpdateProductsInput) {
  const data = bulkUpdateProductsSchema.parse(input);
  const dryRun = data.dryRun ?? false;

  let rows;
  let patchOf: (id: string) => BulkPatch;
  if (data.items) {
    const byId = new Map(data.items.map(({ id, ...p }) => [id, p]));
    rows = await loadByIds(data.items.map((i) => i.id));
    patchOf = (id) => byId.get(id)!;
  } else if (data.target!.ids) {
    rows = await loadByIds(data.target!.ids);
    patchOf = () => data.patch!;
  } else {
    rows = await prisma.product.findMany({
      where: { categoryId: data.target!.categoryId, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
    });
    if (!rows.length)
      fail('Catégorie vide ou introuvable', [data.target!.categoryId!]);
    patchOf = () => data.patch!;
  }

  await assertTargets(rows.map((r) => patchOf(r.id)));

  const results = rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      patch: patchOf(r.id),
      changes: diff(r as unknown as Record<string, unknown>, patchOf(r.id)),
    }))
    .filter((r) => Object.keys(r.changes).length > 0);

  // Une précommande refusée mais un délai posé : `isPreorderable` donne la
  // priorité à `advanceOrderDays`, le produit reste donc précommandable.
  const warnings = results
    .filter((r) => {
      const row = rows.find((x) => x.id === r.id)!;
      const merged = { ...row, ...r.patch };
      return (
        (r.patch.preorderable !== undefined ||
          r.patch.advanceOrderDays !== undefined) &&
        merged.preorderable === false &&
        merged.advanceOrderDays != null
      );
    })
    .map(
      (r) =>
        `${r.name} : « précommande refusée » mais un délai est posé — le produit reste précommandable (advanceOrderDays l’emporte).`
    );

  const report = {
    dryRun,
    matched: rows.length,
    changed: results.length,
    results: results.map(({ id, name, changes }) => ({ id, name, changes })),
    warnings,
  };
  if (dryRun || results.length === 0) return report;

  await prisma.$transaction(async (tx) => {
    // Fin de la catégorie cible, comme `createProduct` (sinon l'ancien
    // `sortOrder` collerait le produit au milieu de sa nouvelle catégorie).
    const nextOrder = new Map<string, number>();
    for (const r of results) {
      const { available, unavailableUntil, categoryId, ...rest } = r.patch;
      const row = rows.find((x) => x.id === r.id)!;
      const moved = categoryId !== undefined && categoryId !== row.categoryId;
      let sortOrder: number | undefined;
      if (moved) {
        if (!nextOrder.has(categoryId)) {
          nextOrder.set(
            categoryId,
            await tx.product.count({
              where: { categoryId, deletedAt: null },
            })
          );
        }
        sortOrder = nextOrder.get(categoryId)!;
        nextOrder.set(categoryId, sortOrder + 1);
      }
      await tx.product.update({
        where: { id: r.id },
        data: {
          ...rest,
          ...(available !== undefined && { available }),
          ...(unavailableUntil !== undefined && {
            unavailableUntil: unavailableUntil
              ? new Date(unavailableUntil)
              : null,
          }),
          ...(moved && { categoryId, sortOrder }),
        },
      });
    }
  });

  if (results.some((r) => r.patch.unavailableUntil !== undefined)) {
    triggerRestockAlerts();
  }
  return report;
}

export async function bulkSetProductStock(input: BulkSetProductStockInput) {
  const { items, dryRun = false } = bulkSetProductStockSchema.parse(input);
  const rows = await loadByIds(items.map((i) => i.id));
  const target = new Map(items.map((i) => [i.id, i.quantity]));

  const results = rows
    .filter((r) => !same(r.stockQuantity, target.get(r.id)))
    .map((r) => ({
      id: r.id,
      name: r.name,
      from: r.stockQuantity ?? null,
      to: target.get(r.id) ?? null,
    }));

  const report = {
    dryRun,
    matched: rows.length,
    changed: results.length,
    results,
  };
  if (dryRun || results.length === 0) return report;

  await prisma.$transaction(async (tx) => {
    for (const r of results) {
      await tx.product.update({
        where: { id: r.id },
        data: { stockQuantity: r.to },
      });
      await logStockSet(tx, {
        kind: 'PRODUCT',
        resourceId: r.id,
        reason: 'BULK_SET',
        before: r.from,
        after: r.to,
        label: r.name,
      });
    }
  });
  triggerRestockAlerts();
  // Comme `setProductStock` : les programmées payées du jour prennent leur part.
  await reserveForScheduledOrdersSafe();
  return report;
}
