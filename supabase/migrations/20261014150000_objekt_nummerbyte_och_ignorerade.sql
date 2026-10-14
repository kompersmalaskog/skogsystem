-- Tillägg till 20261014140000_objekt_alt_nummer.sql (körs EFTER den — den första ändras inte, så den kan redan vara körd).
--
-- 1. NUMMERBYTE: vid namnträff byter importen objekt.vo_nummer till filens nummer och sparar det GAMLA numret som extra nummer
--    — men bara om det gamla numret saknar maskindata (detalj_stam, fakt_produktion, fakt_lass, fakt_tid). Det gamla numrets
--    alias-rad får byte_till = det nya numret; det är det som gör att bytet syns som en rad med Ångra i "Filer utan objekt".
--    byte_till IS NULL = vanligt extra nummer (som förut). Ingen ändring av check-regeln på kalla.
-- 2. IGNORERADE: en okopplad fil kan döljas ("Ignorera") utan att något raderas. Nyckeln är objekt_nyckel (stabil över
--    importens ersättning av snapshots, till skillnad från hpr_filer-raden) eller 'fil:<filnamn>' för filer utan nyckel.
--
-- ADDITIV och idempotent (ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS, policyer i DO-block, inget DROP).
-- Före den här migrationen: importen faller tillbaka på att spara det NYA numret som extra nummer (inget byte), kortet i
-- /redigering visar inga byten och Ignorera säger att tabellen saknas.
--
-- ROLLBACK:  drop table public.hpr_ignorerad;  alter table public.objekt_alt_nummer drop column byte_till;
--            (finns det byten kvar när kolumnen tas bort försvinner Ångra-raden — återställ objekt.vo_nummer först)

alter table public.objekt_alt_nummer add column if not exists byte_till text;

comment on column public.objekt_alt_nummer.byte_till is
  'Satt när importen BYTTE objekt.vo_nummer från nummer till byte_till (det gamla numret hade ingen maskindata). Ångra i /redigering sätter tillbaka numret och sparar byte_till som vanligt extra nummer.';

create table if not exists public.hpr_ignorerad (
  nyckel     text primary key,
  skapad     timestamptz not null default now(),
  skapad_av  uuid default auth.uid()
);

comment on table public.hpr_ignorerad is
  'Okopplade HPR-jobb som Martin dolt i "Filer utan objekt". Filerna raderas aldrig; "Visa ignorerade" tar fram dem igen och "Visa igen" tar bort markeringen. nyckel = hpr_filer.objekt_nyckel, eller fil:<filnamn> för filer utan nyckel.';

alter table public.hpr_ignorerad enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hpr_ignorerad' and policyname = 'hpr_ignorerad_las') then
    create policy hpr_ignorerad_las on public.hpr_ignorerad for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hpr_ignorerad' and policyname = 'hpr_ignorerad_skriv_admin') then
    create policy hpr_ignorerad_skriv_admin on public.hpr_ignorerad for insert to authenticated with check ((select public.ar_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hpr_ignorerad' and policyname = 'hpr_ignorerad_radera_admin') then
    create policy hpr_ignorerad_radera_admin on public.hpr_ignorerad for delete to authenticated using ((select public.ar_admin()));
  end if;
end $$;
