-- CreateEnum
CREATE TYPE "StockMovementSource" AS ENUM ('STAFF', 'MCP', 'SYSTEM');

-- CreateEnum
CREATE TYPE "StockMovementReason" AS ENUM ('BASELINE', 'ORDER_KITCHEN', 'HOLD_RESERVE', 'HOLD_RELEASE', 'ORDER_EDIT_ADD', 'ORDER_EDIT_REMOVE', 'SHORTAGE_COVER', 'REFUND_RESTOCK', 'EXPIRY_RELEASE', 'MANUAL_RESTOCK', 'MANUAL_SET', 'BULK_SET', 'FORM_EDIT', 'CREATED', 'OPTION_REMOVED', 'ANOMALY');

-- CreateTable
CREATE TABLE "stock_movement" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" "StockHoldKind" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "reason" "StockMovementReason" NOT NULL,
    "source" "StockMovementSource" NOT NULL DEFAULT 'STAFF',
    "delta" INTEGER,
    "before" INTEGER,
    "after" INTEGER,
    "orderId" TEXT,
    "refundId" TEXT,
    "actorId" TEXT,
    "note" TEXT,

    CONSTRAINT "stock_movement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_movement_resourceId_createdAt_idx" ON "stock_movement"("resourceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "stock_movement_orderId_idx" ON "stock_movement"("orderId");

-- CreateIndex
CREATE INDEX "stock_movement_createdAt_idx" ON "stock_movement"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "stock_movement_reason_createdAt_idx" ON "stock_movement"("reason", "createdAt" DESC);
