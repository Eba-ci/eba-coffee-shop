-- Modèle de données des salaires (admin seul) : employés, taux datés et
-- versements. Idempotent (db:push peut rejouer) ; aucune table existante n'est
-- modifiée. Les règles de calcul vivent dans lib/salaries/ (pures).

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "SalaryPaymentType" AS ENUM ('SALAIRE', 'ACOMPTE', 'AVANCE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "employee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "salary_rate" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "monthlyAmount" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "salary_payment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "month" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" "SalaryPaymentType" NOT NULL,
    "paymentMethod" "ExpensePaymentMethod" NOT NULL DEFAULT 'CASH',
    "recoveryMonths" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "idempotencyKey" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "employee_active_idx" ON "employee"("active");
CREATE UNIQUE INDEX IF NOT EXISTS "salary_rate_employeeId_startDate_key" ON "salary_rate"("employeeId", "startDate");
CREATE INDEX IF NOT EXISTS "salary_payment_employeeId_month_idx" ON "salary_payment"("employeeId", "month");
CREATE INDEX IF NOT EXISTS "salary_payment_month_idx" ON "salary_payment"("month");
CREATE INDEX IF NOT EXISTS "salary_payment_date_idx" ON "salary_payment"("date");
CREATE UNIQUE INDEX IF NOT EXISTS "salary_payment_idempotencyKey_key" ON "salary_payment"("idempotencyKey");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "salary_rate" ADD CONSTRAINT "salary_rate_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "salary_payment" ADD CONSTRAINT "salary_payment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "salary_payment" ADD CONSTRAINT "salary_payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
