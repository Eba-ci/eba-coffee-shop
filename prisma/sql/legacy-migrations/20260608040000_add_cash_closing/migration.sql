-- CreateTable
CREATE TABLE "cash_closing" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "openingFloat" INTEGER NOT NULL DEFAULT 0,
    "countedCash" INTEGER NOT NULL DEFAULT 0,
    "cashSales" INTEGER NOT NULL DEFAULT 0,
    "cashExpenses" INTEGER NOT NULL DEFAULT 0,
    "expectedCash" INTEGER NOT NULL DEFAULT 0,
    "difference" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_closing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cash_closing_date_key" ON "cash_closing"("date");

-- CreateIndex
CREATE INDEX "cash_closing_date_idx" ON "cash_closing"("date" DESC);

-- AddForeignKey
ALTER TABLE "cash_closing" ADD CONSTRAINT "cash_closing_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
