-- AlterTable
-- Précommande autorisée par produit. Défaut false : aucun produit n'est
-- précommandable tant qu'on ne l'a pas activé (les produits existants aussi).
ALTER TABLE "Product" ADD COLUMN "preorderable" BOOLEAN NOT NULL DEFAULT false;
