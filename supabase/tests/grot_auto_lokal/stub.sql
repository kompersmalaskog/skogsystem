-- Minimal databas för att köra 20261121165916_grot_hamtad_automatiskt.sql lokalt (kolumnerna med prod-namn, läst 2026-11-21).
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create schema if not exists cron;
create table cron.job (jobname text primary key, schedule text, command text);
create function cron.schedule(n text, s text, c text) returns bigint language sql as
  $$ insert into cron.job values (n, s, c) on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command; select 1::bigint $$;

create table public.dim_objekt (
  objekt_id text primary key, object_name text, huvudtyp text, risskotning boolean default false,
  exkludera boolean default false, skotning_avslutad date, grot_hamtad date
);
create table public.grot_koppling (
  risjobb_objekt_id text references dim_objekt(objekt_id), avverknings_objekt_id text references dim_objekt(objekt_id),
  skapad_tid timestamptz default now(), auto_avbockad_datum date,
  primary key (risjobb_objekt_id, avverknings_objekt_id)
);
create table public.helikopter_lass (datum date, maskin_id text, objekt_id text, volym_m3sub numeric, skapad_tid timestamptz, kalla text);
create table public.hyttspar (id uuid default gen_random_uuid(), objekt_id uuid, maskin_id text, roll text, datum date, points jsonb);
create table public.detalj_stam (id serial, objekt_id text, maskin_id text, latitude float8, longitude float8, tidpunkt timestamp);
