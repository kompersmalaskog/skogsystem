-- ─────────────────────────────────────────────────────────────
-- DELDAG — frånvaro som börjar eller slutar mitt på dagen.
--
-- Martins fall: man blir sjuk mitt på dagen, jobbar förmiddagen, åker hem
-- efter lunch. ledighet_ansokningar hade bara startdatum/slutdatum: en dag
-- var antingen hel frånvaro eller ingen, och en halv sjukdag såg ut som en
-- vanlig kort dag.
--
-- Skogsavtalet §12 mom 3 räknar karens i TIMMAR (20 % av genomsnittlig
-- veckoarbetstid = 8 tim vid 40) och sjuklön "per timme som den anställde
-- skulle ha arbetat" — så det spelar roll hur många timmar man hann jobba.
-- docs/lonesystem/skogsavtalet-arbetstid.md.
--
-- Klockslag, inte timmar: klockslaget är det föraren vet ("åkte hem halv
-- tolv"). Timmarna härleds i lib/franvaro ur schematimmar minus arbetad tid
-- och lagras aldrig (beräkning = förslag, aldrig lagrad sanning).
--
-- Regeln "arbete vinner" gäller fortfarande för HELDAGSRADER: en heldags-
-- frånvaro på en arbetad dag är arbete. Bara deldagsrader (minst ett
-- klockslag) betyder arbete PLUS frånvaro. Sagt i lib/franvaro där kartan
-- byggs.
--
-- Semester är hela dagar (semesterlagen) och inarbetad dag är alltid hel —
-- spärren tillåter inte klockslag på dem.
-- Kör i prod av Martin, FÖRE koden (libben läser kolumnerna). Additivt.
-- ─────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE ledighet_ansokningar
  ADD COLUMN IF NOT EXISTS fran_tid time,
  ADD COLUMN IF NOT EXISTS till_tid time;

-- Deldag = EN dag, minst ett klockslag, bara typer som kan vara del av dag.
ALTER TABLE ledighet_ansokningar DROP CONSTRAINT IF EXISTS ledighet_deldag_regler;
ALTER TABLE ledighet_ansokningar
  ADD CONSTRAINT ledighet_deldag_regler CHECK (
    (fran_tid IS NULL AND till_tid IS NULL)
    OR (
      startdatum = slutdatum
      AND typ IN ('sjuk', 'vab', 'foraldraledig', 'atk', 'komp', 'permission', 'tjanstledig')
      AND (fran_tid IS NULL OR till_tid IS NULL OR fran_tid < till_tid)
    )
  );

COMMENT ON COLUMN ledighet_ansokningar.fran_tid IS
  'Deldag: frånvaron började vid detta klockslag (t.ex. sjuk från 11:30). NULL = från dagens början. Timmarna härleds i lib/franvaro ur schematimmar minus arbetad tid, lagras aldrig.';
COMMENT ON COLUMN ledighet_ansokningar.till_tid IS
  'Deldag: frånvaron slutade vid detta klockslag. NULL = till dagens slut.';

COMMIT;

-- EFTER:
--   select column_name, data_type from information_schema.columns
--     where table_name = 'ledighet_ansokningar' and column_name in ('fran_tid', 'till_tid');
--     → fran_tid time without time zone · till_tid time without time zone
--   select conname from pg_constraint
--     where conrelid = 'public.ledighet_ansokningar'::regclass and conname = 'ledighet_deldag_regler';
--     → ledighet_deldag_regler
--   select count(*) from ledighet_ansokningar where fran_tid is not null or till_tid is not null;  → 0
--   Negativtest (ska FELA — halv semesterdag):
--     insert into ledighet_ansokningar (anvandare_id, medarbetare_id, typ, startdatum, slutdatum, status, fran_tid)
--       values ('x', (select id from medarbetare limit 1), 'semester', '2026-10-05', '2026-10-05', 'väntar', '12:00');
--   Negativtest 2 (ska FELA — deldag över två dagar):
--     insert into ledighet_ansokningar (anvandare_id, medarbetare_id, typ, startdatum, slutdatum, status, fran_tid)
--       values ('x', (select id from medarbetare limit 1), 'sjuk', '2026-10-05', '2026-10-06', 'registrerad', '12:00');
