-- Minsta möjliga schema för att prova `skotar_lass_cykel` mot en RIKTIG
-- Postgres. Bara kolumnerna funktionen läser — inga policyer, inga triggrar.
create role authenticated;
create role service_role;

create table skotar_lass (
  id uuid primary key default gen_random_uuid(),
  vo_nummer text,
  objekt_id uuid,
  maskin_id text,
  datum date,
  status text,
  bekraftad_av text
);

create table skotar_lass_del (
  lass_id uuid,
  lossad_tid timestamptz,
  lat double precision,
  lng double precision
);

create table skotar_lass_sortiment (
  lass_id uuid,
  m3_forare numeric
);

create table hyttspar (
  id uuid primary key default gen_random_uuid(),
  objekt_id uuid,
  maskin_id text,
  roll text,
  datum date,
  points jsonb
);
