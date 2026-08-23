-- detalj_stam.stam_bunt_nyckel — markerar stammar som mättes i BUNT.
--
-- BAKGRUND
-- Flerträdshantering (MultiTreeProcessedStem) betyder att skördaren griper
-- flera klena stammar samtidigt och mäter dem som en enhet. Varje träd får
-- en egen <Stem> med egen StemKey, egna koordinater, egen HarvestDate och
-- egen volym — men DIAMETERN mäts EN gång för hela bunten och skrivs
-- identisk på alla träd i den.
--
-- Sjöaryd, bunt 5: tre stammar, alla med DBH 61 mm. Det är EN mätning, inte
-- tre. Lagras de som separata rader utan markering viktas den mätningen tre
-- gånger i Dgv och i diameterhistogrammet, och de klena buntarna får
-- oproportionerligt genomslag i statistiken.
--
-- Kolumnen finns för att kunna skilja dem åt. NULL = enträdshanterad stam,
-- alltså en individuell diametermätning.
--
-- SCOPE — VIKTIGT
-- StemBunchKey börjar om på 1 i varje HPR-fil. Bunt 1 hos Sjöaryd och bunt 1
-- hos Johan Svensson är olika buntar. Värdet är därför BARA meningsfullt
-- tillsammans med maskin_id och objekt_id, som redan står på samma rad.
--
--   Rätt:  GROUP BY maskin_id, objekt_id, stam_bunt_nyckel
--   Fel:   GROUP BY stam_bunt_nyckel
--
-- Inom ett objekts kumulativa filserie är numreringen stabil: bunt 14 på
-- Johan Svensson 23 jan är samma bunt 14 den 24 jan.
--
-- Ingen befintlig rad rörs. Alla nuvarande rader är enträdshanterade — det
-- var hela buggen — och får korrekt NULL.

ALTER TABLE detalj_stam
  ADD COLUMN IF NOT EXISTS stam_bunt_nyckel text;

COMMENT ON COLUMN detalj_stam.stam_bunt_nyckel IS
  'StemBunchKey ur HPR för flerträdshanterade stammar. NULL = enträdshanterad '
  '(individuell diametermätning). Stammar med samma värde delar EN DBH-mätning '
  '— vikta dem som en enda mätning i diameterstatistik. Nyckeln börjar om per '
  'fil: gruppera alltid på (maskin_id, objekt_id, stam_bunt_nyckel).';
