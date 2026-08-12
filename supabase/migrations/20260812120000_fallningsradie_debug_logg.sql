-- TEMP debug-tabell för fällningsradie-kedjan (körvy). Loggar glest (max 1 rad/30 s) det
-- närmaste-symbol-avstånd som STYR fällningsradie-varningen + om varningen visades i ögonblicket.
--
-- OBS: REDAN APPLICERAD MANUELLT i Supabase (testrad in/läst/raderad) — denna fil är BARA för
-- historik. Kör den INTE mot databasen igen. Tas bort (drop table) i en senare PR när kedjan
-- bekräftats i maskin. Skriven idempotent ifall den ändå skulle köras.

create table if not exists public.fallningsradie_debug_logg (
  id                          bigint generated always as identity primary key,
  objekt_id                   text,
  tidpunkt                    timestamptz not null default now(),
  narmaste_symbol_avstand_m   integer,          -- null = ingen symbol inom varningens 300 m-fönster
  varning_visades             boolean not null default false
);

alter table public.fallningsradie_debug_logg enable row level security;

-- Körvyn skriver (anon i dev-bypass, authenticated i prod); läsning för verifiering. Temp, ej känslig data.
drop policy if exists fdl_insert on public.fallningsradie_debug_logg;
create policy fdl_insert on public.fallningsradie_debug_logg for insert to anon, authenticated with check (true);

drop policy if exists fdl_select on public.fallningsradie_debug_logg;
create policy fdl_select on public.fallningsradie_debug_logg for select to anon, authenticated using (true);
