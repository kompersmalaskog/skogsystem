-- ─────────────────────────────────────────────────────────────
-- SAMLAD FRÅNVAROMODELL — STEG 1 av 3: vidga tabellen, rör inga läsare.
--
-- Bakgrund (utredning 2026-09-17, docs/lonesystem/franvaromodell.md):
-- frånvaro bor på två ställen — arbetsdag.dagtyp (oplanerad: sjuk/vab/
-- föräldraledig via morgonkortet) och ledighet_ansokningar (planerad:
-- semester/atk med ansökan + godkännande). Lön, kalender och Min tid måste
-- läsa båda, och två saker verksamheten faktiskt gör har inget begrepp alls:
--   - kompensationsledighet (Skogsavtalet §8 mom 3, 1,4 tim per övertids-
--     timme; Gävle-modellen: 80-timmarsvecka → ledig vecka), och
--   - skoftning / byte av dag (§5 mom 4: ledig fredag mot arbetad röd onsdag).
--
-- Målet: ledighet_ansokningar blir DEN frånvarotabellen. Steg 1 (den här
-- filen) gör bara schemat redo. Ingen kod skriver de nya typerna än, och
-- ingen läsare ändras — de fem som finns filtrerar status='godkänd' och
-- fortsätter få exakt samma rader som i dag (prod 2026-09-17: två rader,
-- semester/godkänd + semester/väntar).
--
-- Steg 2: morgonkortet skriver sjuk/vab/föräldraledig hit (status
--   'registrerad', kalla 'morgonkort') i stället för arbetsdag.dagtyp;
--   backfill av de två sjuk-raderna som finns. Steg 3: en lib läser EN källa
--   (lön, kalender, Min tid, ledighetsvyn), dagtyp-frånvaron slutar läsas.
--   Komp-saldot: beslut väntar (Fortnox eller appen).
--
-- Ändringar:
--   1. typ: semester, atk  →  + sjuk, vab, foraldraledig, komp, inarbetad,
--      tjanstledig, permission.
--   2. status: väntar, godkänd, nekad  →  + registrerad (frånvaro som bara
--      anmäls, ingen godkännare: sjuk/vab/föräldraledig).
--   3. ersatter_datum date: BARA för typ 'inarbetad' — den arbetade dagen
--      (t.ex. den röda onsdagen) som den lediga dagen byts mot. Ingen helglön
--      flyttas (§10 mom 2 — timmarna bortföll inte).
--   4. kalla text: ansokan (ledighetsvyn, default), morgonkort, admin, backfill.
--   5. RLS: egen insert får även vara status 'registrerad' för de tre
--      anmälningstyperna — det morgonkortet ska skriva i steg 2. Ansökningar
--      måste fortfarande skapas som 'väntar'. update/delete-egen rör vi inte
--      (registrerade rader rättas via godkännare tills steg 2 säger annat).
--
-- Kör i prod av Martin. Inget raderas; allt är additivt och kan backas med
-- DROP COLUMN + återställd CHECK.
-- ─────────────────────────────────────────────────────────────

-- FÖRE (förväntat 2026-09-17):
--   select typ, status, count(*) from ledighet_ansokningar group by 1,2;
--     semester | godkänd | 1
--     semester | väntar  | 1
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid = 'public.ledighet_ansokningar'::regclass and contype = 'c';
--     ledighet_ansokningar_typ_check    CHECK (typ IN ('semester','atk'))
--     ledighet_ansokningar_status_check CHECK (status IN ('väntar','godkänd','nekad'))

BEGIN;

-- 1) typ
ALTER TABLE ledighet_ansokningar DROP CONSTRAINT IF EXISTS ledighet_ansokningar_typ_check;
ALTER TABLE ledighet_ansokningar
  ADD CONSTRAINT ledighet_ansokningar_typ_check CHECK (typ IN (
    'semester',       -- intjänad (§10 mom 4)
    'atk',            -- intjänad, §6
    'komp',           -- intjänad, §8 mom 3 (1,4 tim per övertidstimme)
    'sjuk',           -- anmäls på morgonen
    'vab',            -- anmäls på morgonen
    'foraldraledig',  -- anmäls på morgonen
    'inarbetad',      -- skoftning §5 mom 4 — kräver ersatter_datum
    'tjanstledig',    -- ej intjänad; omger den helgdag → ingen helglön (§10 mom 4)
    'permission'      -- kort ledighet med lön
  ));

-- 2) status
ALTER TABLE ledighet_ansokningar DROP CONSTRAINT IF EXISTS ledighet_ansokningar_status_check;
ALTER TABLE ledighet_ansokningar
  ADD CONSTRAINT ledighet_ansokningar_status_check CHECK (status IN ('väntar', 'godkänd', 'nekad', 'registrerad'));

-- 3) ersatter_datum — bara för inarbetad, och alltid för inarbetad
ALTER TABLE ledighet_ansokningar ADD COLUMN IF NOT EXISTS ersatter_datum date;
ALTER TABLE ledighet_ansokningar DROP CONSTRAINT IF EXISTS ledighet_ansokningar_ersatter_datum_check;
ALTER TABLE ledighet_ansokningar
  ADD CONSTRAINT ledighet_ansokningar_ersatter_datum_check CHECK (
    (typ = 'inarbetad' AND ersatter_datum IS NOT NULL)
    OR (typ <> 'inarbetad' AND ersatter_datum IS NULL)
  );
COMMENT ON COLUMN ledighet_ansokningar.ersatter_datum IS
  'Skoftning (Skogsavtalet §5 mom 4): den arbetade dagen som den lediga dagen (startdatum–slutdatum) byts mot. Bara för typ = inarbetad.';

-- 4) kalla
ALTER TABLE ledighet_ansokningar ADD COLUMN IF NOT EXISTS kalla text NOT NULL DEFAULT 'ansokan';
ALTER TABLE ledighet_ansokningar DROP CONSTRAINT IF EXISTS ledighet_ansokningar_kalla_check;
ALTER TABLE ledighet_ansokningar
  ADD CONSTRAINT ledighet_ansokningar_kalla_check CHECK (kalla IN ('ansokan', 'morgonkort', 'admin', 'backfill'));
COMMENT ON COLUMN ledighet_ansokningar.kalla IS
  'Var raden kom ifrån: ansokan (ledighetsvyn), morgonkort (förarens frånvaroanmälan), admin, backfill (flytt från arbetsdag.dagtyp).';

-- 'registrerad' är bara för anmälningstyperna (sjuk/vab/föräldraledig via
-- morgonkortet). De kan också ansökas (väntar/godkänd/nekad, t.ex. planerad
-- föräldraledighet). Intjänad ledighet och skoftning kräver alltid
-- godkännande — aldrig 'registrerad'.
ALTER TABLE ledighet_ansokningar DROP CONSTRAINT IF EXISTS ledighet_ansokningar_registrerad_check;
ALTER TABLE ledighet_ansokningar
  ADD CONSTRAINT ledighet_ansokningar_registrerad_check CHECK (
    status <> 'registrerad' OR typ IN ('sjuk', 'vab', 'foraldraledig')
  );

-- 5) RLS: egen insert — ansökan som 'väntar', eller anmälan som 'registrerad'
DROP POLICY IF EXISTS ledighet_insert_egen ON ledighet_ansokningar;
CREATE POLICY ledighet_insert_egen ON ledighet_ansokningar
  FOR INSERT TO authenticated
  WITH CHECK (
    medarbetare_id = aktuell_medarbetare_id()
    AND (
      status = 'väntar'
      OR (status = 'registrerad' AND typ IN ('sjuk', 'vab', 'foraldraledig'))
    )
  );

COMMENT ON TABLE ledighet_ansokningar IS
  'All frånvaro per medarbetare (en period per rad). Ansökt (semester/atk/komp/inarbetad/tjanstledig/permission: väntar→godkänd/nekad) och anmäld (sjuk/vab/foraldraledig: registrerad). Ersätter arbetsdag.dagtyp-frånvaron när steg 2–3 är körda (docs/lonesystem/franvaromodell.md).';

COMMIT;

-- EFTER:
--   select typ, status, count(*) from ledighet_ansokningar group by 1,2;
--     → oförändrat: semester/godkänd 1, semester/väntar 1
--   select column_name, data_type, column_default from information_schema.columns
--     where table_name = 'ledighet_ansokningar' and column_name in ('ersatter_datum','kalla');
--     → ersatter_datum date NULL · kalla text 'ansokan'
--   select conname from pg_constraint where conrelid = 'public.ledighet_ansokningar'::regclass and contype='c' order by 1;
--     → ersatter_datum_check, kalla_check, registrerad_check, status_check, typ_check
--   select polname, pg_get_expr(polwithcheck, polrelid) from pg_policy
--     where polrelid = 'public.ledighet_ansokningar'::regclass and polname = 'ledighet_insert_egen';
--     → innehåller 'registrerad'
--   Negativtest (ska FELA på CHECK):
--     insert into ledighet_ansokningar (anvandare_id, medarbetare_id, typ, startdatum, slutdatum, status)
--       values ('x', (select id from medarbetare limit 1), 'inarbetad', current_date, current_date, 'godkänd');
--     → ERROR ledighet_ansokningar_ersatter_datum_check (ersatter_datum saknas)
