-- Réservations de stock par ressource pour les programmées du jour (lib/orders/stock-holds) :
-- table additive, aucune donnée existante modifiée.
-- CreateEnum
CREATE TYPE "StockHoldKind" AS ENUM ('PRODUCT', 'OPTION');

-- CreateTable
CREATE TABLE "order_stock_hold" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" "StockHoldKind" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_stock_hold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_stock_hold_orderId_kind_resourceId_key" ON "order_stock_hold"("orderId", "kind", "resourceId");

-- CreateIndex
CREATE INDEX "order_stock_hold_resourceId_idx" ON "order_stock_hold"("resourceId");

-- AddForeignKey
ALTER TABLE "order_stock_hold" ADD CONSTRAINT "order_stock_hold_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
