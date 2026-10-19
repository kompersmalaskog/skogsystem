-- SQL-test: lastbilens lass → flytt (migration 20261019150000_lastbil_lass_automatiska_flyttar.sql ska vara körd).
--
-- Körs i EN transaktion som alltid rullas tillbaka (lokalt: psql -1 -f denna fil): lassen, flytterna, fakturaunderlagen, positionerna och GPS-punkterna som
-- skapas försvinner. Klistra in hela filen i Supabase SQL-editorn (eller via MCP execute_sql) EFTER migrationen. Resultatet kommer
-- som ett fel på sista raden: "TEST OK: N kontroller" eller "TEST FEL: <de som föll>" — det är avsikten, det är så den rullas tillbaka.
--
-- Maskinerna Giant (PONS20SDJAA270231) och Elefant 26 (A130743) måste finnas i dim_maskin. Inget annat i databasen rörs.
--
-- Fall (varje rad i `kontroll` är ett):
--   skapa_flytt_ur_lass  Hög Giant 32 km + kund → flytt, ogodkänt underlag, ny position, lass auto_flytt · samma anrop igen = ingen dubblett
--                        · 17 km → inget underlag, ingen kund · fakturerbar utan kund → avvisas och ingenting skapas
--                        · maskin som inte är vår → kunduppdrag, kund krävs · både/ingen maskin → avvisas
--   besvara_lass         admin: svarar, andra svaret får "redan" + vem · icke-admin: nekas
--   fyll_flytt_ur_lass   tom flytt får odometer + Från · förarens värden skrivs aldrig över · låst flytt: lasset kopplas, inget fylls
--   avvisa_lass          status avvisad, ett andra anrop ändrar inget
--   lastbil_maskin_*     GPS-rader i båda tidskonventionerna (verkligt UTC och svensk väggklocka som UTC) hittas på samma sätt
--   behörigheter         authenticated når inte skapa/fyll/foljer/narvaro, men besvara/avvisa

CREATE TEMP TABLE kontroll (namn text, ok boolean);

-- ── Syntetiska lass (alla i oktober 2099 så inget riktigt kolliderar) ────────────────────────────────────
CREATE TEMP TABLE t_lass (kod text PRIMARY KEY, id uuid);
INSERT INTO t_lass (kod, id) SELECT k, gen_random_uuid() FROM unnest(ARRAY['hog32','kort17','utankund','extern','dubbel','svar','svar2','fyll','last','avvisa']) k;

INSERT INTO lastbil_lass (id, vin, forsta_lastad_tid, sista_lastad_tid, lassning_fran, lassning_tid, lassning_lat, lassning_lng, lassning_odometer_m,
                          lassning_plats_saker, lossning_tid, lossning_till, lossning_lat, lossning_lng, lossning_odometer_m, lossning_plats_saker,
                          km, fran_namn, till_namn, forslag_maskin_id, sakerhet, status, kund)
SELECT t.id, 'TESTVIN', '2099-10-01 06:00+00'::timestamptz + (row_number() OVER (ORDER BY t.kod)) * interval '3 hours',
       '2099-10-01 06:30+00'::timestamptz + (row_number() OVER (ORDER BY t.kod)) * interval '3 hours',
       '2099-10-01 05:50+00'::timestamptz + (row_number() OVER (ORDER BY t.kod)) * interval '3 hours',
       '2099-10-01 06:00+00'::timestamptz + (row_number() OVER (ORDER BY t.kod)) * interval '3 hours',
       56.40, 14.70, 1000000, true,
       '2099-10-01 06:30+00'::timestamptz + (row_number() OVER (ORDER BY t.kod)) * interval '3 hours',
       '2099-10-01 06:40+00'::timestamptz + (row_number() OVER (ORDER BY t.kod)) * interval '3 hours',
       56.20, 15.30, 1032400, true,
       CASE t.kod WHEN 'kort17' THEN 17.0 ELSE 32.4 END, 'Testfrån', 'Testtill', 'PONS20SDJAA270231', 'hog', 'vantar_maskin',
       CASE t.kod WHEN 'hog32' THEN 'Vida' ELSE NULL END
FROM t_lass t;

-- Cron/service-roll för skapa_flytt_ur_lass
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true), set_config('test.role', 'service_role', true);

DO $skapa$
DECLARE
  v_id uuid; v_ut jsonb; v_ut2 jsonb; v_flytt uuid; r maskin_flytt%rowtype; n int; v_fel text;
BEGIN
  -- Hög Giant 32,4 km med kund
  SELECT id INTO v_id FROM t_lass WHERE kod = 'hog32';
  v_ut := skapa_flytt_ur_lass(v_id, 'PONS20SDJAA270231', NULL, NULL, 'auto');
  v_flytt := (v_ut->>'flytt_id')::uuid;
  SELECT * INTO r FROM maskin_flytt WHERE id = v_flytt;
  INSERT INTO kontroll VALUES ('hog32: flytten skapas', (v_ut->>'skapad')::boolean AND v_flytt IS NOT NULL);
  INSERT INTO kontroll VALUES ('hog32: fakturerbar (32,4 km ≥ 30)', r.fakturerbar IS TRUE AND r.flytt_km = 32.4);
  INSERT INTO kontroll VALUES ('hog32: typ produktion, kund Vida', r.flytt_typ = 'produktion' AND r.kund = 'Vida');
  INSERT INTO kontroll VALUES ('hog32: odometer fylld i båda ändar', r.fran_odometer_m = 1000000 AND r.till_odometer_m = 1032400);
  INSERT INTO kontroll VALUES ('hog32: koordinatkälla lastbil, sluttid satt', r.koord_kalla = 'lastbil' AND r.sluttid IS NOT NULL AND r.hamtad_tid IS NOT NULL AND r.avbruten IS FALSE);
  INSERT INTO kontroll VALUES ('hog32: ingen förare påhittad', r.forare IS NULL AND r.medarbetare_id IS NULL);
  SELECT count(*) INTO n FROM fakturaunderlag_flytt WHERE flytt_id = v_flytt AND godkand_tid IS NULL AND km = 32.4 AND kund = 'Vida';
  INSERT INTO kontroll VALUES ('hog32: ogodkänt fakturaunderlag skapat av triggern', n = 1);
  SELECT count(*) INTO n FROM maskin_position WHERE maskin_id = 'PONS20SDJAA270231' AND lat = 56.20 AND lng = 15.30;
  INSERT INTO kontroll VALUES ('hog32: maskinens nya position skriven (bilen stod stilla)', n = 1);
  INSERT INTO kontroll VALUES ('hog32: lasset auto_flytt med flytt_id', (SELECT status = 'auto_flytt' AND flytt_id = v_flytt AND maskin_id = 'PONS20SDJAA270231' AND besvarad_av = 'auto' FROM lastbil_lass WHERE id = v_id));

  -- Idempotent: samma anrop igen skapar ingen andra flytt
  v_ut2 := skapa_flytt_ur_lass(v_id, 'PONS20SDJAA270231', NULL, NULL, 'auto');
  SELECT count(*) INTO n FROM maskin_flytt WHERE hamtad_tid = r.hamtad_tid AND koord_kalla = 'lastbil';
  INSERT INTO kontroll VALUES ('dubbelanrop: ingen dubblett, svarar finns_redan', n = 1 AND v_ut2->>'orsak' = 'finns_redan' AND (v_ut2->>'skapad')::boolean IS FALSE);

  -- 17 km: inte fakturerbar, ingen kund, inget underlag
  SELECT id INTO v_id FROM t_lass WHERE kod = 'kort17';
  v_ut := skapa_flytt_ur_lass(v_id, 'PONS20SDJAA270231', NULL, 'Vida', 'auto');
  SELECT * INTO r FROM maskin_flytt WHERE id = (v_ut->>'flytt_id')::uuid;
  INSERT INTO kontroll VALUES ('kort17: inte fakturerbar, kund avstängd', r.fakturerbar IS FALSE AND r.kund IS NULL);
  SELECT count(*) INTO n FROM fakturaunderlag_flytt WHERE flytt_id = r.id;
  INSERT INTO kontroll VALUES ('kort17: inget fakturaunderlag', n = 0);

  -- Fakturerbar utan kund: avvisas, ingenting skapas, lasset väntar kvar
  SELECT id INTO v_id FROM t_lass WHERE kod = 'utankund';
  SELECT count(*) INTO n FROM maskin_flytt WHERE koord_kalla = 'lastbil';
  BEGIN
    PERFORM skapa_flytt_ur_lass(v_id, 'PONS20SDJAA270231', NULL, NULL, 'auto');
    v_fel := NULL;
  EXCEPTION WHEN check_violation THEN v_fel := SQLERRM; END;
  INSERT INTO kontroll VALUES ('utan kund: "Välj kund" och ingen flytt', v_fel LIKE 'Välj kund%' AND (SELECT count(*) FROM maskin_flytt WHERE koord_kalla = 'lastbil') = n
    AND (SELECT status FROM lastbil_lass WHERE id = v_id) = 'vantar_maskin');
  -- ...och med kund i anropet går det
  v_ut := skapa_flytt_ur_lass(v_id, 'A130743', NULL, 'Vida Energi', 'Test');
  INSERT INTO kontroll VALUES ('utan kund: kunden i svaret räcker', (v_ut->>'skapad')::boolean AND (SELECT kund FROM maskin_flytt WHERE id = (v_ut->>'flytt_id')::uuid) = 'Vida Energi');

  -- Maskin som inte är vår: kunduppdrag, kund krävs
  SELECT id INTO v_id FROM t_lass WHERE kod = 'extern';
  BEGIN
    PERFORM skapa_flytt_ur_lass(v_id, NULL, 'Skotare Andersson', NULL, 'Test');
    v_fel := NULL;
  EXCEPTION WHEN check_violation THEN v_fel := SQLERRM; END;
  INSERT INTO kontroll VALUES ('extern utan kund: avvisas', v_fel LIKE 'Välj kund%');
  v_ut := skapa_flytt_ur_lass(v_id, NULL, 'Skotare Andersson', 'Privat Person', 'Test');
  SELECT * INTO r FROM maskin_flytt WHERE id = (v_ut->>'flytt_id')::uuid;
  INSERT INTO kontroll VALUES ('extern: kunduppdrag, extern_maskin + kund, fakturerbar', r.flytt_typ = 'kunduppdrag' AND r.extern_maskin = 'Skotare Andersson' AND r.maskin_id IS NULL AND r.kund = 'Privat Person' AND r.fakturerbar IS TRUE);
  SELECT count(*) INTO n FROM maskin_position WHERE tidpunkt = r.sluttid;
  INSERT INTO kontroll VALUES ('extern: ingen maskinposition skrivs för andras maskiner', n = 0);

  -- Både maskin och extern, och ingen alls
  SELECT id INTO v_id FROM t_lass WHERE kod = 'dubbel';
  BEGIN PERFORM skapa_flytt_ur_lass(v_id, 'PONS20SDJAA270231', 'Annan', 'Vida', 'Test'); v_fel := NULL; EXCEPTION WHEN check_violation THEN v_fel := SQLERRM; END;
  INSERT INTO kontroll VALUES ('både maskin och extern: avvisas', v_fel LIKE 'Välj en maskin%');
  BEGIN PERFORM skapa_flytt_ur_lass(v_id, NULL, NULL, 'Vida', 'Test'); v_fel := NULL; EXCEPTION WHEN check_violation THEN v_fel := SQLERRM; END;
  INSERT INTO kontroll VALUES ('ingen maskin alls: avvisas', v_fel LIKE 'Välj en maskin%');
  BEGIN PERFORM skapa_flytt_ur_lass(v_id, 'FINNS_INTE', NULL, 'Vida', 'Test'); v_fel := NULL; EXCEPTION WHEN foreign_key_violation THEN v_fel := SQLERRM; END;
  INSERT INTO kontroll VALUES ('okänd maskin: avvisas', v_fel LIKE 'Okänd maskin%');
END
$skapa$;

-- ── Admin svarar (första svaret vinner) ──────────────────────────────────────────────────────────────────
DO $svar$
DECLARE
  v_admin uuid; v_id uuid; v_ut jsonb; v_ut2 jsonb; v_fel text; n int;
BEGIN
  SELECT user_id INTO v_admin FROM medarbetare WHERE roll = 'admin' AND user_id IS NOT NULL LIMIT 1;
  IF v_admin IS NULL THEN
    INSERT INTO kontroll VALUES ('besvara_lass: ingen admin med user_id i medarbetare — fallet hoppades över', false);
    RETURN;
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','sub',v_admin)::text, true);
  PERFORM set_config('test.role', 'authenticated', true);
  PERFORM set_config('test.uid', v_admin::text, true);

  SELECT id INTO v_id FROM t_lass WHERE kod = 'svar';
  UPDATE lastbil_lass SET kund = 'Vida' WHERE id = v_id;
  v_ut := besvara_lass(v_id, 'A130743', NULL, NULL);
  INSERT INTO kontroll VALUES ('besvara_lass: admin skapar flytten', (v_ut->>'ok')::boolean AND (v_ut->>'flytt_id') IS NOT NULL);
  INSERT INTO kontroll VALUES ('besvara_lass: svararen sparas', (SELECT besvarad_av IS NOT NULL AND besvarad_av <> 'auto' AND besvarad_tid IS NOT NULL FROM lastbil_lass WHERE id = v_id));
  v_ut2 := besvara_lass(v_id, 'PONS20SDJAA270231', NULL, NULL);
  SELECT count(*) INTO n FROM maskin_flytt WHERE id = (v_ut->>'flytt_id')::uuid;
  INSERT INTO kontroll VALUES ('besvara_lass: andra svaret = redan besvarat, ingen andra flytt', (v_ut2->>'redan')::boolean AND (v_ut2->>'ok')::boolean IS FALSE AND v_ut2->>'av' IS NOT NULL
    AND (SELECT maskin_id FROM lastbil_lass WHERE id = v_id) = 'A130743' AND n = 1);

  -- Avvisa
  SELECT id INTO v_id FROM t_lass WHERE kod = 'avvisa';
  v_ut := avvisa_lass(v_id, 'ingen_maskinflytt');
  v_ut2 := avvisa_lass(v_id, 'annat');
  INSERT INTO kontroll VALUES ('avvisa_lass: avvisad, andra anropet ändrar inget', (v_ut->>'ok')::boolean AND (v_ut2->>'redan')::boolean
    AND (SELECT status = 'avvisad' AND status_orsak = 'ingen_maskinflytt' AND flytt_id IS NULL FROM lastbil_lass WHERE id = v_id));

  -- Icke-admin nekas
  PERFORM set_config('test.uid', gen_random_uuid()::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','sub',gen_random_uuid())::text, true);
  SELECT id INTO v_id FROM t_lass WHERE kod = 'svar2';
  BEGIN PERFORM besvara_lass(v_id, 'A130743', NULL, 'Vida'); v_fel := NULL; EXCEPTION WHEN insufficient_privilege THEN v_fel := SQLERRM; END;
  INSERT INTO kontroll VALUES ('besvara_lass: icke-admin nekas', v_fel LIKE 'Bara admin%' AND (SELECT status FROM lastbil_lass WHERE id = v_id) = 'vantar_maskin');
  BEGIN PERFORM avvisa_lass(v_id, 'x'); v_fel := NULL; EXCEPTION WHEN insufficient_privilege THEN v_fel := SQLERRM; END;
  INSERT INTO kontroll VALUES ('avvisa_lass: icke-admin nekas', v_fel LIKE 'Bara admin%');
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM set_config('test.role', 'service_role', true);
  PERFORM set_config('test.uid', '', true);
END
$svar$;

-- ── Förarens egen flytt matchas mot lasset ───────────────────────────────────────────────────────────────
DO $fyll$
DECLARE
  v_id uuid; v_man uuid; v_las uuid; v_ut jsonb; r maskin_flytt%rowtype; n int;
BEGIN
  -- Tom flytt: saknar odometer och Från → fylls i. Förarens maskin, Till och km rörs inte.
  SELECT id INTO v_id FROM t_lass WHERE kod = 'fyll';
  INSERT INTO maskin_flytt (maskin_id, fran_lat, fran_lng, till_lat, till_lng, flytt_km, flytt_typ, fakturerbar, starttid, hamtad_tid, sluttid, forare)
  VALUES ('PONS20SDJAA270231', 56.41, 14.71, 56.19, 15.29, 33, 'produktion', true, '2099-10-01 05:00+00', '2099-10-01 06:00+00', '2099-10-01 06:50+00', 'Test Förare')
  RETURNING id INTO v_man;
  UPDATE lastbil_lass SET fran_plats_id = (SELECT id FROM flyttplats LIMIT 1) WHERE id = v_id AND EXISTS (SELECT 1 FROM flyttplats);
  v_ut := fyll_flytt_ur_lass(v_id, v_man);
  SELECT * INTO r FROM maskin_flytt WHERE id = v_man;
  INSERT INTO kontroll VALUES ('fyll: odometer fylld, ok', (v_ut->>'ok')::boolean AND r.fran_odometer_m = 1000000 AND r.till_odometer_m = 1032400);
  INSERT INTO kontroll VALUES ('fyll: förarens värden orörda', r.maskin_id = 'PONS20SDJAA270231' AND r.flytt_km = 33 AND r.forare = 'Test Förare' AND r.till_lat = 56.19 AND r.fran_lat = 56.41);
  INSERT INTO kontroll VALUES ('fyll: lasset matchad_manuell med flytt_id', (SELECT status = 'matchad_manuell' AND flytt_id = v_man AND maskin_id = 'PONS20SDJAA270231' FROM lastbil_lass WHERE id = v_id));
  SELECT count(*) INTO n FROM maskin_flytt WHERE koord_kalla = 'lastbil' AND id IN (SELECT flytt_id FROM lastbil_lass WHERE id = v_id);
  INSERT INTO kontroll VALUES ('fyll: ingen dubblett skapad', n = 0);

  -- Förarens odometer skrivs aldrig över
  SELECT id INTO v_las FROM t_lass WHERE kod = 'last';
  INSERT INTO maskin_flytt (maskin_id, fran_lat, fran_lng, till_lat, till_lng, flytt_km, flytt_typ, fakturerbar, starttid, hamtad_tid, sluttid, fran_odometer_m, till_odometer_m, kund)
  VALUES ('A130743', 56.41, 14.71, 56.19, 15.29, 33, 'produktion', true, '2099-10-02 05:00+00', '2099-10-02 06:00+00', '2099-10-02 06:50+00', 777, 888, 'Vida')
  RETURNING id INTO v_man;
  v_ut := fyll_flytt_ur_lass(v_las, v_man);
  SELECT * INTO r FROM maskin_flytt WHERE id = v_man;
  INSERT INTO kontroll VALUES ('fyll: befintlig odometer skrivs aldrig över', r.fran_odometer_m = 777 AND r.till_odometer_m = 888);

  -- Låst flytt (godkänt underlag): inget fylls, lasset kopplas ändå, inget fel kastas
  SELECT id INTO v_las FROM t_lass WHERE kod = 'dubbel';
  INSERT INTO maskin_flytt (maskin_id, fran_lat, fran_lng, till_lat, till_lng, flytt_km, flytt_typ, fakturerbar, starttid, hamtad_tid, sluttid, kund)
  VALUES ('A130743', 56.41, 14.71, 56.19, 15.29, 33, 'produktion', true, '2099-10-03 05:00+00', '2099-10-03 06:00+00', '2099-10-03 06:50+00', 'Vida')
  RETURNING id INTO v_man;
  UPDATE fakturaunderlag_flytt SET godkand_tid = now() WHERE flytt_id = v_man;
  v_ut := fyll_flytt_ur_lass(v_las, v_man);
  SELECT * INTO r FROM maskin_flytt WHERE id = v_man;
  INSERT INTO kontroll VALUES ('fyll: låst flytt lämnas orörd men lasset kopplas',
    (v_ut->>'ok')::boolean AND (v_ut->>'last')::boolean AND r.fran_odometer_m IS NULL AND r.till_odometer_m IS NULL
    AND (SELECT status = 'matchad_manuell' AND flytt_id = v_man FROM lastbil_lass WHERE id = v_las));

  -- Ett lass kan bara höra till EN flytt
  SELECT id INTO v_id FROM t_lass WHERE kod = 'fyll';
  v_ut := fyll_flytt_ur_lass(v_id, v_man);
  INSERT INTO kontroll VALUES ('fyll: lass som redan har en flytt kopplas inte till en annan', (v_ut->>'ok')::boolean IS FALSE AND v_ut->>'orsak' = 'lasset_har_annan_flytt');
END
$fyll$;

-- ── GPS-närvaro i båda tidskonventionerna ────────────────────────────────────────────────────────────────
-- Verkligt UTC (tid_ar_utc = true) och svensk väggklocka lagrad som UTC (false; sommartid = +2 h).
INSERT INTO detalj_gps_spar (maskin_id, tidpunkt, latitude, longitude, tid_ar_utc, tracking_key, filnamn)
VALUES ('PONS20SDJAA270231', '2099-10-05 08:00:10+00', 56.2000, 15.3000, true,  'tk1', 'test'),
       ('PONS20SDJAA270231', '2099-10-05 10:00:10+00', 56.2000, 15.3000, false, 'tk2', 'test'),   -- = 08:00:10 UTC (sommar, +2 h)
       ('A130743',           '2099-10-05 08:00:10+00', 57.0000, 16.0000, true,  'tk3', 'test');   -- långt bort
DO $gps$
DECLARE n int; d1 double precision; d2 double precision;
BEGIN
  SELECT count(*), min(dist_m) INTO n, d1 FROM lastbil_maskin_foljer(
    '[{"t":"2099-10-05T08:00:00Z","lat":56.2000,"lng":15.3000}]'::jsonb, ARRAY['PONS20SDJAA270231','A130743']) WHERE maskin_id = 'PONS20SDJAA270231';
  INSERT INTO kontroll VALUES ('foljer: Giant hittas, nära 0 m, i bägge tidskonventionerna (1 rad per punkt och maskin)', n = 1 AND d1 < 5);
  SELECT dist_m INTO d2 FROM lastbil_maskin_foljer(
    '[{"t":"2099-10-05T08:00:00Z","lat":56.2000,"lng":15.3000}]'::jsonb, ARRAY['A130743']);
  INSERT INTO kontroll VALUES ('foljer: maskin långt bort ger stort avstånd', d2 > 50000);
  SELECT count(*) INTO n FROM lastbil_maskin_foljer('[{"t":"2099-10-05T09:00:00Z","lat":56.2,"lng":15.3}]'::jsonb, ARRAY['PONS20SDJAA270231']);
  INSERT INTO kontroll VALUES ('foljer: utanför ±150 s = ingen rad (maskinen loggade inte då)', n = 0);
  SELECT count(*) INTO n FROM lastbil_maskin_narvaro(ARRAY['PONS20SDJAA270231'], 56.2, 15.3, '2099-10-05T07:00:00Z', '2099-10-05T09:00:00Z', true);
  INSERT INTO kontroll VALUES ('narvaro: första punkten i fönstret hittas', n = 1);
  SELECT count(*) INTO n FROM lastbil_maskin_narvaro(ARRAY['PONS20SDJAA270231'], 56.2, 15.3, '2099-10-05T06:00:00Z', '2099-10-05T07:00:00Z', false);
  INSERT INTO kontroll VALUES ('narvaro: tomt fönster = ingen rad', n = 0);
END
$gps$;

-- ── Behörigheter ─────────────────────────────────────────────────────────────────────────────────────────
INSERT INTO kontroll
SELECT 'behörighet ' || p.proname || ': authenticated=' || v.want_auth || ', service_role=' || v.want_service,
       has_function_privilege('authenticated', p.oid, 'execute') = v.want_auth
       AND has_function_privilege('service_role', p.oid, 'execute') = v.want_service
       AND NOT has_function_privilege('anon', p.oid, 'execute')
FROM pg_proc p JOIN (VALUES ('lastbil_maskin_foljer', false, true), ('lastbil_maskin_narvaro', false, true), ('skapa_flytt_ur_lass', false, true),
                            ('fyll_flytt_ur_lass', false, true), ('besvara_lass', true, false), ('avvisa_lass', true, false)) v(namn, want_auth, want_service)
       ON v.namn = p.proname
WHERE p.pronamespace = 'public'::regnamespace;
INSERT INTO kontroll VALUES ('alla sex funktionerna finns', (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('lastbil_maskin_foljer','lastbil_maskin_narvaro','skapa_flytt_ur_lass','fyll_flytt_ur_lass','besvara_lass','avvisa_lass')) = 6);
INSERT INTO kontroll VALUES ('RLS på lastbil_lass och lastbil_lass_state', (SELECT bool_and(relrowsecurity) FROM pg_class WHERE relname IN ('lastbil_lass','lastbil_lass_state')));
INSERT INTO kontroll VALUES ('unik nyckel (vin, första lastade tid) hindrar dubbletter',
  (SELECT count(*) FROM pg_constraint WHERE conrelid = 'lastbil_lass'::regclass AND conname = 'lastbil_lass_unik') = 1);

-- ── Resultat (rullar alltid tillbaka) ───────────────────────────────────────
DO $resultat$
DECLARE
  v_fel text;
  v_antal int;
BEGIN
  SELECT count(*) INTO v_antal FROM kontroll;
  SELECT string_agg(namn, E'\n  - ') INTO v_fel FROM kontroll WHERE ok IS NOT TRUE;
  IF v_fel IS NOT NULL THEN
    RAISE EXCEPTION E'TEST FEL: % av % kontroller föll:\n  - %', (SELECT count(*) FROM kontroll WHERE ok IS NOT TRUE), v_antal, v_fel;
  END IF;
  RAISE EXCEPTION 'TEST OK: % kontroller (transaktionen rullas tillbaka)', v_antal;
END
$resultat$;
