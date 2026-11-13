-- Remboursements (lib/refunds) : tables additives, aucune donnée existante modifiée.
-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PROCESSING', 'UNCERTAIN', 'FAILED', 'PAID', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RefundDelivery" AS ENUM ('JEKO_TRANSFER', 'MANUAL');

-- CreateEnum
CREATE TYPE "RefundReason" AS ENUM ('PRODUCT_UNAVAILABLE', 'QUALITY', 'PRICE_ERROR', 'DOUBLE_PAYMENT', 'CUSTOMER_CHANGED_MIND', 'LATE_PAYMENT', 'COMMERCIAL_GESTURE', 'OTHER');

-- CreateEnum
CREATE TYPE "RefundSource" AS ENUM ('STAFF', 'AUTO_LATE');

-- CreateEnum
CREATE TYPE "RefundLineKind" AS ENUM ('PRODUCT', 'SUPPLEMENT');

-- CreateTable
CREATE TABLE "refund" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" "RefundReason" NOT NULL,
    "note" TEXT,
    "source" "RefundSource" NOT NULL DEFAULT 'STAFF',
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "delivery" "RefundDelivery" NOT NULL,
    "channel" "PaymentMode" NOT NULL,
    "destinationPhone" TEXT,
    "customerId" TEXT,
    "customerName" TEXT,
    "requestedById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "payoutDate" DATE,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "jekoTransferId" TEXT,
    "feeFcfa" INTEGER NOT NULL DEFAULT 0,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "restockItems" BOOLEAN NOT NULL DEFAULT false,
    "stockRestoredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_line" (
    "id" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "RefundLineKind" NOT NULL,
    "groupName" TEXT,
    "optionName" TEXT,
    "quantity" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "refund_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_event" (
    "id" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "actorId" TEXT,
    "fromStatus" "RefundStatus",
    "toStatus" "RefundStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "refund_orderId_idx" ON "refund"("orderId");

-- CreateIndex
CREATE INDEX "refund_status_idx" ON "refund"("status");

-- CreateIndex
CREATE INDEX "refund_payoutDate_idx" ON "refund"("payoutDate");

-- CreateIndex
CREATE INDEX "refund_line_refundId_idx" ON "refund_line"("refundId");

-- CreateIndex
CREATE INDEX "refund_event_refundId_idx" ON "refund_event"("refundId");

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_line" ADD CONSTRAINT "refund_line_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "refund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_event" ADD CONSTRAINT "refund_event_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "refund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_event" ADD CONSTRAINT "refund_event_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

