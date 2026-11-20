-- uppdaterad_tid hade bara DEFAULT now() — den sätts vid INSERT och rörs
-- aldrig vid UPDATE. En ändringsstämpel som inte stämplar är värre än ingen:
-- den ser ut att svara på "när ändrades detta sist" men ljuger (stod kvar på
-- 2026-07-18 trots switch-sparningar samma dag).
-- Trigger i stället för app-kod: fångar ALLA skrivare (redigeringsvyn,
-- importen, manuell SQL), inte bara de vi råkar minnas att uppdatera.
-- Redan applicerad i prod 2026-07-22; filen versionerar den.

CREATE OR REPLACE FUNCTION satt_uppdaterad_tid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.uppdaterad_tid := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dim_objekt_satt_uppdaterad_tid ON dim_objekt;
CREATE TRIGGER dim_objekt_satt_uppdaterad_tid
  BEFORE UPDATE ON dim_objekt
  FOR EACH ROW
  EXECUTE FUNCTION satt_uppdaterad_tid();
