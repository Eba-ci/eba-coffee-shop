-- AlterTable
-- Remboursements rendus en espèces, figés à la clôture (anciennes clôtures : 0).
ALTER TABLE "cash_closing" ADD COLUMN     "cashRefunds" INTEGER NOT NULL DEFAULT 0;
