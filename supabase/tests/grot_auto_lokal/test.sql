-- Provar grot_auto mot en lokal Postgres. Kör: bash supabase/tests/grot_auto_lokal/kor.sh
\set ON_ERROR_STOP 1
create or replace function pg_temp.kolla(villkor boolean, vad text) returns void language plpgsql as $$
begin if villkor is not true then raise exception 'FEL: %', vad; end if; raise notice 'ok: %', vad; end $$;

-- Ett hygge = ett rutnät av stammar runt en mittpunkt (radie ~150 m), fällt i september.
create or replace function pg_temp.hygge(id text, lat float8, lng float8, fallt date) returns void language sql as $$
  insert into detalj_stam (objekt_id, maskin_id, latitude, longitude, tidpunkt)
  select id, 'GIANT', lat + i * 0.0002, lng + j * 0.00035, fallt from generate_series(-6, 6) i, generate_series(-6, 6) j $$;
-- Ett körspår: n punkter i en ring runt en mittpunkt.
create or replace function pg_temp.spar(lat float8, lng float8, n int, r float8) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('lat', lat + r * sin(k), 'lng', lng + 1.8 * r * cos(k))) from generate_series(1, n) k $$;

insert into dim_objekt (objekt_id, object_name, huvudtyp, risskotning) values
  ('H1', 'Kroksjömåla', 'Slutavverkning', false), ('H2', 'Grannhygget', 'Slutavverkning', false),
  ('H3', 'Brokamåla', 'Slutavverkning', false), ('H4', 'Sent fällt', 'Slutavverkning', false),
  ('R1', 'GROT Kroksjömåla', 'Grot', true), ('R2', 'Sibbesson Klipp', 'Grot', true),
  ('R3', 'GROT Brokamåla', 'Grot', true), ('R4', 'GROT Sent', 'Grot', true);
select pg_temp.hygge('H1', 56.25, 14.92, '2026-09-10');
select pg_temp.hygge('H2', 56.30, 14.92, '2026-09-10');
select pg_temp.hygge('H3', 56.40, 14.92, '2026-09-10');
select pg_temp.hygge('H4', 56.50, 14.92, '2026-11-30');   -- fällt EFTER risjobbet

insert into helikopter_lass (datum, maskin_id, objekt_id) values
  (current_date - 5, 'WIS', 'R1'), (current_date - 4, 'WIS', 'R1'),
  (current_date - 3, 'ELEF', 'R2'), (current_date - 2, 'ELEF', 'R4'), (current_date - 6, 'M3', 'R3');
-- R1: allt körspår på H1, plus en kort tur genom H2 (under en fjärdedel).
insert into hyttspar (maskin_id, roll, datum, points) values
  ('WIS', 'skotare', current_date - 5, pg_temp.spar(56.25, 14.92, 400, 0.0008)),
  ('WIS', 'skotare', current_date - 4, pg_temp.spar(56.25, 14.92, 300, 0.0006) || pg_temp.spar(56.30, 14.92, 60, 0.0005)),
  ('ELEF', 'skotare', current_date - 3, pg_temp.spar(56.60, 15.40, 500, 0.001)),   -- R2 klipp: långt från alla stammar
  ('ELEF', 'skotare', current_date - 2, pg_temp.spar(56.50, 14.92, 300, 0.0006)),  -- R4: på H4, men H4 fälldes efteråt
  ('M3', 'skotare', current_date - 6, pg_temp.spar(56.30, 14.92, 400, 0.0006)),    -- R3 kördes på H2, men människan har kopplat H3
  ('WIS', 'skordare', current_date - 5, pg_temp.spar(56.30, 14.92, 900, 0.0005));  -- skördarens spår räknas aldrig

-- R3 är kopplad av en människa till H3.
insert into grot_koppling (risjobb_objekt_id, avverknings_objekt_id) values ('R3', 'H3');

-- TORRKÖRNING skriver ingenting.
select pg_temp.kolla((select count(*) from grot_auto(false) where handelse = 'koppla' and risjobb = 'R1' and avverkning = 'H1') = 1, 'torr: föreslår R1 → H1');
select pg_temp.kolla((select count(*) from grot_koppling) = 1, 'torr: inget skrivet');

-- SKARPT.
select count(*) from grot_auto(true);
select pg_temp.kolla(exists (select 1 from grot_koppling where risjobb_objekt_id = 'R1' and avverknings_objekt_id = 'H1' and kalla = 'auto' and andel > 0.8), 'R1 kopplas till H1 (auto, andel > 80 %)');
select pg_temp.kolla(not exists (select 1 from grot_koppling where risjobb_objekt_id = 'R1' and avverknings_objekt_id = 'H2'), 'kort tur genom H2 ger ingen koppling');
select pg_temp.kolla(not exists (select 1 from grot_koppling where risjobb_objekt_id = 'R2'), 'klipp långt från stammar kopplas inte');
select pg_temp.kolla(not exists (select 1 from grot_koppling where risjobb_objekt_id = 'R4'), 'hygge fällt efter risjobbet räknas inte');
select pg_temp.kolla((select kalla from grot_koppling where risjobb_objekt_id = 'R3') = 'manuell', 'människans koppling står kvar som manuell');
select pg_temp.kolla((select count(*) from grot_koppling where risjobb_objekt_id = 'R3') = 1, 'ett risjobb som människan kopplat får ingen auto-koppling');
select pg_temp.kolla((select grot_hamtad from dim_objekt where objekt_id = 'H1') is null, 'R1 inte skotat än: H1 inte hämtat');

-- Risjobben blir skotade (av maskindatan eller en människa).
update dim_objekt set skotning_avslutad = current_date - 4 where objekt_id = 'R1';
update dim_objekt set skotning_avslutad = date '2026-10-01' where objekt_id = 'R3';
update dim_objekt set grot_hamtad = date '2026-10-05' where objekt_id = 'H3';   -- människan har redan satt ett datum
select count(*) from grot_auto(true);
select pg_temp.kolla((select grot_hamtad from dim_objekt where objekt_id = 'H1') = current_date - 4, 'H1 hämtat = risjobbets avslutsdag');
select pg_temp.kolla((select auto_avbockad_datum from grot_koppling where risjobb_objekt_id = 'R1') = current_date - 4, 'kvittot sparat');
select pg_temp.kolla((select grot_hamtad from dim_objekt where objekt_id = 'H3') = date '2026-10-05', 'människans datum skrivs aldrig över');
select pg_temp.kolla((select auto_avbockad_datum from grot_koppling where risjobb_objekt_id = 'R3') is null, 'inget kvitto där människan satte datumet');

-- Idempotent: en andra körning gör ingenting.
select pg_temp.kolla((select count(*) from grot_auto(true)) = 0, 'andra körningen: inga händelser');

-- Kopplingen som bockat av står kvar även om körspåret skulle sluta räcka.
delete from hyttspar where maskin_id = 'WIS';
select count(*) from grot_auto(true);
select pg_temp.kolla(exists (select 1 from grot_koppling where risjobb_objekt_id = 'R1' and avverknings_objekt_id = 'H1'), 'avbockad koppling tas aldrig bort');

-- Risjobbet öppnas igen → automatikens datum bort.
update dim_objekt set skotning_avslutad = null where objekt_id = 'R1';
select count(*) from grot_auto(true);
select pg_temp.kolla((select grot_hamtad from dim_objekt where objekt_id = 'H1') is null, 'risjobbet pågår igen: H1 inte hämtat');
select pg_temp.kolla((select auto_avbockad_datum from grot_koppling where risjobb_objekt_id = 'R1') is null, 'kvittot borttaget');

-- Ett omöppnat risjobb där människan ändrat datumet: datumet står kvar.
insert into hyttspar (maskin_id, roll, datum, points) values ('WIS', 'skotare', current_date - 5, pg_temp.spar(56.25, 14.92, 400, 0.0008));
update dim_objekt set skotning_avslutad = current_date - 1 where objekt_id = 'R1';
select count(*) from grot_auto(true);
select pg_temp.kolla((select auto_avbockad_datum from grot_koppling where risjobb_objekt_id = 'R1') = current_date - 1, 'bockas av igen när risjobbet blir klart igen');
update dim_objekt set grot_hamtad = date '2026-11-01' where objekt_id = 'H1';
update dim_objekt set skotning_avslutad = null where objekt_id = 'R1';
select count(*) from grot_auto(true);
select pg_temp.kolla((select grot_hamtad from dim_objekt where objekt_id = 'H1') = date '2026-11-01', 'ändrat datum rörs inte när risjobbet öppnas');

-- Utan körspår tas en ej avbockad auto-koppling bort.
insert into grot_koppling (risjobb_objekt_id, avverknings_objekt_id, kalla) values ('R2', 'H2', 'auto');
select count(*) from grot_auto(true);
select pg_temp.kolla(not exists (select 1 from grot_koppling where risjobb_objekt_id = 'R2'), 'auto-koppling utan stöd tas bort');

-- Timjobbet kör GROT mellan avslut och status.
select pg_temp.kolla((select command from cron.job where jobname = 'avslut_ur_maskindata') like '%avslut_ur_maskindata(true)%grot_auto(true)%objekt_status_ur_maskindata(true)%', 'timjobbet: avslut → grot → status');
-- Klienten når inte funktionerna.
select pg_temp.kolla(not has_function_privilege('authenticated', 'public.grot_auto(boolean)', 'execute'), 'inloggade kan inte köra grot_auto');
select 'ALLA KONTROLLER OK';
