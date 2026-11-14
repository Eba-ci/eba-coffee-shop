-- Avoirs (lib/credits) : valeurs d'enum et tables additives, aucune donnée existante modifiée.
-- AlterEnum
ALTER TYPE "PaymentMode" ADD VALUE 'AVOIR';

-- AlterEnum
ALTER TYPE "RefundDelivery" ADD VALUE 'STORE_CREDIT';

-- CreateEnum
CREATE TYPE "CreditEntryKind" AS ENUM ('ISSUED', 'SPENT', 'RESTORED', 'CONVERTED', 'ADJUSTED');

-- AlterTable
ALTER TABLE "customer" ADD COLUMN     "creditBalance" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "order" ADD COLUMN     "creditApplied" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paymentCreditPart" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "refund" ADD COLUMN     "creditSourceId" TEXT;

-- CreateIndex
CREATE INDEX "refund_creditSourceId_idx" ON "refund"("creditSourceId");

-- CreateTable
CREATE TABLE "customer_credit_entry" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" "CreditEntryKind" NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "orderId" TEXT,
    "refundId" TEXT,
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_credit_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "minRemaining" INTEGER NOT NULL DEFAULT 1500,
    "maxPercent" INTEGER NOT NULL DEFAULT 70,
    "onlineEnabled" BOOLEAN NOT NULL DEFAULT false,
    "onlineDailyCap" INTEGER NOT NULL DEFAULT 5000,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_credit_entry_customerId_createdAt_idx" ON "customer_credit_entry"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "customer_credit_entry_orderId_idx" ON "customer_credit_entry"("orderId");

-- CreateIndex
CREATE INDEX "customer_credit_entry_refundId_idx" ON "customer_credit_entry"("refundId");

-- AddForeignKey
ALTER TABLE "customer_credit_entry" ADD CONSTRAINT "customer_credit_entry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
