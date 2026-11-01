// lib/supplement-groups-sync.ts
//
// Synchronise un ensemble de groupes/options de suppléments par UPSERT
// (apparié par `name`) plutôt que par delete+recreate : les groupes/options
// dont le nom est conservé gardent leur `id`. Partagé par deux appelants :
// `updateSupplementGroups` (lib/menu-mutations.ts, scope = un produit) et
// `updateGlobalExtraGroups` (lib/global-extras-mutations.ts, scope = les
// groupes globaux « Extras »), pour ne pas dupliquer cette logique de diff.

import type { Prisma } from '@/generated/prisma/client';
import type { SupplementGroupInput } from '@/lib/schemas/menu';
import { lockStock } from '@/lib/stock-history/lock';
import { logCreated, logOptionsRemoved } from '@/lib/stock-history/lifecycle';
import { logStockSet } from '@/lib/stock-history/record';

export type SupplementGroupScope = { productId: string } | { isGlobal: true };

export async function syncSupplementGroups(
  tx: Prisma.TransactionClient,
  scope: SupplementGroupScope,
  groups: SupplementGroupInput[]
): Promise<void> {
  const currentGroups = await tx.supplementGroup.findMany({
    where: scope,
    include: { options: true },
  });
  const currentGroupByName = new Map(currentGroups.map((g) => [g.name, g]));
  const keepGroupNames = new Set(groups.map((g) => g.name));

  const removedGroupIds = currentGroups
    .filter((g) => !keepGroupNames.has(g.name))
    .map((g) => g.id);
  if (removedGroupIds.length > 0) {
    for (const g of currentGroups) {
      if (!removedGroupIds.includes(g.id)) continue;
      await logOptionsRemoved(
        tx,
        g.options.map((o) => ({
          id: o.id,
          stockQuantity: o.stockQuantity,
          label: `${g.name} · ${o.name}`,
        }))
      );
    }
    await tx.supplementGroup.deleteMany({
      where: { id: { in: removedGroupIds } },
    });
  }

  for (const [gi, g] of groups.entries()) {
    const groupData = {
      name: g.name,
      type: g.type,
      required: g.required,
      available: g.available,
      minSelect: g.minSelect ?? null,
      maxSelect: g.maxSelect ?? null,
      sortOrder: gi,
    };
    const match = currentGroupByName.get(g.name);

    if (!match) {
      const created = await tx.supplementGroup.create({
        include: { options: true },
        data: {
          ...groupData,
          kind: g.kind ?? 'extra',
          ...scope,
          options: {
            create: g.options.map((o, oi) => ({
              name: o.name,
              price: o.price,
              available: o.available,
              stockQuantity: o.stockQuantity ?? null,
              sortOrder: oi,
            })),
          },
        },
      });
      await logCreated(
        tx,
        'OPTION',
        created.options.map((o) => ({
          id: o.id,
          stockQuantity: o.stockQuantity,
          label: `${g.name} · ${o.name}`,
        }))
      );
      continue;
    }

    await tx.supplementGroup.update({
      where: { id: match.id },
      // `kind` absent = payload qui ne le connaît pas : on garde la valeur en base.
      data: { ...groupData, ...(g.kind !== undefined && { kind: g.kind }) },
    });

    // Appariement par nom, mais via une FILE par nom (pas une valeur
    // unique) : si le nom est dupliqué en base (données historiques —
    // c'est arrivé) ou soumis plusieurs fois, chaque option soumise ne
    // consomme qu'UNE ligne existante correspondante ; les lignes
    // restantes (nom disparu, ou surplus d'un doublon) sont supprimées
    // après coup. Une simple Map à valeur unique collapsait silencieusement
    // les doublons et rendait leur suppression impossible — un « goût »
    // désactivé dupliqué ne pouvait jamais être retiré, y compris en le
    // supprimant du formulaire et en sauvegardant (cf. le bug qui a bloqué
    // des paiements par ambiguïté de décrément, lib/order-mutations.ts).
    const currentOptionsByName = new Map<string, typeof match.options>();
    for (const o of match.options) {
      const queue = currentOptionsByName.get(o.name) ?? [];
      queue.push(o);
      currentOptionsByName.set(o.name, queue);
    }

    for (const [oi, o] of g.options.entries()) {
      const optionMatch = currentOptionsByName.get(o.name)?.shift();
      const optionData = {
        name: o.name,
        price: o.price,
        available: o.available,
        // L'ordre soumis fait foi : c'est celui que le client verra.
        sortOrder: oi,
      };
      if (optionMatch) {
        // `stockQuantity: undefined` = l'éditeur n'a pas touché ce champ
        // (cf. `fromUiGroup`, supplements-editor.tsx) : ne PAS l'écraser avec
        // la lecture figée au chargement de la page, qui effacerait un
        // décrément réel survenu depuis (vente passée en cuisine). Une
        // option NOUVELLE (branche `create` ci-dessous) n'a rien à perdre :
        // `?? null` s'y applique sans condition.
        const stockBefore =
          o.stockQuantity !== undefined
            ? await lockStock(tx, 'OPTION', optionMatch.id)
            : undefined;
        await tx.supplementOption.update({
          where: { id: optionMatch.id },
          data: {
            ...optionData,
            ...(o.stockQuantity !== undefined && {
              stockQuantity: o.stockQuantity,
            }),
          },
        });
        if (stockBefore !== undefined) {
          await logStockSet(tx, {
            kind: 'OPTION',
            resourceId: optionMatch.id,
            reason: 'FORM_EDIT',
            before: stockBefore,
            after: o.stockQuantity ?? null,
            label: `${g.name} · ${o.name}`,
          });
        }
      } else {
        const createdOption = await tx.supplementOption.create({
          data: {
            ...optionData,
            stockQuantity: o.stockQuantity ?? null,
            groupId: match.id,
          },
        });
        await logCreated(tx, 'OPTION', [
          {
            id: createdOption.id,
            stockQuantity: createdOption.stockQuantity,
            label: `${g.name} · ${o.name}`,
          },
        ]);
      }
    }

    const removedOptions = [...currentOptionsByName.values()].flat();
    const removedOptionIds = removedOptions.map((o) => o.id);
    if (removedOptionIds.length > 0) {
      await logOptionsRemoved(
        tx,
        removedOptions.map((o) => ({
          id: o.id,
          stockQuantity: o.stockQuantity,
          label: `${g.name} · ${o.name}`,
        }))
      );
      await tx.supplementOption.deleteMany({
        where: { id: { in: removedOptionIds } },
      });
    }
  }
}
