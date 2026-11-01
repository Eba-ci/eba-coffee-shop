// lib/global-extras-mutations.ts
//
// CRUD des groupes/options « Extras globaux » : un supplément configuré UNE
// fois (ex. « Chantilly ») et proposé automatiquement sur TOUS les produits,
// sans devoir le rattacher à chacun (voir `SupplementGroup.isGlobal`,
// prisma/schema.prisma). Adressage par `id` (pas par nom comme les groupes
// propres à un produit dans `lib/menu-mutations.ts`), car ces groupes vivent
// dans leur propre écran admin plutôt que dans un formulaire produit.

import { z } from 'zod';
import prisma from '@/lib/prisma';
import {
  globalExtraGroupInputSchema,
  globalExtraGroupUpdateSchema,
  globalExtraOptionUpdateSchema,
  supplementGroupSchema,
  supplementOptionSchema,
  type GlobalExtraGroupInput,
  type GlobalExtraGroupUpdate,
  type GlobalExtraOptionUpdate,
  type SupplementGroupInput,
  type SupplementOptionInput,
} from '@/lib/schemas/menu';
import { syncSupplementGroups } from '@/lib/supplement-groups-sync';
import { lockStock } from '@/lib/stock-history/lock';
import { logCreated, logOptionsRemoved } from '@/lib/stock-history/lifecycle';
import { logStockSet } from '@/lib/stock-history/record';
import { triggerRestockAlerts } from '@/lib/restock-alerts';

export async function createGlobalExtraGroup(input: GlobalExtraGroupInput) {
  const data = globalExtraGroupInputSchema.parse(input);
  const existing = await prisma.supplementGroup.findMany({
    where: { isGlobal: true },
    select: { id: true },
  });
  return prisma.supplementGroup.create({
    data: {
      name: data.name,
      kind: data.kind ?? 'extra',
      type: data.type,
      required: data.required,
      available: data.available,
      minSelect: data.minSelect ?? null,
      maxSelect: data.maxSelect ?? null,
      sortOrder: existing.length,
      isGlobal: true,
      productId: null,
    },
  });
}

// Sauvegarde en bloc (écran admin « Extras globaux », sur le même modèle que
// `SupplementsEditor` produit) : remplace l'ensemble des groupes/options
// globaux par ceux fournis, upsert par nom (voir `syncSupplementGroups`). Pour
// une modification unitaire (ex. client MCP), préférer les fonctions
// `create/update/delete_global_extra_*` ci-dessous.
export async function updateGlobalExtraGroups(groups: SupplementGroupInput[]) {
  const parsed = z.array(supplementGroupSchema).parse(groups);
  const result = await prisma.$transaction((tx) =>
    syncSupplementGroups(tx, { isGlobal: true }, parsed)
  );
  // Un extra attendu est peut-être de retour (lib/restock-alerts.ts).
  triggerRestockAlerts();
  return result;
}

async function requireGlobalGroup(id: string) {
  const group = await prisma.supplementGroup.findUnique({ where: { id } });
  if (!group || !group.isGlobal) {
    throw new Error('Groupe d’extras global introuvable');
  }
  return group;
}

export async function updateGlobalExtraGroup(
  id: string,
  input: GlobalExtraGroupUpdate
) {
  const data = globalExtraGroupUpdateSchema.parse(input);
  await requireGlobalGroup(id);
  return prisma.supplementGroup.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.kind !== undefined && { kind: data.kind }),
      ...(data.required !== undefined && { required: data.required }),
      ...(data.available !== undefined && { available: data.available }),
      ...(data.minSelect !== undefined && { minSelect: data.minSelect }),
      ...(data.maxSelect !== undefined && { maxSelect: data.maxSelect }),
    },
  });
}

// Suppression définitive (pas de soft delete) : un groupe d'extras global est
// une configuration pure, sans historique de commande qui y référerait par id
// (les commandes le résolvent par nom, cf. lib/order-mutations.ts) — cascade
// sur ses options.
export async function deleteGlobalExtraGroup(id: string) {
  const group = await requireGlobalGroup(id);
  return prisma.$transaction(async (tx) => {
    const options = await tx.supplementOption.findMany({
      where: { groupId: id },
      select: { id: true, name: true, stockQuantity: true },
    });
    await logOptionsRemoved(
      tx,
      options.map((o) => ({
        ...o,
        label: `${group.name} · ${o.name}`,
      }))
    );
    return tx.supplementGroup.delete({ where: { id } });
  });
}

export async function createGlobalExtraOption(input: {
  groupId: string;
  option: SupplementOptionInput;
}) {
  const option = supplementOptionSchema.parse(input.option);
  const group = await requireGlobalGroup(input.groupId);
  // Ajout en fin de groupe : sans ce calcul, l'option prendrait le `sortOrder`
  // 0 par défaut et se placerait devant les options existantes.
  const last = await prisma.supplementOption.findFirst({
    where: { groupId: input.groupId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  return prisma.$transaction(async (tx) => {
    const created = await tx.supplementOption.create({
      data: {
        name: option.name,
        price: option.price,
        available: option.available,
        stockQuantity: option.stockQuantity ?? null,
        sortOrder: last ? last.sortOrder + 1 : 0,
        groupId: input.groupId,
      },
    });
    await logCreated(tx, 'OPTION', [
      {
        id: created.id,
        stockQuantity: created.stockQuantity,
        label: `${group.name} · ${created.name}`,
      },
    ]);
    return created;
  });
}

async function requireGlobalOption(id: string) {
  const option = await prisma.supplementOption.findUnique({
    where: { id },
    include: { group: true },
  });
  if (!option || !option.group.isGlobal) {
    throw new Error('Option d’extra global introuvable');
  }
  return option;
}

export async function updateGlobalExtraOption(
  id: string,
  input: GlobalExtraOptionUpdate
) {
  const data = globalExtraOptionUpdateSchema.parse(input);
  const current = await requireGlobalOption(id);
  const updated = await prisma.$transaction(async (tx) => {
    const stockBefore =
      data.stockQuantity !== undefined
        ? await lockStock(tx, 'OPTION', id)
        : undefined;
    const row = await tx.supplementOption.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.price !== undefined && { price: data.price }),
        ...(data.available !== undefined && { available: data.available }),
        ...(data.stockQuantity !== undefined && {
          stockQuantity: data.stockQuantity,
        }),
      },
    });
    if (stockBefore !== undefined) {
      await logStockSet(tx, {
        kind: 'OPTION',
        resourceId: id,
        reason: 'FORM_EDIT',
        before: stockBefore,
        after: data.stockQuantity ?? null,
        label: `${current.group.name} · ${row.name}`,
      });
    }
    return row;
  });
  if (data.stockQuantity !== undefined || data.available !== undefined) {
    triggerRestockAlerts();
  }
  return updated;
}

export async function deleteGlobalExtraOption(id: string) {
  const option = await requireGlobalOption(id);
  return prisma.$transaction(async (tx) => {
    await logOptionsRemoved(tx, [
      {
        id,
        stockQuantity: option.stockQuantity,
        label: `${option.group.name} · ${option.name}`,
      },
    ]);
    return tx.supplementOption.delete({ where: { id } });
  });
}
