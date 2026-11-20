-- Ackordgrund-overrides (PR ekonomi-ackordgrund-detalj):
-- handredigerade värden som importen ALDRIG skriver över (importen rör
-- inga *_manuell-kolumner — verifierat). NULL = använd mätt/beräknat värde.
-- Redigeras i /redigering, visas i bärnsten i Mot ackord-detaljvyn,
-- konsumeras av acordmotorn i /ekonomi och /ekonomi/mot-ackord.
ALTER TABLE dim_objekt
  ADD COLUMN IF NOT EXISTS medelstam_manuell numeric,
  ADD COLUMN IF NOT EXISTS skordning_g15_manuell numeric,
  ADD COLUMN IF NOT EXISTS sortiment_grupper_manuell integer,
  ADD COLUMN IF NOT EXISTS skotavstand_manuell numeric;

COMMENT ON COLUMN dim_objekt.medelstam_manuell IS 'Manuell medelstam (m³) för ackordprisuppslag — override, importen rör den aldrig';
COMMENT ON COLUMN dim_objekt.skordning_g15_manuell IS 'Manuella G15-timmar skördare — override för timpeng-jämförelsen';
COMMENT ON COLUMN dim_objekt.sortiment_grupper_manuell IS 'Manuellt antal sortimentgrupper för sortimenttillägget';
COMMENT ON COLUMN dim_objekt.skotavstand_manuell IS 'Manuellt skotningsavstånd (m) — tillägget räknas på hela skotarvolymen';
