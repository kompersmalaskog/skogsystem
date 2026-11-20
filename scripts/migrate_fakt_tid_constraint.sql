-- Migration: Ändra fakt_tid unique constraint
-- Byt från (datum, maskin_id, operator_id, objekt_id, filnamn) till (datum, maskin_id, objekt_id)
-- Anledning: MOM-filer innehåller kumulativ data — nyare filer ska skriva över äldre.

-- 1. Ta bort befintlig constraint
ALTER TABLE fakt_tid DROP CONSTRAINT IF EXISTS fakt_tid_unique;

-- 2. Ta bort eventuella dubbletter innan ny constraint läggs till
-- Behåll raden med högst processing_sek (mest komplett data) per (datum, maskin_id, objekt_id)
DELETE FROM fakt_tid a
USING fakt_tid b
WHERE a.ctid < b.ctid
  AND a.datum = b.datum
  AND a.maskin_id = b.maskin_id
  AND a.objekt_id = b.objekt_id;

-- 3. Lägg till ny constraint
ALTER TABLE fakt_tid ADD CONSTRAINT fakt_tid_unique UNIQUE (datum, maskin_id, objekt_id);
