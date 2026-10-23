\set ON_ERROR_STOP on
-- Punkt 3: medarbetarraden. Förväntan efter migrationen 20261023120100_medarbetare_skydda_kolumner.sql.
-- Alla "förbjudna" försök görs som förare 1 mot SIN EGEN rad (det RLS släpper in) — det är det som var hålet.
create function test.vagrad(kol text, nytt text) returns text language sql as
  $$ select test.som('f1', format('update public.medarbetare set %I = %L where user_id = auth.uid()', kol, nytt)) $$;

select test.forvanta('förare: roll → admin spärras',          test.vagrad('roll', 'admin') = 'fel:42501');
select test.forvanta('förare: timlön spärras',                test.som('f1', $$update public.medarbetare set timlon_kr = 999 where user_id = auth.uid()$$) = 'fel:42501');
select test.forvanta('förare: månadslön spärras',             test.som('f1', $$update public.medarbetare set manadslon_kr = 99999 where user_id = auth.uid()$$) = 'fel:42501');
select test.forvanta('förare: aktiv spärras',                 test.som('f1', $$update public.medarbetare set aktiv = false where user_id = auth.uid()$$) = 'fel:42501');
select test.forvanta('förare: företagsledare spärras',        test.som('f1', $$update public.medarbetare set foretagsledare = true where user_id = auth.uid()$$) = 'fel:42501');
select test.forvanta('förare: maskin_id spärras',             test.vagrad('maskin_id', 'R64101') = 'fel:42501');
select test.forvanta('förare: e-post spärras',                test.vagrad('epost', 'admin@x.se') = 'fel:42501');
select test.forvanta('förare: user_id spärras',               test.som('f1', $$update public.medarbetare set user_id = '11111111-1111-1111-1111-111111111111' where user_id = auth.uid()$$) = 'fel:42501');
select test.forvanta('förare: hemadress spärras (styr km-ersättning)', test.vagrad('hemadress', 'Annan väg 1') = 'fel:42501');
select test.forvanta('förare: friskvårdsbudget spärras',      test.som('f1', $$update public.medarbetare set friskvard_budget_total = 99999 where user_id = auth.uid()$$) = 'fel:42501');
select test.forvanta('förare: flera fält i ett svep, ett av dem förbjudet → hela spärras', test.som('f1', $$update public.medarbetare set telefon = '070-1', roll = 'admin' where user_id = auth.uid()$$) = 'fel:42501');
select test.forvanta('inget av det ovan skrevs',              (select roll = 'forare' and timlon_kr = 200 and aktiv and not foretagsledare and epost = 'f1@x.se' and telefon is null from public.medarbetare where namn = 'Förare1'));

select test.forvanta('förare: telefon går bra',               test.som('f1', $$update public.medarbetare set telefon = '070-123' where user_id = auth.uid()$$) = '1');
select test.forvanta('förare: närstående går bra',            test.som('f1', $$update public.medarbetare set anhorig_namn = 'Kim', anhorig_telefon = '070-9', anhorig_relation = 'syskon' where user_id = auth.uid()$$) = '1');
select test.forvanta('förare: egna påminnelse-inställningar går bra', test.som('f1', $$update public.medarbetare set push_aktiv = false, daglig_pamin_aktiv = false, daglig_pamin_tid = '17:00', pamin_obekraftad_min = 10, pamin_pagaende_min = 60 where user_id = auth.uid()$$) = '1');
select test.forvanta('förare: ledighet_markera_sett (DEFINER) går bra', test.som('f1', $$select public.ledighet_markera_sett(now())$$) = '1');
select test.forvanta('förare: satt_kartlager (DEFINER) går bra',        test.som('f1', $$select public.satt_kartlager('osm')$$) = '1');
select test.forvanta('de tillåtna fälten skrevs',             (select telefon = '070-123' and anhorig_namn = 'Kim' and not push_aktiv and kartlager = 'osm' from public.medarbetare where namn = 'Förare1'));

select test.forvanta('förare: kan inte ändra en kollegas rad (RLS)', test.som('f1', $$update public.medarbetare set telefon = 'x' where namn = 'Förare2'$$) = '0');
select test.forvanta('förare: kan inte lägga till medarbetare',      test.som('f1', $$insert into public.medarbetare (namn, epost, roll) values ('Ny', 'ny@x.se', 'admin')$$) = 'fel:42501');
select test.forvanta('förare: kan inte radera medarbetare',          test.som('f1', $$delete from public.medarbetare where namn = 'Förare2'$$) = '0');
select test.forvanta('utloggad (anon) kan inte ändra något',         test.som('anon', $$update public.medarbetare set roll = 'admin'$$) in ('0', 'fel:42501'));

select test.forvanta('admin: ändrar roll, lön och aktiv på en förare', test.som('admin', $$update public.medarbetare set roll = 'forare', timlon_kr = 250, aktiv = true where namn = 'Förare2'$$) = '1');
select test.forvanta('admin: ändrar e-post och hemadress',            test.som('admin', $$update public.medarbetare set epost = 'f2@y.se', hemadress = 'Ny adress' where namn = 'Förare2'$$) = '1');
select test.forvanta('admin: lägger till medarbetare',                 test.som('admin', $$insert into public.medarbetare (namn, epost, roll, user_id) values ('Inbjuden', 'inb@x.se', 'forare', null)$$) = '1');
select test.forvanta('admin: skrev lönen',                             (select timlon_kr = 250 from public.medarbetare where namn = 'Förare2'));

-- #921:s inbjudningsflöde och serverns egna skrivningar
select test.forvanta('servicenyckeln (service_role) kan ändra roll och lön', test.som('service', $$update public.medarbetare set roll = 'admin', timlon_kr = 1 where namn = 'Inbjuden'$$) = '1');
select test.forvanta('service_role kan lägga till en inbjuden',        test.som('service', $$insert into public.medarbetare (namn, epost, roll) values ('Inbjuden2', 'inb2@x.se', 'forare')$$) = '1');
select test.forvanta('databasens egna körningar (ingen JWT-roll, t.ex. GoTrue-kopplingen) kan sätta user_id', test.som('sql', $$update public.medarbetare set user_id = '44444444-4444-4444-4444-444444444444' where namn = 'Inbjuden2'$$) = '1');
select test.forvanta('den inbjudna, sedan kopplad, kan logga in som förare och ändra sin telefon men inte sin roll',
  test.som('u', $$update public.medarbetare set telefon = '1' where user_id = auth.uid()$$) = '0');   -- u har ingen rad
select 'MEDARBETARE: allt grönt' as resultat;
