// prisma/resync-salary-expenses.ts
//
// Recalcule les lignes globales de masse salariale depuis les versements. Plus
// requis après la migration `salary_expense_aggregate` (elle regroupe elle-même
// les anciennes dépenses « miroir ») : sert à réparer une dérive, par exemple un
// versement qui n'a aucune ligne globale :
//
//   pnpm db:resync-salary-expenses
//
// Idempotent : sans effet si tout est à jour.

import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { resyncAllSalaryExpenses } from '@/lib/salaries/expense-sync';

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    const { keys } = await resyncAllSalaryExpenses(prisma as never);
    console.log(`Masse salariale recalculée : ${keys} jour(s)/mode(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
