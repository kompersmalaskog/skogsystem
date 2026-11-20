-- Steg 2 av två: dedupe-nycklar på detalj_stock.
--
-- KRITISK ORDNING — körs EFTER:
--   1. 20260506_dim_sortiment_pris.sql är applicerad
--   2. skogsmaskin_import_version_6.py är patchad (stock_key utan filnamn,
--      stem_key/log_key som separata fält, upsert på composite-nyckel)
--   3. detalj_stock + detalj_stam wipade per objekt
--   4. Husjönäs (eller annat MVP-objekt) reimporterat med patchat skript
--
-- Om körd på existerande data utan wipe failar UNIQUE-constraint på dubletter.

-- ============================================================
-- 1. Lägg till stem_key och log_key som separata kolumner
-- ============================================================

ALTER TABLE detalj_stock
  ADD COLUMN IF NOT EXISTS stem_key text,
  ADD COLUMN IF NOT EXISTS log_key  int;

COMMENT ON COLUMN detalj_stock.stem_key IS
  'StemKey från HPR-XML. Tillsammans med (maskin_id, log_key) den logiska identiteten '
  'för en stock — oberoende av vilken kumulativ HPR-fil den importerades från.';

COMMENT ON COLUMN detalj_stock.log_key IS
  'LogKey från HPR-XML. Heltal, ordningstal för stockar inom samma stam (1=bottenstock).';

-- ============================================================
-- 2. Composite UNIQUE för dedupe
-- ============================================================
-- HPR-filer är kumulativa — samma logiska stock förekommer i flera filer.
-- Composite-nyckeln gör att upsert i import-skriptet skriver över istället
-- för att duplicera.

ALTER TABLE detalj_stock
  ADD CONSTRAINT detalj_stock_logical_unique
  UNIQUE (maskin_id, stem_key, log_key);

-- ============================================================
-- 3. Verifiering
-- ============================================================
-- Efter applicering kontrollera:
--
--   -- Inga dubletter på composite-nyckel
--   SELECT maskin_id, stem_key, log_key, count(*)
--   FROM detalj_stock
--   GROUP BY 1,2,3
--   HAVING count(*) > 1;
--   -- Ska ge 0 rader
--
--   -- Antal stocks rimligt mot förväntat (Husjönäs ~1349 stammar × ~3-4 stocks/stam)
--   SELECT objekt_id, count(*) FROM detalj_stock GROUP BY 1 ORDER BY 2 DESC LIMIT 10;
