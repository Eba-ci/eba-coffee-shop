-- Clé d'idempotence des règlements de charges fixes en lot. Nullable : les
-- dépenses existantes n'en ont pas. Idempotent (db:push peut rejouer).

-- AlterTable
ALTER TABLE "expense" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "expense_idempotencyKey_key" ON "expense"("idempotencyKey");
