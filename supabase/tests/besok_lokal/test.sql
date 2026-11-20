-- Lokalt test av besöksmigrationen: ingen anon-åtkomst, token bara via funktionerna (bara admin), kvittens och SMS-logg bara som sig själv med servertid, volymfunktionen bara för service_role.
create table t_res (namn text, ok boolean);
grant all on t_res to public;
create or replace function chk(n text, ok boolean) returns void language sql as $$ insert into t_res values (n, coalesce(ok, false)) $$;
grant execute on function chk(text, boolean) to public;
create or replace function forvanta(q text, kod text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return sqlstate = kod; end $$;
grant execute on function forvanta(text, text) to public;

insert into medarbetare (id, user_id, namn, roll) values
  ('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', 'Planeraren', 'admin'),
  ('00000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f1', 'Föraren', 'forare'),
  ('00000000-0000-0000-0000-0000000000f2', '10000000-0000-0000-0000-0000000000f2', 'Andra föraren', 'forare');
insert into objekt (id, namn) values ('00000000-0000-0000-0000-00000000000b', 'Testtrakt');

-- ADMIN: skapar länken, får samma token vid nästa anrop, kan stänga av den
set role authenticated; set request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000a1';
select chk('admin får en token på minst 32 tecken', (select char_length(token) >= 32 from besok_lank_hamta('00000000-0000-0000-0000-00000000000b')));
select chk('samma token andra gången', (select count(distinct token) = 1 from (select token from besok_lank_hamta('00000000-0000-0000-0000-00000000000b') union all select token from besok_lank_hamta('00000000-0000-0000-0000-00000000000b')) x));
select chk('länken är aktiv från början', (select aktiv from besok_lank_hamta('00000000-0000-0000-0000-00000000000b')));
select besok_lank_satt_aktiv('00000000-0000-0000-0000-00000000000b', false);
select chk('admin kan stänga av länken', (select not aktiv from besok_lank_hamta('00000000-0000-0000-0000-00000000000b')));
select besok_lank_satt_aktiv('00000000-0000-0000-0000-00000000000b', true);
select chk('tabellen med token går inte att läsa direkt (ens för admin)', forvanta('select * from objekt_besok_lank', '42501'));
select chk('admin kan inte skriva besök direkt (bara servern)', forvanta($$insert into objekt_besok (objekt_id, namn, telefon, besokstid) values ('00000000-0000-0000-0000-00000000000b', 'X', '0701234567', now())$$, '42501'));
reset role;

-- FÖRARE: får inte hämta eller stänga länken, kan inte läsa token
set role authenticated; set request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000f1';
select chk('förare får inte hämta länken', forvanta($$select * from besok_lank_hamta('00000000-0000-0000-0000-00000000000b')$$, '42501'));
select chk('förare får inte stänga länken', forvanta($$select besok_lank_satt_aktiv('00000000-0000-0000-0000-00000000000b', false)$$, '42501'));
select chk('förare kan inte läsa token-tabellen', forvanta('select token from objekt_besok_lank', '42501'));
reset role;

-- Servern (postgres här, service_role i prod) skapar en anmälan
insert into objekt_besok (id, objekt_id, namn, telefon, besokstid) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000b', 'Anna Svensson', '070-123 45 67', now());
select chk('namn får inte vara tomt', forvanta($$insert into objekt_besok (objekt_id, namn, telefon, besokstid) values ('00000000-0000-0000-0000-00000000000b', '   ', '0701234567', now())$$, '23514'));
select chk('telefon får inte vara för kort', forvanta($$insert into objekt_besok (objekt_id, namn, telefon, besokstid) values ('00000000-0000-0000-0000-00000000000b', 'A', '12', now())$$, '23514'));
insert into objekt (id, namn) values ('00000000-0000-0000-0000-00000000000c', 'Annan trakt');
select chk('token under 32 tecken avvisas', forvanta($$insert into objekt_besok_lank (objekt_id, token) values ('00000000-0000-0000-0000-00000000000c', 'kort')$$, '23514'));

-- FÖRARE 1: läser besöket, kvitterar som sig själv, servertid
set role authenticated; set request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000f1';
select chk('förare läser besök', (select count(*) = 1 from objekt_besok));
insert into objekt_besok_kvittens (besok_id, maskin_id, roll, forare_id, kvitterad_at) values ('00000000-0000-0000-0000-0000000000c1', 'PONS20SDJAA270231', 'skordare', '00000000-0000-0000-0000-0000000000f1', '2000-01-01');
select chk('kvitterad_at sätts av servern, inte klienten', (select kvitterad_at > now() - interval '1 minute' from objekt_besok_kvittens where maskin_id = 'PONS20SDJAA270231'));
select chk('kvittens som en annan förare avvisas', forvanta($$insert into objekt_besok_kvittens (besok_id, maskin_id, roll, forare_id) values ('00000000-0000-0000-0000-0000000000c1', 'A130743', 'skotare', '00000000-0000-0000-0000-0000000000f2')$$, '42501'));
insert into objekt_besok_kvittens (besok_id, maskin_id, roll, forare_id) values ('00000000-0000-0000-0000-0000000000c1', 'PONS20SDJAA270231', 'skordare', '00000000-0000-0000-0000-0000000000f1') on conflict (besok_id, maskin_id) do nothing;
select chk('samma maskin två gånger = bara en rad (on conflict do nothing)', (select count(*) = 1 from objekt_besok_kvittens where maskin_id = 'PONS20SDJAA270231'));
update objekt_besok_kvittens set maskin_id = 'X';
select chk('förare kan inte ändra en kvittens (ingen update-policy)', (select count(*) = 1 from objekt_besok_kvittens where maskin_id = 'PONS20SDJAA270231'));
delete from objekt_besok_kvittens;
select chk('förare kan inte radera en kvittens (ingen delete-policy)', (select count(*) = 1 from objekt_besok_kvittens));
insert into objekt_besok_sms (objekt_id, oppnad_av, oppnad_at) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000f1', '2000-01-01');
select chk('SMS-loggens tid sätts av servern', (select oppnad_at > now() - interval '1 minute' from objekt_besok_sms));
select chk('SMS-logg som en annan avvisas', forvanta($$insert into objekt_besok_sms (objekt_id, oppnad_av) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000f2')$$, '42501'));
select chk('volymfunktionen går inte att anropa som inloggad', forvanta($$select * from besok_volymer('00000000-0000-0000-0000-00000000000b', array['1'])$$, '42501'));
reset role;

-- ANON: ingenting alls
set role anon;
select chk('anon läser inte besök', forvanta('select * from objekt_besok', '42501'));
select chk('anon läser inte kvittenser', forvanta('select * from objekt_besok_kvittens', '42501'));
select chk('anon läser inte SMS-logg', forvanta('select * from objekt_besok_sms', '42501'));
select chk('anon läser inte token-tabellen', forvanta('select * from objekt_besok_lank', '42501'));
select chk('anon skriver inte besök', forvanta($$insert into objekt_besok (objekt_id, namn, telefon, besokstid) values ('00000000-0000-0000-0000-00000000000b', 'X', '0701234567', now())$$, '42501'));
select chk('anon kan inte hämta länken', forvanta($$select * from besok_lank_hamta('00000000-0000-0000-0000-00000000000b')$$, '42501'));
select chk('anon kan inte anropa volymfunktionen', forvanta($$select * from besok_volymer('00000000-0000-0000-0000-00000000000b', array['1'])$$, '42501'));
reset role;

-- Volymfunktionen: summerar per dag, skördat + skotat (Opti + appens ej strukna lass)
insert into fakt_produktion values ('11', '2026-10-21', 100), ('11', '2026-10-21', 34.5), ('11', '2026-10-22', 309), ('99', '2026-10-22', 5);
insert into fakt_lass values ('11', '2026-10-22', 20);
insert into skotar_lass_sortiment_skalat values ('00000000-0000-0000-0000-00000000000b', '2026-10-22', 'bekraftat', 7, 6), ('00000000-0000-0000-0000-00000000000b', '2026-10-22', 'struket', 50, 50);
set role service_role;
select chk('service_role summerar skördat per dag', (select sum(m3) = 134.5 from besok_volymer('00000000-0000-0000-0000-00000000000b', array['11']) where kalla = 'skordat' and datum = '2026-10-21'));
select chk('andra objekt räknas inte', (select sum(m3) = 443.5 from besok_volymer('00000000-0000-0000-0000-00000000000b', array['11']) where kalla = 'skordat'));
select chk('skotat = Opti-lass + appens lass utan strukna', (select sum(m3) = 27 from besok_volymer('00000000-0000-0000-0000-00000000000b', array['11']) where kalla = 'skotat'));
reset role;

select 'rader_som_inte_ar_true = ' || count(*) from t_res where not ok;
select namn from t_res where not ok;
select 'kontroller = ' || count(*) from t_res;
