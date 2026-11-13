-- AlterTable
ALTER TABLE "product" ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "featuredBadge" TEXT,
ADD COLUMN     "featuredOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "product_featured_featuredOrder_idx" ON "product"("featured", "featuredOrder");
