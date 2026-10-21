-- Stubbtabeller för migrationen 20261021100000_lon_forarens_godkannande.sql (kolumnerna som triggrarna och funktionerna rör, som i prod 2026-10-21).
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
create schema auth;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

create table medarbetare (id uuid primary key default gen_random_uuid(), user_id uuid, namn text, roll text, aktiv boolean default true, foretagsledare boolean);
create function ar_admin() returns boolean language sql stable security definer as $$ select exists (select 1 from medarbetare where user_id = auth.uid() and roll = 'admin') $$;

create table loneunderlag (
  id uuid primary key default gen_random_uuid(), medarbetare_id text, namn text not null default 'x', period text not null,
  skickat_tidpunkt timestamptz, status text default 'inskickat', unique (medarbetare_id, period)
);
create table fortnox_export_logg (id uuid primary key default gen_random_uuid(), medarbetare_id uuid, period text, status text, unique (medarbetare_id, period));

create table arbetsdag (
  id uuid primary key default gen_random_uuid(), medarbetare_id uuid, datum date, dagtyp text, start_tid time, slut_tid time, rast_min integer,
  km_morgon integer, km_kvall integer, km_totalt integer, maskin_id text, traktamente boolean, redigerad boolean, bekraftad boolean, bekraftad_tid timestamptz,
  kommentar text, objekt_id text, synk_avvikelse jsonb, tidigarelagd_start jsonb, km_kalla text, brandrisk_beordrad boolean, arbetad_min integer, tidsfragor_svar jsonb
);
create table extra_tid (
  id uuid primary key default gen_random_uuid(), arbetsdag_id uuid, medarbetare_id uuid, datum date, typ text, minuter integer, debiterbar boolean, objekt_id text,
  objekt_namn text, kommentar text, start_tid time, slut_tid time, aktivitet_typ text, aktivitet_text text, kalla text, rast_min integer
);
create table "notis_kö" (
  id uuid primary key default gen_random_uuid(), mottagare_id uuid not null, typ text not null, payload jsonb not null default '{}', skapad_at timestamptz not null default now(),
  skickas_at timestamptz not null, skickad_at timestamptz, fel_meddelande text, datum date, dedup_nyckel text
);
create unique index notis_ko_dedup_nyckel_unik on "notis_kö" (typ, mottagare_id, dedup_nyckel);

grant usage on schema auth to authenticated, anon;
grant select on medarbetare to authenticated;
