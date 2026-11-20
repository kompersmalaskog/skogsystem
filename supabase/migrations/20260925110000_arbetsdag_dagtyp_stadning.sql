-- ─────────────────────────────────────────────────────────────
-- FRÅNVAROMODELLEN STEG 3 — arbetsdag.dagtyp betyder bara "sorts maskindag".
--
-- Frånvaro bor sedan steg 2 uteslutande i ledighet_ansokningar (lib/franvaro).
-- Två rader i arbetsdag bär fortfarande dagtyp = 'sjuk' från tiden före:
--   Martin Lindqvist 2026-05-10  id 129f27d9-a043-4be1-bd98-0b75ba460271
--   Joacim Ringberg  2026-08-19  id f77f78bc-dbf8-4ae5-aae0-5c7328575858
-- Båda har arbetad_min NULL, ingen start/slut, och båda finns som rader i
-- ledighet_ansokningar (kalla 'backfill', migration 20260918110000). De sätts
-- till 'normal' — värdet appen ger en förarskapad rad. Raderna raderas inte.
--
-- Prod 2026-09-25: dagtyp = 'Produktion' 907 rader (Python-importen),
-- 'normal' 131 (appen/MOM-routen), 'sjuk' 2. Inga NULL. Kolumnen har aldrig
-- haft en CHECK — det var därför frånvaron kunde hamna där från början.
-- Efter uppdateringen får den en: bara Produktion och normal (NULL tillåts,
-- ingen skrivare förlitar sig på det men ingen ska heller falla på det).
--
-- Kör i prod av Martin. Koden (steg 3-PR:en) beror inte på ordningen: de två
-- raderna saknar tid och räknas inte som dag oavsett dagtyp.
-- ─────────────────────────────────────────────────────────────

-- FÖRE:
--   select dagtyp, count(*) from arbetsdag group by 1;  → Produktion 907 · normal 131 · sjuk 2

BEGIN;

UPDATE arbetsdag SET dagtyp = 'normal'
 WHERE id IN ('129f27d9-a043-4be1-bd98-0b75ba460271', 'f77f78bc-dbf8-4ae5-aae0-5c7328575858')
   AND dagtyp = 'sjuk';

-- Spärr: inga frånvarovärden kvar innan CHECK:en läggs
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM arbetsdag WHERE dagtyp IS NOT NULL AND dagtyp NOT IN ('Produktion', 'normal');
  IF n <> 0 THEN
    RAISE EXCEPTION 'Steg 3: % rader har annat dagtyp än Produktion/normal', n;
  END IF;
END $$;

ALTER TABLE arbetsdag DROP CONSTRAINT IF EXISTS arbetsdag_dagtyp_check;
ALTER TABLE arbetsdag
  ADD CONSTRAINT arbetsdag_dagtyp_check CHECK (dagtyp IS NULL OR dagtyp IN ('Produktion', 'normal'));

COMMENT ON COLUMN arbetsdag.dagtyp IS
  'Sorts maskindag: Produktion (Python-importen) eller normal (appen/MOM-routen). ALDRIG frånvaro — den bor i ledighet_ansokningar (lib/franvaro) sedan 2026-09-18.';

COMMIT;

-- EFTER:
--   select dagtyp, count(*) from arbetsdag group by 1;  → Produktion 907 · normal 133
--   select id, datum, dagtyp from arbetsdag where id in ('129f27d9-a043-4be1-bd98-0b75ba460271', 'f77f78bc-dbf8-4ae5-aae0-5c7328575858');
--     → båda 'normal'
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid = 'public.arbetsdag'::regclass and conname = 'arbetsdag_dagtyp_check';
--   Negativtest (ska FELA på arbetsdag_dagtyp_check):
--     update arbetsdag set dagtyp = 'sjuk' where id = 'f77f78bc-dbf8-4ae5-aae0-5c7328575858';
--   Frånvaron finns kvar där den ska:
--   select l.startdatum, m.namn, l.typ, l.status from ledighet_ansokningar l join medarbetare m on m.id = l.medarbetare_id
--     where l.kalla = 'backfill' order by 1;  → 2026-05-10 Martin sjuk registrerad · 2026-08-19 Joacim sjuk registrerad
