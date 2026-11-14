-- AlterTable
ALTER TABLE "menu_category" ADD COLUMN     "scheduleId" TEXT;

-- AlterTable
ALTER TABLE "product" ADD COLUMN     "scheduleId" TEXT;

-- CreateTable
CREATE TABLE "product_schedule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "days" INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_weekly_special" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_weekly_special_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_weekly_special_productId_idx" ON "product_weekly_special"("productId");

-- AddForeignKey
ALTER TABLE "menu_category" ADD CONSTRAINT "menu_category_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "product_schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "product_schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_weekly_special" ADD CONSTRAINT "product_weekly_special_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

