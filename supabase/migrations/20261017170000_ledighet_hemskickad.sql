-- ─────────────────────────────────────────────────────────────
-- HEMSKICKAD — ny typ i ledighet_ansokningar (Martin 2026-10-17).
--
-- Maskinen gick sönder eller vädret stoppade jobbet och föraren skickades hem mitt på dagen. Valet "Maskinen gick sönder / väder" finns i
-- "Åkte hem" (Dag-vyn och Redigera). Raden är en DELDAG som de andra (klockslaget föraren åkte hem i fran_tid) men skiljer sig på en punkt:
-- den är INGEN frånvaro. Dagen fylls upp till 8 tim (arbetad + hemskickad = 8) och betalas som timlön (+ premie), räknas som arbetad tid mot
-- månadens ordinarie och ger aldrig övertid. Timmarna HÄRLEDS ur den arbetade tiden den dagen (lib/franvaro.hemskickadMinuter, lönemotorn) och
-- lagras aldrig — som för varje annan deldag.
--
-- Ändringar (alla additiva, inga data rörs):
--   1. typ: + 'hemskickad'.
--   2. ledighet_registrerad_bara_anmalan: 'hemskickad' får vara status 'registrerad' (anmäld av föraren, ingen godkännare) — som sjuk/vab/föräldraledig.
--   3. ledighet_deldag_regler: 'hemskickad' är en av typerna som får vara del av dag.
--   4. NY ledighet_hemskickad_deldag: en hemskickad rad HAR ett från-klockslag och inget till-klockslag (resten av dagen betalas upp till 8 tim;
--      en hel dag hemskickad eller ett intervall betyder inget).
--   5. RLS ledighet_insert_egen: egen insert som 'registrerad' tillåts även för 'hemskickad'.
--
-- Prod läst 2026-10-17 (bara SELECT): constraint- och policy-definitionerna nedan är exakt de som ersätts. Kör i prod av Martin FÖRE koden
-- (appen skriver typen; lönemotorn läser den). Raden filen heter efter körningen: byt till versionen prod stämplar (CLAUDE.md, punkt 5).
-- Rollback: längst ned.
-- ─────────────────────────────────────────────────────────────

BEGIN;

-- 1) typ
ALTER TABLE ledighet_ansokningar DROP CONSTRAINT IF EXISTS ledighet_ansokningar_typ_check;
ALTER TABLE ledighet_ansokningar
  ADD CONSTRAINT ledighet_ansokningar_typ_check CHECK (typ IN (
    'semester', 'atk', 'komp', 'sjuk', 'vab', 'foraldraledig', 'inarbetad', 'tjanstledig', 'permission',
    'hemskickad'      -- skickad hem mitt på dagen (maskin sönder, väder): del av dag, betalas upp till 8 tim
  ));

-- 2) registrerad (anmäld) = sjuk/vab/föräldraledig och hemskickad
ALTER TABLE ledighet_ansokningar DROP CONSTRAINT IF EXISTS ledighet_registrerad_bara_anmalan;
ALTER TABLE ledighet_ansokningar
  ADD CONSTRAINT ledighet_registrerad_bara_anmalan CHECK (
    status <> 'registrerad' OR typ IN ('sjuk', 'vab', 'foraldraledig', 'hemskickad')
  );

-- 3) deldag: en dag, minst ett klockslag, bara typer som kan vara del av dag
ALTER TABLE ledighet_ansokningar DROP CONSTRAINT IF EXISTS ledighet_deldag_regler;
ALTER TABLE ledighet_ansokningar
  ADD CONSTRAINT ledighet_deldag_regler CHECK (
    (fran_tid IS NULL AND till_tid IS NULL)
    OR (
      startdatum = slutdatum
      AND typ IN ('sjuk', 'vab', 'foraldraledig', 'atk', 'komp', 'permission', 'tjanstledig', 'hemskickad')
      AND (fran_tid IS NULL OR till_tid IS NULL OR fran_tid < till_tid)
    )
  );

-- 4) hemskickad: klockslaget föraren åkte hem, ingen sluttid
ALTER TABLE ledighet_ansokningar DROP CONSTRAINT IF EXISTS ledighet_hemskickad_deldag;
ALTER TABLE ledighet_ansokningar
  ADD CONSTRAINT ledighet_hemskickad_deldag CHECK (
    typ <> 'hemskickad' OR (fran_tid IS NOT NULL AND till_tid IS NULL AND startdatum = slutdatum)
  );

-- 5) RLS: egen insert — ansökan som 'väntar', eller anmälan som 'registrerad' (sjuk/vab/föräldraledig/hemskickad)
DROP POLICY IF EXISTS ledighet_insert_egen ON ledighet_ansokningar;
CREATE POLICY ledighet_insert_egen ON ledighet_ansokningar
  FOR INSERT TO authenticated
  WITH CHECK (
    medarbetare_id = aktuell_medarbetare_id()
    AND (
      status = 'väntar'
      OR (status = 'registrerad' AND typ IN ('sjuk', 'vab', 'foraldraledig', 'hemskickad'))
    )
  );

COMMIT;

-- FÖRE (prod 2026-10-17):
--   ledighet_ansokningar_typ_check           … 'permission'  (nio typer)
--   ledighet_registrerad_bara_anmalan        … typ IN ('sjuk','vab','foraldraledig')
--   ledighet_deldag_regler                   … typ IN ('sjuk','vab','foraldraledig','atk','komp','permission','tjanstledig')
--   ledighet_insert_egen (with check)        … status='registrerad' AND typ IN ('sjuk','vab','foraldraledig')
--
-- EFTER:
--   select conname from pg_constraint where conrelid = 'public.ledighet_ansokningar'::regclass and contype = 'c' order by 1;
--     → ledighet_ansokningar_status_check, ledighet_ansokningar_typ_check, ledighet_deldag_regler, ledighet_ersatter_bara_inarbetad,
--       ledighet_hemskickad_deldag, ledighet_inarbetad_en_vardag, ledighet_kalla_check, ledighet_registrerad_bara_anmalan
--   select count(*) from pg_constraint where conrelid = 'public.ledighet_ansokningar'::regclass and pg_get_constraintdef(oid) ilike '%hemskickad%'; → 4
--   select pg_get_expr(polwithcheck, polrelid) from pg_policy where polrelid = 'public.ledighet_ansokningar'::regclass and polname = 'ledighet_insert_egen';
--     → innehåller 'hemskickad'
--   select count(*) from ledighet_ansokningar where typ = 'hemskickad'; → 0   (inga data rörs)
--
-- Negativtest (ska FELA), i en transaktion som rullas tillbaka:
--   -- hel dag hemskickad (inget klockslag):
--   insert into ledighet_ansokningar (anvandare_id, medarbetare_id, typ, startdatum, slutdatum, status, kalla)
--     values ('x', (select id from medarbetare limit 1), 'hemskickad', '2026-10-05', '2026-10-05', 'registrerad', 'morgonkort');
--   -- med sluttid:
--   insert into ledighet_ansokningar (anvandare_id, medarbetare_id, typ, startdatum, slutdatum, status, kalla, fran_tid, till_tid)
--     values ('x', (select id from medarbetare limit 1), 'hemskickad', '2026-10-05', '2026-10-05', 'registrerad', 'morgonkort', '14:00', '15:00');
--   -- över två dagar:
--   insert into ledighet_ansokningar (anvandare_id, medarbetare_id, typ, startdatum, slutdatum, status, kalla, fran_tid)
--     values ('x', (select id from medarbetare limit 1), 'hemskickad', '2026-10-05', '2026-10-06', 'registrerad', 'morgonkort', '14:00');
-- Positivt (ska gå): samma med startdatum = slutdatum, fran_tid '14:00', till_tid null.
--
-- ROLLBACK (om en rad av typen hemskickad finns måste den tas bort först — annars vägrar CHECK-återställningen):
--   BEGIN;
--   DELETE FROM ledighet_ansokningar WHERE typ = 'hemskickad';   -- bara om det är avsikten
--   ALTER TABLE ledighet_ansokningar DROP CONSTRAINT IF EXISTS ledighet_hemskickad_deldag;
--   ALTER TABLE ledighet_ansokningar DROP CONSTRAINT IF EXISTS ledighet_ansokningar_typ_check;
--   ALTER TABLE ledighet_ansokningar ADD CONSTRAINT ledighet_ansokningar_typ_check CHECK (typ IN
--     ('semester','atk','komp','sjuk','vab','foraldraledig','inarbetad','tjanstledig','permission'));
--   ALTER TABLE ledighet_ansokningar DROP CONSTRAINT IF EXISTS ledighet_registrerad_bara_anmalan;
--   ALTER TABLE ledighet_ansokningar ADD CONSTRAINT ledighet_registrerad_bara_anmalan CHECK (status <> 'registrerad' OR typ IN ('sjuk','vab','foraldraledig'));
--   ALTER TABLE ledighet_ansokningar DROP CONSTRAINT IF EXISTS ledighet_deldag_regler;
--   ALTER TABLE ledighet_ansokningar ADD CONSTRAINT ledighet_deldag_regler CHECK (
--     (fran_tid IS NULL AND till_tid IS NULL) OR (startdatum = slutdatum
--       AND typ IN ('sjuk','vab','foraldraledig','atk','komp','permission','tjanstledig') AND (fran_tid IS NULL OR till_tid IS NULL OR fran_tid < till_tid)));
--   DROP POLICY IF EXISTS ledighet_insert_egen ON ledighet_ansokningar;
--   CREATE POLICY ledighet_insert_egen ON ledighet_ansokningar FOR INSERT TO authenticated WITH CHECK (
--     medarbetare_id = aktuell_medarbetare_id() AND (status = 'väntar' OR (status = 'registrerad' AND typ IN ('sjuk','vab','foraldraledig'))));
--   COMMIT;
