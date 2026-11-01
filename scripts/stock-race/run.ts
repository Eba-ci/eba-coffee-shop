// pnpm test:race — scénarios de concurrence du stock sur une base Postgres JETABLE.
// Voir scripts/stock-race/README.md.

import prisma from '@/lib/prisma';
import { runAll } from './scenarios';

// Ces scénarios créent des centaines de commandes et de mouvements : on refuse toute
// base qui n'est pas explicitement jetable (staging et production comprises).
const dbName = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? '').pathname.slice(1);
  } catch {
    return '';
  }
})();
if (!/race|test/i.test(dbName)) {
  console.error(
    `Refus : la base « ${dbName || '?'} » n'est pas jetable. Utilisez une base dont le nom contient « race » ou « test » (ex. eba_race).`
  );
  process.exit(2);
}

runAll()
  .then(async (failures) => {
    await prisma.$disconnect();
    console.log(
      failures === 0
        ? '\nTous les scénarios passent.'
        : `\n${failures} échec(s).`
    );
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
