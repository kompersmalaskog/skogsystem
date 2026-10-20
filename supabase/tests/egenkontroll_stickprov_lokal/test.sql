\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on
-- 1. Oktober (källa september) dras en gång
select 'dragning 1: ny=' || (egenkontroll_stickprov_dra('2026-10-01')->>'ny');
select 'dragning 2: ny=' || (egenkontroll_stickprov_dra('2026-10-01')->>'ny');
select 'kandidater sep: ' || jsonb_array_length(kandidater) || ' (väntat 11: tio med timestamp + Betet AU via faktisk_slut)' from egenkontroll_stickprov where manad='2026-10-01';
select 'valda: ' || jsonb_array_length(valda) || ' förklaring=' || forklaring || ' spridning=' || coalesce(spridning_km::text,'-') from egenkontroll_stickprov where manad='2026-10-01';
-- 2. Ankaret kan räknas om utan databasens slumpfunktion: md5(fro) -> 60 bitar -> mod n över id-sorterad lista
select 'omräknat ankare stämmer: ' || (
  (select (kandidater -> ((('x' || substr(md5(fro),1,15))::bit(60)::bigint) % jsonb_array_length(kandidater))::int ->> 'id')::uuid = ankare_objekt_id
     and ankare_index = ((('x' || substr(md5(fro),1,15))::bit(60)::bigint) % jsonb_array_length(kandidater))::int
   from egenkontroll_stickprov where manad='2026-10-01'));
select 'kandidaterna är id-sorterade: ' || (select (select array_agg(e->>'id' order by ord) from jsonb_array_elements(kandidater) with ordinality t(e,ord)) = (select array_agg(e->>'id' order by e->>'id') from jsonb_array_elements(kandidater) e) from egenkontroll_stickprov where manad='2026-10-01');
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
