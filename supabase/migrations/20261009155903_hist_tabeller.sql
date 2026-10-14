-- Historikimport (steg 8): nya tabeller hist_* för produktionsrapporter 2011-2026 ur mejlexporterna.
-- Bara CREATE TABLE, CREATE INDEX, CREATE POLICY och ALTER TABLE ... ENABLE ROW LEVEL SECURITY, och bara för tabeller som börjar på hist_.
-- Ingen befintlig tabell, vy eller funktion rörs. Inga foreign keys mot befintliga tabeller (maskin_id är en ren textkoppling till dim_maskin).
-- RLS: inloggade får läsa, ingen skrivpolicy finns => skrivning sker bara med service_role (som kringgår RLS).
-- Lagrar bara fakta ur rapporterna. Index, normkurvor och jämförelser lagras inte.
-- Bucketen "historik" skapas av importskriptet (scripts/historik/importera.py), inte här.

create table hist_maskin (
  id uuid primary key default gen_random_uuid(),
  namn text not null unique,
  typ text,
  tillverkare text,
  identifierare text,
  fran date,
  till date,
  agare text,
  maskin_id text,
  skapad timestamptz not null default now()
);

create table hist_forare (
  id uuid primary key default gen_random_uuid(),
  namn text not null unique,
  alias text[] not null default '{}',
  teknisk boolean not null default false,
  skapad timestamptz not null default now()
);

create table hist_rapport (
  sha256 text primary key,
  format text not null,
  typ text not null,
  hist_maskin_id uuid references hist_maskin(id),
  maskin_kalla text,
  mejldatum date,
  avsandare text,
  filnamn text,
  filtyp text,
  storage_path text,
  exkluderad boolean not null default false,
  exkluderad_orsak text,
  tolkad boolean not null default false,
  skapad timestamptz not null default now()
);

create table hist_objekt (
  sha256 text primary key references hist_rapport(sha256),
  objekt text,
  objektnr text,
  startdatum date,
  slutdatum date,
  rapportdatum date,
  atgard text,
  atgard_kalla text,
  stammar integer,
  volym_m3fub numeric(12,3),
  volym_enhet text,
  g15_h numeric(10,3),
  g0_h numeric(10,3),
  motortid_h numeric(10,3),
  bransle_l numeric(10,1),
  avbrott_reparation_min integer,
  avbrott_service_min integer,
  avbrott_storning_min integer,
  avbrott_flytt_min integer,
  avbrott_trailer_min integer,
  avbrott_varmkorning_min integer,
  avbrott_ovrigt_min integer,
  avbrott_totalt_min integer,
  avbrott_registrerade text,
  objekt_nyckel text,
  programversion text,
  antal_lass integer,
  volym_kvalitet text,
  livstid_h numeric(10,1),
  skapad timestamptz not null default now()
);

create table hist_skift (
  id bigint generated always as identity primary key,
  hist_maskin_id uuid not null references hist_maskin(id),
  hist_forare_id uuid not null references hist_forare(id),
  datum date not null,
  in_tid time not null,
  ut_tid time,
  g15_h numeric(10,3),
  g0_h numeric(10,3),
  volym numeric(12,3),
  volym_enhet text,
  stammar integer,
  bransle_l numeric(10,1),
  motortid_h numeric(10,3),
  sha256 text references hist_rapport(sha256),
  kalla text,
  objekt text,
  skapad timestamptz not null default now(),
  unique (hist_maskin_id, hist_forare_id, datum, in_tid)
);

create table hist_forare_objekt (
  sha256 text not null references hist_rapport(sha256),
  hist_forare_id uuid not null references hist_forare(id),
  g15_h numeric(10,3),
  volym numeric(12,3),
  stammar integer,
  skapad timestamptz not null default now(),
  primary key (sha256, hist_forare_id)
);

create table hist_stopp (
  id bigint generated always as identity primary key,
  hist_maskin_id uuid not null references hist_maskin(id),
  datum date not null,
  tid time not null,
  felkod text not null,
  beskrivning text,
  minuter integer,
  forare text,
  sha256 text references hist_rapport(sha256),
  skapad timestamptz not null default now(),
  unique (hist_maskin_id, datum, tid, felkod)
);

create index hist_rapport_maskin_idx on hist_rapport (hist_maskin_id);
create index hist_rapport_exkluderad_idx on hist_rapport (exkluderad);
create index hist_objekt_rapportdatum_idx on hist_objekt (rapportdatum);
create index hist_objekt_nyckel_idx on hist_objekt (objekt_nyckel);
create index hist_skift_maskin_datum_idx on hist_skift (hist_maskin_id, datum);
create index hist_skift_forare_datum_idx on hist_skift (hist_forare_id, datum);
create index hist_skift_sha256_idx on hist_skift (sha256);
create index hist_forare_objekt_forare_idx on hist_forare_objekt (hist_forare_id);
create index hist_stopp_maskin_datum_idx on hist_stopp (hist_maskin_id, datum);

alter table hist_maskin enable row level security;
alter table hist_forare enable row level security;
alter table hist_rapport enable row level security;
alter table hist_objekt enable row level security;
alter table hist_skift enable row level security;
alter table hist_forare_objekt enable row level security;
alter table hist_stopp enable row level security;

create policy hist_maskin_las on hist_maskin for select to authenticated using (true);
create policy hist_forare_las on hist_forare for select to authenticated using (true);
create policy hist_rapport_las on hist_rapport for select to authenticated using (true);
create policy hist_objekt_las on hist_objekt for select to authenticated using (true);
create policy hist_skift_las on hist_skift for select to authenticated using (true);
create policy hist_forare_objekt_las on hist_forare_objekt for select to authenticated using (true);
create policy hist_stopp_las on hist_stopp for select to authenticated using (true);
