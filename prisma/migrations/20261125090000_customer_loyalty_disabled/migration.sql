-- Fidélité désactivable par client : `Customer.loyaltyDisabled` gèle le gain,
-- l'affichage et l'usage des récompenses pour ce client (tampons et récompenses
-- conservés). Défaut false : aucun comportement ne change pour les clients existants.
ALTER TABLE "customer" ADD COLUMN "loyaltyDisabled" BOOLEAN NOT NULL DEFAULT false;
