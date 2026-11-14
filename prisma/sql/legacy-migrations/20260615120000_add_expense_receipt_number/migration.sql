-- Numérotation des reçus de dépense (DEP-YYYY-MM-NNNN), avec rétroactivité.
--
-- Les colonnes restent NULLABLE (pour rester compatibles avec un `db push` sur
-- une base déjà remplie). On BACKFILL tout de même les lignes existantes ici,
-- pour les déploiements qui passent par `migrate deploy` :
--   1) ajout des colonnes ;
--   2) backfill chronologique par mois civil de la `date`
--      (ordre date ASC, createdAt ASC, id ASC) ;
--   3) contraintes d'unicité (après le backfill pour éviter tout conflit).
-- NB : si tu déploies via `db push`, la migration n'est pas exécutée — lance
-- alors `pnpm db:backfill-expense-receipts` pour numéroter l'existant.

-- 1) Colonnes (nullable)
ALTER TABLE "expense" ADD COLUMN "receiptNo" TEXT;
ALTER TABLE "expense" ADD COLUMN "receiptPeriod" TEXT;
ALTER TABLE "expense" ADD COLUMN "receiptSeq" INTEGER;

-- 2) Backfill rétroactif : compteur remis à zéro chaque mois civil de la date.
WITH numbered AS (
  SELECT
    "id",
    to_char("date", 'YYYY-MM') AS period,
    ROW_NUMBER() OVER (
      PARTITION BY to_char("date", 'YYYY-MM')
      ORDER BY "date" ASC, "createdAt" ASC, "id" ASC
    ) AS seq
  FROM "expense"
)
UPDATE "expense" e
SET
  "receiptPeriod" = n.period,
  "receiptSeq" = n.seq,
  "receiptNo" = 'DEP-' || n.period || '-' || lpad(n.seq::text, 4, '0')
FROM numbered n
WHERE e."id" = n."id";

-- 3) Unicité (libellé global + couple mois/séquence). NULL autorisé et distinct
-- en Postgres, donc compatible avec d'éventuelles lignes non numérotées.
CREATE UNIQUE INDEX "expense_receiptNo_key" ON "expense"("receiptNo");
CREATE UNIQUE INDEX "expense_receiptPeriod_receiptSeq_key" ON "expense"("receiptPeriod", "receiptSeq");
