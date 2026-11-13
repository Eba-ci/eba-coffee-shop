-- Lien versement de salaire ↔ dépense : une ligne de dépense par versement
-- (catégorie « Salaires », sans numéro de reçu). Idempotent (db:push peut
-- rejouer) ; aucune donnée existante n'est modifiée.

-- AlterTable
ALTER TABLE "expense" ADD COLUMN IF NOT EXISTS "salaryPaymentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "expense_salaryPaymentId_key" ON "expense"("salaryPaymentId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "expense" ADD CONSTRAINT "expense_salaryPaymentId_fkey" FOREIGN KEY ("salaryPaymentId") REFERENCES "salary_payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
