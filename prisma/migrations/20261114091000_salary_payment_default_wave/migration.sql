-- Aligne le défaut BASE du mode de paiement d'un versement sur le défaut
-- applicatif (WAVE) : en pratique la paie se règle par Wave, un versement
-- espèces est un cas explicite. Idempotent (SET DEFAULT peut rejouer).

-- AlterTable
ALTER TABLE "salary_payment" ALTER COLUMN "paymentMethod" SET DEFAULT 'WAVE';
