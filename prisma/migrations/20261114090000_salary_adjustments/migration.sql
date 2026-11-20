-- Primes et retenues datées (#443). Un ajustement n'est jamais supprimé :
-- `canceledAt` le sort des calculs en conservant l'historique.
CREATE TYPE "SalaryAdjustmentNature" AS ENUM ('PRIME', 'RETENUE');

CREATE TABLE "salary_adjustment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "nature" "SalaryAdjustmentNature" NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_adjustment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "salary_adjustment_employeeId_month_idx" ON "salary_adjustment"("employeeId", "month");
CREATE INDEX "salary_adjustment_month_idx" ON "salary_adjustment"("month");

ALTER TABLE "salary_adjustment" ADD CONSTRAINT "salary_adjustment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "salary_adjustment" ADD CONSTRAINT "salary_adjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;