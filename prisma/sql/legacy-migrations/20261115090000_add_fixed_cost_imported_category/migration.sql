-- Clé d'idempotence de l'import des catégories FIXED en charges fixes (#433).
-- Idempotent (db:push peut rejouer) ; aucune donnée existante n'est modifiée.

-- AlterTable
ALTER TABLE "fixed_cost" ADD COLUMN IF NOT EXISTS "importedCategoryId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "fixed_cost_importedCategoryId_key" ON "fixed_cost"("importedCategoryId");
