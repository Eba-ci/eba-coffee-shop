-- CreateEnum
CREATE TYPE "WhatsAppMessageDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "WhatsAppMessageStatus" AS ENUM ('RECEIVED', 'PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "WhatsAppLinkSource" AS ENUM ('PHONE_MATCH', 'CLAIMED', 'STAFF');

-- CreateTable
CREATE TABLE "whatsapp_conversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "waId" TEXT,
    "customerId" TEXT,
    "linkSource" "WhatsAppLinkSource",
    "linkedAt" TIMESTAMP(3),
    "inboundVersion" INTEGER NOT NULL DEFAULT 0,
    "processedVersion" INTEGER NOT NULL DEFAULT 0,
    "lastInboundAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_message" (
    "id" TEXT NOT NULL,
    "wamid" TEXT,
    "conversationId" TEXT NOT NULL,
    "direction" "WhatsAppMessageDirection" NOT NULL,
    "type" TEXT NOT NULL,
    "body" TEXT,
    "payload" JSONB,
    "status" "WhatsAppMessageStatus" NOT NULL DEFAULT 'RECEIVED',
    "errorCode" INTEGER,
    "errorTitle" TEXT,
    "version" INTEGER,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_conversation_userId_key" ON "whatsapp_conversation"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_conversation_waId_key" ON "whatsapp_conversation"("waId");

-- CreateIndex
CREATE INDEX "whatsapp_conversation_customerId_idx" ON "whatsapp_conversation"("customerId");

-- CreateIndex
CREATE INDEX "whatsapp_conversation_lastInboundAt_idx" ON "whatsapp_conversation"("lastInboundAt");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_message_wamid_key" ON "whatsapp_message"("wamid");

-- CreateIndex
CREATE INDEX "whatsapp_message_conversationId_createdAt_idx" ON "whatsapp_message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "whatsapp_message_conversationId_version_idx" ON "whatsapp_message"("conversationId", "version");

-- CreateIndex
CREATE INDEX "whatsapp_message_createdAt_idx" ON "whatsapp_message"("createdAt");

-- AddForeignKey
ALTER TABLE "whatsapp_conversation" ADD CONSTRAINT "whatsapp_conversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_message" ADD CONSTRAINT "whatsapp_message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "whatsapp_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

