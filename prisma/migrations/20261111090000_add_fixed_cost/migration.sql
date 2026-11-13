-- Idempotent (rejouée par scripts/db-pre-push.sh avant db push).

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "FixedCostPeriodicity" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "fixed_cost" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "periodicity" "FixedCostPeriodicity" NOT NULL DEFAULT 'MONTHLY',
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "categoryId" TEXT NOT NULL,
    "recurringExpenseId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixed_cost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "fixed_cost_recurringExpenseId_key" ON "fixed_cost"("recurringExpenseId");
CREATE INDEX IF NOT EXISTS "fixed_cost_categoryId_idx" ON "fixed_cost"("categoryId");
CREATE INDEX IF NOT EXISTS "fixed_cost_active_idx" ON "fixed_cost"("active");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "fixed_cost" ADD CONSTRAINT "fixed_cost_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "expense_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
