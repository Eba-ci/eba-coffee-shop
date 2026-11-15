-- Journal du rapprochement dépense <-> échéance de charge fixe (#453).
-- CreateEnum
CREATE TYPE "FixedCostLinkAction" AS ENUM ('LINK', 'UNLINK');

-- CreateTable
CREATE TABLE "fixed_cost_link_event" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "fixedCostId" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "action" "FixedCostLinkAction" NOT NULL,
    "actorId" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fixed_cost_link_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fixed_cost_link_event_expenseId_idx" ON "fixed_cost_link_event"("expenseId");

-- CreateIndex
CREATE INDEX "fixed_cost_link_event_fixedCostId_dueDate_idx" ON "fixed_cost_link_event"("fixedCostId", "dueDate");
