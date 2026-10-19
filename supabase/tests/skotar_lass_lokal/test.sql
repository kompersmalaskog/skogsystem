\set ON_ERROR_STOP on
insert into objekt (id, vo_nummer) values ('11111111-1111-1111-1111-111111111111', '555');
insert into dim_objekt values ('555','555',null);
insert into dim_sortiment values ('s1','Timmer: Vislanda_V3'),('s2','Massa: BmavFall_V3'),('s3','Massa: HemvedFall_V3');
insert into fakt_sortiment values ('555','s1',120),('555','s2',45),('555','s3',12),('999','s1',500);
insert into fakt_lass values ('555','A030353',100);
select set_config('test.uid','22222222-2222-2222-2222-222222222222',false);
select skotar_lass_spara('{"lass":{"id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1","objekt_id":"11111111-1111-1111-1111-111111111111","vo_nummer":"555","maskin_id":"A030353","lass_nummer":1,"datum":"2026-10-19","status":"bekraftat","bekraftad_av":"forare","bekraftad_tid":"2026-10-19T08:00:00Z","andrad":"2026-10-19T08:00:00Z"},"delar":[{"del_nr":1,"avlagg_id":"vida:2","avlagg_nummer":"2","lossad_tid":"2026-10-19T08:00:00Z","lat":56.6,"lng":15.8,"rader":[{"nyckel":"timmer: vislanda_v3","namn":"Timmer: Vislanda_V3","m3":50},{"nyckel":"massa: bmavfall_v3","namn":"Massa: BmavFall_V3","m3":60}]}]}'::jsonb);
-- idempotent: samma igen
select skotar_lass_spara('{"lass":{"id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1","objekt_id":"11111111-1111-1111-1111-111111111111","vo_nummer":"555","maskin_id":"A030353","lass_nummer":1,"datum":"2026-10-19","status":"bekraftat","andrad":"2026-10-19T08:00:00Z"},"delar":[{"del_nr":1,"avlagg_id":"vida:2","avlagg_nummer":"2","lossad_tid":"2026-10-19T08:00:00Z","lat":56.6,"lng":15.8,"rader":[{"nyckel":"timmer: vislanda_v3","namn":"Timmer: Vislanda_V3","m3":50},{"nyckel":"massa: bmavfall_v3","namn":"Massa: BmavFall_V3","m3":60}]}]}'::jsonb);
-- äldre version skriver inte över
select skotar_lass_spara('{"lass":{"id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1","objekt_id":"11111111-1111-1111-1111-111111111111","maskin_id":"A030353","lass_nummer":1,"datum":"2026-10-19","status":"struket","andrad":"2026-10-19T07:00:00Z"},"delar":[]}'::jsonb);
select count(*) as lass, (select count(*) from skotar_lass_sortiment) as rader, (select status from skotar_lass) as status;
select skotar_farduskotat('11111111-1111-1111-1111-111111111111');
select sortiment_nyckel, m3_forare, round(m3_skalat,4) m3_skalat from skotar_lass_sortiment_skalat order by 1;
select vo_nummer, skotning_avslutad from dim_objekt;
select * from skotar_lass_mot_opti;
select skillnad_m3, tillagg from skotar_trakt_avslut;
