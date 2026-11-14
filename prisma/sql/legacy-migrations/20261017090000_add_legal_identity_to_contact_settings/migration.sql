-- AlterTable
-- Identité légale du commerce (mentions légales, politique de confidentialité,
-- dossier ARTCI). "" = non renseigné, affiché « à compléter ».
ALTER TABLE "contact_settings"
  ADD COLUMN "legalName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "legalForm" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "rccm" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "ncc" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "publicationDirector" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "hostName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "artciReference" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "privacyEmail" TEXT NOT NULL DEFAULT '';
