-- Steg 1 av två: dim_sortiment cleanup + ny dim_sortiment_pris-tabell.
-- Säker att köra direkt — påverkar bara dim_sortiment (232 rader, alla pris/dim
-- är 100% null) och skapar ny tabell.
--
-- Steg 2 (detalj_stock dedupe-keys + UNIQUE) ligger i separat migration som
-- körs EFTER wipe + import-skript-patch för att inte fail:a på existerande dubletter.

-- ============================================================
-- 1. dim_sortiment cleanup
-- ============================================================
-- Spec-rester: pris/dimension migreras till dim_sortiment_pris.
-- Verifierat 2026-05-06: alla 232 rader har null på dessa kolumner.

ALTER TABLE dim_sortiment
  DROP COLUMN IF EXISTS pris_per_m3,
  DROP COLUMN IF EXISTS dia_min_mm,
  DROP COLUMN IF EXISTS dia_max_mm,
  DROP COLUMN IF EXISTS langd_min_cm,
  DROP COLUMN IF EXISTS langd_max_cm;

-- ============================================================
-- 2. dim_sortiment_pris
-- ============================================================
-- Pris per (sortiment, längd-tröskel, dimensions-tröskel) från
-- ProductMatrixItem i StanForD2010-HPR-XML. StanForD-prislistor använder
-- "lower threshold"-modellen: en stock med (langd, dia) får priset från
-- den största raden där langd_min_cm <= stock.langd OCH dia_min_mm <= stock.dia.
-- Ingen upper-limit existerar.

CREATE TABLE IF NOT EXISTS dim_sortiment_pris (
  sortiment_id  text    NOT NULL REFERENCES dim_sortiment(sortiment_id) ON DELETE CASCADE,
  langd_min_cm  int     NOT NULL,
  dia_min_mm    int     NOT NULL,
  pris_per_m3   numeric NOT NULL,
  PRIMARY KEY (sortiment_id, langd_min_cm, dia_min_mm)
);

-- DESC-index för "find largest threshold not exceeding stock"-lookup:
--   SELECT pris_per_m3 FROM dim_sortiment_pris
--   WHERE sortiment_id = $1 AND langd_min_cm <= $2 AND dia_min_mm <= $3
--   ORDER BY langd_min_cm DESC, dia_min_mm DESC LIMIT 1;
CREATE INDEX IF NOT EXISTS idx_dim_sortiment_pris_lookup
  ON dim_sortiment_pris (sortiment_id, langd_min_cm DESC, dia_min_mm DESC);

COMMENT ON TABLE dim_sortiment_pris IS
  'Pris per sortiment, längd-tröskel och dimensions-tröskel. Källa: ProductMatrixItem '
  'i HPR-XML. Slå upp pris för en stock genom att hitta största (langd_min_cm, dia_min_mm) '
  'som inte överskrider stockens (langd_cm, toppdia_ub_mm). Inga upper-limits — '
  'StanForD-prislistor är lower-threshold-baserade.';
