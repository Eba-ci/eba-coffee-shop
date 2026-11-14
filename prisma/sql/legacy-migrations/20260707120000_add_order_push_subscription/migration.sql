-- Abonnements push côté CLIENT (page publique de suivi) : `userId` devient
-- optionnel (un abonnement est soit staff, soit client) et `orderId` relie
-- l'appareil du client à la commande dont il suit les statuts.

-- AlterTable
ALTER TABLE "push_subscription" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "push_subscription" ADD COLUMN "orderId" TEXT;

-- CreateIndex
CREATE INDEX "push_subscription_orderId_idx" ON "push_subscription"("orderId");

-- AddForeignKey
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
