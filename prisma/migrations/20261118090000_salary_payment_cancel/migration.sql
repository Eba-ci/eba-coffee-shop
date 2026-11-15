-- Annulation d'un versement de salaire (jamais supprimé).
ALTER TABLE "salary_payment"
  ADD COLUMN "canceledAt" TIMESTAMP(3),
  ADD COLUMN "canceledById" TEXT,
  ADD COLUMN "cancelReason" TEXT;
