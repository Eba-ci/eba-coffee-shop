-- Masse salariale : une dépense GLOBALE par jour de versement et par mode
-- (`expense.salaryAggregateKey`), portée par plusieurs versements
-- (`salary_payment.expenseId`, 1:N). Les anciennes dépenses « miroir » (une par
-- versement) sont des données dérivées : on les retire, puis
-- `pnpm db:resync-salary-expenses` recrée les lignes globales depuis les
-- versements (aucun versement n'est touché).
DELETE FROM "expense" WHERE "salaryPaymentId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "expense" DROP CONSTRAINT "expense_salaryPaymentId_fkey";

-- DropIndex
DROP INDEX "expense_salaryPaymentId_key";

-- AlterTable
ALTER TABLE "salary_payment" ADD COLUMN     "expenseId" TEXT;

-- AlterTable
ALTER TABLE "expense" DROP COLUMN "salaryPaymentId",
ADD COLUMN     "salaryAggregateKey" TEXT;

-- CreateIndex
CREATE INDEX "salary_payment_expenseId_idx" ON "salary_payment"("expenseId");

-- CreateIndex
CREATE INDEX "salary_payment_date_paymentMethod_idx" ON "salary_payment"("date", "paymentMethod");

-- CreateIndex
CREATE UNIQUE INDEX "expense_salaryAggregateKey_key" ON "expense"("salaryAggregateKey");

-- AddForeignKey
ALTER TABLE "salary_payment" ADD CONSTRAINT "salary_payment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

