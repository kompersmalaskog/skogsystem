-- Minsta möjliga stub av de tabeller och funktioner som migrationerna 20261120140001–5 rör. Tabellerna är kopior av prod i de
-- kolumner som spelar roll; de ORIGINALA tidsutlösarna (now() vid varje insert/update) ligger med, eftersom del 3 ersätter dem.
create role authenticated;
create role service_role;
create role anon;

create function opti_tid_utc(t timestamptz, ar_utc boolean) returns timestamptz language sql stable parallel safe as
$$ select case when t is null or ar_utc then t else (t at time zone 'UTC') at time zone 'Europe/Stockholm' end $$;

create table medarbetare (id uuid primary key, namn text, roll text, maskin_id text, aktiv boolean default true, skapad timestamptz default now());
create table operator_medarbetare (operator_id text primary key, medarbetare_id uuid references medarbetare(id));
create table fakt_skift (id serial primary key, maskin_id text, operator_id text, datum date, inloggning_tid timestamptz, utloggning_tid timestamptz, tid_ar_utc boolean default true);
create table ledighet_ansokningar (id serial primary key, medarbetare_id uuid, status text, fran_tid time, till_tid time, startdatum date, slutdatum date);

create table skotar_lass (
  id uuid primary key, maskin_id text not null, medarbetare_id uuid references medarbetare(id), datum date not null, status text not null,
  bekraftad_av text, bekraftad_tid timestamptz, skapad timestamptz not null default now(), andrad timestamptz not null default now());
create table objekt_besok_kvittens (
  id uuid primary key default gen_random_uuid(), besok_id uuid not null, maskin_id text not null, roll text, forare_id uuid, kvitterad_at timestamptz default now(),
  testlage boolean default false, unique (besok_id, maskin_id));
create table korvy_kvittens_forare (
  id uuid primary key default gen_random_uuid(), objekt_id uuid not null, marker_id text not null, forare_id uuid not null, innehall_hash text,
  kvitterad_at timestamptz default now(), unique (objekt_id, marker_id, forare_id));
create table kommentar_sett_forare (
  id uuid primary key default gen_random_uuid(), objekt_id uuid not null, forare_id uuid not null, kommentar_ref text not null, innehall_hash text,
  sett_at timestamptz default now(), unique (objekt_id, forare_id, kommentar_ref));

-- Originalen i prod: serverns tid vid VARJE insert/update.
create function korvy_kvittens_forare_satt_tid() returns trigger language plpgsql as $$ begin new.kvitterad_at := now(); return new; end $$;
create function kommentar_sett_forare_satt_tid() returns trigger language plpgsql as $$ begin new.sett_at := now(); return new; end $$;
create function besok_tid_fran_servern() returns trigger language plpgsql as $$ begin new.kvitterad_at := now(); return new; end $$;
create trigger korvy_kvittens_forare_tid before insert or update on korvy_kvittens_forare for each row execute function korvy_kvittens_forare_satt_tid();
create trigger kommentar_sett_forare_tid before insert or update on kommentar_sett_forare for each row execute function kommentar_sett_forare_satt_tid();
create trigger besok_kvittens_tid before insert on objekt_besok_kvittens for each row execute function besok_tid_fran_servern();
