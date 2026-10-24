-- Lokalt test av uppstramningen: läsning bara för admin, kvittens bara från servern (service_role), SMS-logg bara admin med händelse.
create table t_res (namn text, ok boolean);
grant all on t_res to public;
create or replace function chk(n text, ok boolean) returns void language sql as $$ insert into t_res values (n, coalesce(ok, false)) $$;
grant execute on function chk(text, boolean) to public;
create or replace function forvanta(q text, kod text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return sqlstate = kod; end $$;
grant execute on function forvanta(text, text) to public;

insert into medarbetare (id, user_id, namn, roll) values
  ('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', 'Planeraren', 'admin'),
  ('00000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f1', 'Föraren', 'forare');
insert into objekt (id, namn) values ('00000000-0000-0000-0000-00000000000b', 'Testtrakt');
insert into objekt_besok (id, objekt_id, namn, telefon, besokstid) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000b', 'Anna Svensson', '070-123 45 67', now());
insert into objekt_besok_kvittens (besok_id, maskin_id, roll, forare_id) values ('00000000-0000-0000-0000-0000000000c1', 'M1', 'skordare', '00000000-0000-0000-0000-0000000000f1');
insert into objekt_besok_sms (objekt_id, oppnad_av) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a1');

-- Gamla SMS-rader blir 'oppnad' – alltså aldrig skickade
select chk('befintlig SMS-rad får händelsen oppnad', (select handelse = 'oppnad' from objekt_besok_sms));

-- FÖRARE: ser ingenting av besökarna och kan inte skriva något
set role authenticated; set request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000f1';
select chk('förare läser inga besök (namn och nummer)', (select count(*) = 0 from objekt_besok));
select chk('förare läser inga kvittenser', (select count(*) = 0 from objekt_besok_kvittens));
select chk('förare läser ingen SMS-logg', (select count(*) = 0 from objekt_besok_sms));
select chk('förare kan inte skriva en kvittens ens som sig själv', forvanta($$insert into objekt_besok_kvittens (besok_id, maskin_id, roll, forare_id, testlage) values ('00000000-0000-0000-0000-0000000000c1', 'M2', 'skordare', '00000000-0000-0000-0000-0000000000f1', false)$$, '42501'));
select chk('förare kan inte kvittera med testläge', forvanta($$insert into objekt_besok_kvittens (besok_id, maskin_id, roll, forare_id, testlage) values ('00000000-0000-0000-0000-0000000000c1', 'M3', 'skordare', '00000000-0000-0000-0000-0000000000f1', true)$$, '42501'));
select chk('förare kan inte skriva SMS-logg', forvanta($$insert into objekt_besok_sms (objekt_id, oppnad_av, handelse) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000f1', 'skickad')$$, '42501'));
select chk('förare kan inte ändra SMS-logg', forvanta($$update objekt_besok_sms set handelse = 'skickad'$$, '42501'));
select chk('förare kan inte tömma tabellerna', forvanta('truncate objekt_besok_kvittens', '42501') and forvanta('truncate objekt_besok_sms', '42501') and forvanta('truncate objekt_besok', '42501'));
reset role;

-- ADMIN: läser allt, skriver bara SMS-händelser som sig själv
set role authenticated; set request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000a1';
select chk('admin läser besök', (select count(*) = 1 from objekt_besok));
select chk('admin läser kvittenser', (select count(*) = 1 from objekt_besok_kvittens));
select chk('admin läser SMS-logg', (select count(*) = 1 from objekt_besok_sms));
insert into objekt_besok_sms (objekt_id, oppnad_av, handelse) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a1', 'kopierad');
insert into objekt_besok_sms (objekt_id, oppnad_av, handelse) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a1', 'skickad');
select chk('admin kan logga kopierad och skickad', (select count(*) filter (where handelse in ('kopierad','skickad')) = 2 from objekt_besok_sms));
insert into objekt_besok_sms (objekt_id, oppnad_av) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a1');
select chk('standard är oppnad när inget anges', (select handelse = 'oppnad' from objekt_besok_sms order by oppnad_at desc, id limit 1) or (select count(*) filter (where handelse = 'oppnad') = 2 from objekt_besok_sms));
select chk('okänd händelse avvisas', forvanta($$insert into objekt_besok_sms (objekt_id, oppnad_av, handelse) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a1', 'nastan')$$, '23514'));
select chk('admin kan inte logga i någon annans namn', forvanta($$insert into objekt_besok_sms (objekt_id, oppnad_av, handelse) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000f1', 'skickad')$$, '42501'));
select chk('inte ens admin skriver kvittens från appen (bara servern)', forvanta($$insert into objekt_besok_kvittens (besok_id, maskin_id, roll, forare_id) values ('00000000-0000-0000-0000-0000000000c1', 'M4', 'skordare', '00000000-0000-0000-0000-0000000000a1')$$, '42501'));
select chk('admin kan inte ändra eller radera loggen', forvanta($$update objekt_besok_sms set handelse = 'skickad'$$, '42501') and forvanta('delete from objekt_besok_sms', '42501'));
reset role;

-- SERVERN (service_role): skriver kvittens med testläge, läser allt
set role service_role;
insert into objekt_besok_kvittens (besok_id, maskin_id, roll, forare_id, testlage) values ('00000000-0000-0000-0000-0000000000c1', 'M5', 'skotare', '00000000-0000-0000-0000-0000000000f1', true);
select chk('servern kan skriva kvittens (service_role kringgår RLS)', (select count(*) = 1 from objekt_besok_kvittens where maskin_id = 'M5' and testlage));
reset role;

-- ANON: fortfarande ingenting
set role anon;
select chk('anon läser fortfarande ingenting', forvanta('select * from objekt_besok', '42501') and forvanta('select * from objekt_besok_sms', '42501') and forvanta('select * from objekt_besok_kvittens', '42501'));
reset role;

select 'rader_som_inte_ar_true = ' || count(*) from t_res where not ok;
select namn from t_res where not ok;
select 'kontroller = ' || count(*) from t_res;
