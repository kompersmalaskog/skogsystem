-- Provar avslut_ur_maskindata mot en lokal Postgres. Kör (från repo-roten):
--   createdb av && psql av -v ON_ERROR_STOP=1 -f supabase/tests/avslut_ur_maskindata_lokal/stub.sql \
--     -f supabase/migrations/20261024161546_avslut_ur_maskindata_1_kolumner.sql \
--     -f supabase/migrations/20261024161621_avslut_ur_maskindata_2_berakna.sql \
--     -f supabase/migrations/20261024161643_avslut_ur_maskindata_3_satt.sql \
--     -f supabase/tests/avslut_ur_maskindata_lokal/test.sql
-- Faller med ett felmeddelande som säger vilken kontroll som inte höll. Sista raden är "ALLA KONTROLLER OK".
\set ON_ERROR_STOP 1

create or replace function pg_temp.kolla(villkor boolean, vad text) returns void language plpgsql as $$
begin
  if villkor is not true then raise exception 'FEL: %', vad; end if;
  raise notice 'ok: %', vad;
end $$;

insert into dim_maskin values
  ('GIANT', 'Harvester', 'Giant', null), ('H8E', 'Harvester', 'H8E -26', null),
  ('ELEF', 'Forwarder', 'Elefant 26', null), ('WIS', 'Forwarder', 'Wisent', null),
  ('810E', 'Forwarder', '810E', 'manuell');

-- MÖLLERYD (prod-fallet): skördaren har två nummer, skotaren ett — ett objekt via extra nummer.
insert into objekt (id, namn, vo_nummer) values ('00000000-0000-0000-0000-00000000000a', 'Mölleryd', '11271883');
insert into objekt_alt_nummer (objekt_id, nummer) values ('00000000-0000-0000-0000-00000000000a', '11166477');
insert into dim_objekt (objekt_id, object_name, vo_nummer, huvudtyp) values
  ('11271883', 'Mölleryd', '11271883', 'Slutavverkning'), ('11166477', 'Mölleryd', '11166477', 'Slutavverkning'),
  ('11271860', 'Skälviken', '11271860', 'Slutavverkning');
insert into fakt_produktion (datum, maskin_id, objekt_id, volym_m3sub) values
  ('2026-10-19','GIANT','11271883',300), ('2026-10-20','GIANT','11271883',400), ('2026-10-21','GIANT','11271883',288),
  ('2026-10-21','GIANT','11271860',50), ('2026-10-22','GIANT','11271860',400), ('2026-10-23','GIANT','11271860',345);
insert into fakt_tid (datum, maskin_id, objekt_id, processing_sek, terrain_sek, other_work_sek) values
  ('2026-10-20','ELEF','11271883',3600,600,0), ('2026-10-23','ELEF','11271883',3600,600,0);
insert into fakt_lass (datum, maskin_id, objekt_id, volym_m3sub) values ('2026-10-20','ELEF','11271883',100), ('2026-10-21','ELEF','11271883',111);
insert into skotar_lass (id, objekt_id, vo_nummer, maskin_id, datum, status) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000a', '11271883', 'ELEF', '2026-10-23', 'bekraftat');
insert into skotar_lass_sortiment values ('00000000-0000-0000-0000-0000000000b1', 1, 'x', 1139);

-- BÅGSKYTTEBANAN: skördaren gick till Mölleryd, skotaren skotade klart och gick också dit.
insert into dim_objekt (objekt_id, object_name, vo_nummer, huvudtyp) values ('11271849', 'Bågskyttebanan', '11271849', 'Slutavverkning');
insert into fakt_produktion (datum, maskin_id, objekt_id, volym_m3sub) values ('2026-10-12','GIANT','11271849',900), ('2026-10-13','GIANT','11271849',787);
insert into fakt_lass (datum, maskin_id, objekt_id, volym_m3sub) values ('2026-10-15','ELEF','11271849',900), ('2026-10-19','ELEF','11271849',789);

-- SKOTAT FÖR LITE: skotaren har gått vidare men bara hälften är skotat → skotning sätts inte.
insert into dim_objekt (objekt_id, object_name, vo_nummer, huvudtyp) values ('900001', 'Halvskotat', '900001', 'Slutavverkning');
insert into fakt_produktion (datum, maskin_id, objekt_id, volym_m3sub) values ('2026-09-01','GIANT','900001',400);
insert into fakt_lass (datum, maskin_id, objekt_id, volym_m3sub) values ('2026-09-03','WIS','900001',200);
insert into fakt_lass (datum, maskin_id, objekt_id, volym_m3sub) values ('2026-09-04','WIS','11271860',20);

-- GROT: inget skördat, skotaren har gått vidare → skotning sätts.
insert into dim_objekt (objekt_id, object_name, vo_nummer, huvudtyp) values ('900002', 'GROT Ris', '900002', 'Grot');
insert into fakt_lass (datum, maskin_id, objekt_id, volym_m3sub) values ('2026-09-10','WIS','900002',300), ('2026-09-11','WIS','11271860',5);

-- SKÖRDAREN KVAR: skotaren har skotat allt och gått vidare, men skördaren kör fortfarande → skotning väntar.
insert into dim_objekt (objekt_id, object_name, vo_nummer, huvudtyp) values ('900009', 'Skördaren kvar', '900009', 'Gallring');
insert into fakt_produktion (datum, maskin_id, objekt_id, volym_m3sub) values ('2026-10-25','H8E','900009',40);
insert into fakt_lass (datum, maskin_id, objekt_id, volym_m3sub) values ('2026-10-24','WIS','900009',40), ('2026-10-25','WIS','11271860',1);

-- AUTO, SKOTNING: automatiken satte 1 sep, skotaren körde till 18 sep → datumet följer.
insert into dim_objekt (objekt_id, object_name, vo_nummer, huvudtyp, skotning_avslutad, skotning_avslutad_auto, skotning_auto_skal)
  values ('900011', 'Auto skot', '900011', 'Gallring', '2026-09-01', true, 'gammalt');
insert into fakt_produktion (datum, maskin_id, objekt_id, volym_m3sub) values ('2026-08-30','GIANT','900011',30);
insert into fakt_lass (datum, maskin_id, objekt_id, volym_m3sub) values ('2026-09-18','WIS','900011',30), ('2026-09-19','WIS','11271860',1);

-- HAND, SKOTNING: datum satt för hand → rörs inte fast skotaren gått vidare en annan dag.
insert into dim_objekt (objekt_id, object_name, vo_nummer, huvudtyp, skotning_avslutad) values ('900010', 'Hand skot', '900010', 'Gallring', '2026-09-20');
insert into fakt_produktion (datum, maskin_id, objekt_id, volym_m3sub) values ('2026-09-14','GIANT','900010',30);
insert into fakt_lass (datum, maskin_id, objekt_id, volym_m3sub) values ('2026-09-16','WIS','900010',30);

-- HAND: skördning satt för hand (inget skäl) → rörs aldrig. EJ KLAR → sätts inte.
insert into dim_objekt (objekt_id, object_name, vo_nummer, huvudtyp, skordning_avslutad) values ('900003', 'Hand', '900003', 'Gallring', '2026-08-01');
insert into dim_objekt (objekt_id, object_name, vo_nummer, huvudtyp, skordning_ej_klar) values ('900004', 'Ej klar', '900004', 'Gallring', true);
insert into fakt_produktion (datum, maskin_id, objekt_id, volym_m3sub) values
  ('2026-08-05','H8E','900003',50), ('2026-08-06','H8E','900004',50), ('2026-08-07','H8E','900005',50), ('2026-08-09','H8E','900006',50);

-- KOM TILLBAKA: automatiken satte 7 aug, sedan har skördaren arbetat här igen 9 aug... på 900006 — men på 900005 inget.
insert into dim_objekt (objekt_id, object_name, vo_nummer, huvudtyp, skordning_avslutad, skordning_avslutad_auto, skordning_auto_skal)
  values ('900005', 'Tillbaka', '900005', 'Gallring', '2026-08-01', true, 'gammalt skäl');
insert into fakt_produktion (datum, maskin_id, objekt_id, volym_m3sub) values ('2026-08-08','H8E','900005',10);

-- EXKLUDERAT och 810E (manuell) rörs inte. 810E:s "vidare" räknas inte.
insert into dim_objekt (objekt_id, object_name, vo_nummer, huvudtyp, exkludera) values ('900007', 'Flytt', '900007', null, true);
insert into fakt_produktion (datum, maskin_id, objekt_id, volym_m3sub) values ('2026-07-01','GIANT','900007',1);
insert into dim_objekt (objekt_id, object_name, vo_nummer, huvudtyp) values ('900008', 'Manuell skotare', '900008', 'Gallring');
insert into fakt_produktion (datum, maskin_id, objekt_id, volym_m3sub) values ('2026-07-02','H8E','900008',30);
insert into fakt_lass (datum, maskin_id, objekt_id, volym_m3sub) values ('2026-07-05','810E','900008',30), ('2026-07-06','810E','900003',1);

-- ===== TORRKÖRNING: rader tillbaka, inget skrivs =====
select pg_temp.kolla((select count(*) from avslut_ur_maskindata(false)) > 0, 'torrkörningen ger rader');
select pg_temp.kolla((select count(*) from dim_objekt where (skordning_auto_skal is not null and objekt_id <> '900005') or (skotning_auto_skal is not null and objekt_id <> '900011')) = 0, 'torrkörningen skriver inget');

-- ===== SKARP =====
create temp table utfall as select * from avslut_ur_maskindata(true);
select * from utfall order by namn, falt;

select pg_temp.kolla((select skordning_avslutad from dim_objekt where objekt_id='11271883') = '2026-10-21', 'Mölleryd: skördning klar 21 okt');
select pg_temp.kolla((select skordning_avslutad from dim_objekt where objekt_id='11166477') = '2026-10-21', 'Mölleryd: skördarens andra nummer får samma dag');
select pg_temp.kolla((select skordning_auto_skal from dim_objekt where objekt_id='11271883') = 'Giant körde vidare till Skälviken 22 okt', 'Mölleryd: skälet');
select pg_temp.kolla((select skordning_avslutad_auto from dim_objekt where objekt_id='11271883'), 'Mölleryd: auto = true');
select pg_temp.kolla((select skotning_avslutad from dim_objekt where objekt_id='11271883') is null, 'Mölleryd: skotning INTE klar (Elefanten kör kvar)');
select pg_temp.kolla((select skordning_avslutad from dim_objekt where objekt_id='11271860') is null, 'Skälviken: inte klar (Giant kör där)');
select pg_temp.kolla((select skotning_avslutad from dim_objekt where objekt_id='11271849') = '2026-10-19', 'Bågskyttebanan: skotning klar 19 okt');
select pg_temp.kolla((select skotning_auto_skal from dim_objekt where objekt_id='11271849') = 'Elefant 26 körde vidare till Mölleryd 20 okt', 'Bågskyttebanan: skotarens skäl');
select pg_temp.kolla((select skotning_avslutad from dim_objekt where objekt_id='900001') is null, 'Halvskotat: skotning sätts inte (50 %)');
select pg_temp.kolla((select skordning_avslutad from dim_objekt where objekt_id='900001') = '2026-09-01', 'Halvskotat: skördning klar');
select pg_temp.kolla((select skotning_avslutad from dim_objekt where objekt_id='900002') = '2026-09-10', 'GROT: skotning klar utan skördat');
select pg_temp.kolla((select skordning_avslutad from dim_objekt where objekt_id='900003') = '2026-08-01', 'Hand: människans datum rörs inte');
select pg_temp.kolla((select skordning_auto_skal from dim_objekt where objekt_id='900003') is null, 'Hand: inget skäl skrivet');
select pg_temp.kolla((select skordning_avslutad from dim_objekt where objekt_id='900004') is null, 'Ej klar: sätts inte');
select pg_temp.kolla((select skordning_avslutad from dim_objekt where objekt_id='900005') = '2026-08-08', 'Automatikens datum flyttas till nya sista dagen');
select pg_temp.kolla((select skordning_avslutad from dim_objekt where objekt_id='900007') is null, 'Exkluderat rörs inte');
select pg_temp.kolla((select skotning_avslutad from dim_objekt where objekt_id='900009') is null, 'Skotning väntar på skördningen');
select pg_temp.kolla((select skotning_avslutad from dim_objekt where objekt_id='900011') = '2026-09-18', 'Automatikens skotningsdatum följer skotarens sista dag');
select pg_temp.kolla((select skotning_avslutad from dim_objekt where objekt_id='900010') = '2026-09-20', 'Hand: människans skotningsdatum rörs inte');
select pg_temp.kolla((select skotning_avslutad from dim_objekt where objekt_id='900008') is null, '810E (manuell) avgör aldrig skotningen');

-- ===== OMKÖRNING: inget nytt =====
select pg_temp.kolla((select count(*) from avslut_ur_maskindata(true)) = 0, 'en andra körning ändrar inget');

-- ===== KOM TILLBAKA: Giant arbetar på Mölleryd igen 24 okt → automatikens datum tas bort =====
insert into fakt_produktion (datum, maskin_id, objekt_id, volym_m3sub) values ('2026-10-24','GIANT','11271883',20);
create temp table utfall2 as select * from avslut_ur_maskindata(true);
select pg_temp.kolla((select skordning_avslutad from dim_objekt where objekt_id='11271883') is null, 'Mölleryd öppnas igen när Giant kommer tillbaka');
select pg_temp.kolla((select skordning_auto_skal from dim_objekt where objekt_id='11271883') is null, 'Mölleryd: skälet borta');
select pg_temp.kolla(exists(select 1 from utfall2 where efter is null and skal like 'Skördaren har arbetat här igen 24 okt'), 'returnerar varför den öppnades');

-- ===== MÄNNISKAN GÅR FÖRE: "Inte klar än" på Bågskyttebanans skotning efter att automatiken satt den =====
update dim_objekt set skotning_avslutad = null, skotning_avslutad_auto = false, skotning_auto_skal = null, skotning_ej_klar = true
 where objekt_id = '11271849';
select pg_temp.kolla((select count(*) from avslut_ur_maskindata(true) where namn = 'Bågskyttebanan') = 0, 'Inte klar än står kvar');
select pg_temp.kolla((select skotning_avslutad from dim_objekt where objekt_id='11271849') is null, 'Bågskyttebanan förblir inte klar');

select 'ALLA KONTROLLER OK';
