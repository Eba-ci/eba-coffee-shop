-- Brouillon d'achat/dépense (flux MCP prepare -> confirm, Phase 2 du refactor
-- dépenses/achats). Migration 100 % ADDITIVE (aucun DROP, aucun ALTER
-- destructif) : nouvelle table, aucune colonne existante touchée.
-- NB : si tu déploies via `db push`, cette migration n'est pas exécutée — le
-- schéma Prisma produit le même résultat.

CREATE TABLE "purchase_draft" (
  "id"          TEXT NOT NULL,
  "kind"        TEXT NOT NULL,
  "payload"     JSONB NOT NULL,
  "expiresAt"   TIMESTAMP(3) NOT NULL,
  "confirmedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "purchase_draft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "purchase_draft_expiresAt_idx" ON "purchase_draft"("expiresAt");

ALTER TABLE "purchase_draft"
  ADD CONSTRAINT "purchase_draft_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
