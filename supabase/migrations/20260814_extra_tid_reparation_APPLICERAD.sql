-- REDAN APPLICERAD I PROD — KÖR INTE OM.
-- Speglar en CHECK-ändring som redan körts manuellt mot prod, så repot stämmer
-- med verkligheten (samma mönster som 20260810_..._brandkontroll_APPLICERAD).
--
-- 'reparation' lades till som EGEN aktivitet_typ (oplanerat haveri) skild från
-- 'service' (planerat underhåll). För uppföljningen är de två olika kostnadsslag
-- — planerad service är en förväntad kostnad, ett haveri är oplanerat stillestånd
-- — och får inte ligga i samma hink. Ingen befintlig rad rörs.
--
-- Idempotent (DROP IF EXISTS + ADD): landar rätt slutläge även om den mot
-- förmodan körs mot en miljö där ändringen inte gjorts manuellt.

ALTER TABLE extra_tid DROP CONSTRAINT IF EXISTS extra_tid_aktivitet_typ_check;
ALTER TABLE extra_tid ADD CONSTRAINT extra_tid_aktivitet_typ_check
  CHECK (aktivitet_typ IS NULL OR aktivitet_typ IN
    ('rotben','reservdelar','markagare','service','mote','flytt','annat','utbildning','brandkontroll','reparation'));
