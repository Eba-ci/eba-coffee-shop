-- Suppression de l'onglet « Récurrentes » (#417).
-- Idempotent (db:push / rejeu possibles) et sans perte : les récurrentes
-- ACTIVES avec montant sont d'abord reprises comme charges fixes mensuelles,
-- puis la table et la colonne de synchro disparaissent.
--
-- Règles de reprise (sans doublon) :
--  - ignorées : « salaires » (catégorie « Salaires » ou libellé contenant
--    « salaire », accents/casse repliés — même prédicat que
--    lib/fixed-costs/salary-migration.ts) ;
--  - ignorées : sans montant attendu ;
--  - ignorées : la catégorie porte déjà une charge fixe (import #433, charge
--    manuelle ou récurrente déjà synchronisée) ;
--  - UNE seule charge par catégorie (la plus ancienne récurrente) ;
--  - catégorie de nature FIXED : la charge reprend `importedCategoryId`, pour
--    que « Importer les catégories fixes » (#433) ne la double pas.
-- Prise d'effet = 1er du mois courant (Abidjan = UTC), périodicité MENSUELLE.

CREATE EXTENSION IF NOT EXISTS unaccent;

DO $$
BEGIN
  IF to_regclass('public.recurring_expense') IS NOT NULL THEN
    INSERT INTO "fixed_cost" (
      "id", "label", "amount", "periodicity", "startDate", "categoryId",
      "importedCategoryId", "active", "sortOrder", "createdAt", "updatedAt"
    )
    SELECT
      'rec_' || r."id",
      r."label",
      r."expectedAmount",
      'MONTHLY',
      date_trunc('month', now())::date,
      r."categoryId",
      CASE WHEN c."nature" = 'FIXED' THEN r."categoryId" END,
      true,
      COALESCE((SELECT max("sortOrder") FROM "fixed_cost"), -1)
        + row_number() OVER (ORDER BY r."createdAt", r."id"),
      now(),
      now()
    FROM (
      SELECT DISTINCT ON ("categoryId") *
      FROM "recurring_expense"
      WHERE "active" AND "expectedAmount" > 0
      ORDER BY "categoryId", "createdAt", "id"
    ) r
    JOIN "expense_category" c ON c."id" = r."categoryId"
    WHERE lower(unaccent(c."name")) <> 'salaires'
      AND lower(unaccent(r."label")) NOT LIKE '%salaire%'
      AND NOT EXISTS (
        SELECT 1 FROM "fixed_cost" f WHERE f."categoryId" = r."categoryId"
      )
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Colonne de synchro (l'index unique tombe avec elle).
ALTER TABLE "fixed_cost" DROP COLUMN IF EXISTS "recurringExpenseId";

DROP TABLE IF EXISTS "recurring_expense";
