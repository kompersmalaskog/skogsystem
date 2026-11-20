\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on
-- 1. Oktober (källa september) dras en gång
select 'dragning 1: ny=' || (egenkontroll_stickprov_dra('2026-10-01')->>'ny');
select 'dragning 2: ny=' || (egenkontroll_stickprov_dra('2026-10-01')->>'ny');
select 'kandidater sep: ' || jsonb_array_length(kandidater) || ' (väntat 11: tio med timestamp + Betet AU via faktisk_slut)' from egenkontroll_stickprov where manad='2026-10-01';
select 'valda: ' || jsonb_array_length(valda) || ' förklaring=' || forklaring || ' spridning=' || coalesce(spridning_km::text,'-') from egenkontroll_stickprov where manad='2026-10-01';
-- 2. Ankaret räknas om utan databasens slumpfunktion (regel version 2): första kandidaten i fro-ordning med minst en granne inom 15 km
select 'algoritm_version 2, ankare_forsok satt: ' || (algoritm_version = 2 and ankare_forsok >= 1) from egenkontroll_stickprov where manad='2026-10-01';
select 'omräknat ankare stämmer: ' || (
  select (
    select k.id from jsonb_to_recordset(e.kandidater) k(id uuid, lat double precision, lng double precision)
     where exists (select 1 from jsonb_to_recordset(e.kandidater) g(id uuid, lat double precision, lng double precision)
                    where g.id <> k.id and egenkontroll_fagelvag_km(k.lat,k.lng,g.lat,g.lng) <= 15)
     order by md5(e.fro || ':' || k.id::text) collate "C", k.id::text collate "C" limit 1) = e.ankare_objekt_id
  from egenkontroll_stickprov e where e.manad='2026-10-01');
select 'kandidaterna är id-sorterade: ' || (select (select array_agg(e->>'id' order by ord) from jsonb_array_elements(kandidater) with ordinality t(e,ord)) = (select array_agg(e->>'id' order by e->>'id' collate "C") from jsonb_array_elements(kandidater) e) from egenkontroll_stickprov where manad='2026-10-01');
-- 3. Låset
do $$ begin begin update egenkontroll_stickprov set fro='x'; raise exception 'UPDATE gick igenom'; exception when check_violation then null; end; end $$;
do $$ begin begin delete from egenkontroll_stickprov; raise exception 'DELETE gick igenom'; exception when check_violation then null; end; end $$;
select 'lås: UPDATE och DELETE avvisas';
-- 4. Invariantprov: 300 dragningar på samma månad (underhållsläge för att kunna radera i testet)
select set_config('app.stickprov_tillat_andring','on',false);
create temp table utfall as select * from egenkontroll_stickprov where false;
do $$ declare i int; begin
  for i in 1..300 loop
    delete from egenkontroll_stickprov where manad='2026-10-01';
    perform egenkontroll_stickprov_dra('2026-10-01');
    insert into utfall select * from egenkontroll_stickprov where manad='2026-10-01';
  end loop;
end $$;
select 'invariant: valda<=3 ' || bool_and(jsonb_array_length(valda) between 1 and 3)
   || ' | grannar<=15km ' || bool_and((select coalesce(bool_and((e->>'km_fran_ankare')::numeric <= 15),true) from jsonb_array_elements(valda) e))
   || ' | ankare först ' || bool_and((valda->0->>'objekt_id')::uuid = ankare_objekt_id)
   || ' | aldrig ensam när ett kluster finns ' || bool_and(jsonb_array_length(valda) >= 2 or not exists (select 1 from jsonb_to_recordset(kandidater) a(id uuid, lat double precision, lng double precision), jsonb_to_recordset(kandidater) b(id uuid, lat double precision, lng double precision) where a.id<>b.id and egenkontroll_fagelvag_km(a.lat,a.lng,b.lat,b.lng) <= 15))
   || ' | ingen GROT/ingen utan datum ' || bool_and(not exists (select 1 from jsonb_array_elements(kandidater) k where k->>'namn' like 'GROT%'))
   from utfall;
select 'förklaringar: ' || string_agg(forklaring || '=' || n, ', ') from (select forklaring, count(*) n from utfall group by 1 order by 1) x;
select 'ankare som förekommit: ' || count(distinct ankare_objekt_id) || ' av 11' from utfall;
-- 5. Grannarna stämmer mot brute force (annan formel: fågelväg räknad direkt, id som tiebreak)
select 'grannar = brute force: ' || bool_and(ok) from (
  select u.dragen_vid, u.valda,
    (select array_agg(e->>'objekt_id' order by (e->>'ordning')::int) from jsonb_array_elements(u.valda) e)
    = (select array_agg(id::text order by ord) from (
         select k.id, 0 as ord from jsonb_to_recordset(u.kandidater) k(id uuid) where k.id=u.ankare_objekt_id
         union all
         select id, 1 + row_number() over (order by km, id::text) from (
           select k.id, egenkontroll_fagelvag_km(a.lat,a.lng,k.lat,k.lng) km
           from jsonb_to_recordset(u.kandidater) k(id uuid, lat double precision, lng double precision),
                jsonb_to_recordset(u.kandidater) a(id uuid, lat double precision, lng double precision)
           where a.id=u.ankare_objekt_id and k.id<>a.id and egenkontroll_fagelvag_km(a.lat,a.lng,k.lat,k.lng) <= 15
           order by km, k.id::text limit 2) n
       ) q) as ok
  from utfall u) z;
-- 6. Tunn månad: augusti har två objekt (Ulfsnäs, Dockemåla)
select set_config('app.stickprov_tillat_andring','off',false);
select egenkontroll_stickprov_dra('2026-09-01') is not null as dragen;
select 'tunn månad (augusti, 2 objekt): valda=' || jsonb_array_length(valda) || ' förklaring=' || forklaring || ' kandidater=' || jsonb_array_length(kandidater) || ' spridning=' || coalesce(spridning_km::text,'-') from egenkontroll_stickprov where manad='2026-09-01';
-- 7. Tom månad och ankare utan plats
select 'tom månad: ' || (egenkontroll_stickprov_dra('2026-12-01')->>'forklaring');   -- november saknar objekt
insert into objekt (namn, typ, status, lat, lng, avslutad_timestamp) values ('Utan plats','gallring','avslutat',null,null,'2027-01-10 10:00+00');
select 'ankare utan plats: valda=' || jsonb_array_length(egenkontroll_stickprov_dra('2027-02-01')->'valda') || ' ' || (egenkontroll_stickprov_dra('2027-02-01')->>'forklaring');
-- 8. Månadsgräns i svensk tid: 2026-11-30 23:30 UTC är 1 december 00:30 svensk tid -> hör till december, inte november
insert into objekt (namn, typ, status, lat, lng, avslutad_timestamp) values ('Gränsfall','gallring','avslutat',56.4,14.8,'2026-11-30 23:30+00');
select 'gränsfall i december-källa: ' || exists (select 1 from jsonb_array_elements((egenkontroll_stickprov_dra('2027-01-01')->'kandidater')) k where k->>'namn'='Gränsfall');
select 'gränsfall inte i november-källa: ' || not exists (select 1 from jsonb_array_elements((select kandidater from egenkontroll_stickprov where manad='2026-12-01')) k where k->>'namn'='Gränsfall');
-- 8b. Inget kluster alls: tre objekt långt isär -> ett ensamt, det första i fro-ordning, ankare_forsok = antalet kandidater
insert into objekt (namn, typ, status, lat, lng, avslutad_timestamp) values
  ('Syd','gallring','avslutat',55.5,13.0,'2027-03-10 10:00+00'), ('Mitt','gallring','avslutat',57.5,15.0,'2027-03-11 10:00+00'), ('Nord','gallring','avslutat',59.5,17.0,'2027-03-12 10:00+00');
select egenkontroll_stickprov_dra('2027-04-01') is not null as dragen;
select 'inget kluster: valda=' || jsonb_array_length(valda) || ' förklaring=' || forklaring || ' ankare_forsok=' || ankare_forsok
    || ' första i fro-ordning: ' || ((select k->>'id' from jsonb_array_elements(kandidater) k order by md5(fro || ':' || (k->>'id')) collate "C" limit 1)::uuid = ankare_objekt_id)
  from egenkontroll_stickprov where manad='2027-04-01';
-- 8c. Ett kluster + en ensam, ett ankare utan koordinat: ankare utan plats hoppas över så länge ett kluster finns
insert into objekt (namn, typ, status, lat, lng, avslutad_timestamp) values
  ('A','gallring','avslutat',56.40,14.80,'2027-05-10 10:00+00'), ('B','gallring','avslutat',56.41,14.81,'2027-05-11 10:00+00'),
  ('Ensam','gallring','avslutat',58.0,16.0,'2027-05-12 10:00+00'), ('Plats saknas','gallring','avslutat',null,null,'2027-05-13 10:00+00');
select set_config('app.stickprov_tillat_andring','on',false);
create temp table k as select * from egenkontroll_stickprov where false;
do $$ begin for i in 1..100 loop delete from egenkontroll_stickprov where manad='2027-06-01'; perform egenkontroll_stickprov_dra('2027-06-01'); insert into k select * from egenkontroll_stickprov where manad='2027-06-01'; end loop; end $$;
select 'kluster + ensam + utan plats (100 dragningar): alltid A+B: ' || bool_and(jsonb_array_length(valda)=2 and (valda->0->>'namn') in ('A','B')) || ' | max ankare_forsok ' || max(ankare_forsok) from k;
select set_config('app.stickprov_tillat_andring','off',false);
-- 8d. Oktobers verkliga data (källa för november), 100 dragningar i en transaktion som rullas tillbaka
begin;
select set_config('app.stickprov_tillat_andring','on',true);
create temp table okt as select * from egenkontroll_stickprov where false;
do $$ begin for i in 1..100 loop delete from egenkontroll_stickprov where manad='2026-11-01'; perform egenkontroll_stickprov_dra('2026-11-01'); insert into okt select * from egenkontroll_stickprov where manad='2026-11-01'; end loop; end $$;
select 'oktober: kandidater=' || jsonb_array_length(kandidater) from okt limit 1;
select 'oktober: antal valda -> ' || string_agg(a || ' objekt: ' || n, ', ' order by a) from (select jsonb_array_length(valda) a, count(*) n from okt group by 1) x;
select 'oktober: valda=' || jsonb_array_length(valda) || ' spridning=' || coalesce(spridning_km::text,'-') || ' forklaring=' || forklaring || ' dragningar=' || count(*) from okt group by jsonb_array_length(valda), spridning_km, forklaring order by 1;
select 'oktober: ankare ' || (select string_agg(namn || '=' || n, ', ' order by namn) from (select k->>'namn' namn, count(*) n from okt o, jsonb_array_elements(o.valda) k where (k->>'ordning')::int=1 group by 1) q);
select 'oktober: ankare_forsok -> ' || string_agg(ankare_forsok || ':' || n, ', ' order by ankare_forsok) from (select ankare_forsok, count(*) n from okt group by 1) q;
rollback;
select 'efter rollback: rader för november = ' || count(*) from egenkontroll_stickprov where manad='2026-11-01';
-- 9. Publika funktionen (första månad flyttad till år 2000 i testkopian)
select set_config('app.stickprov_tillat_andring','on',false);
delete from egenkontroll_stickprov where manad >= '2026-09-01';
select set_config('app.stickprov_tillat_andring','off',false);
select egenkontroll_stickprov() is not null as dragen_nu;
select egenkontroll_stickprov() is not null as andra_anropet;
select 'notiser i kön: ' || count(*) || ' | typ=' || min(typ) || ' | skickas_at=' || min(skickas_at::text) || ' | datum=' || min(datum::text) || ' | mottagare=' || (select epost from medarbetare where id = min(mottagare_id::text)::uuid)
  || ' | skicka_efter >= nu: ' || bool_and((payload->>'skicka_efter')::timestamptz >= now() - interval '1 minute')
  from "notis_kö";
select 'rader för innevarande månad: ' || count(*) from egenkontroll_stickprov where manad = date_trunc('month', now() at time zone 'Europe/Stockholm')::date;
-- 10. Rättigheter
set role authenticated;
select 'authenticated läser: ' || count(*) from egenkontroll_stickprov;
do $$ begin begin insert into egenkontroll_stickprov (manad,kalla_manad,fro,forklaring) values ('2030-01-01','2029-12-01','x','full'); raise exception 'INSERT gick igenom'; exception when insufficient_privilege then null; end; end $$;
do $$ begin begin perform egenkontroll_stickprov_dra('2030-01-01'); raise exception 'intern dragning gick att anropa'; exception when insufficient_privilege then null; end; end $$;
select 'authenticated kan anropa publika: ' || (egenkontroll_stickprov() is not null);
reset role;
set role anon;
do $$ begin begin perform egenkontroll_stickprov(); raise exception 'anon kunde anropa'; exception when insufficient_privilege then null; end; end $$;
reset role;
select 'rättigheter ok';
