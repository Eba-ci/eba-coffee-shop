-- Deux comptes Jèko (A = existant, B = second) : additif, les lignes existantes
-- passent sur le compte A.
ALTER TABLE "order" ADD COLUMN "jekoAccount" TEXT NOT NULL DEFAULT 'A';
ALTER TABLE "jeko_withdrawal" ADD COLUMN "jekoAccount" TEXT NOT NULL DEFAULT 'A';

CREATE TABLE "jeko_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "activeAccount" TEXT NOT NULL DEFAULT 'A',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jeko_settings_pkey" PRIMARY KEY ("id")
);
