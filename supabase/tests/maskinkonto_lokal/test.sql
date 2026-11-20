-- Prov för "Maskinen som maskin". Körs som superanvändare; varje kontroll byter till rollen authenticated med rätt JWT (sub) — samma
-- väg som PostgREST. Skriver tabellen "tabell | läsa | skriva | förväntat | ok" och slutar med ALLA KONTROLLER OK.
-- Ett fel = RAISE EXCEPTION (psql avbryter, kor.sh ser ERROR).
\set ON_ERROR_STOP on

create temp table matris (tabell text, lasa text, skriva text, forvantat text, ok boolean);
grant all on matris to public;
create function pg_temp.kolla(namn text, villkor boolean) returns void language plpgsql as $$
begin
  if villkor is distinct from true then raise exception 'FEL: %', namn; end if;
  raise notice 'OK: %', namn;
end $$;

-- personer
insert into medarbetare (id, namn, roll, maskin_id, aktiv, user_id, epost, timlon_kr) values
  ('00000000-0000-0000-0000-0000000000a1', 'Martin', 'admin', null, true, '10000000-0000-0000-0000-0000000000a1', 'a@x', 300),
  ('00000000-0000-0000-0000-0000000000f1', 'Oskar', 'forare', 'R64428', true, '10000000-0000-0000-0000-0000000000f1', 'f@x', 200),
  ('00000000-0000-0000-0000-0000000000e1', 'Daniel', 'forare', 'A130743', true, '10000000-0000-0000-0000-0000000000e1', 'e@x', 200);
-- maskinkontot skapas av servern (service_role) — som i appen: roll maskin, aktiv = false
insert into medarbetare (id, namn, roll, maskin_id, aktiv, user_id, epost) values
  ('00000000-0000-0000-0000-0000000000b1', 'H8', 'maskin', 'R64428', false, '10000000-0000-0000-0000-0000000000b1', 'h8@x');
insert into operator_medarbetare values ('op1', '00000000-0000-0000-0000-0000000000f1');
insert into fakt_skift (maskin_id, operator_id, datum, inloggning_tid, utloggning_tid, tid_ar_utc)
  values ('R64428', 'op1', current_date, now() - interval '3 hours', now() + interval '3 hours', true);
insert into objekt (id, namn) values ('20000000-0000-0000-0000-000000000001', 'Trakt');
insert into dim_objekt values ('1', 'x'); insert into fakt_produktion (maskin_id, volym) values ('R64428', 5); insert into fakt_tid (maskin_id, processing_sek) values ('R64428', 60);
insert into maskin_ko (maskin_id) values ('R64428'); insert into planering_markeringar (objekt_id) values ('20000000-0000-0000-0000-000000000001');


do $$
declare
  M constant text := '10000000-0000-0000-0000-0000000000b1';
  F constant text := '10000000-0000-0000-0000-0000000000f1';
  A constant text := '10000000-0000-0000-0000-0000000000a1';
  t text; n int; rad record;
  res jsonb := '[]'::jsonb;
  las_m int; las_f int; ins_ok boolean; upd_n int; del_n int; skriv_text text; las_text text; ok boolean;
begin
  -- ar_maskinkonto
  perform set_config('request.jwt.claim.sub', M, true); execute 'set local role authenticated';
  if not public.ar_maskinkonto() then raise exception 'FEL: ar_maskinkonto borde vara sant för maskinkontot'; end if;
  perform set_config('request.jwt.claim.sub', F, true);
  if public.ar_maskinkonto() then raise exception 'FEL: ar_maskinkonto sant för förare'; end if;
  perform set_config('request.jwt.claim.sub', A, true);
  if public.ar_maskinkonto() then raise exception 'FEL: ar_maskinkonto sant för admin'; end if;
  execute 'reset role';
  raise notice 'OK: ar_maskinkonto sant bara för maskinkontot';

  -- matrisen
  for t in select tabell from sparrade order by tabell loop
    -- maskinkonto
    perform set_config('request.jwt.claim.sub', M, true); execute 'set local role authenticated';
    execute format('select count(*) from %I', t) into las_m;
    begin execute format('insert into %I (medarbetare_id, data) values (%L, %L)', t, '00000000-0000-0000-0000-0000000000b1', 'maskin'); ins_ok := true;
    exception when others then ins_ok := false; end;
    begin execute format('update %I set data = %L', t, 'andrad'); get diagnostics upd_n = row_count; exception when others then upd_n := 0; end;
    begin execute format('delete from %I', t); get diagnostics del_n = row_count; exception when others then del_n := 0; end;
    execute 'reset role';
    -- förare: spärren ska inte beröra
    perform set_config('request.jwt.claim.sub', F, true); execute 'set local role authenticated';
    execute format('select count(*) from %I', t) into las_f;
    execute 'reset role';
    las_text := case when las_m = 0 then 'nekad (0 av 1 rader)' else 'SER ' || las_m || ' rader' end;
    skriv_text := case when not ins_ok and upd_n = 0 and del_n = 0 then 'nekad (insert/update/delete)' else 'FÅR SKRIVA' end;
    ok := las_m = 0 and not ins_ok and upd_n = 0 and del_n = 0 and las_f = 1;
    res := res || jsonb_build_object('t', t, 'l', las_text, 's', skriv_text, 'o', ok);
    insert into pg_temp.matris values (t, las_text, skriv_text, 'nekad / nekad', ok);
  end loop;
end $$;

-- medarbetare: läsa sin egen rad, aldrig ändra/lägga till/ta bort
do $$
declare n int; upd int;
begin
  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-0000000000b1', true); execute 'set local role authenticated';
  select count(*) into n from medarbetare;
  if n <> 1 then raise exception 'FEL: maskinkontot ska se exakt sin egen medarbetarrad (ser %)', n; end if;
  update medarbetare set roll = 'admin' where user_id = auth.uid(); get diagnostics upd = row_count;
  if upd <> 0 then raise exception 'FEL: maskinkontot kunde ändra sin egen roll'; end if;
  update medarbetare set timlon_kr = 999; get diagnostics upd = row_count;
  if upd <> 0 then raise exception 'FEL: maskinkontot kunde ändra lön'; end if;
  begin insert into medarbetare (id, namn, roll) values (gen_random_uuid(), 'Ny', 'admin'); raise exception 'FEL: maskinkontot kunde lägga till medarbetare';
  exception when insufficient_privilege or others then if sqlerrm like 'FEL:%' then raise; end if; end;
  delete from medarbetare; get diagnostics upd = row_count;
  if upd <> 0 then raise exception 'FEL: maskinkontot kunde ta bort medarbetare'; end if;
  execute 'reset role';
  insert into pg_temp.matris values ('medarbetare (alla andras rader + egen roll/lön)', 'bara egen rad (1 av 4)', 'nekad (insert/update/delete)', 'egen rad / nekad', true);
  -- förare och admin oförändrat
  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-0000000000f1', true); execute 'set local role authenticated';
  update medarbetare set telefon = '070' where user_id = auth.uid(); get diagnostics upd = row_count;
  if upd <> 1 then raise exception 'FEL: förare kan inte ändra sin egen rad längre'; end if;
  select count(*) into n from medarbetare; if n <> 1 then raise exception 'FEL: förare ser fler än sin egen rad'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-0000000000a1', true); execute 'set local role authenticated';
  select count(*) into n from medarbetare; if n <> 4 then raise exception 'FEL: admin ser inte alla medarbetare (%)', n; end if;
  update medarbetare set timlon_kr = 310 where namn = 'Oskar'; get diagnostics upd = row_count;
  if upd <> 1 then raise exception 'FEL: admin kan inte ändra medarbetare'; end if;
  execute 'reset role';
  raise notice 'OK: medarbetare — maskinkonto bara läsa egen rad; förare och admin som förut';
end $$;

-- maskin_konto och kodtabellerna
do $$
declare n int;
begin
  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-0000000000b1', true); execute 'set local role authenticated';
  select count(*) into n from maskin_konto; if n <> 0 then raise exception 'FEL: maskinkontot läser maskin_konto'; end if;
  if (select public.maskin_konto_lage()) is distinct from '{"maskin_id":"R64428","aktiv":true}'::jsonb then raise exception 'FEL: maskin_konto_lage fel för maskinkontot: %', public.maskin_konto_lage(); end if;
  begin perform count(*) from forare_maskinkod; raise exception 'FEL: maskinkontot läser forare_maskinkod'; exception when insufficient_privilege then null; end;
  begin perform count(*) from maskin_kod_las; raise exception 'FEL: maskinkontot läser maskin_kod_las'; exception when insufficient_privilege then null; end;
  begin perform maskin_kod_forsok('00000000-0000-0000-0000-0000000000f1'); raise exception 'FEL: maskinkontot kör maskin_kod_forsok'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-0000000000f1', true); execute 'set local role authenticated';
  if public.maskin_konto_lage() is not null then raise exception 'FEL: förare får maskin_konto_lage'; end if;
  begin perform count(*) from forare_maskinkod; raise exception 'FEL: förare läser forare_maskinkod'; exception when insufficient_privilege then null; end;
  select count(*) into n from maskin_konto; if n <> 0 then raise exception 'FEL: förare läser maskin_konto'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-0000000000a1', true); execute 'set local role authenticated';
  begin perform count(*) from forare_maskinkod; raise exception 'FEL: admin läser forare_maskinkod direkt'; exception when insufficient_privilege then null; end;
  select count(*) into n from maskin_konto; if n <> 1 then raise exception 'FEL: admin ser inte maskin_konto'; end if;
  update maskin_konto set aktiv = false where maskin_id = 'R64428'; update maskin_konto set aktiv = true where maskin_id = 'R64428';
  execute 'reset role';
  insert into pg_temp.matris values ('maskin_konto', 'nekad för maskin och förare, admin ser', 'bara admin', 'nekad', true),
    ('forare_maskinkod / maskin_kod_las / maskin_upplasning_logg', 'ingen läsrätt (permission denied)', 'ingen skrivrätt', 'nekad', true);
  raise notice 'OK: maskin_konto och kodtabellerna går inte att nå från webbläsaren';
end $$;

-- felräknaren: fem fel i rad → en minut, tio fel i rad → en timme (+ notis), rätt kod nollar allt
do $$
declare r record; f record; i int; id uuid := '00000000-0000-0000-0000-0000000000f1'; sek numeric;
begin
  for i in 1..4 loop
    select * into r from maskin_kod_forsok(id); if not r.tillat then raise exception 'FEL: försök % blockerades', i; end if;
    select * into f from maskin_kod_fel(id); if f.vantar_till is not null then raise exception 'FEL: väntan satt för tidigt (försök %)', i; end if;
  end loop;
  perform maskin_kod_ratt(id);   -- rätt kod efter fyra fel nollar
  for i in 1..5 loop
    select * into r from maskin_kod_forsok(id); if not r.tillat then raise exception 'FEL: nollad räknare — försök % blockerades', i; end if;
    select * into f from maskin_kod_fel(id);
  end loop;
  if f.vantar_till is null or f.timme then raise exception 'FEL: det femte felet ska ge en MINUT, inte timme (%)', f; end if;
  sek := extract(epoch from (f.vantar_till - now()));
  if sek < 50 or sek > 61 then raise exception 'FEL: femte felet gav % s väntan (väntade ~60)', sek; end if;
  select * into r from maskin_kod_forsok(id);
  if r.tillat or r.vantar_till is null then raise exception 'FEL: sjätte försöket under väntan släpptes igenom'; end if;
  -- minuten över: de fem börjar om, men de tio i rad ligger kvar
  update maskin_kod_las set last_until = now() - interval '1 second' where medarbetare_id = id;
  for i in 6..10 loop
    select * into r from maskin_kod_forsok(id); if not r.tillat then raise exception 'FEL: försök % (efter minuten) blockerades', i; end if;
    select * into f from maskin_kod_fel(id);
  end loop;
  if not f.timme then raise exception 'FEL: det tionde felet i rad ska ge en TIMME (timme-flaggan saknas)'; end if;
  sek := extract(epoch from (f.vantar_till - now()));
  if sek < 3590 or sek > 3601 then raise exception 'FEL: tionde felet gav % s väntan (väntade ~3600)', sek; end if;
  select * into r from maskin_kod_forsok(id);
  if r.tillat then raise exception 'FEL: försök under timmen släpptes igenom'; end if;
  -- timmen över: räknaren börjar om från noll (fel_rad nollades när timmen sattes)
  update maskin_kod_las set last_until = now() - interval '1 second' where medarbetare_id = id;
  select * into r from maskin_kod_forsok(id); if not r.tillat then raise exception 'FEL: timmen släppte aldrig'; end if;
  if (select fel_rad from maskin_kod_las where medarbetare_id = id) <> 1 then raise exception 'FEL: tio-i-rad började inte om efter timmen'; end if;
  -- nio fel + rätt kod nollar tio-i-rad
  perform maskin_kod_ratt(id);
  for i in 1..9 loop
    select * into r from maskin_kod_forsok(id);
    if not r.tillat then update maskin_kod_las set last_until = now() - interval '1 second' where medarbetare_id = id; select * into r from maskin_kod_forsok(id); end if;
    perform maskin_kod_fel(id);
  end loop;
  perform maskin_kod_ratt(id);
  if (select fel_rad + fel from maskin_kod_las where medarbetare_id = id) <> 0 then raise exception 'FEL: rätt kod nollade inte räknarna'; end if;
  insert into pg_temp.matris values ('kod: fem fel i rad / tio fel i rad', '5 → en minut · 10 → en timme (+ notis)', '-', 'väntan', true);
  raise notice 'OK: fem fel → en minut, tio fel i rad → en timme, räknarna nollas av rätt kod';
end $$;

-- skrivningar: maskinen sätts av databasen
do $$
declare
  M constant text := '10000000-0000-0000-0000-0000000000b1';
  F constant text := '10000000-0000-0000-0000-0000000000f1';
  mid constant uuid := '00000000-0000-0000-0000-0000000000b1';
  fid constant uuid := '00000000-0000-0000-0000-0000000000f1';
  o constant uuid := '20000000-0000-0000-0000-000000000001';
  x text; k record; s record; n int;
begin
  perform set_config('request.jwt.claim.sub', M, true); execute 'set local role authenticated';
  -- hyttspår: klienten säger Elefanten, databasen säger H8
  insert into hyttspar (objekt_id, maskin_id, roll) values (o, 'A130743', 'rm');
  select maskin_id into x from hyttspar where roll = 'rm';
  if x <> 'R64428' then raise exception 'FEL: hyttspår fick maskin % (väntade R64428)', x; end if;
  -- lass
  insert into skotar_lass (id, maskin_id, medarbetare_id, datum, status, bekraftad_av, bekraftad_tid) values (gen_random_uuid(), 'A130743', mid, current_date, 'bekraftat', 'forare', now());
  select * into s from skotar_lass order by skapad desc limit 1;
  if s.maskin_id <> 'R64428' then raise exception 'FEL: lasset fick maskin %', s.maskin_id; end if;
  if s.medarbetare_id <> fid then raise exception 'FEL: lasset fick inte föraren (Oskar via Opti/schema) utan %', s.medarbetare_id; end if;
  if s.registrerad_av <> mid then raise exception 'FEL: registrerad_av ska vara maskinkontot'; end if;
  -- kvittens (Opti-passet finns för Oskar)
  insert into korvy_kvittens_forare (objekt_id, marker_id, forare_id, innehall_hash) values (o, 'm1', mid, 'h');
  select * into k from korvy_kvittens_forare where marker_id = 'm1';
  if k.maskin_id is distinct from 'R64428' then raise exception 'FEL: kvittensen fick ingen maskin (%)', k.maskin_id; end if;
  if k.utford_av is distinct from fid or k.utford_kalla <> 'opti' then raise exception 'FEL: kvittensen fick inte Opti-föraren (% %)', k.utford_av, k.utford_kalla; end if;
  insert into kommentar_sett_forare (objekt_id, forare_id, kommentar_ref, innehall_hash) values (o, mid, 'k1', 'h');
  select * into k from kommentar_sett_forare where kommentar_ref = 'k1';
  if k.maskin_id is distinct from 'R64428' or k.utford_av is distinct from fid then raise exception 'FEL: sett fick inte maskin/förare'; end if;
  -- planering, karta, uppföljning fungerar som förut
  insert into planering_markeringar (objekt_id, data) values (o, '{}');
  select count(*) into n from objekt; if n <> 1 then raise exception 'FEL: maskinkontot ser inte objekt'; end if;
  select count(*) into n from dim_objekt; if n <> 1 then raise exception 'FEL: maskinkontot ser inte dim_objekt'; end if;
  select count(*) into n from fakt_produktion; if n <> 1 then raise exception 'FEL: maskinkontot ser inte produktion'; end if;
  select count(*) into n from fakt_tid; if n <> 1 then raise exception 'FEL: maskinkontot ser inte fakt_tid'; end if;
  select count(*) into n from maskin_ko; if n <> 1 then raise exception 'FEL: maskinkontot ser inte maskin_ko'; end if;
  execute 'reset role';
  insert into pg_temp.matris values ('hyttspar / skotar_lass / kvittenser (SKRIVA)', 'fungerar', 'fungerar, maskin satt av databasen', 'fungerar', true),
    ('objekt / planering / karta / uppföljning per maskin', 'fungerar', 'fungerar', 'fungerar', true);
  raise notice 'OK: maskinkontot skriver lass, spår och kvittenser med maskinen satt av databasen; planering och uppföljning fungerar';

  -- förare i telefon: maskin_id lämnas som skrevs, inget Opti-byte av roll
  perform set_config('request.jwt.claim.sub', F, true); execute 'set local role authenticated';
  insert into hyttspar (objekt_id, maskin_id, roll) values (o, 'A130743', 'rf');
  select maskin_id into x from hyttspar where roll = 'rf';
  if x <> 'A130743' then raise exception 'FEL: förarens hyttspår fick maskin % (ska vara orört)', x; end if;
  insert into korvy_kvittens_forare (objekt_id, marker_id, forare_id, innehall_hash) values (o, 'm2', fid, 'h');
  select * into k from korvy_kvittens_forare where marker_id = 'm2';
  if k.maskin_id is not null then raise exception 'FEL: förarens kvittens fick maskin %', k.maskin_id; end if;
  execute 'reset role';
  raise notice 'OK: förare i telefon — maskin_id orört';
end $$;

-- lagrade filer
do $$ declare n int; begin
  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-0000000000b1', true); execute 'set local role authenticated';
  select count(*) into n from storage.objects where bucket_id in ('avtal', 'utbildningsbevis'); if n <> 0 then raise exception 'FEL: maskinkontot ser avtal/utbildningsbevis (%)', n; end if;
  select count(*) into n from storage.objects where bucket_id = 'audio'; if n <> 1 then raise exception 'FEL: maskinkontot ser inte ljudbucketen'; end if;
  begin insert into storage.objects (bucket_id, name) values ('avtal', 'x.pdf'); raise exception 'FEL: maskinkontot skrev i avtal'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-0000000000f1', true); execute 'set local role authenticated';
  select count(*) into n from storage.objects; if n <> 3 then raise exception 'FEL: förare ser inte alla filer (%)', n; end if;
  execute 'reset role';
  insert into pg_temp.matris values ('storage: bucket avtal + utbildningsbevis', 'nekad (0 av 2 filer)', 'nekad', 'nekad / nekad', true);
  raise notice 'OK: lagrade filer';
end $$;

-- del 4: kalenderns Semester/Ledig går via maskin_ledighet — tabellen är spärrad, funktionen lämnar bara ut 'semester'/'ledig' per maskin
do $$ declare n int; r record; l uuid := '10000000-0000-0000-0000-0000000004a1';
begin
  insert into medarbetare (id, namn, roll, maskin_id, aktiv) values (l, 'Ledig Förare', 'forare', 'R64428', true) on conflict do nothing;
  insert into ledighet_ansokningar (medarbetare_id, status, fran_tid, till_tid, startdatum, slutdatum, typ)
    values (l, 'godkänd', null, null, '2026-11-10', '2026-11-12', 'sjuk'), (l, 'godkänd', null, null, '2026-11-20', '2026-11-21', 'semester'),
           (l, 'väntar', null, null, '2026-11-25', '2026-11-26', 'semester');
  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-0000000000b1', true); execute 'set local role authenticated';
  select count(*) into n from ledighet_ansokningar where medarbetare_id = l;
  if n <> 0 then raise exception 'FEL: maskinkontot läser ledighet direkt (%)', n; end if;
  select count(*) into n from maskin_ledighet(array['R64428'], '2026-11-01', '2026-11-30');
  if n <> 2 then raise exception 'FEL: maskin_ledighet gav % rader (ska vara 2: ej väntande)', n; end if;
  for r in select * from maskin_ledighet(array['R64428'], '2026-11-01', '2026-11-30') loop
    if r.typ not in ('semester', 'ledig') then raise exception 'FEL: maskin_ledighet läcker typen %', r.typ; end if;
  end loop;
  if (select count(*) from maskin_ledighet(array['R64428'], '2026-11-01', '2026-11-30') where typ = 'ledig') <> 1 then raise exception 'FEL: sjuk ska bli ledig'; end if;
  if exists (select 1 from maskin_ledighet(array['A130743'], '2026-11-01', '2026-11-30')) then raise exception 'FEL: fel maskin'; end if;
  execute 'reset role';
  insert into pg_temp.matris values ('ledighet via maskin_ledighet (kalendern)', 'bara semester/ledig per maskin', 'nekad', 'bara semester/ledig', true);
  raise notice 'OK: maskin_ledighet — maskinkontot får bara semester/ledig per maskin, aldrig typen eller personen';
end $$;

-- migrationen ger EXAKT listan: en policy per spärrad tabell, ingen extra
do $$
declare n_pol int; n_lista int;
begin
  select count(*) into n_pol from pg_policies where schemaname = 'public' and policyname = 'maskinkonto_nekar';
  select count(*) into n_lista from sparrade;
  if n_pol <> n_lista then raise exception 'FEL: % spärrade tabeller men % policyer', n_lista, n_pol; end if;
  raise notice 'OK: % tabeller spärrade, exakt listan', n_pol;
end $$;

-- tabellen
select '--- ' || 'tabell | läsa | skriva | förväntat | ok';
select tabell || ' | ' || lasa || ' | ' || skriva || ' | ' || forvantat || ' | ' || case when ok then 'ok' else 'FEL' end from matris order by (ok), tabell;
do $$ begin
  if exists (select 1 from matris where not ok) then raise exception 'FEL: matrisen har rader som inte är ok'; end if;
end $$;
select 'ALLA KONTROLLER OK';
