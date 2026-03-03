-- ===================================================
-- Supabase Setup: Nya tabeller + Storage bucket
-- Kör detta i Supabase SQL Editor
-- ===================================================

-- 1. KVITTERINGS-STATUS (checklista-avbockning)
CREATE TABLE IF NOT EXISTS kvittering_status (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  objekt_id UUID NOT NULL REFERENCES objekt(id) ON DELETE CASCADE,
  checked_ids TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(objekt_id)
);

-- 2. BRIEFING-STATUS (briefing genomförd)
CREATE TABLE IF NOT EXISTS briefing_status (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  objekt_id UUID NOT NULL REFERENCES objekt(id) ON DELETE CASCADE,
  completed BOOLEAN DEFAULT false,
  step_total INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(objekt_id)
);

-- 3. STORAGE BUCKET för ljud
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio', 'audio', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: Tillåt alla att ladda upp/läsa (anon key)
CREATE POLICY "Allow public uploads to audio bucket"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'audio');

CREATE POLICY "Allow public reads from audio bucket"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'audio');

CREATE POLICY "Allow public deletes from audio bucket"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'audio');

-- 4. GPS-SPÅR (lat/lng-koordinater med tidsstämplar)
CREATE TABLE IF NOT EXISTS gps_tracks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  track_id TEXT NOT NULL UNIQUE,
  objekt_id UUID NOT NULL REFERENCES objekt(id) ON DELETE CASCADE,
  line_type TEXT,
  points JSONB DEFAULT '[]',
  status TEXT DEFAULT 'recording' CHECK (status IN ('recording', 'completed')),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gps_tracks_objekt ON gps_tracks(objekt_id);
CREATE INDEX IF NOT EXISTS idx_gps_tracks_status ON gps_tracks(status);

-- 5. BRAND-UTRUSTNING + LARM (nya kolumner på brand_samrad)
ALTER TABLE brand_samrad ADD COLUMN IF NOT EXISTS utrustning JSONB DEFAULT '[false,false,false,false]';
ALTER TABLE brand_samrad ADD COLUMN IF NOT EXISTS larm_checklista JSONB DEFAULT '[false,false,false,false,false]';
ALTER TABLE brand_samrad ADD COLUMN IF NOT EXISTS larm_tillfart TEXT DEFAULT '';

-- 6. PROGNOS + TRAKTDATA + KÖRLÄGE + STICKVÄG (nya kolumner på objekt)
ALTER TABLE objekt ADD COLUMN IF NOT EXISTS prognos_settings JSONB;
ALTER TABLE objekt ADD COLUMN IF NOT EXISTS manuell_prognos JSONB;
ALTER TABLE objekt ADD COLUMN IF NOT EXISTS trakt_data JSONB;
ALTER TABLE objekt ADD COLUMN IF NOT EXISTS driving_mode BOOLEAN DEFAULT false;
ALTER TABLE objekt ADD COLUMN IF NOT EXISTS stickvag_settings JSONB;
ALTER TABLE objekt ADD COLUMN IF NOT EXISTS checklist_items JSONB;
ALTER TABLE objekt ADD COLUMN IF NOT EXISTS generellt_tillstand JSONB;

-- 7. FEEDBACK / FÖRBÄTTRINGSFÖRSLAG
CREATE TABLE IF NOT EXISTS feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  text TEXT,
  audio_url TEXT,
  sida TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: Tillåt alla att läsa och skriva feedback (anon key)
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public insert feedback"
  ON feedback FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public select feedback"
  ON feedback FOR SELECT
  USING (true);

-- 8. MASKINKÖ (refererar till befintlig dim_maskin-tabell)
-- OBS: Kör först i Supabase SQL Editor:
--   DROP TABLE IF EXISTS maskin_ko;
--   DROP TABLE IF EXISTS maskiner;
-- Sedan kör nedanstående:
CREATE TABLE IF NOT EXISTS maskin_ko (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  maskin_id TEXT NOT NULL REFERENCES dim_maskin(maskin_id) ON DELETE CASCADE,
  objekt_id UUID REFERENCES objekt(id) ON DELETE CASCADE,
  ordning INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(maskin_id, objekt_id)
);

CREATE INDEX IF NOT EXISTS idx_maskin_ko_maskin ON maskin_ko(maskin_id);
CREATE INDEX IF NOT EXISTS idx_maskin_ko_objekt ON maskin_ko(objekt_id);

ALTER TABLE maskin_ko ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all maskin_ko" ON maskin_ko FOR ALL USING (true) WITH CHECK (true);

-- 9. John Deere 810E (saknas i dim_maskin)
INSERT INTO dim_maskin (maskin_id, tillverkare, modell, typ, marke, aktiv)
VALUES ('JD810E', 'John Deere', '810E', 'skotare', 'John Deere', true)
ON CONFLICT (maskin_id) DO NOTHING;

-- 10. GROT-kolumner på objekt
ALTER TABLE objekt ADD COLUMN IF NOT EXISTS grot_status TEXT DEFAULT 'ej_aktuellt';
ALTER TABLE objekt ADD COLUMN IF NOT EXISTS grot_volym NUMERIC;
ALTER TABLE objekt ADD COLUMN IF NOT EXISTS grot_anteckning TEXT;
ALTER TABLE objekt ADD COLUMN IF NOT EXISTS grot_deadline DATE;
