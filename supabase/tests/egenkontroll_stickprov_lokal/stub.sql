do $$ begin create role anon; exception when duplicate_object then null; end $$; do $$ begin create role authenticated; exception when duplicate_object then null; end $$; do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create table objekt (id uuid primary key default gen_random_uuid(), namn text not null, typ text, status text, lat double precision, lng double precision,
  faktisk_slut date, avslutad_timestamp timestamptz, avverkningsform text);
create table medarbetare (id uuid primary key default gen_random_uuid(), epost text);
insert into medarbetare (epost) values ('martin.lindqvist@kompersmalaskog.com'), ('joacim.ringberg@kompersmalaskog.com');
create table "notis_kö" (id uuid primary key default gen_random_uuid(), mottagare_id uuid not null, typ text not null, payload jsonb not null default '{}',
  skapad_at timestamptz not null default now(), skickas_at timestamptz not null, skickad_at timestamptz, fel_meddelande text, datum date, dedup_nyckel text);
create unique index notis_ko_datum_unik on "notis_kö" (typ, mottagare_id, datum) where datum is not null;
