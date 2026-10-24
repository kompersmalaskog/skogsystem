-- Kalibreringshistoriken: rotstockens längdjustering och märkning av omkalibrering efter reparation.
--
-- 1) langd_justering_rot_mm — HQC:ns LengthCalibrationAdjustmentButtLog (rotstockens längdjustering). Längden är det som
--    bedöms hos Vida, så rotjusteringen hör till samma rad som den vanliga längdjusteringen. NULL = filen sa inget
--    (aldrig 0). Fylls av importen för nya filer och av scripts/backfill-kalibrering-historik.py för de gamla.
--
-- 2) omkalibrering — true för en rad vars orsak är "Repair of measurement system". Då är raden en OMKALIBRERING efter
--    reparation av mätsystemet, inte en justering i mm: R64428:s diameterrad (56 vid position 50) betyder att
--    mätsystemet kalibrerades om, inte att diametern flyttades +56 mm. Raden behåller sina värden (inget raderas); märket
--    gör att en vy aldrig visar dem som en justering. Generated column: en enda definition, kan inte glida isär från
--    orsaken, gäller alla befintliga rader direkt och importen skriver den aldrig. TypeScript-sidan
--    (lib/kalibrering/historik.ts, OMKALIBRERING_ORSAK) har samma literal — lib/kalibrering/historik.test.ts läser den här
--    filen och larmar om de skiljer sig.
--
-- beskrivning (som redan finns) fylls nu också för diameterrader (DiameterCalibrationDescription).
-- Ändrar inte unika nyckeln (datum, maskin_id, tradslag, typ).

ALTER TABLE fakt_kalibrering_historik
  ADD COLUMN IF NOT EXISTS langd_justering_rot_mm integer;

ALTER TABLE fakt_kalibrering_historik
  ADD COLUMN IF NOT EXISTS omkalibrering boolean
  GENERATED ALWAYS AS (coalesce(orsak, '') = 'Repair of measurement system') STORED;
