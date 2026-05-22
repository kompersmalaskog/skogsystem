-- VIKTIGT: Denna migration raderar 820 bit-
-- identiska dubblettrader (verifierade 2026-05-19).
-- Dubbletterna uppstod p.g.a. parser-bugg i
-- upsert_data() som körde plain INSERT istället
-- för upsert. Bugg-fix kommer i parser-utöknings-
-- prompten.

-- ════════════════════════════════════════════════════════
-- Migration: kontroll_schema_v2
-- Datum: 2026-05-19
-- Syfte:
--   1. Versionskontrollera befintliga tabeller
--      (de skapades manuellt i Supabase UI)
--   2. Droppa tomma oanvända kontroll_*-tabeller
--   3. Droppa dubbla volymkolumner på
--      detalj_kontroll_stock (_m3-versionerna är
--      NaN-skuggor, _sub-versionerna har datan)
--   4. Lägg till nya kolumner för utökad HQC-data
--      + väder + objektinfo
--   5. Skapa detalj_kontroll_stock_matpunkt för
--      per-mätpunkts-diametrar
--   6. Lägg till UNIQUE-constraints för dedup
--      (fakt_kalibrering_historik dedupas i
--      separat migration efter backfill)
-- ════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────
-- A) Versionskontrollera befintliga tabeller
-- ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS detalj_kontroll_stock (
  id INTEGER PRIMARY KEY
    DEFAULT nextval('detalj_kontroll_stock_id_seq'::regclass),
  maskin_id TEXT,
  kontroll_datum DATE,
  stam_nummer INTEGER,
  stock_nummer INTEGER,
  maskin_langd_cm INTEGER,
  maskin_toppdia_mm INTEGER,
  maskin_volym_m3 NUMERIC(10,6),
  operator_langd_cm INTEGER,
  operator_toppdia_mm INTEGER,
  operator_volym_m3 NUMERIC(10,6),
  langd_avvikelse_cm NUMERIC(6,2),
  dia_avvikelse_mm NUMERIC(6,2),
  filnamn TEXT,
  skapad_tid TIMESTAMPTZ DEFAULT now(),
  maskin_volym_sub NUMERIC(10,4),
  operator_volym_sub NUMERIC(10,4),
  volym_avvikelse NUMERIC(10,4),
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  objekt_id TEXT
);

CREATE TABLE IF NOT EXISTS fakt_kalibrering (
  id INTEGER PRIMARY KEY
    DEFAULT nextval('fakt_kalibrering_id_seq'::regclass),
  datum DATE NOT NULL,
  maskin_id TEXT REFERENCES dim_maskin(maskin_id),
  operator_id TEXT,
  tradslag TEXT,
  antal_kontrollstammar INTEGER DEFAULT 0,
  antal_kontrollstockar INTEGER DEFAULT 0,
  langd_avvikelse_snitt_cm NUMERIC(6,2),
  langd_avvikelse_min_cm NUMERIC(6,2),
  langd_avvikelse_max_cm NUMERIC(6,2),
  dia_avvikelse_snitt_mm NUMERIC(6,2),
  dia_avvikelse_min_mm NUMERIC(6,2),
  dia_avvikelse_max_mm NUMERIC(6,2),
  status TEXT,
  filnamn TEXT,
  skapad_tid TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fakt_kalibrering_historik (
  id INTEGER PRIMARY KEY
    DEFAULT nextval('fakt_kalibrering_historik_id_seq'::regclass),
  datum TIMESTAMPTZ NOT NULL,
  maskin_id TEXT REFERENCES dim_maskin(maskin_id),
  operator_id TEXT,
  tradslag TEXT,
  orsak TEXT,
  beskrivning TEXT,
  langd_justering_mm INTEGER,
  dia_justering_mm INTEGER,
  position_cm INTEGER,
  filnamn TEXT,
  skapad_tid TIMESTAMPTZ DEFAULT now(),
  typ TEXT
);

-- ────────────────────────────────────────────────────────
-- B) Droppa oanvända tomma tabeller
-- ────────────────────────────────────────────────────────

DROP TABLE IF EXISTS kontroll_matpunkter CASCADE;
DROP TABLE IF EXISTS kontroll_stockar CASCADE;
DROP TABLE IF EXISTS kontroll_stammar CASCADE;

-- ────────────────────────────────────────────────────────
-- C) Droppa dubbla volymkolumner på detalj_kontroll_stock
-- ────────────────────────────────────────────────────────

ALTER TABLE detalj_kontroll_stock
  DROP COLUMN IF EXISTS maskin_volym_m3,
  DROP COLUMN IF EXISTS operator_volym_m3;

-- ────────────────────────────────────────────────────────
-- D) Nya kolumner på detalj_kontroll_stock
-- ────────────────────────────────────────────────────────

ALTER TABLE detalj_kontroll_stock
  ADD COLUMN IF NOT EXISTS sortiment_namn TEXT,
  ADD COLUMN IF NOT EXISTS sortiment_grupp TEXT,
  ADD COLUMN IF NOT EXISTS sortiment_kod TEXT,
  ADD COLUMN IF NOT EXISTS cutting_reason TEXT,
  ADD COLUMN IF NOT EXISTS log_diameter_mid_ob_mm INTEGER,
  ADD COLUMN IF NOT EXISTS log_diameter_butt_ob_mm INTEGER,
  ADD COLUMN IF NOT EXISTS machine_measurement_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS operator_measurement_date TIMESTAMPTZ;

-- ────────────────────────────────────────────────────────
-- E) Nya kolumner på fakt_kalibrering
-- ────────────────────────────────────────────────────────

ALTER TABLE fakt_kalibrering
  ADD COLUMN IF NOT EXISTS stem_lat NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS stem_lon NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS stem_alt NUMERIC,
  ADD COLUMN IF NOT EXISTS harvest_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stem_dbh_mm INTEGER,
  ADD COLUMN IF NOT EXISTS stem_diameter_profile JSONB,
  ADD COLUMN IF NOT EXISTS object_name TEXT,
  ADD COLUMN IF NOT EXISTS object_area_ha NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS cutting_method TEXT,
  ADD COLUMN IF NOT EXISTS forest_certification TEXT,
  ADD COLUMN IF NOT EXISTS contract_number TEXT,
  ADD COLUMN IF NOT EXISTS application_version TEXT,
  ADD COLUMN IF NOT EXISTS processing_category TEXT,
  ADD COLUMN IF NOT EXISTS butt_log_length_adjustment_mm INTEGER,
  ADD COLUMN IF NOT EXISTS stem_selection TEXT,
  ADD COLUMN IF NOT EXISTS measurement_mode TEXT,
  ADD COLUMN IF NOT EXISTS rejected_reason TEXT,
  ADD COLUMN IF NOT EXISTS measurer_name TEXT,
  ADD COLUMN IF NOT EXISTS caliper_id TEXT,
  ADD COLUMN IF NOT EXISTS weather_at_harvest JSONB;

-- ────────────────────────────────────────────────────────
-- F0) Dedup av bit-identiska dubbletter
-- Diagnostiserade 2026-05-19: 758 skräp-rader i
-- detalj_kontroll_stock + 62 i fakt_kalibrering.
-- Alla bit-identiska utom id+skapad_tid.
-- Behåll lägsta id per grupp.
-- ────────────────────────────────────────────────────────

-- Före-räkning för loggning
DO $$
DECLARE
  stock_count INTEGER;
  kalib_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO stock_count FROM detalj_kontroll_stock;
  SELECT COUNT(*) INTO kalib_count FROM fakt_kalibrering;
  RAISE NOTICE 'Före dedup — detalj_kontroll_stock: %, fakt_kalibrering: %', stock_count, kalib_count;
END $$;

-- Dedup detalj_kontroll_stock (behåll lägsta id)
WITH deleted AS (
  DELETE FROM detalj_kontroll_stock a
  USING detalj_kontroll_stock b
  WHERE a.id > b.id
    AND a.filnamn = b.filnamn
    AND a.stam_nummer = b.stam_nummer
    AND a.stock_nummer = b.stock_nummer
  RETURNING a.id
)
SELECT COUNT(*) AS detalj_dedup_count FROM deleted;

-- Dedup fakt_kalibrering (behåll lägsta id)
WITH deleted AS (
  DELETE FROM fakt_kalibrering a
  USING fakt_kalibrering b
  WHERE a.id > b.id
    AND a.filnamn = b.filnamn
  RETURNING a.id
)
SELECT COUNT(*) AS kalib_dedup_count FROM deleted;

-- Efter-räkning för loggning
DO $$
DECLARE
  stock_count INTEGER;
  kalib_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO stock_count FROM detalj_kontroll_stock;
  SELECT COUNT(*) INTO kalib_count FROM fakt_kalibrering;
  RAISE NOTICE 'Efter dedup — detalj_kontroll_stock: % (väntat 3459), fakt_kalibrering: % (väntat 365)', stock_count, kalib_count;
END $$;

-- ────────────────────────────────────────────────────────
-- F) Ny tabell för per-mätpunkts-diametrar
-- ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS detalj_kontroll_stock_matpunkt (
  id BIGSERIAL PRIMARY KEY,
  detalj_kontroll_stock_id INTEGER NOT NULL
    REFERENCES detalj_kontroll_stock(id) ON DELETE CASCADE,
  position_cm INTEGER NOT NULL,
  diameter_maskin_mm INTEGER,
  diameter_operator_mm INTEGER,
  klave_first_mm INTEGER,
  klave_second_mm INTEGER,
  skapad_tid TIMESTAMPTZ DEFAULT now(),
  UNIQUE (detalj_kontroll_stock_id, position_cm)
);

CREATE INDEX IF NOT EXISTS idx_matpunkt_stock
  ON detalj_kontroll_stock_matpunkt(detalj_kontroll_stock_id);

ALTER TABLE detalj_kontroll_stock_matpunkt
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "matpunkt_read"
  ON detalj_kontroll_stock_matpunkt
  FOR SELECT USING (true);

CREATE POLICY "matpunkt_write"
  ON detalj_kontroll_stock_matpunkt
  FOR ALL USING (true);

COMMENT ON TABLE detalj_kontroll_stock_matpunkt IS
  'Per-mätpunkts-diametrar från ControlLogDiameter i Stanford 2010 HQC. Positioner i cm från rotände.';

-- ────────────────────────────────────────────────────────
-- G) UNIQUE-constraints för dedup
-- ────────────────────────────────────────────────────────

-- detalj_kontroll_stock: en stock identifieras unikt
-- av sin position i sin källfil
ALTER TABLE detalj_kontroll_stock
  ADD CONSTRAINT detalj_kontroll_stock_unik
  UNIQUE (filnamn, stam_nummer, stock_nummer);

-- fakt_kalibrering: en kontrollsession per fil
ALTER TABLE fakt_kalibrering
  ADD CONSTRAINT fakt_kalibrering_unik
  UNIQUE (filnamn);

-- fakt_kalibrering_historik: UNIQUE läggs till i
-- separat migration EFTER backfill, eftersom
-- nuvarande data har dubbletter som måste
-- städas först.

-- ────────────────────────────────────────────────────────
-- H) Tilläggsindex för upsert-prestanda
-- ────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_stock_filnamn
  ON detalj_kontroll_stock(filnamn);

CREATE INDEX IF NOT EXISTS idx_kalib_filnamn
  ON fakt_kalibrering(filnamn);

CREATE INDEX IF NOT EXISTS idx_hist_dedup
  ON fakt_kalibrering_historik(
    datum, maskin_id, tradslag, typ
  );
