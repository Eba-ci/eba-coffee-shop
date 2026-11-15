-- Fin d'effet facultative d'un taux (null = en cours) : les taux existants restent « ouverts », rien ne change pour eux.
-- AlterTable
ALTER TABLE "salary_rate" ADD COLUMN     "endDate" DATE;

