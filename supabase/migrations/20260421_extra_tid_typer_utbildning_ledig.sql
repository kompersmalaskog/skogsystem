-- Utbildning och Ledig flyttas från arbetsdag.dagtyp (heldag) till extra_tid
-- (timer-baserat) för att samlas med övriga timer-aktiviteter.
ALTER TABLE extra_tid DROP CONSTRAINT IF EXISTS extra_tid_aktivitet_typ_check;
ALTER TABLE extra_tid ADD CONSTRAINT extra_tid_aktivitet_typ_check
  CHECK (aktivitet_typ IS NULL OR aktivitet_typ IN
    ('rotben','reservdelar','markagare','service','mote','flytt','annat','utbildning','ledig'));
