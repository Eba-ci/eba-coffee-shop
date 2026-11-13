-- Recherche par nom faite en base (lib/search/trgm.ts) : similarité trigramme
-- pour tolérer les fautes de frappe, unaccent pour replier les accents.
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";
