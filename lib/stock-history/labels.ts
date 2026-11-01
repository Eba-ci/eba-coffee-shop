// lib/stock-history/labels.ts
//
// Libellé COURANT d'un goût / supplément : « Produit · Groupe · Option » (groupe
// global : « Groupe · Option »). Le libellé figé dans le journal est un instantané ;
// les lignes écrites avant que le nom du produit y figure s'affichent donc avec
// celui d'aujourd'hui tant que l'option existe encore. Option supprimée : on garde
// l'instantané.

import prisma from '@/lib/prisma';

export async function currentOptionLabels(
  ids: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await prisma.supplementOption.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      name: true,
      group: { select: { name: true, product: { select: { name: true } } } },
    },
  });
  return new Map(
    rows.map((o) => [
      o.id,
      [o.group.product?.name, o.group.name, o.name].filter(Boolean).join(' · '),
    ])
  );
}
