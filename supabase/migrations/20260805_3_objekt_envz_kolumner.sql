-- 2026-08-05  objekt: nya kolumner för envz-import
--
-- region + avverkningsform kommer ur envz (object-info <Region>, OGI LoggingFormDescription)
-- och saknar kolumn idag. traktkarta_url pekar på TK-PDF:en (Steg 6) — separat från
-- kartbild_url, som betyder "georefererad bild med bounds som kartvyn lägger ut". En TK-PDF
-- har inga bounds; läggs den i kartbild_url kraschar kartvyn.
--
-- checklist_items (jsonb) finns redan och återanvänds — ingen ny kolumn för den.
-- volym_planerad läggs INTE till: envz Target skrivs till befintliga objekt.volym (det vyerna
-- läser); volym_planerad var död kod (0/45 rader).

ALTER TABLE objekt
  ADD COLUMN IF NOT EXISTS region          text,
  ADD COLUMN IF NOT EXISTS avverkningsform text,
  ADD COLUMN IF NOT EXISTS traktkarta_url  text;
