\set ON_ERROR_STOP on
-- Trakt som började i Opti: skördat 120 timmer + 45 massa. Opti (före appens start) har skotat 70 timmer + 40 massa.
-- Appen rapporterar 50 timmer + 10 massa. Efter Färdigskotad ska Opti + app = skördat per sortiment.
insert into objekt (id, vo_nummer) values ('11111111-1111-1111-1111-111111111111', '555');
insert into dim_objekt values ('555','555',null);
insert into dim_sortiment values ('s1','Timmer: Vislanda_V3'),('s2','Massa: BmavFall_V3');
insert into fakt_sortiment values ('555','s1',120),('555','s2',45);
select set_config('test.uid','22222222-2222-2222-2222-222222222222',false);
select skotar_lass_spara('{"lass":{"id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1","objekt_id":"11111111-1111-1111-1111-111111111111","vo_nummer":"555","maskin_id":"A030353","lass_nummer":1,"datum":"2026-10-19","status":"bekraftat","andrad":"2026-10-19T08:00:00Z"},"delar":[{"del_nr":1,"avlagg_id":"vida:2","avlagg_nummer":"2","lossad_tid":"2026-10-19T08:00:00Z","lat":56.6,"lng":15.8,"rader":[{"nyckel":"timmer: vislanda_v3","namn":"Timmer: Vislanda_V3","m3":50},{"nyckel":"massa: bmavfall_v3","namn":"Massa: BmavFall_V3","m3":10}]}]}'::jsonb);
select skotar_farduskotat('11111111-1111-1111-1111-111111111111', '{"timmer: vislanda_v3":70,"massa: bmavfall_v3":40}'::jsonb) as svar \gset
select :'svar'::jsonb -> 'faktorer' as faktorer, :'svar'::jsonb -> 'opti' as opti, :'svar'::jsonb -> 'tillagg' as tillagg, :'svar'::jsonb ->> 'skillnad_m3' as skillnad;
-- Opti + appens skalade = skördat, per sortiment (förväntat: timmer 70+50 = 120, massa 40+5 = 45).
select s.sortiment_nyckel, round(s.m3_skalat, 4) as app_skalat, (a.opti ->> s.sortiment_nyckel)::numeric as opti,
       round(s.m3_skalat + (a.opti ->> s.sortiment_nyckel)::numeric, 4) as summa, (a.skordat ->> s.sortiment_nyckel)::numeric as skordat
from skotar_lass_sortiment_skalat s join skotar_trakt_avslut a on a.objekt_id = s.objekt_id order by 1;
select vo_nummer, skotning_avslutad is not null as avslutad from dim_objekt;
-- Gamla klienten (utan Opti) ger det gamla beteendet: appens lass skalas mot hela skördat.
select skotar_farduskotat('11111111-1111-1111-1111-111111111111') ->> 'faktorer' as gammal_klient;
-- Opti över skördat kläms: mål 0 → faktor 0, inget negativt.
select skotar_avslut_berakna('11111111-1111-1111-1111-111111111111', '{"timmer: vislanda_v3":500,"massa: bmavfall_v3":-5}'::jsonb) as klamt \gset
select :'klamt'::jsonb -> 'faktorer' as faktorer_klamt, :'klamt'::jsonb -> 'opti' as opti_klamt;
-- Opti utan appens lass i ett sortiment → tillägg = skördat − Opti.
select skotar_avslut_berakna('11111111-1111-1111-1111-111111111111', '{"timmer: vislanda_v3":20}'::jsonb) -> 'faktorer' as f2;
