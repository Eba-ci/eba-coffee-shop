-- Masse salariale : une dépense GLOBALE par jour de versement et par mode
-- (`expense.salaryAggregateKey`), portée par plusieurs versements
-- (`salary_payment.expenseId`, 1:N).
--
-- Les anciennes dépenses « miroir » (une par versement, `expense.salaryPaymentId`)
-- sont REGROUPÉES, pas effacées : pour chaque (jour, mode), la plus ancienne
-- devient la ligne globale (montant = somme des versements du jour/mode, numéro
-- de reçu normal, versements rattachés) ; les autres miroirs du même (jour,
-- mode), dont le montant est entièrement repris dans cette ligne, sont retirées.
-- Aucun versement n'est touché. Un garde-fou final annule TOUTE la migration si
-- un total ne tombe pas juste. `pnpm db:resync-salary-expenses` reste utile
-- pour réparer une dérive (versement sans miroir), il n'est plus requis.

-- AlterTable
ALTER TABLE "salary_payment" ADD COLUMN     "expenseId" TEXT;

-- AlterTable
ALTER TABLE "expense" ADD COLUMN     "salaryAggregateKey" TEXT;

-- Groupes (jour, mode) qui ont au moins un miroir : la ligne conservée est le
-- plus ancien miroir du groupe ; le total couvre TOUS les versements du groupe.
CREATE TEMP TABLE "_salary_groups" ON COMMIT DROP AS
SELECT
  sp."date"                                     AS "date",
  sp."paymentMethod"                            AS "paymentMethod",
  to_char(sp."date", 'YYYY-MM-DD') || ':' || sp."paymentMethod"::text AS "key",
  (SELECT min(e2."id")
     FROM "expense" e2
     JOIN "salary_payment" sp2 ON sp2."id" = e2."salaryPaymentId"
    WHERE sp2."date" = sp."date"
      AND sp2."paymentMethod" = sp."paymentMethod") AS "keeperId",
  sum(sp."amount")::int                         AS "total"
FROM "salary_payment" sp
GROUP BY sp."date", sp."paymentMethod"
HAVING EXISTS (
  SELECT 1
    FROM "expense" e3
    JOIN "salary_payment" sp3 ON sp3."id" = e3."salaryPaymentId"
   WHERE sp3."date" = sp."date"
     AND sp3."paymentMethod" = sp."paymentMethod"
);

-- Numéro de reçu : DEP-YYYY-MM-NNNN, à la suite du dernier du mois (les miroirs
-- n'en portaient aucun, la séquence existante reste intacte).
CREATE TEMP TABLE "_salary_receipts" ON COMMIT DROP AS
SELECT
  g."keeperId",
  to_char(g."date", 'YYYY-MM') AS "period",
  COALESCE(
    (SELECT max(x."receiptSeq") FROM "expense" x
      WHERE x."receiptPeriod" = to_char(g."date", 'YYYY-MM')),
    0
  ) + row_number() OVER (
    PARTITION BY to_char(g."date", 'YYYY-MM')
    ORDER BY g."date", g."keeperId"
  ) AS "seq"
FROM "_salary_groups" g;

-- Le plus ancien miroir devient la ligne globale.
UPDATE "expense" e
   SET "date"               = g."date",
       "paymentMethod"      = g."paymentMethod",
       "amount"             = g."total",
       "note"               = 'Masse salariale (automatique)',
       "supplier"           = NULL,
       "salaryAggregateKey" = g."key",
       "receiptPeriod"      = r."period",
       "receiptSeq"         = r."seq",
       "receiptNo"          = 'DEP-' || r."period" || '-' || lpad(r."seq"::text, 4, '0'),
       "salaryPaymentId"    = NULL
  FROM "_salary_groups" g
  JOIN "_salary_receipts" r ON r."keeperId" = g."keeperId"
 WHERE e."id" = g."keeperId";

-- Rattache TOUS les versements du (jour, mode) à la ligne globale.
UPDATE "salary_payment" sp
   SET "expenseId" = g."keeperId"
  FROM "_salary_groups" g
 WHERE sp."date" = g."date" AND sp."paymentMethod" = g."paymentMethod";

-- Les autres miroirs (montant déjà repris dans la ligne globale) sont retirés.
DELETE FROM "expense"
 WHERE "salaryPaymentId" IS NOT NULL
   AND "salaryAggregateKey" IS NULL;

-- Garde-fou : le total de chaque ligne globale égale la somme de ses versements.
-- Sinon la migration entière est annulée, rien n'est modifié.
DO $$
DECLARE
  bad integer;
BEGIN
  SELECT count(*) INTO bad
    FROM "expense" e
   WHERE e."salaryAggregateKey" IS NOT NULL
     AND e."amount" IS DISTINCT FROM (
       SELECT sum(sp."amount") FROM "salary_payment" sp WHERE sp."expenseId" = e."id"
     );
  IF bad > 0 THEN
    RAISE EXCEPTION 'salary_expense_aggregate : % ligne(s) globale(s) au total incohérent, migration annulée', bad;
  END IF;
END $$;

-- DropForeignKey
ALTER TABLE "expense" DROP CONSTRAINT "expense_salaryPaymentId_fkey";

-- DropIndex
DROP INDEX "expense_salaryPaymentId_key";

-- AlterTable
ALTER TABLE "expense" DROP COLUMN "salaryPaymentId";

-- CreateIndex
CREATE INDEX "salary_payment_expenseId_idx" ON "salary_payment"("expenseId");

-- CreateIndex
CREATE INDEX "salary_payment_date_paymentMethod_idx" ON "salary_payment"("date", "paymentMethod");

-- CreateIndex
CREATE UNIQUE INDEX "expense_salaryAggregateKey_key" ON "expense"("salaryAggregateKey");

-- AddForeignKey
ALTER TABLE "salary_payment" ADD CONSTRAINT "salary_payment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
