-- ════════════════════════════════════════════════
-- Migration: matpunkt_position_fix
-- Datum: 2026-05-21
-- Syfte: Korrigera position_cm i
--   detalj_kontroll_stock_matpunkt. Parsern delade
--   diameterPosition med 10 felaktigt — råvärdet
--   var redan i cm. Multiplicera tillbaka med 10.
--   Verifierat mot Ponsse + Rottne 2026-05-21:
--   - Ponsse Göljahult: 100/200/300/400 = jämna meter
--   - Rottne R64101: 132/204 = ~1.3m/~2m
--   - Rödby stam 1 stock 1: 130 = brösthöjd
-- ════════════════════════════════════════════════

-- Före-räkning
DO $$
DECLARE
  total INTEGER;
  min_p INTEGER;
  max_p INTEGER;
BEGIN
  SELECT COUNT(*), MIN(position_cm), MAX(position_cm)
    INTO total, min_p, max_p
    FROM detalj_kontroll_stock_matpunkt;
  RAISE NOTICE 'Före: % rader, position_cm % till %',
    total, min_p, max_p;
END $$;

-- Korrigera
UPDATE detalj_kontroll_stock_matpunkt
SET position_cm = position_cm * 10;

-- Efter-räkning
DO $$
DECLARE
  total INTEGER;
  min_p INTEGER;
  max_p INTEGER;
BEGIN
  SELECT COUNT(*), MIN(position_cm), MAX(position_cm)
    INTO total, min_p, max_p
    FROM detalj_kontroll_stock_matpunkt;
  RAISE NOTICE 'Efter: % rader, position_cm % till %',
    total, min_p, max_p;
END $$;
