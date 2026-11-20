-- Kalibrerings-dedup på INNEHÅLL (inte filnamn).
-- Samma HQC-mätning exporteras som flera filer med olika tidsstämpel i namnet.
-- Både fil-checken (meta_importerade_filer) och fakt_kalibrering-upserten
-- avgjorde unikhet på filnamn → 241 innehållsidentiska dubblettrader.
--
-- KÖRORDNING (hashen backfillas i Python för att matcha parserns hash exakt):
--   1. Denna fil DEL 1 (lägg till kolumn).
--   2. backfill_kalibrering_hash.py  (fyller innehalls_hash + raderar 241 dubbletter
--      + deras detalj-rader, behåller äldsta raden per (maskin_id, hash)).
--   3. Denna fil DEL 2 (unikt partiellt index — bara efter att dubbletter rensats).
--
-- Tomma kontroller (0 stockar) får innehalls_hash = NULL och lämnas oförändrade
-- (det partiella indexet undantar NULL).

-- === DEL 1 ===
ALTER TABLE fakt_kalibrering ADD COLUMN IF NOT EXISTS innehalls_hash text;

-- === DEL 2 (kör EFTER backfill_kalibrering_hash.py) ===
-- CREATE UNIQUE INDEX IF NOT EXISTS ux_fakt_kalibrering_innehall
--   ON fakt_kalibrering (maskin_id, innehalls_hash)
--   WHERE innehalls_hash IS NOT NULL;
