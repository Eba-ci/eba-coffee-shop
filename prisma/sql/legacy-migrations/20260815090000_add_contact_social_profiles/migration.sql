-- AlterTable
-- Réseaux sociaux facultatifs : "" = pas de compte (le lien disparaît du pied
-- de page et du `sameAs` JSON-LD). Cf. lib/contact-settings.ts.
ALTER TABLE "contact_settings"
  ADD COLUMN "facebookUrl" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "xUrl" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "linkedinUrl" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "youtubeUrl" TEXT NOT NULL DEFAULT '';
