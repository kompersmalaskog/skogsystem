-- REDAN APPLICERAD I PROD — KÖR INTE OM.
-- Speglar en CHECK-ändring som redan körts manuellt mot prod, så repot stämmer
-- med verkligheten. 'reparation' lades till som egen aktivitet_typ (oplanerat
-- haveri) skild från 'service' (planerat underhåll) — för uppföljningen är de
-- två olika kostnadsslag och får inte ligga i samma hink.
--
-- CHECK tillåter nu: rotben, reservdelar, markagare, service, mote, flytt,
-- annat, utbildning, brandkontroll, reparation.
--
-- Idempotent: droppar ev. gammal constraint och sätter den kompletta listan.
-- Om detta av någon anledning körs mot en miljö där ändringen INTE gjorts
-- manuellt landar rätt slutläge ändå.

ALTER TABLE extra_tid DROP CONSTRAINT IF EXISTS extra_tid_aktivitet_typ_check;

ALTER TABLE extra_tid ADD CONSTRAINT extra_tid_aktivitet_typ_check
  CHECK (aktivitet_typ IS NULL OR aktivitet_typ IN (
    'rotben', 'reservdelar', 'markagare', 'service', 'mote',
    'flytt', 'annat', 'utbildning', 'brandkontroll', 'reparation'
  ));
