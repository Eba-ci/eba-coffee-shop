-- Paiement fractionné : une commande payée peut désormais être réglée en
-- plusieurs lignes (modes différents), à condition que leur somme égale
-- exactement le total de la commande (pas de paiement partiel). `order.
-- paymentMode` reste renseigné pour le cas courant (1 seule ligne) et devient
-- NULL pour un paiement fractionné (2+ modes) — cf.
-- lib/order-mutations.ts::setOrderPayment.
-- Migration 100 % additive (aucun DROP, aucune colonne existante modifiée).

CREATE TABLE "order_payment" (
  "id"          TEXT NOT NULL,
  "orderId"     TEXT NOT NULL,
  "mode"        "PaymentMode" NOT NULL,
  "amount"      INTEGER NOT NULL,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "order_payment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_payment_orderId_idx" ON "order_payment"("orderId");
CREATE INDEX "order_payment_mode_idx" ON "order_payment"("mode");

ALTER TABLE "order_payment"
  ADD CONSTRAINT "order_payment_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "order"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_payment"
  ADD CONSTRAINT "order_payment_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Rétro-remplissage : une ligne par commande déjà payée avec un mode unique
-- (tout le passif du système actuel, avant l'existence des paiements
-- fractionnés) — nécessaire pour que les stats (revenueByPaymentMode),
-- désormais calculées depuis cette table, restent correctes sur l'historique.
-- Id déterministe ('legacy-' || id de la commande) plutôt que
-- gen_random_uuid() : évite toute dépendance à la version de PostgreSQL, et
-- reste unique puisque `orderId` était unique avant ce rétro-remplissage (une
-- seule ligne par commande).
INSERT INTO "order_payment" ("id", "orderId", "mode", "amount", "createdAt")
SELECT
  'legacy-' || "id",
  "id",
  "paymentMode",
  "total",
  COALESCE("paidAt", "createdAt")
FROM "order"
WHERE "isPaid" = true AND "paymentMode" IS NOT NULL;
