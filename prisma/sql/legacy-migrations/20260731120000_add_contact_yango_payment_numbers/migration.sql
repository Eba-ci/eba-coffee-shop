-- AlterTable
ALTER TABLE "contact_settings"
  ADD COLUMN "yangoLandmark" TEXT NOT NULL DEFAULT 'Odyssée du vin',
  ADD COLUMN "wavePaymentNumber" TEXT NOT NULL DEFAULT '+225 07 00 00 00 00',
  ADD COLUMN "orangeMoneyPaymentNumber" TEXT NOT NULL DEFAULT '+225 07 00 00 00 00';
