-- AlterTable
-- Droit à l'effacement : date d'anonymisation d'une fiche client
-- (lib/customer-privacy.ts).
ALTER TABLE "customer" ADD COLUMN "anonymizedAt" TIMESTAMP(3);
