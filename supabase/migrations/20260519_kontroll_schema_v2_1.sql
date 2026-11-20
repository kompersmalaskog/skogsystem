-- ════════════════════════════════════════════════════════
-- Migration: kontroll_schema_v2_1
-- Datum: 2026-05-19
-- Syfte:
--   Flytta per-stam-fält från fakt_kalibrering
--   (som är per-fil) till detalj_kontroll_stock
--   (som är per-stock men vet vilken stam den
--   tillhör). Skapa ny tabell detalj_kontroll_stam
--   för StemDiameters JSONB.
--
--   fakt_kalibrering = per-fil aggregat
--   detalj_kontroll_stam = per-stam (stem-profil)
--   detalj_kontroll_stock = per-stock + per-stam-meta
--
--   Säkert: alla berörda kolumner är NULL
--   (lades till i v2, ännu inte ifyllda).
-- ════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────
-- A) Flytta per-stam-kolumner från fakt_kalibrering
--    till detalj_kontroll_stock
-- ────────────────────────────────────────────────

ALTER TABLE detalj_kontroll_stock
  ADD COLUMN IF NOT EXISTS stem_lat NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS stem_lon NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS stem_alt NUMERIC,
  ADD COLUMN IF NOT EXISTS harvest_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stem_dbh_mm INTEGER,
  ADD COLUMN IF NOT EXISTS stem_selection TEXT,
  ADD COLUMN IF NOT EXISTS measurement_mode TEXT,
  ADD COLUMN IF NOT EXISTS rejected_reason TEXT,
  ADD COLUMN IF NOT EXISTS measurer_name TEXT,
  ADD COLUMN IF NOT EXISTS caliper_id TEXT,
  ADD COLUMN IF NOT EXISTS processing_category TEXT;

ALTER TABLE fakt_kalibrering
  DROP COLUMN IF EXISTS stem_lat,
  DROP COLUMN IF EXISTS stem_lon,
  DROP COLUMN IF EXISTS stem_alt,
  DROP COLUMN IF EXISTS harvest_date,
  DROP COLUMN IF EXISTS stem_dbh_mm,
  DROP COLUMN IF EXISTS stem_selection,
  DROP COLUMN IF EXISTS measurement_mode,
  DROP COLUMN IF EXISTS rejected_reason,
  DROP COLUMN IF EXISTS measurer_name,
  DROP COLUMN IF EXISTS caliper_id,
  DROP COLUMN IF EXISTS processing_category;

-- ────────────────────────────────────────────────
-- B) Skapa ny tabell detalj_kontroll_stam
-- ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS detalj_kontroll_stam (
  id BIGSERIAL PRIMARY KEY,
  filnamn TEXT NOT NULL,
  stam_nummer INTEGER NOT NULL,
  maskin_id TEXT,
  kontroll_datum DATE,
  stem_diameter_profile JSONB,
  skapad_tid TIMESTAMPTZ DEFAULT now(),
  UNIQUE (filnamn, stam_nummer)
);

CREATE INDEX IF NOT EXISTS idx_stam_filnamn
  ON detalj_kontroll_stam(filnamn);

ALTER TABLE detalj_kontroll_stam
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stam_read"
  ON detalj_kontroll_stam
  FOR SELECT USING (true);

CREATE POLICY "stam_write"
  ON detalj_kontroll_stam
  FOR ALL USING (true);

COMMENT ON TABLE detalj_kontroll_stam IS
  'Per-stam-data från Stanford 2010 HQC. Främst stem_diameter_profile (183 mätpunkter per stam, var 10:e cm). Identifieras via (filnamn, stam_nummer) som matchar mot detalj_kontroll_stock.';

-- ────────────────────────────────────────────────
-- C) Droppa stem_diameter_profile från
--    fakt_kalibrering (flyttad)
-- ────────────────────────────────────────────────

ALTER TABLE fakt_kalibrering
  DROP COLUMN IF EXISTS stem_diameter_profile;
