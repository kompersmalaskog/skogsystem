-- Lokalt test av lastbil_vikt_manad (migration 20261020111258). Körs mot en tom Postgres, ingen Supabase behövs:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/lastbil_vikt_manad.sql <db>     (från repo-roten: migrationen läses med \i)
-- Varje fall har sitt facit i kommentaren; testet kastar om en rad avviker.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
end $$;
create table lastbil_logg (vin text, tidpunkt timestamptz, odometer_m bigint, bransle_ml bigint, radata jsonb);
create or replace function w(k text) returns jsonb language sql as $$ select jsonb_build_object('rfms', jsonb_build_object('grossCombinationVehicleWeight', k)) $$;

-- Bil A, 10 aug (04:00Z = 06:00 svensk tid)
insert into lastbil_logg values
 ('A','2026-08-10 04:00Z',1000000,100000,w('28000')),
 ('A','2026-08-10 04:08Z',1010000,103000,w('28000')),  -- tom 10 km, 3 l
 ('A','2026-08-10 04:16Z',1010000,104000,w('28000')),  -- står still (1 l tomgång): räknas inte, varken km eller liter
 ('A','2026-08-10 04:24Z',1020000,109000,w('36000')),  -- tom -> lastad: okänd 10 km, 5 l
 ('A','2026-08-10 04:32Z',1050000,129000,w('36000')),  -- lastad 30 km, 20 l
 ('A','2026-08-10 04:40Z',1060000,null,  w('0')),      -- lastad -> okänd vikt: lastad 10 km, bränsle saknas
 ('A','2026-08-10 04:48Z',1070000,null,  null),        -- okänd + okänd: okänd 10 km, bränsle saknas
 ('A','2026-08-10 04:56Z',1065000,130000,w('30000')),  -- mätaren bakåt: räknas inte
 ('A','2026-08-10 05:04Z',1075000,135000,w('abc'));    -- tom -> okänd vikt (text): tom 10 km, 5 l
-- Bil D, mellan A:s punkter (partition per bil): lastad 20 km, 4 l
insert into lastbil_logg values
 ('D','2026-08-10 04:03Z',9000000,1,     w('36000')),
 ('D','2026-08-10 04:11Z',9020000,4001,  w('36000'));
-- Bil B över månadsskiftet: segmentet hör till den månad det BÖRJADE i (svensk tid)
insert into lastbil_logg values
 ('B','2026-08-31 21:50Z',500000,50000,w('28000')),
 ('B','2026-08-31 22:00Z',505000,51000,w('28000')),    -- börjar 23:50 svensk tid 31 aug: augusti, tom 5 km, 1 l
 ('B','2026-08-31 22:10Z',512000,52000,w('28000'));    -- börjar 00:00 svensk tid 1 sep: september, tom 7 km, 1 l
-- Oktober: bränslet går bakåt (tankning/nollställning) och viktgränsen 34 000 kg
insert into lastbil_logg values
 ('E','2026-10-05 08:00Z',0,5000,w('28000')),
 ('E','2026-10-05 08:08Z',10000,4000,w('28000')),      -- tom 10 km, bränsle saknas (skillnaden negativ)
 ('F','2026-10-06 08:00Z',0,0,w('33999')),
 ('F','2026-10-06 08:08Z',10000,1000,w('33999')),      -- 33 999 kg är tom: tom 10 km, 1 l
 ('F','2026-10-06 08:16Z',20000,1000,w('34000')),      -- tom -> 34 000 kg (lastad): okänd 10 km, 0 l
 ('F','2026-10-06 08:24Z',30000,3000,w('34000'));      -- 34 000 kg är lastad: lastad 10 km, 2 l
-- Annat år
insert into lastbil_logg values
 ('C','2025-05-01 10:00Z',100000,1000,w('28000')),
 ('C','2025-05-01 10:08Z',110000,3000,w('28000'));     -- 2025: tom 10 km, 2 l

\i supabase/migrations/20261020111258_lastbil_vikt_manad.sql

do $$
declare r record; n int;
begin
  select count(*) into n from lastbil_vikt_manad(2026);
  if n <> 3 then raise exception 'förväntade 3 månader (aug, sep, okt), fick %', n; end if;

  select * into r from lastbil_vikt_manad(2026) where man = 8;
  -- lastad: D 20 km 4 l + A 30 km 20 l + A 10 km (utan bränsle)  => 60 km, 24 l, 50 km med bränsle
  if (r.km_lastad, r.liter_lastad, r.km_diesel_lastad) is distinct from (60::numeric, 24::numeric, 50::numeric) then raise exception 'lastad aug: %', r; end if;
  -- tom: A 10 km 3 l + A 10 km 5 l + B 5 km 1 l => 25 km, 9 l, 25 km med bränsle
  if (r.km_tom, r.liter_tom, r.km_diesel_tom) is distinct from (25::numeric, 9::numeric, 25::numeric) then raise exception 'tom aug: %', r; end if;
  -- okänd: A 10 km 5 l (tom -> lastad) + A 10 km utan bränsle => 20 km, 5 l, 10 km med bränsle
  if (r.km_okand, r.liter_okand, r.km_diesel_okand) is distinct from (20::numeric, 5::numeric, 10::numeric) then raise exception 'okänd aug: %', r; end if;

  select * into r from lastbil_vikt_manad(2026) where man = 9;
  if (r.km_tom, r.liter_tom, r.km_diesel_tom, r.km_lastad, r.km_okand) is distinct from (7::numeric, 1::numeric, 7::numeric, 0::numeric, 0::numeric) then raise exception 'sep: %', r; end if;

  select * into r from lastbil_vikt_manad(2026) where man = 10;
  if (r.km_tom, r.liter_tom, r.km_diesel_tom) is distinct from (20::numeric, 1::numeric, 10::numeric) then raise exception 'tom okt: %', r; end if;
  if (r.km_lastad, r.liter_lastad, r.km_diesel_lastad) is distinct from (10::numeric, 2::numeric, 10::numeric) then raise exception 'lastad okt: %', r; end if;
  if (r.km_okand, r.liter_okand, r.km_diesel_okand) is distinct from (10::numeric, 0::numeric, 10::numeric) then raise exception 'okänd okt: %', r; end if;

  select * into r from lastbil_vikt_manad(2025);
  if (r.man, r.km_tom, r.liter_tom) is distinct from (5, 10::numeric, 2::numeric) then raise exception '2025: %', r; end if;
  if exists (select 1 from lastbil_vikt_manad(2024)) then raise exception '2024 ska vara tomt'; end if;
  raise notice 'lastbil_vikt_manad: alla fall stämmer';
end $$;

-- Behörighet: inloggade får läsa, anon inte
set role authenticated; select count(*) as rader_for_inloggad from lastbil_vikt_manad(2026);
reset role; set role anon;
do $$ begin
  begin perform lastbil_vikt_manad(2026); raise exception 'anon fick köra funktionen';
  exception when insufficient_privilege then raise notice 'anon nekas: ok'; end;
end $$;
