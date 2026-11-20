-- extra_tid.objekt_id sattes ursprungligen som uuid, men dim_objekt.objekt_id är
-- text (t.ex. "11124774", "A030353_150"). Koden skickar text-värden från
-- objektLista, vilket gav 400-fel vid POST. Ingen FK på kolumnen — säkert att
-- ändra typ. Befintliga uuid-värden konverteras till text via USING.

ALTER TABLE extra_tid ALTER COLUMN objekt_id TYPE text USING objekt_id::text;
