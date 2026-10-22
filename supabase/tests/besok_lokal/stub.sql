-- Stubbar för att köra migrationen 20261022170000_besok_pa_trakten.sql mot en tom Postgres (ingen Supabase behövs).
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create schema if not exists auth;
-- Som Supabase: nya tabeller och funktioner i public ges till anon/authenticated/service_role automatiskt. Migrationen ska dra tillbaka det den inte vill ha.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table medarbetare (id uuid primary key default gen_random_uuid(), user_id uuid unique, namn text, roll text not null default 'forare');
create table objekt (id uuid primary key default gen_random_uuid(), namn text, status text default 'planerad');
create or replace function public.korvy_min_medarbetare() returns uuid language sql stable security definer set search_path to 'public' as $$ select id from public.medarbetare where user_id = auth.uid() limit 1 $$;
create table fakt_produktion (objekt_id text, datum date, volym_m3sub numeric);
create table fakt_lass (objekt_id text, datum date, volym_m3sub numeric);
create table skotar_lass_sortiment_skalat (objekt_id uuid, datum date, status text, m3_skalat numeric, m3_forare numeric);
grant usage on schema public, auth to anon, authenticated, service_role;
grant select on medarbetare, objekt to authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function public.korvy_min_medarbetare() to authenticated, service_role;
