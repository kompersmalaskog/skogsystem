-- Maskinflytt som egen rad i förarens dag (beslut Martin 2026-10-19).
--
-- *** LEVERERAD SOM FIL — KÖRS AV MARTIN (apply_migration), INTE AV KODEN. Körs FÖRE att production förs fram. ***
-- Efter körningen: hämta versionen prod stämplade och döp om filen till den (CLAUDE.md, Deploy-flöde punkt 5).
-- Koden är byggd för att vänta: utan migrationen skapas ingen flyttrad och synken stannar aldrig (lib/flyttSynk.ts).
--
-- Tre delar, alla additiva:
--   1. arbetsdag_segment.kalla får värdet 'flytt' (rader som synken skapat ur maskinens GPS-spår).
--   2. arbetsdag_flytt_borta — "gravstenar": en flyttrad föraren tagit bort eller flyttat på får inte skapas igen av
--      nästa synk (som kör var 5:e minut). Utan den kommer varje borttagen rad tillbaka.
--   3. flytt_luckor(maskin, dag, min_minuter) — GPS-luckor mellan två objekt för en maskin och en dag. Bara
--      förfiltrering på tid; regeln (≥ 30 min OCH ≥ 2 km, klippt mot förarens pass) bor i lib/flyttRad.ts.
--
-- Raden är ett SEGMENT: tid MÄRKT inom förarens inloggade dag. Den tiden ligger redan i arbetad_min, så raden lägger inte
-- till något — lönen läser aldrig arbetsdag_segment (se 20260814_arbetsdag_segment.sql och lib/lonesystem/flytt.lon.test.ts).

-- ── 1. kalla får 'flytt' ────────────────────────────────────────────────────────────────────────────────
-- Prod före: CHECK (kalla IN ('forare','synk')). Konstruktionen är densamma, bara listan är längre.
alter table arbetsdag_segment drop constraint if exists arbetsdag_segment_kalla_check;
alter table arbetsdag_segment add constraint arbetsdag_segment_kalla_check
  check (kalla in ('forare', 'synk', 'flytt'));

-- ── 2. Gravstenar ───────────────────────────────────────────────────────────────────────────────────────
-- Nycklad på (medarbetare_id, datum) som arbetsdag_segment, utan koppling till arbetsdag: synkens delete+insert av
-- arbetsdag rör den aldrig. Tidsintervallet är det synken inte får skapa en rad på igen (överlapp, inte exakt likhet —
-- en ny GPS-fil kan flytta luckans kanter någon minut).
create table if not exists arbetsdag_flytt_borta (
  id             uuid primary key default gen_random_uuid(),
  medarbetare_id uuid not null references medarbetare(id) on delete cascade,
  datum          date not null,
  start_tid      time not null,
  slut_tid       time not null,
  skapad         timestamptz not null default now(),
  constraint arbetsdag_flytt_borta_tid_ordning check (slut_tid > start_tid)
);
create index if not exists ix_arbetsdag_flytt_borta_med_datum on arbetsdag_flytt_borta (medarbetare_id, datum);

alter table arbetsdag_flytt_borta enable row level security;
-- Föraren skriver sin egen gravsten när hen tar bort eller flyttar en flyttrad; admin får göra det åt någon annan.
-- Synken (service_role) går förbi RLS. Ingen UPDATE/DELETE: en gravsten är bara en gravsten.
drop policy if exists arbetsdag_flytt_borta_select on arbetsdag_flytt_borta;
drop policy if exists arbetsdag_flytt_borta_insert on arbetsdag_flytt_borta;
create policy arbetsdag_flytt_borta_select on arbetsdag_flytt_borta
  for select using (medarbetare_id = aktuell_medarbetare_id() or ar_admin());
create policy arbetsdag_flytt_borta_insert on arbetsdag_flytt_borta
  for insert with check (medarbetare_id = aktuell_medarbetare_id() or ar_admin());

comment on table arbetsdag_flytt_borta is
  'Flyttrader (arbetsdag_segment.kalla = ''flytt'') som föraren tagit bort eller flyttat på. Synken skapar ingen ny flyttrad '
  'som överlappar en rad här. Läses och skrivs aldrig av lönen.';

-- ── 3. GPS-luckor mellan två objekt ─────────────────────────────────────────────────────────────────────
-- Spåret sorteras på LOKAL tid (opti_tid_lokal), aldrig på rå tidpunkt: rader med olika tid_ar_utc ligger olika många
-- timmar fel i rådata, och en rå sortering ger 120-minutersluckor som inte finns (Giant 2026-10-13, uppmätt).
-- Bara luckor som börjar OCH slutar samma lokala dag (parkering över natten är ingen flytt) och är minst p_min_min långa.
-- Fönstret på rå tidpunkt är avsiktligt brett (−1 till +2 dygn) så att ingen rad faller utanför på grund av flaggan.
create or replace function flytt_luckor(p_maskin_id text, p_datum date, p_min_min integer)
returns table (
  fran_objekt_id text, till_objekt_id text,
  start_lokal timestamp, slut_lokal timestamp,
  fran_lat double precision, fran_lng double precision, till_lat double precision, till_lng double precision
)
language sql stable
set search_path = public, pg_temp
as $$
  with p as (
    select s.objekt_id::text as objekt_id,
           opti_tid_lokal(s.tidpunkt, s.tid_ar_utc) as t,
           s.latitude::double precision as lat, s.longitude::double precision as lng
      from detalj_gps_spar s
     where s.maskin_id = p_maskin_id
       and s.tidpunkt >= (p_datum::timestamp - interval '1 day')
       and s.tidpunkt <  (p_datum::timestamp + interval '2 days')
       and s.latitude is not null and s.longitude is not null and s.objekt_id is not null
  ), q as (
    select p.*,
           lag(objekt_id) over w as po, lag(t) over w as pt, lag(lat) over w as plat, lag(lng) over w as plng
      from p
    window w as (order by t)
  )
  select po, objekt_id, pt, t, plat, plng, lat, lng
    from q
   where po is not null and po is distinct from objekt_id
     and pt::date = p_datum and t::date = p_datum
     and extract(epoch from (t - pt)) >= p_min_min * 60
   order by pt;
$$;

-- Bara synken (service_role) anropar den. GPS-spåret är inget förarna ska kunna bläddra i via RPC.
revoke all on function flytt_luckor(text, date, integer) from public, anon, authenticated;
grant execute on function flytt_luckor(text, date, integer) to service_role;

comment on function flytt_luckor(text, date, integer) is
  'GPS-luckor mellan två objekt för en maskin och en lokal dag (≥ p_min_min minuter). Förfiltrering för mom-import steg 7d; '
  'regeln 30 min + 2 km bor i lib/flyttRad.ts.';

-- ── Kvitto ──────────────────────────────────────────────────────────────────────────────────────────────
-- Förväntat: kalla_check innehåller 'flytt' · gravstenar = 0 · funktionen finns · 4 luckor ≥ 30 min senaste tre månaderna
-- för R64428 per dag (Oskar 10-01, 10-05, 10-10, 10-12; de som ligger på redan bekräftade dagar får ingen rad).
select
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'arbetsdag_segment_kalla_check') as kalla_check,
  (select count(*) from arbetsdag_flytt_borta) as gravstenar,
  (select count(*) from pg_proc where proname = 'flytt_luckor') as funktion,
  (select count(*) from flytt_luckor('R64428', date '2026-10-12', 30)) as oskar_12_okt;
