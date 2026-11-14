-- CreateEnum
CREATE TYPE "LoyaltyRewardStatus" AS ENUM ('AVAILABLE', 'USED');

-- CreateEnum
CREATE TYPE "LoyaltyEventType" AS ENUM ('STAMP_EARNED', 'REWARD_EARNED', 'REWARD_USED', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "customer" ADD COLUMN "stampCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastStampDate" DATE;

-- CreateTable
CREATE TABLE "loyalty_reward" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "capAmount" INTEGER NOT NULL,
    "status" "LoyaltyRewardStatus" NOT NULL DEFAULT 'AVAILABLE',
    "earnedOrderId" TEXT,
    "usedOrderId" TEXT,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "loyalty_reward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_ledger" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "LoyaltyEventType" NOT NULL,
    "stamps" INTEGER NOT NULL DEFAULT 0,
    "orderId" TEXT,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "minOrderAmount" INTEGER NOT NULL DEFAULT 1000,
    "stampsPerCard" INTEGER NOT NULL DEFAULT 10,
    "tier1Stamps" INTEGER NOT NULL DEFAULT 5,
    "tier1RewardCap" INTEGER NOT NULL DEFAULT 1000,
    "tier2RewardCap" INTEGER NOT NULL DEFAULT 2500,
    "oneStampPerDay" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "loyalty_reward_customerId_status_idx" ON "loyalty_reward"("customerId", "status");

-- CreateIndex
CREATE INDEX "loyalty_ledger_customerId_idx" ON "loyalty_ledger"("customerId");

-- AddForeignKey
ALTER TABLE "loyalty_reward" ADD CONSTRAINT "loyalty_reward_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_ledger" ADD CONSTRAINT "loyalty_ledger_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
