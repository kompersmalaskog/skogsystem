-- STEG 1 av 2 — extra tid: lägg till 'brandkontroll' (kontrollrunda efter
-- avslutat arbete). BÅDE 'ledig' OCH 'brandkontroll' tillåts i detta steg.
--
-- ⚠ REDAN APPLICERAD I PROD 2026-08-10 via Supabase-MCP — KÖR INTE OM.
-- Filen speglar det som redan finns i prod (dokumentation/andra miljöer).
--
-- Varför båda tillåts samtidigt: annars uppstår ett glapp mellan DB och
-- frontend under utrullningen —
--   * migration utan 'brandkontroll' först → ny frontend visar Brandkontroll
--     innan DB tillåter den → sparandet avvisas.
--   * migration utan 'ledig' först → gammal (ännu ej deployad) frontend visar
--     Ledig → sparandet avvisas.
-- Med båda tillåtna kan inget led gå sönder. 'ledig' tas bort i STEG 2 FÖRST
-- efter att frontend-mergen är verifierad i origin/main.
ALTER TABLE extra_tid DROP CONSTRAINT IF EXISTS extra_tid_aktivitet_typ_check;
ALTER TABLE extra_tid ADD CONSTRAINT extra_tid_aktivitet_typ_check
  CHECK (aktivitet_typ IS NULL OR aktivitet_typ IN
    ('rotben','reservdelar','markagare','service','mote','flytt','annat','utbildning','ledig','brandkontroll'));
