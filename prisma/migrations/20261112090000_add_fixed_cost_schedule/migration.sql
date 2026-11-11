-- Échéancier des charges fixes : échéances + liaison dépense ↔ occurrence.
-- Idempotent (db:push peut rejouer) ; aucune donnée existante n'est modifiée :
-- une charge sans échéance en reçoit une par défaut à la lecture.

-- AlterTable
ALTER TABLE "expense" ADD COLUMN IF NOT EXISTS "fixedCostId" TEXT;
ALTER TABLE "expense" ADD COLUMN IF NOT EXISTS "dueDate" DATE;

-- CreateTable
CREATE TABLE IF NOT EXISTS "fixed_cost_installment" (
    "id" TEXT NOT NULL,
    "fixedCostId" TEXT NOT NULL,
    "monthOffset" INTEGER NOT NULL DEFAULT 0,
    "day" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "fixed_cost_installment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "fixed_cost_installment_fixedCostId_monthOffset_day_key" ON "fixed_cost_installment"("fixedCostId", "monthOffset", "day");
CREATE INDEX IF NOT EXISTS "expense_fixedCostId_dueDate_idx" ON "expense"("fixedCostId", "dueDate");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "fixed_cost_installment" ADD CONSTRAINT "fixed_cost_installment_fixedCostId_fkey" FOREIGN KEY ("fixedCostId") REFERENCES "fixed_cost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "expense" ADD CONSTRAINT "expense_fixedCostId_fkey" FOREIGN KEY ("fixedCostId") REFERENCES "fixed_cost"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
