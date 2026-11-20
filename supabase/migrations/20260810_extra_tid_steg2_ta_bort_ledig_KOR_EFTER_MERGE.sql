-- STEG 2 av 2 — extra tid: ta bort 'ledig' ur tillåtna aktivitet_typ-värden.
--
-- ⚠ KÖRS FÖRST EFTER ATT FRONTEND-MERGEN ÄR VERIFIERAD I origin/main —
--   KÖR INTE AUTOMATISKT, KÖR INTE VID DEPLOY. Martin kör den manuellt via
--   Supabase-MCP när leveranskontrollen visar att 'ledig' är borta ur
--   frontend på origin/main.
--
-- Varför vänta: så länge en frontend som fortfarande visar "Ledig" kan vara
-- live (innan mergen deployats) måste 'ledig' vara tillåtet, annars kraschar
-- sparandet för den som väljer det. När Brandkontroll-frontend är live och
-- Ledig-alternativet är borta finns ingen väg kvar att skapa en 'ledig'-post.
--
-- Ofarlig: ingen extra_tid-rad använder 'ledig' (verifierat 2026-08-10 —
-- befintliga värden: markagare, flytt, annat, NULL) → ingen rad bryter mot
-- den nya constrainten.
ALTER TABLE extra_tid DROP CONSTRAINT IF EXISTS extra_tid_aktivitet_typ_check;
ALTER TABLE extra_tid ADD CONSTRAINT extra_tid_aktivitet_typ_check
  CHECK (aktivitet_typ IS NULL OR aktivitet_typ IN
    ('rotben','reservdelar','markagare','service','mote','flytt','annat','utbildning','brandkontroll'));
