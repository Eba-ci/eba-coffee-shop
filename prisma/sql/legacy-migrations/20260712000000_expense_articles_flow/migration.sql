-- Réglages du module dépenses + référentiel d'articles + détail par article
-- des dépenses (ExpenseItem) + nature fixe/variable des catégories.
--
-- Migration 100 % ADDITIVE (aucun DROP, aucun ALTER destructif) : les dépenses
-- existantes et leur numérotation de reçu ne sont pas touchées. Compatible avec
-- l'ancien code (colonnes nouvelles avec défaut, tables nouvelles ignorées).
-- NB : si tu déploies via `db push`, la migration n'est pas exécutée — le
-- schéma Prisma produit le même résultat. Après déploiement, lance
-- `pnpm db:backfill-expense-items` pour générer le détail des dépenses déjà
-- liées à des achats d'inventaire.

-- 1) Réglages du module dépenses (singleton), calque de LoyaltySettings /
-- InventorySettings.
CREATE TABLE "expense_settings" (
  "id" TEXT NOT NULL DEFAULT 'singleton',
  "freqWindowDays" INTEGER NOT NULL DEFAULT 30,
  "freqMinCount" INTEGER NOT NULL DEFAULT 3,
  "cumulativeMinAmount" INTEGER NOT NULL DEFAULT 20000,
  "priceAberrantFactor" INTEGER NOT NULL DEFAULT 3,
  "draftTtlMinutes" INTEGER NOT NULL DEFAULT 10,
  "recurrenceSuggestMinHits" INTEGER NOT NULL DEFAULT 3,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "expense_settings_pkey" PRIMARY KEY ("id")
);

-- 2) Nature (fixe/variable) portée par la catégorie. Défaut VARIABLE : les
-- catégories existantes restent classées « variables », l'admin reclasse
-- Loyer/Salaires/Abonnements dans l'UI.
CREATE TYPE "ExpenseNature" AS ENUM ('FIXED', 'VARIABLE');
ALTER TABLE "expense_category"
  ADD COLUMN "nature" "ExpenseNature" NOT NULL DEFAULT 'VARIABLE';

-- 3) Référentiel d'articles de dépense (« Farine T45 », « Sucre », « Gaz »…).
CREATE TABLE "expense_article" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "baseUnit" TEXT,
  "trackInventory" BOOLEAN NOT NULL DEFAULT false,
  "inventoryItemId" TEXT,
  "location" TEXT,
  "bulkPurchase" BOOLEAN NOT NULL DEFAULT false,
  "bulkPurchaseAt" TIMESTAMP(3),
  "wholesaleRefPrice" INTEGER,
  "archivedAt" TIMESTAMP(3),
  "mergedIntoId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "expense_article_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "expense_article_normalizedName_key" ON "expense_article"("normalizedName");
CREATE UNIQUE INDEX "expense_article_inventoryItemId_key" ON "expense_article"("inventoryItemId");
CREATE INDEX "expense_article_archivedAt_idx" ON "expense_article"("archivedAt");
CREATE INDEX "expense_article_bulkPurchase_idx" ON "expense_article"("bulkPurchase");

-- Auto-référence (fusion d'articles en doublon).
ALTER TABLE "expense_article"
  ADD CONSTRAINT "expense_article_mergedIntoId_fkey"
  FOREIGN KEY ("mergedIntoId") REFERENCES "expense_article"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- FK conditionnelle : `inventory_item` a été créée via `db push` (pas de
-- dossier de migration). En prod elle existe ; sur une base vierge rejouée
-- depuis l'historique des migrations, elle n'existe pas encore — le `db push`
-- de synchronisation posera alors la contrainte.
DO $$
BEGIN
  IF to_regclass('"inventory_item"') IS NOT NULL THEN
    ALTER TABLE "expense_article"
      ADD CONSTRAINT "expense_article_inventoryItemId_fkey"
      FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_item"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 4) Alias de saisie (libellé fournisseur, orthographe alternative…).
CREATE TABLE "article_alias" (
  "id"          TEXT NOT NULL,
  "alias"       TEXT NOT NULL,
  "supplierKey" TEXT,
  "articleId"   TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "article_alias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "article_alias_alias_supplierKey_key" ON "article_alias"("alias", "supplierKey");
CREATE INDEX "article_alias_articleId_idx" ON "article_alias"("articleId");

ALTER TABLE "article_alias"
  ADD CONSTRAINT "article_alias_articleId_fkey"
  FOREIGN KEY ("articleId") REFERENCES "expense_article"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 5) Lignes de détail optionnelles d'une dépense. Si des lignes existent,
-- sum(amount) == expense.amount (invariant imposé par les mutations).
CREATE TABLE "expense_item" (
  "id"              TEXT NOT NULL,
  "expenseId"       TEXT NOT NULL,
  "articleId"       TEXT,
  "rawLabel"        TEXT NOT NULL,
  "label"           TEXT,
  "qtyBase"         DECIMAL(12,3),
  "formatQty"       DECIMAL(12,3),
  "formatSize"      DECIMAL(12,3),
  "unit"            TEXT,
  "unitPrice"       INTEGER,
  "amount"          INTEGER NOT NULL,
  "pendingQuantity" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "expense_item_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "expense_item_expenseId_idx" ON "expense_item"("expenseId");
CREATE INDEX "expense_item_articleId_idx" ON "expense_item"("articleId");

ALTER TABLE "expense_item"
  ADD CONSTRAINT "expense_item_expenseId_fkey"
  FOREIGN KEY ("expenseId") REFERENCES "expense"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "expense_item"
  ADD CONSTRAINT "expense_item_articleId_fkey"
  FOREIGN KEY ("articleId") REFERENCES "expense_article"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
