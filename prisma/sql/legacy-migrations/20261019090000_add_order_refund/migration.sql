-- AlterTable
-- Remboursement automatique d'un paiement Jèko tardif (lib/jeko/refund.ts).
ALTER TABLE "order" ADD COLUMN "refundTransferId" TEXT,
ADD COLUMN "refundedAt" TIMESTAMP(3),
ADD COLUMN "refundAmount" INTEGER,
ADD COLUMN "refundFee" INTEGER;
