// scripts/db-baseline-state.ts
//
// Dit si la baseline Prisma est enregistrée comme APPLIQUÉE dans la base.
//
//   pnpm exec tsx --env-file=.env scripts/db-baseline-state.ts
//
// Code de sortie : 0 = appliquée (et terminée), 1 = absente, en échec, ou
// table `_prisma_migrations` inconnue (base vierge).
//
// Pourquoi pas `prisma migrate status` ? Sur une base construite par l'ancien
// pipeline, l'historique diverge (migrations héritées non présentes dans le
// dépôt) : le statut cite alors la baseline comme « dernier point commun »
// même quand elle est déjà appliquée. Un `migrate resolve --applied` derrière
// échoue en P3008 et casse le déploiement.

import prisma from '@/lib/prisma';

const BASELINE = '20261113060000_baseline';

async function main() {
  const rows = await prisma.$queryRaw<{ applied: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM "_prisma_migrations"
      WHERE migration_name = ${BASELINE} AND finished_at IS NOT NULL
    ) AS applied
  `;
  process.exitCode = rows[0]?.applied ? 0 : 1;
}

main()
  .catch(() => {
    // Base vierge (pas de table) ou erreur de connexion : non appliquée.
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });