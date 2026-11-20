\set ON_ERROR_STOP on
-- Granskningen av de gamla självbekräftade lassen (bekraftad_av = 'auto'): räknas inte som skotat, kan bekräftas / strykas / slås ihop av en planerare,
-- allt loggat med lassets tillstånd före. Varje kontroll kastar vid fel; sista raden säger OK.
create function t_fel(p_sql text, p_del text) returns void language plpgsql as $$
begin
  begin execute p_sql; exception when others then
    if position(p_del in sqlerrm) = 0 then raise exception 'Fel text. Väntade "%", fick "%"', p_del, sqlerrm; end if;
    return;
  end;
  raise exception 'Väntade fel "%" men inget kastades: %', p_del, p_sql;
end $$;
create function t_lika(p_namn text, p_fick anyelement, p_vantat anyelement) returns void language plpgsql as $$
begin if p_fick is distinct from p_vantat then raise exception '% : fick %, väntade %', p_namn, p_fick, p_vantat; end if; end $$;

insert into objekt (id, vo_nummer) values ('11111111-1111-1111-1111-111111111111', '555'), ('22222222-aaaa-aaaa-aaaa-222222222222', '556');
insert into dim_objekt values ('555','555',null), ('556','556',null);
insert into dim_sortiment values ('s1','Timmer: Vislanda_V3');
insert into fakt_sortiment values ('555','s1',200);

-- E1 20 okt: fyra gamla självbekräftade (20 m³ vardera) + ett struket. 21 okt: ett som föraren bekräftat (15 m³). E2: ett gammalt på samma trakt.
-- De gamla 'auto'-raderna FINNS redan i prod: lägg in dem med triggern avstängd (den stoppar nya).
alter table skotar_lass disable trigger skotar_lass_ingen_auto;
insert into skotar_lass (id, objekt_id, vo_nummer, maskin_id, lass_nummer, datum, status, bekraftad_av, bekraftad_tid, andrad) values
 ('00000000-0000-0000-0000-0000000000a1','11111111-1111-1111-1111-111111111111','555','E1',1,'2026-10-20','bekraftat','auto',now(),'2026-10-20T10:00:00Z'),
 ('00000000-0000-0000-0000-0000000000a2','11111111-1111-1111-1111-111111111111','555','E1',2,'2026-10-20','bekraftat','auto',now(),'2026-10-20T10:10:00Z'),
 ('00000000-0000-0000-0000-0000000000a3','11111111-1111-1111-1111-111111111111','555','E1',3,'2026-10-20','bekraftat','auto',now(),'2026-10-20T10:20:00Z'),
 ('00000000-0000-0000-0000-0000000000a4','11111111-1111-1111-1111-111111111111','555','E1',4,'2026-10-20','bekraftat','auto',now(),'2026-10-20T10:30:00Z'),
 ('00000000-0000-0000-0000-0000000000a5','11111111-1111-1111-1111-111111111111','555','E1',5,'2026-10-20','struket','auto',now(),'2026-10-20T10:40:00Z'),
 ('00000000-0000-0000-0000-0000000000f1','11111111-1111-1111-1111-111111111111','555','E1',6,'2026-10-21','bekraftat','forare',now(),'2026-10-21T10:00:00Z'),
 ('00000000-0000-0000-0000-0000000000b1','11111111-1111-1111-1111-111111111111','555','E2',1,'2026-10-20','bekraftat','auto',now(),'2026-10-20T11:00:00Z'),
 ('00000000-0000-0000-0000-0000000000c1','22222222-aaaa-aaaa-aaaa-222222222222','556','E1',1,'2026-10-20','bekraftat','auto',now(),'2026-10-20T12:00:00Z');
alter table skotar_lass enable trigger skotar_lass_ingen_auto;
insert into skotar_lass_del (lass_id, del_nr, avlagg_id, avlagg_nummer, lossad_tid, lat, lng)
 select id, 1, 'vida:1', '01-1', '2026-10-20T10:00:00Z', 56.6, 15.8 from skotar_lass;
insert into skotar_lass_sortiment (lass_id, del_nr, sortiment_nyckel, sortiment_namn, m3_forare)
 select id, 1, 'timmer: vislanda_v3', 'Timmer: Vislanda_V3', case when id = '00000000-0000-0000-0000-0000000000f1' then 15 else 20 end from skotar_lass;

select set_config('test.uid','33333333-3333-3333-3333-333333333333',false);

-- 1. Det gamla räknas inte: vyn, Färdigskotad och admin-jämförelsen.
select t_lika('skalat utan auto', (select sum(m3_skalat) from skotar_lass_sortiment_skalat where objekt_id = '11111111-1111-1111-1111-111111111111'), 15::numeric);
select t_lika('rapporterat utan auto', (skotar_avslut_berakna('11111111-1111-1111-1111-111111111111', '{}'::jsonb) -> 'rapporterat' ->> 'timmer: vislanda_v3')::numeric, 15::numeric);
select t_lika('mot_opti E1 app', (select app_lass from skotar_lass_mot_opti where vo_nummer = '555' and maskin_id = 'E1'), 1::bigint);
select t_lika('mot_opti E1 gammal lass', (select gammal_lass from skotar_lass_mot_opti where vo_nummer = '555' and maskin_id = 'E1'), 4::bigint);
select t_lika('mot_opti E1 gammal m3', (select gammal_m3 from skotar_lass_mot_opti where vo_nummer = '555' and maskin_id = 'E1'), 80::numeric);
-- En trakt/maskin där ALLA lass är gamla försvinner inte ur admin-jämförelsen (annars syns de aldrig).
select t_lika('mot_opti E2 finns', (select gammal_lass from skotar_lass_mot_opti where vo_nummer = '555' and maskin_id = 'E2'), 1::bigint);
select t_lika('mot_opti E2 app', (select app_lass from skotar_lass_mot_opti where vo_nummer = '555' and maskin_id = 'E2'), 0::bigint);
select t_lika('objekt_id med', (select objekt_id from skotar_lass_mot_opti where vo_nummer = '555' and maskin_id = 'E2'), '11111111-1111-1111-1111-111111111111'::uuid);

-- 2. Fel som ska kastas.
select t_fel($$select skotar_lass_granska('bekrafta', array[]::uuid[])$$, 'Inga lass valda');
select t_fel($$select skotar_lass_granska('radera', array['00000000-0000-0000-0000-0000000000a1']::uuid[])$$, 'Okänt beslut');
select t_fel($$select skotar_lass_granska('bekrafta', array['00000000-0000-0000-0000-0000000000ff']::uuid[])$$, 'finns inte');
select t_fel($$select skotar_lass_granska('bekrafta', array['00000000-0000-0000-0000-0000000000f1']::uuid[])$$, 'gamla funktionen');   -- förarens eget
select t_fel($$select skotar_lass_granska('bekrafta', array['00000000-0000-0000-0000-0000000000a5']::uuid[])$$, 'gamla funktionen');   -- redan struket
select t_fel($$select skotar_lass_granska('bekrafta', array['00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1']::uuid[])$$, 'samma trakt och maskin');
select t_fel($$select skotar_lass_granska('bekrafta', array['00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1']::uuid[])$$, 'samma trakt och maskin');
select t_fel($$select skotar_lass_granska('slaihop', array['00000000-0000-0000-0000-0000000000a1']::uuid[], '00000000-0000-0000-0000-0000000000a1')$$, 'minst två');
select t_fel($$select skotar_lass_granska('slaihop', array['00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2']::uuid[], null)$$, 'vilket lass');
select t_fel($$select skotar_lass_granska('slaihop', array['00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2']::uuid[], '00000000-0000-0000-0000-0000000000a3')$$, 'vilket lass');
create or replace function ar_admin() returns boolean language sql as $$ select false $$;
select t_fel($$select skotar_lass_granska('bekrafta', array['00000000-0000-0000-0000-0000000000a1']::uuid[])$$, 'Bara en planerare');
create or replace function ar_admin() returns boolean language sql as $$ select true $$;
select set_config('test.uid','',false);
select t_fel($$select skotar_lass_granska('bekrafta', array['00000000-0000-0000-0000-0000000000a1']::uuid[])$$, 'Inte inloggad');
select set_config('test.uid','33333333-3333-3333-3333-333333333333',false);
-- Efter alla fel: ingenting ändrat, ingenting loggat.
select t_lika('orört', (select count(*) from skotar_lass where bekraftad_av = 'auto' and status <> 'struket'), 6::bigint);
select t_lika('inget loggat', (select count(*) from skotar_lass_granskning), 0::bigint);

-- 3. Bekräfta ett lass → räknas, loggat med lassets tillstånd före ('auto' och sortimenten).
select skotar_lass_granska('bekrafta', array['00000000-0000-0000-0000-0000000000a1']::uuid[], null, '  Stämmer mot Opti  ');
select t_lika('bekräftat av planerare', (select bekraftad_av from skotar_lass where id = '00000000-0000-0000-0000-0000000000a1'), 'planerare');
select t_lika('status', (select status from skotar_lass where id = '00000000-0000-0000-0000-0000000000a1'), 'bekraftat');
select t_lika('räknas nu', (select sum(m3_skalat) from skotar_lass_sortiment_skalat where objekt_id = '11111111-1111-1111-1111-111111111111'), 35::numeric);
select t_lika('logg beslut', (select beslut from skotar_lass_granskning where lass_id = '00000000-0000-0000-0000-0000000000a1'), 'bekraftad');
select t_lika('logg före = auto', (select fore -> 'lass' ->> 'bekraftad_av' from skotar_lass_granskning where lass_id = '00000000-0000-0000-0000-0000000000a1'), 'auto');
select t_lika('logg före sortiment', (select (fore -> 'delar' -> 0 -> 'sortiment' -> 0 ->> 'm3_forare')::numeric from skotar_lass_granskning where lass_id = '00000000-0000-0000-0000-0000000000a1'), 20::numeric);
select t_lika('logg anledning trimmad', (select anledning from skotar_lass_granskning where lass_id = '00000000-0000-0000-0000-0000000000a1'), 'Stämmer mot Opti');
select t_lika('logg av', (select av from skotar_lass_granskning where lass_id = '00000000-0000-0000-0000-0000000000a1'), '33333333-3333-3333-3333-333333333333'::uuid);
-- Det går inte att granska samma lass två gånger.
select t_fel($$select skotar_lass_granska('stryk', array['00000000-0000-0000-0000-0000000000a1']::uuid[])$$, 'gamla funktionen');

-- 4. Stryk → struket, kvar i databasen med sina rader.
select skotar_lass_granska('stryk', array['00000000-0000-0000-0000-0000000000a2']::uuid[], null, 'Dubblett');
select t_lika('struket', (select status from skotar_lass where id = '00000000-0000-0000-0000-0000000000a2'), 'struket');
select t_lika('rader kvar', (select count(*) from skotar_lass_sortiment where lass_id = '00000000-0000-0000-0000-0000000000a2'), 1::bigint);
select t_lika('logg stryk', (select beslut from skotar_lass_granskning where lass_id = '00000000-0000-0000-0000-0000000000a2'), 'struken');

-- 5. Slå ihop a3 + a4 i a3: 20 + 20 = 40 på a3, a4 struket, båda loggade.
select skotar_lass_granska('slaihop', array['00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a4']::uuid[], '00000000-0000-0000-0000-0000000000a3', 'Samma lossning delad i två');
select t_lika('mottagarens m3', (select m3_forare from skotar_lass_sortiment where lass_id = '00000000-0000-0000-0000-0000000000a3' and del_nr = 1), 40::numeric);
select t_lika('mottagare bekräftad av planerare', (select bekraftad_av from skotar_lass where id = '00000000-0000-0000-0000-0000000000a3'), 'planerare');
select t_lika('källa struken', (select status from skotar_lass where id = '00000000-0000-0000-0000-0000000000a4'), 'struket');
select t_lika('källans rader orörda', (select m3_forare from skotar_lass_sortiment where lass_id = '00000000-0000-0000-0000-0000000000a4'), 20::numeric);
select t_lika('logg tog_emot', (select beslut from skotar_lass_granskning where lass_id = '00000000-0000-0000-0000-0000000000a3'), 'tog_emot');
select t_lika('logg slogs_ihop', (select beslut from skotar_lass_granskning where lass_id = '00000000-0000-0000-0000-0000000000a4'), 'slogs_ihop');
select t_lika('logg mål', (select mal_lass from skotar_lass_granskning where lass_id = '00000000-0000-0000-0000-0000000000a4'), '00000000-0000-0000-0000-0000000000a3'::uuid);
select t_lika('logg före på mottagaren = 20', (select (fore -> 'delar' -> 0 -> 'sortiment' -> 0 ->> 'm3_forare')::numeric from skotar_lass_granskning where lass_id = '00000000-0000-0000-0000-0000000000a3'), 20::numeric);
select t_lika('räknas: 15 + 20 + 40', (select sum(m3_skalat) from skotar_lass_sortiment_skalat where objekt_id = '11111111-1111-1111-1111-111111111111' and maskin_id = 'E1'), 75::numeric);
select t_lika('rapporterat i Färdigskotad', (skotar_avslut_berakna('11111111-1111-1111-1111-111111111111', '{}'::jsonb) -> 'rapporterat' ->> 'timmer: vislanda_v3')::numeric, 75::numeric);   -- E2:s gamla lass räknas inte heller

-- 6. Loggen går inte att ändra eller skriva för en inloggad användare (bara via funktionen).
set role authenticated;
select t_fel($$update skotar_lass_granskning set beslut = 'bekraftad'$$, 'permission denied');
select t_fel($$delete from skotar_lass_granskning$$, 'permission denied');
select t_fel($$insert into skotar_lass_granskning (lass_id, objekt_id, beslut, av, fore) values (gen_random_uuid(), gen_random_uuid(), 'bekraftad', gen_random_uuid(), '{}')$$, 'permission denied');
reset role;

-- 7. Inget nytt 'auto' — vare sig nytt lass eller ändring av ett förarbekräftat. Gamla 'auto' som förblir 'auto' rörs inte.
select skotar_lass_spara('{"lass":{"id":"00000000-0000-0000-0000-0000000000d1","objekt_id":"11111111-1111-1111-1111-111111111111","maskin_id":"E1","lass_nummer":9,"datum":"2026-10-22","status":"bekraftat","bekraftad_av":"auto","bekraftad_tid":"2026-10-22T08:00:00Z","andrad":"2026-10-22T08:00:00Z"},"delar":[]}'::jsonb);
select t_lika('nytt auto blir väntande', (select status || '/' || coalesce(bekraftad_av, 'null') from skotar_lass where id = '00000000-0000-0000-0000-0000000000d1'), 'vantar_forare/null');
select skotar_lass_spara('{"lass":{"id":"00000000-0000-0000-0000-0000000000f1","objekt_id":"11111111-1111-1111-1111-111111111111","maskin_id":"E1","lass_nummer":6,"datum":"2026-10-21","status":"bekraftat","bekraftad_av":"auto","bekraftad_tid":"2026-10-22T08:00:00Z","andrad":"2026-10-22T09:00:00Z"},"delar":[]}'::jsonb);
select t_lika('förarens lass blir inte auto', (select bekraftad_av from skotar_lass where id = '00000000-0000-0000-0000-0000000000f1'), null::text);
select skotar_lass_spara('{"lass":{"id":"00000000-0000-0000-0000-0000000000b1","objekt_id":"11111111-1111-1111-1111-111111111111","maskin_id":"E2","lass_nummer":1,"datum":"2026-10-20","status":"bekraftat","bekraftad_av":"auto","bekraftad_tid":"2026-10-20T11:00:00Z","andrad":"2026-10-22T10:00:00Z"},"delar":[]}'::jsonb);
select t_lika('gammalt auto förblir auto', (select bekraftad_av || '/' || status from skotar_lass where id = '00000000-0000-0000-0000-0000000000b1'), 'auto/bekraftat');
select skotar_lass_spara('{"lass":{"id":"00000000-0000-0000-0000-0000000000d2","objekt_id":"11111111-1111-1111-1111-111111111111","maskin_id":"E1","lass_nummer":10,"datum":"2026-10-22","status":"bekraftat","bekraftad_av":"forare","bekraftad_tid":"2026-10-22T08:00:00Z","andrad":"2026-10-22T08:00:00Z"},"delar":[]}'::jsonb);
select t_lika('förare passerar', (select bekraftad_av from skotar_lass where id = '00000000-0000-0000-0000-0000000000d2'), 'forare');

select 'OK granskning' as resultat;
