-- Kontrollerna för "Föraren från Opti". Varje kontroll är ett DO-block som kastar vid fel; sista raden är "ALLA KONTROLLER OK".
create function chk(namn text, villkor boolean) returns void language plpgsql as $$
begin if villkor is not true then raise exception 'KONTROLL FALLER: %', namn; end if; end $$;

insert into medarbetare (id, namn, roll, maskin_id) values
  ('00000000-0000-0000-0000-00000000000d', 'Daniel', 'forare', 'A130743'),
  ('00000000-0000-0000-0000-00000000000a', 'Martin', 'admin', null),
  ('00000000-0000-0000-0000-0000000000a1', 'Max', 'forare', 'A030353'),
  ('00000000-0000-0000-0000-0000000000a2', 'Oscar', 'forare', 'JD810E'),
  ('00000000-0000-0000-0000-0000000000a3', 'Stefan', 'forare', 'PONS1');
insert into operator_medarbetare values
  ('A130743_1', '00000000-0000-0000-0000-00000000000d'),
  ('A130743_2', '00000000-0000-0000-0000-00000000000a');

-- Edestad 18 nov, Elefanten: Daniel till 15:14:26, Martin från 15:14:33 till 22:40:53 (UTC).
insert into fakt_skift (maskin_id, operator_id, datum, inloggning_tid, utloggning_tid) values
  ('A130743', 'A130743_1', '2026-11-18', '2026-11-18 10:04:41+00', '2026-11-18 15:14:26+00'),
  ('A130743', 'A130743_2', '2026-11-18', '2026-11-18 15:14:33+00', '2026-11-18 22:40:53+00');

-- Appen skriver ALLT på den inloggade (Daniel).
insert into skotar_lass (id, maskin_id, medarbetare_id, datum, status, bekraftad_av, bekraftad_tid, skapad) values
  ('10000000-0000-0000-0000-000000000001', 'A130743', '00000000-0000-0000-0000-00000000000d', '2026-11-18', 'bekraftat', 'forare', '2026-11-18 11:10:48+00', '2026-11-18 11:10:30+00'),
  ('10000000-0000-0000-0000-000000000002', 'A130743', '00000000-0000-0000-0000-00000000000d', '2026-11-18', 'bekraftat', 'forare', '2026-11-18 15:54:37+00', '2026-11-18 15:54:33+00'),
  -- skiftbyte: lossat i Daniels pass men BEKRÄFTAT efter att Martin loggat in → Martin
  ('10000000-0000-0000-0000-000000000004', 'A130743', '00000000-0000-0000-0000-00000000000d', '2026-11-18', 'bekraftat', 'forare', '2026-11-18 15:14:40+00', '2026-11-18 15:14:20+00'),
  -- struket i Martins pass: rörs inte
  ('10000000-0000-0000-0000-000000000005', 'A130743', '00000000-0000-0000-0000-00000000000d', '2026-11-18', 'struket', 'forare', '2026-11-18 22:27:21+00', '2026-11-18 22:27:02+00'),
  -- efter utloggningen, ingen fil: schemats förare (Daniel)
  ('10000000-0000-0000-0000-000000000006', 'A130743', '00000000-0000-0000-0000-00000000000d', '2026-11-18', 'bekraftat', 'forare', '2026-11-18 23:30:00+00', '2026-11-18 23:29:00+00');

do $$ begin
  perform chk('Daniels pass → Daniel', (select medarbetare_id from skotar_lass where id = '10000000-0000-0000-0000-000000000001') = '00000000-0000-0000-0000-00000000000d');
  perform chk('Daniels pass: källa opti', (select forare_kalla from skotar_lass where id = '10000000-0000-0000-0000-000000000001') = 'opti');
  perform chk('Martins pass → Martin (var Daniel)', (select medarbetare_id from skotar_lass where id = '10000000-0000-0000-0000-000000000002') = '00000000-0000-0000-0000-00000000000a');
  perform chk('originalet bevaras', (select registrerad_av from skotar_lass where id = '10000000-0000-0000-0000-000000000002') = '00000000-0000-0000-0000-00000000000d');
  perform chk('skiftbyte: bekräftat i Martins pass → Martin', (select medarbetare_id from skotar_lass where id = '10000000-0000-0000-0000-000000000004') = '00000000-0000-0000-0000-00000000000a');
  perform chk('struket lass rörs inte (förare)', (select medarbetare_id from skotar_lass where id = '10000000-0000-0000-0000-000000000005') = '00000000-0000-0000-0000-00000000000d');
  perform chk('struket lass rörs inte (källa)', (select forare_kalla from skotar_lass where id = '10000000-0000-0000-0000-000000000005') is null);
  perform chk('utan fil: schemats förare', (select forare_kalla from skotar_lass where id = '10000000-0000-0000-0000-000000000006') = 'schema');
  perform chk('Edestad-räkning: Daniel 2 (1, 6), Martin 2 (2, 4), exkl. struket',
    (select count(*) from skotar_lass where status <> 'struket' and medarbetare_id = '00000000-0000-0000-0000-00000000000d') = 2
    and (select count(*) from skotar_lass where status <> 'struket' and medarbetare_id = '00000000-0000-0000-0000-00000000000a') = 2);
end $$;

-- LASS INNAN FILEN: schemats förare; sedan kommer Opti-filen (Martins pass) och lasset rättas av sig självt.
insert into skotar_lass (id, maskin_id, medarbetare_id, datum, status, bekraftad_av, bekraftad_tid, skapad) values
  ('10000000-0000-0000-0000-000000000007', 'A130743', '00000000-0000-0000-0000-00000000000d', '2026-11-19', 'bekraftat', 'forare', '2026-11-19 16:05:52+00', '2026-11-19 16:05:40+00');
do $$ begin
  perform chk('innan filen: schemats förare', (select medarbetare_id from skotar_lass where id = '10000000-0000-0000-0000-000000000007') = '00000000-0000-0000-0000-00000000000d'
    and (select forare_kalla from skotar_lass where id = '10000000-0000-0000-0000-000000000007') = 'schema');
end $$;
insert into fakt_skift (maskin_id, operator_id, datum, inloggning_tid, utloggning_tid) values
  ('A130743', 'A130743_2', '2026-11-19', '2026-11-19 15:21:10+00', '2026-11-19 21:37:59+00');
do $$ begin
  perform chk('filen kom: lasset rättas av sig självt', (select medarbetare_id from skotar_lass where id = '10000000-0000-0000-0000-000000000007') = '00000000-0000-0000-0000-00000000000a'
    and (select forare_kalla from skotar_lass where id = '10000000-0000-0000-0000-000000000007') = 'opti');
end $$;

-- 810E: ingen Opti-fil alls → schemats förare (Oscar), också när någon annan var inloggad i appen.
insert into skotar_lass (id, maskin_id, medarbetare_id, datum, status, bekraftad_av, bekraftad_tid, skapad) values
  ('10000000-0000-0000-0000-000000000008', 'JD810E', '00000000-0000-0000-0000-0000000000a1', '2026-11-19', 'bekraftat', 'forare', '2026-11-19 10:00:00+00', '2026-11-19 09:59:00+00');
do $$ begin
  perform chk('810E: schemats förare', (select medarbetare_id from skotar_lass where id = '10000000-0000-0000-0000-000000000008') = '00000000-0000-0000-0000-0000000000a2'
    and (select forare_kalla from skotar_lass where id = '10000000-0000-0000-0000-000000000008') = 'schema');
end $$;

-- OKOPPLAD OPTI-PROFIL: passet finns men profilen hör till ingen medarbetare → schemats förare (Max); kopplas den → rättas lasset.
insert into fakt_skift (maskin_id, operator_id, datum, inloggning_tid, utloggning_tid) values
  ('A030353', 'A030353_9', '2026-11-20', '2026-11-20 06:00:00+00', '2026-11-20 10:00:00+00');
insert into skotar_lass (id, maskin_id, medarbetare_id, datum, status, bekraftad_av, bekraftad_tid, skapad) values
  ('10000000-0000-0000-0000-000000000009', 'A030353', '00000000-0000-0000-0000-00000000000a', '2026-11-20', 'bekraftat', 'forare', '2026-11-20 08:00:00+00', '2026-11-20 07:59:00+00');
do $$ begin
  perform chk('okopplad profil: schemats förare, inte den inloggade', (select medarbetare_id from skotar_lass where id = '10000000-0000-0000-0000-000000000009') = '00000000-0000-0000-0000-0000000000a1'
    and (select forare_kalla from skotar_lass where id = '10000000-0000-0000-0000-000000000009') = 'schema');
end $$;
insert into operator_medarbetare values ('A030353_9', '00000000-0000-0000-0000-0000000000a3');
do $$ begin
  perform chk('profilen kopplas: lasset rättas i efterhand', (select medarbetare_id from skotar_lass where id = '10000000-0000-0000-0000-000000000009') = '00000000-0000-0000-0000-0000000000a3'
    and (select forare_kalla from skotar_lass where id = '10000000-0000-0000-0000-000000000009') = 'opti');
end $$;

-- SCHEMATS FÖRARE ÄR LEDIG heldag och ingen Opti-fil: ingen gissning — det appen skrev gäller.
insert into ledighet_ansokningar (medarbetare_id, status, startdatum, slutdatum) values ('00000000-0000-0000-0000-0000000000a1', 'godkänd', '2026-11-23', '2026-11-23');
insert into skotar_lass (id, maskin_id, medarbetare_id, datum, status, bekraftad_av, bekraftad_tid, skapad) values
  ('10000000-0000-0000-0000-00000000000a', 'A030353', '00000000-0000-0000-0000-00000000000a', '2026-11-23', 'bekraftat', 'forare', '2026-11-23 08:00:00+00', '2026-11-23 07:59:00+00');
do $$ begin
  perform chk('schemats förare ledig: den inloggade behålls', (select medarbetare_id from skotar_lass where id = '10000000-0000-0000-0000-00000000000a') = '00000000-0000-0000-0000-00000000000a'
    and (select forare_kalla from skotar_lass where id = '10000000-0000-0000-0000-00000000000a') = 'inloggad');
end $$;

-- ETT LASS SOM SKICKAS OM av klienten (ON CONFLICT … DO UPDATE utan medarbetare_id) behåller den rättade föraren.
insert into skotar_lass (id, maskin_id, medarbetare_id, datum, status, bekraftad_av, bekraftad_tid, skapad)
  values ('10000000-0000-0000-0000-000000000002', 'A130743', '00000000-0000-0000-0000-00000000000d', '2026-11-18', 'bekraftat', 'forare', '2026-11-18 15:54:37+00', '2026-11-18 15:54:33+00')
  on conflict (id) do update set status = excluded.status, andrad = now();
do $$ begin
  perform chk('omskickat lass: rättad förare kvar, original kvar', (select medarbetare_id from skotar_lass where id = '10000000-0000-0000-0000-000000000002') = '00000000-0000-0000-0000-00000000000a'
    and (select registrerad_av from skotar_lass where id = '10000000-0000-0000-0000-000000000002') = '00000000-0000-0000-0000-00000000000d');
end $$;

-- ÖVERLAPPANDE PASS (ett långt pass som ännu inte kapats och ett nytt): det senast påbörjade passet gäller.
insert into fakt_skift (maskin_id, operator_id, datum, inloggning_tid, utloggning_tid) values
  ('A130743', 'A130743_1', '2026-11-21', '2026-11-21 06:00:00+00', '2026-11-21 23:00:00+00'),
  ('A130743', 'A130743_2', '2026-11-21', '2026-11-21 15:00:00+00', '2026-11-21 22:00:00+00');
insert into skotar_lass (id, maskin_id, medarbetare_id, datum, status, bekraftad_av, bekraftad_tid, skapad) values
  ('10000000-0000-0000-0000-00000000000b', 'A130743', '00000000-0000-0000-0000-00000000000d', '2026-11-21', 'bekraftat', 'forare', '2026-11-21 16:00:00+00', '2026-11-21 15:59:00+00');
do $$ begin
  perform chk('överlappande pass: det senast påbörjade gäller', (select medarbetare_id from skotar_lass where id = '10000000-0000-0000-0000-00000000000b') = '00000000-0000-0000-0000-00000000000a');
end $$;

-- KVITTENSER: Daniel är inloggad men Martin kör (Martins pass täcker nu() — passet läggs in EFTER kvittensen = filen kom efteråt).
insert into korvy_kvittens_forare (objekt_id, marker_id, forare_id, innehall_hash) values ('20000000-0000-0000-0000-000000000001', 'm1', '00000000-0000-0000-0000-00000000000d', 'h');
insert into kommentar_sett_forare (objekt_id, forare_id, kommentar_ref, innehall_hash) values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000d', 'k1', 'h');
insert into korvy_kvittens_forare (objekt_id, marker_id, forare_id, innehall_hash) values ('20000000-0000-0000-0000-000000000001', 'm2', '00000000-0000-0000-0000-00000000000a', 'h');
create temp table t0 as select kvitterad_at from korvy_kvittens_forare where marker_id = 'm1';
create temp table t0s as select sett_at from kommentar_sett_forare where kommentar_ref = 'k1';
do $$ begin
  perform chk('kvittens innan filen: utford = skribenten', (select utford_av from korvy_kvittens_forare where marker_id = 'm1') = '00000000-0000-0000-0000-00000000000d'
    and (select utford_kalla from korvy_kvittens_forare where marker_id = 'm1') = 'inloggad');
end $$;
select pg_sleep(0.1);
insert into fakt_skift (maskin_id, operator_id, datum, inloggning_tid, utloggning_tid) values
  ('A130743', 'A130743_2', current_date, now() - interval '1 hour', now() + interval '1 hour');
do $$ begin
  perform chk('Sett (marker): utford_av blir Martin efter filen', (select utford_av from korvy_kvittens_forare where marker_id = 'm1') = '00000000-0000-0000-0000-00000000000a'
    and (select utford_kalla from korvy_kvittens_forare where marker_id = 'm1') = 'opti');
  perform chk('Sett (kommentar): utford_av blir Martin', (select utford_av from kommentar_sett_forare where kommentar_ref = 'k1') = '00000000-0000-0000-0000-00000000000a');
  perform chk('forare_id rörs ALDRIG (enhetens nyckel)', (select forare_id from korvy_kvittens_forare where marker_id = 'm1') = '00000000-0000-0000-0000-00000000000d'
    and (select forare_id from kommentar_sett_forare where kommentar_ref = 'k1') = '00000000-0000-0000-0000-00000000000d');
  perform chk('omräkningen rör inte beviset på NÄR (marker)', (select kvitterad_at from korvy_kvittens_forare where marker_id = 'm1') = (select kvitterad_at from t0));
  perform chk('omräkningen rör inte beviset på NÄR (kommentar)', (select sett_at from kommentar_sett_forare where kommentar_ref = 'k1') = (select sett_at from t0s));
  perform chk('en admin utan maskin rörs inte', (select utford_av from korvy_kvittens_forare where marker_id = 'm2') = '00000000-0000-0000-0000-00000000000a'
    and (select utford_kalla from korvy_kvittens_forare where marker_id = 'm2') = 'inloggad');
end $$;
-- En vanlig upsert från enheten (flaggan är AV) sätter fortfarande ny tid.
select pg_sleep(0.1);
insert into korvy_kvittens_forare (objekt_id, marker_id, forare_id, innehall_hash) values ('20000000-0000-0000-0000-000000000001', 'm1', '00000000-0000-0000-0000-00000000000d', 'h2')
  on conflict (objekt_id, marker_id, forare_id) do update set innehall_hash = excluded.innehall_hash;
do $$ begin
  perform chk('vanlig upsert ger ny tid (flaggan läcker inte)', (select kvitterad_at from korvy_kvittens_forare where marker_id = 'm1') > (select kvitterad_at from t0));
  perform chk('vanlig upsert: Opti-föraren gäller fortfarande', (select utford_av from korvy_kvittens_forare where marker_id = 'm1') = '00000000-0000-0000-0000-00000000000a');
end $$;

-- BESÖK ("Uppfattat"): servern skriver, forare_id rättas, originalet i registrerad_av; testläget rörs inte.
insert into objekt_besok_kvittens (besok_id, maskin_id, roll, forare_id, testlage) values
  ('30000000-0000-0000-0000-000000000001', 'A130743', 'skotare', '00000000-0000-0000-0000-00000000000d', false),
  ('30000000-0000-0000-0000-000000000002', 'A130743', 'skotare', '00000000-0000-0000-0000-00000000000d', true);
do $$ begin
  perform chk('besök → Opti-föraren', (select forare_id from objekt_besok_kvittens where besok_id = '30000000-0000-0000-0000-000000000001') = '00000000-0000-0000-0000-00000000000a'
    and (select registrerad_av from objekt_besok_kvittens where besok_id = '30000000-0000-0000-0000-000000000001') = '00000000-0000-0000-0000-00000000000d');
  perform chk('besök i testläge rörs inte', (select forare_id from objekt_besok_kvittens where besok_id = '30000000-0000-0000-0000-000000000002') = '00000000-0000-0000-0000-00000000000d');
end $$;

-- HISTORIKEN (del 5) är idempotent: en omkörning ändrar ingenting.
create temp table fore as select md5(string_agg(x::text, '|' order by id)) h from (select id, medarbetare_id, forare_kalla, registrerad_av from skotar_lass) x;
do $$ begin
  perform set_config('app.forare_omrakning', 'on', true);
  update skotar_lass set forare_kalla = forare_kalla where status <> 'struket';
  update korvy_kvittens_forare set utford_kalla = utford_kalla;
  update kommentar_sett_forare set utford_kalla = utford_kalla;
  update objekt_besok_kvittens set forare_kalla = forare_kalla where not coalesce(testlage, false);
  perform set_config('app.forare_omrakning', 'off', true);
  perform chk('historiken är idempotent', (select md5(string_agg(x::text, '|' order by id)) from (select id, medarbetare_id, forare_kalla, registrerad_av from skotar_lass) x) = (select h from fore));
end $$;

select 'ALLA KONTROLLER OK';
