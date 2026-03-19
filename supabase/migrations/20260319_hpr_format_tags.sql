-- Lägg till format-kolumner på hpr_filer
-- Kör i Supabase SQL Editor eller via supabase db push

ALTER TABLE hpr_filer
  ADD COLUMN IF NOT EXISTS stanford_version text,
  ADD COLUMN IF NOT EXISTS sender_app text,
  ADD COLUMN IF NOT EXISTS has_coordinates boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS stammar_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stammar_med_koordinat integer DEFAULT 0;

-- Kommentar
COMMENT ON COLUMN hpr_filer.stanford_version IS 'StanForD-version, t.ex. 3.5 eller 3.6';
COMMENT ON COLUMN hpr_filer.sender_app IS 'Applikation som skapade filen, t.ex. Ponsse Opti eller Forester H70';
COMMENT ON COLUMN hpr_filer.has_coordinates IS 'Sant om filen har GPS-koordinater per stam (kan visas pa karta)';
COMMENT ON COLUMN hpr_filer.stammar_count IS 'Totalt antal stammar i filen';
COMMENT ON COLUMN hpr_filer.stammar_med_koordinat IS 'Antal stammar med GPS-koordinat';
