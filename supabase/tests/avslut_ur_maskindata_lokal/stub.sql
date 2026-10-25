-- Minimal databas för att köra migrationerna 20261024161546–161658 (avslut ur maskindata) lokalt.
-- Kolumnerna är de som funktionerna läser, med prod-namn (läst 2026-10-24).
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;

create table public.dim_objekt (
  objekt_id text primary key, object_name text, vo_nummer text, huvudtyp text, maskin_id text,
  exkludera boolean default false, extern_skordning boolean default false, egen_skotning boolean default false,
  ovrigt_info text,
  skordning_avslutad date, skordning_avslutad_auto boolean not null default false,
  skotning_avslutad date, skotning_avslutad_auto boolean not null default false
);
create table public.objekt (id uuid primary key default gen_random_uuid(), namn text, vo_nummer text, dim_objekt_id text);
create table public.objekt_alt_nummer (id uuid primary key default gen_random_uuid(), objekt_id uuid, nummer text, maskin_id text);
create table public.dim_maskin (maskin_id text primary key, maskin_typ text, visningsnamn text, datakalla text);
create table public.fakt_produktion (id serial, datum date, maskin_id text, objekt_id text, volym_m3sub numeric);
create table public.fakt_lass (id serial, datum date, maskin_id text, objekt_id text, volym_m3sub numeric);
create table public.fakt_tid (id serial, datum date, maskin_id text, objekt_id text,
  processing_sek int, terrain_sek int, other_work_sek int);
create table public.skotar_lass (id uuid primary key default gen_random_uuid(), objekt_id uuid, vo_nummer text,
  maskin_id text, datum date, status text);
create table public.skotar_lass_sortiment (lass_id uuid, del_nr int, sortiment_nyckel text, m3_forare numeric);
