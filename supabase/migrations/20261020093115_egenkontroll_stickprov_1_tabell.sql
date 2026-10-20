-- Egenkontrollens månadsstickprov, del 1 av 4: tabellen. 2026-10-20 (PR 5).
--
-- Ett stickprov = ETT ankare slumpat bland FÖREGÅENDE månads avslutade objekt + de objekt som ligger nära ankaret (<= 15 km fågelväg,
-- högst två, aldrig "fyll upp till tre"). Dragningen sker EN gång per månad och kan inte göras om: raden är låst av triggern nedan,
-- och appen har ingen skrivväg alls (bara funktionerna i del 3 och 4, SECURITY DEFINER).
--
-- GRANSKNING (visa Vida att urvalet inte är handplockat): `fro` och `kandidater` sparas. Ankaret räknas om så här, utan databasen:
--   1. kandidater = raderna i `kandidater`, redan sorterade på id (text, stigande)
--   2. index      = (de första 60 bitarna av md5(fro) som heltal) mod antalet kandidater   (0-baserat)
--   3. ankare     = kandidater[index]
-- Grannarna följer av geografin (fågelväg, haversine, R = 6371 km), inte av slump.
--
-- Kör del 1-4 i ordning. Ingen av dem rör befintliga tabeller. Inget dras före 2026-11-01 (se del 4).

create table if not exists egenkontroll_stickprov (
  -- Första dagen i månaden stickprovet GÄLLER (svensk månad). Källmånaden är månaden före.
  manad            date primary key check (manad = date_trunc('month', manad)::date),
  kalla_manad      date not null check (kalla_manad = (manad - interval '1 month')::date),
  dragen_vid       timestamptz not null default now(),
  fro              text not null,
  algoritm_version int not null default 1,
  troskel_km       numeric not null default 15,
  max_antal        int not null default 3,
  -- Frusen kandidatlista: [{id, namn, typ, lat, lng, avslutat}], sorterad på id::text.
  kandidater       jsonb not null default '[]'::jsonb,
  ankare_index     int,
  ankare_objekt_id uuid,
  -- De dragna: [{objekt_id, namn, ordning, km_fran_ankare}], ankaret först (ordning 1). Tom lista = inget att kontrollera den månaden.
  valda            jsonb not null default '[]'::jsonb,
  -- Längsta fågelväg mellan två av de dragna (null om bara ett). Det är "X km isär" i vyn och i notisen.
  spridning_km     numeric,
  -- Varför det blev färre än tre. 'full' = tre valda.
  forklaring       text not null check (forklaring in ('full', 'tunn_manad', 'for_langt', 'ankare_utan_plats', 'inga_objekt'))
);

comment on table egenkontroll_stickprov is
  'Månadens stickprov för egenkontrollen. En rad per månad, dras en gång (första läsningen i månaden), låst. Se kommentaren i migrationen för hur ankaret räknas om ur fro + kandidater.';

alter table egenkontroll_stickprov enable row level security;

do $$ begin
  create policy egenkontroll_stickprov_las on egenkontroll_stickprov for select to authenticated using (true);
exception when duplicate_object then null;
end $$;

revoke all on egenkontroll_stickprov from anon, authenticated;
grant select on egenkontroll_stickprov to authenticated;

-- Låset: en dragning ändras eller raderas aldrig av någon (inte heller service_role). Medvetet underhåll i SQL-editorn:
--   select set_config('app.stickprov_tillat_andring','on',true);   -- i SAMMA transaktion
create or replace function egenkontroll_stickprov_las()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('app.stickprov_tillat_andring', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'Stickprovet är dragit och kan inte ändras eller göras om'
    using errcode = 'check_violation';
end $$;

create or replace trigger egenkontroll_stickprov_las
  before update or delete on egenkontroll_stickprov
  for each row execute function egenkontroll_stickprov_las();
