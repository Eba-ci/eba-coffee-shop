// prisma/backfill-stock-baseline.ts
//
// Relevé de départ du journal de stock : une ligne `BASELINE` pour chaque produit
// ou goût à stock suivi qui n'a encore aucun mouvement journalisé. Sans lui, la
// première ligne d'historique d'un élément n'a pas de point de comparaison et le
// contrôle d'angles morts le signale « sans relevé de départ ».
//
// Idempotent : un élément déjà présent dans le journal est ignoré. Le même geste
// existe dans l'application (Menu > Historique du stock, ADMIN/MANAGER).

import { fileURLToPath } from 'node:url';
import prisma from '@/lib/prisma';
import { recordStockBaseline } from '@/lib/stock-history/audit';

async function main() {
  try {
    const count = await recordStockBaseline();
    console.log(`Relevé de départ du stock : ${count} ligne(s) posée(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

const isDirectRun =
  // @ts-expect-error -- propriété Bun-spécifique non typée
  import.meta.main === true ||
  (typeof process !== 'undefined' &&
    process.argv[1] === fileURLToPath(import.meta.url));

if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
