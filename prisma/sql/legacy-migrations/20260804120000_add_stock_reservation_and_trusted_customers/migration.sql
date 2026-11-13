-- Réservation de stock à l'entrée en cuisine + clients de confiance (ardoise).
--
-- 1. `order.stockReservedAt` — verrou d'idempotence de la réservation de stock.
--    Jusqu'ici le stock était décrémenté à l'ENCAISSEMENT. Il l'est désormais à
--    l'ENTRÉE EN CUISINE, or plusieurs chemins y mènent (encaissement d'une
--    commande NEW, envoi manuel sans paiement, création pour un client de
--    confiance) et certaines transitions sont réversibles (undo PREPARING → NEW,
--    restauration d'une annulée). Le statut seul ne peut donc pas dire si la
--    réservation a déjà eu lieu : cette colonne le dit. Verrou à sens unique,
--    jamais remis à NULL — pas même à l'annulation.
--
-- 2. `order.isOnAccount` — « ardoise » : commande partie en cuisine sans
--    encaissement. Ce n'est PAS un paiement (`isPaid` reste false, le CA n'est
--    pas impacté — cf. lib/stats.ts) ; le drapeau sert à ne plus traiter
--    l'impayé comme urgent en caisse.
--
-- 3. `customer.isTrusted` / `trustedSince` / `trustedNote` — client de confiance,
--    dont les commandes saisies en caisse partent directement en cuisine.
--
-- Migration 100 % additive (aucun DROP, aucune colonne existante modifiée), et
-- le backfill du point 4 est idempotent (garde `IS NULL`) : rejouable sans effet.

-- AlterTable
ALTER TABLE "order"
  ADD COLUMN "stockReservedAt" TIMESTAMP(3),
  ADD COLUMN "isOnAccount"     BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "customer"
  ADD COLUMN "isTrusted"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "trustedSince" TIMESTAMP(3),
  ADD COLUMN "trustedNote"  TEXT;

-- Ardoise : impayés tous jours confondus. L'égalité porte sur `isPaid`, d'où
-- l'ordre de colonnes inverse de l'index `order_status_isPaid_idx` existant.
CREATE INDEX "order_isPaid_status_idx" ON "order"("isPaid", "status");

-- 4. Backfill OBLIGATOIRE, exécuté ici pour qu'il ne puisse pas être oublié.
--
--    `stockReservedAt` naît à NULL sur TOUTES les lignes existantes — alors que
--    les commandes historiques payées ont DÉJÀ décrémenté leur stock sous
--    l'ancienne règle. Sans ce backfill, la première transition
--    `CANCELLED → PREPARING` (ou un undo suivi d'un renvoi en cuisine) sur une
--    de ces commandes décrémenterait le stock une SECONDE fois.
--
--    Ordre du COALESCE : l'entrée en cuisine est l'instant de réservation le
--    plus juste ; `paidAt` couvre les commandes payées sans entrée en cuisine
--    enregistrée ; `createdAt` est le dernier recours.
--
--    Restent volontairement à NULL : les commandes NEW impayées et les annulées
--    jamais préparées — elles n'ont effectivement jamais réservé de stock.
UPDATE "order"
SET "stockReservedAt" = COALESCE("preparingStartedAt", "paidAt", "createdAt")
WHERE "stockReservedAt" IS NULL
  AND ("isPaid" = true OR "status" IN ('PREPARING', 'READY', 'COMPLETED'));
