-- Lastbilsflytt ger förarens flyttrad (beslut Martin 2026-10-19).
--
-- *** LEVERERAD SOM FIL — KÖRS AV MARTIN (apply_migration), INTE AV KODEN. Körs FÖRE att production förs fram. ***
-- *** BYGGER PÅ 20261025160000_flytt_som_egen_rad.sql (GPS-flytten, PR #832): kör den FÖRST. Den här filen avbryter annars. ***
-- Efter körningen: hämta versionen prod stämplade och döp om filen till den (CLAUDE.md, Deploy-flöde punkt 5).
-- Koden är byggd för att vänta: utan migrationen skapas ingen flyttloggsrad och synken stannar aldrig (lib/flyttloggSynk.ts).
--
-- Flyttloggen (maskin_flytt) säger när lastbilen hämtade maskinen (hamtad_tid) och lämnade den (sluttid). Synken skriver en
-- flyttrad hos den förare som hade maskinen den dagen, som ett SEGMENT (arbetsdag_segment, kalla 'flyttlogg'): tid MÄRKT inom
-- den redan betalda dagen. Lönen läser aldrig segment, så den är oförändrad (lib/lonesystem/flytt.lon.test.ts).
--
-- Tre additiva delar:
--   1. arbetsdag_segment.kalla får värdet 'flyttlogg'.
--   2. arbetsdag_segment.flytt_id — flyttens id i maskin_flytt. Raden "är" flytten: synken skapar den aldrig två gånger, inte
--      heller efter att föraren ändrat tiden på den. Unikt per flytt, så två samtidiga synkar inte kan skriva den dubbelt.
--   3. arbetsdag_flytt_borta.flytt_id — svepad-gravsten för en rad från flyttloggen: flyttens id (inte tiden) hindrar att den
--      skapas igen, också när flyttens tider rättas i loggen.

do $$ begin
  if to_regclass('arbetsdag_flytt_borta') is null then
    raise exception 'Kör 20261025160000_flytt_som_egen_rad.sql (GPS-flytten) FÖRST: arbetsdag_flytt_borta saknas.';
  end if;
end $$;

alter table arbetsdag_segment add column if not exists flytt_id uuid;
alter table arbetsdag_flytt_borta add column if not exists flytt_id uuid;

-- En flytt ger högst EN rad. (Inga FK: maskin_flytt rättas och strykas av admin, och en rad föraren redan fått ska inte försvinna.)
create unique index if not exists ux_arbetsdag_segment_flytt_id on arbetsdag_segment (flytt_id) where flytt_id is not null;
create index if not exists ix_arbetsdag_flytt_borta_flytt_id on arbetsdag_flytt_borta (flytt_id) where flytt_id is not null;

-- Före: CHECK (kalla IN ('forare','synk','flytt')) från GPS-migrationen. Samma konstruktion, längre lista.
alter table arbetsdag_segment drop constraint if exists arbetsdag_segment_kalla_check;
alter table arbetsdag_segment add constraint arbetsdag_segment_kalla_check
  check (kalla in ('forare', 'synk', 'flytt', 'flyttlogg'));

comment on column arbetsdag_segment.flytt_id is
  'maskin_flytt.id för en rad som synken skapat ur flyttloggen (kalla = ''flyttlogg''); annars null. Ingen FK.';
comment on column arbetsdag_flytt_borta.flytt_id is
  'maskin_flytt.id när föraren svepat bort en rad från flyttloggen; null för en borttagen GPS-rad (som känns igen på tiden).';

-- ── Kvitto ──────────────────────────────────────────────────────────────────────────────────────────────
-- Förväntat: kalla_check innehåller 'flyttlogg' · båda kolumnerna finns (2) · det unika indexet finns (1).
select
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'arbetsdag_segment_kalla_check') as kalla_check,
  (select count(*) from information_schema.columns where column_name = 'flytt_id' and table_name in ('arbetsdag_segment', 'arbetsdag_flytt_borta')) as kolumner,
  (select count(*) from pg_indexes where indexname = 'ux_arbetsdag_segment_flytt_id') as unikt_index;
