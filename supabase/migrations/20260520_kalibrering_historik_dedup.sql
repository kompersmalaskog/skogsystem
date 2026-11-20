-- ════════════════════════════════════════════════
-- Migration: kalibrering_historik_dedup
-- Datum: 2026-05-20
-- Syfte:
--   Dedupera fakt_kalibrering_historik och lägga
--   till UNIQUE-constraint som matchar parserns
--   upsert-nyckel.
--
--   Diagnostik 2026-05-20 visade 61 dubblett-
--   grupper med totalt 612 rader varav 551 är
--   bit-identiska överskott (samma datum,
--   maskin_id, tradslag, typ, justering, orsak —
--   bara olika filnamn + skapad_tid).
--
--   Orsaken är kumulativ Stanford 2010-beteende:
--   varje ny HQC-fil innehåller hela
--   CalibrationValues-blocket. Inte parser-bugg.
-- ════════════════════════════════════════════════

-- ────────────────────────────────────────────────
-- A) Logga före-räkning
-- ────────────────────────────────────────────────

DO $$
DECLARE
  before_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO before_count
    FROM fakt_kalibrering_historik;
  RAISE NOTICE 'Före dedup: % rader', before_count;
END $$;

-- ────────────────────────────────────────────────
-- B) Dedupera — behåll lägsta id per grupp
-- ────────────────────────────────────────────────

WITH deleted AS (
  DELETE FROM fakt_kalibrering_historik a
  USING fakt_kalibrering_historik b
  WHERE a.id > b.id
    AND a.datum = b.datum
    AND a.maskin_id = b.maskin_id
    AND a.tradslag = b.tradslag
    AND a.typ = b.typ
  RETURNING a.id
)
SELECT COUNT(*) AS dedup_count FROM deleted;

-- ────────────────────────────────────────────────
-- C) Logga efter-räkning
-- ────────────────────────────────────────────────

DO $$
DECLARE
  after_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO after_count
    FROM fakt_kalibrering_historik;
  RAISE NOTICE 'Efter dedup: % rader (väntat ca 56 baserat på diagnostik)', after_count;
END $$;

-- ────────────────────────────────────────────────
-- D) Lägg till UNIQUE-constraint
-- ────────────────────────────────────────────────

-- VIKTIGT: Postgres tillåter inte UNIQUE över
-- kolumner som kan vara NULL och bete sig som
-- "olika". Vi använder NULLS NOT DISTINCT så
-- (NULL, X, Y, Z) räknas som lika med en annan
-- (NULL, X, Y, Z) — detta motsvarar parserns
-- semantik (samma kalibrering oavsett om
-- operator_id är ifyllt).

ALTER TABLE fakt_kalibrering_historik
  ADD CONSTRAINT fakt_kalibrering_historik_unik
  UNIQUE NULLS NOT DISTINCT
  (datum, maskin_id, tradslag, typ);

-- Notering:
-- - Vi inkluderar INTE filnamn eftersom den
--   varierar för samma kalibreringshändelse
--   (kumulativ data)
-- - Vi inkluderar INTE position_cm/justeringen
--   eftersom samma kalibreringshändelse har
--   identiska värden
-- - operator_id är alltid NULL i nuvarande data
--   (parsern sätter den aldrig), så NULLS NOT
--   DISTINCT är säkert
