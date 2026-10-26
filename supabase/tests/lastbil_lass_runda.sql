-- SQL-test: automatisk flytt → bilens runda och starttid (migrationerna 20261026183350_lastbil_auto_flytt_runda.sql och
-- 20261026184907_lastbil_auto_flytt_starttid.sql ska vara körda).
--
-- Körs i EN transaktion som alltid rullas tillbaka (lokalt: psql -1 -f denna fil, eller hela filen via MCP execute_sql).
-- Resultatet kommer som ett fel på sista raden: "TEST OK: N kontroller" eller "TEST FEL: …" — så rullas den tillbaka.
-- Maskinen Wisent (A030353) måste finnas i dim_maskin. Alla rader är i oktober 2099 med egna VIN, inget riktigt rörs.
--
-- Fall:
--   efter   rundan börjar 88 s EFTER lastningen (26 okt 2026) och pågår → flytten kopplas, lassning_fran 10 min före = starttid
--   ovrig   rundan redan stängd som ovrig_korning runt lasset → kopplas, rundan blir 'avslutad'
--   glapp   lassning_fran 4 dagar före (bilen avstängd) → starttid = lastningen, underlagets datum = lastningsdagen
--   fore    rundan slutade före lastningen → ingen runda
--   tva     en runda pågick vid lastningen, nästa började före lossningen → den som pågick vid lastningen
--   vaken   bilen avstängd i dagar, startad 14 min före lastningen (Wisent 26 okt) → starttid = när bilen startades
--   tickar  bilen sände var 10:e minut hela timmen före (ingen start) → sista tomma punkten som förut
CREATE TEMP TABLE kontroll (namn text, ok boolean);
CREATE TEMP TABLE t (kod text PRIMARY KEY, lass uuid, dag uuid, dag2 uuid, vin text, t0 timestamptz, fran timestamptz);

INSERT INTO t (kod, lass, dag, dag2, vin, t0, fran)
SELECT k, gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'TESTRUNDA_' || k,
       '2099-10-05 10:00+00'::timestamptz,
       CASE k WHEN 'glapp' THEN '2099-10-01 13:47+00'::timestamptz ELSE '2099-10-05 09:50+00'::timestamptz END
FROM unnest(ARRAY['efter','ovrig','glapp','fore','tva','vaken','tickar']) k;

-- Bilens logg: 'vaken' tyst sedan 4 dagar, startad t0 − 14 min, punkt vid lastningen; 'tickar' en punkt var 10:e min i 2 h.
INSERT INTO lastbil_logg (vin, tidpunkt, lat, lng, odometer_m)
SELECT vin, x, 56.46, 14.70, 1000000 FROM t,
  unnest(ARRAY[t0 - interval '4 days', t0 - interval '14 minutes', t0 - interval '14 minutes' + interval '1 second', t0]) x
WHERE kod = 'vaken';
INSERT INTO lastbil_logg (vin, tidpunkt, lat, lng, odometer_m)
SELECT vin, t0 - g * interval '10 minutes', 56.46, 14.70, 1000000 FROM t, generate_series(0, 12) g WHERE kod = 'tickar';

INSERT INTO lastbil_lass (id, vin, forsta_lastad_tid, sista_lastad_tid, lassning_fran, lassning_tid, lassning_lat, lassning_lng, lassning_odometer_m,
                          lassning_plats_saker, lossning_tid, lossning_till, lossning_lat, lossning_lng, lossning_odometer_m, lossning_plats_saker,
                          km, fran_namn, till_namn, forslag_maskin_id, sakerhet, status, kund)
SELECT lass, vin, t0, t0 + interval '45 minutes', fran, t0, 56.40, 14.70, 1000000, true,
       t0 + interval '49 minutes', t0 + interval '55 minutes', 56.20, 15.30, 1035400, true,
       35.4, 'Testfrån', 'Testtill', 'A030353', 'hog', 'vantar_maskin', 'Vida'
FROM t;

-- Rundorna
INSERT INTO flyttdag (id, vin, starttid, sluttid, status, auto_skapad)
SELECT dag, vin, t0 + interval '88 seconds', NULL, 'pagaende', true FROM t WHERE kod IN ('efter', 'glapp');
INSERT INTO flyttdag (id, vin, starttid, sluttid, status, auto_skapad)
SELECT dag, vin, t0 + interval '2 minutes', t0 + interval '90 minutes', 'ovrig_korning', true FROM t WHERE kod = 'ovrig';
INSERT INTO flyttdag (id, vin, starttid, sluttid, status, auto_skapad)
SELECT dag, vin, t0 - interval '3 hours', t0 - interval '1 hour', 'ovrig_korning', true FROM t WHERE kod = 'fore';
INSERT INTO flyttdag (id, vin, starttid, sluttid, status, auto_skapad)
SELECT dag, vin, t0 - interval '1 hour', t0 + interval '10 minutes', 'pagaende', true FROM t WHERE kod = 'tva';
INSERT INTO flyttdag (id, vin, starttid, sluttid, status, auto_skapad)
SELECT dag2, vin, t0 + interval '20 minutes', NULL, 'pagaende', true FROM t WHERE kod = 'tva';

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $k$
DECLARE r record; v_ut jsonb; f maskin_flytt%rowtype; v_status text; v_datum date;
BEGIN
  FOR r IN SELECT * FROM t LOOP
    v_ut := skapa_flytt_ur_lass(r.lass, 'A030353', NULL, NULL, 'auto');
    SELECT * INTO f FROM maskin_flytt WHERE id = (v_ut->>'flytt_id')::uuid;
    SELECT status INTO v_status FROM flyttdag WHERE id = r.dag;
    SELECT datum INTO v_datum FROM fakturaunderlag_flytt WHERE flytt_id = f.id;
    IF r.kod = 'efter' THEN
      INSERT INTO kontroll VALUES ('efter: rundan som började efter lastningen kopplas', f.flyttdag_id = r.dag);
      INSERT INTO kontroll VALUES ('efter: starttid = sista tomma punkten (10 min före)', f.starttid = r.fran);
      INSERT INTO kontroll VALUES ('efter: pågående runda rörs inte', v_status = 'pagaende');
    ELSIF r.kod = 'ovrig' THEN
      INSERT INTO kontroll VALUES ('ovrig: stängd runda kopplas', f.flyttdag_id = r.dag);
      INSERT INTO kontroll VALUES ('ovrig: övrig körning blir flyttrunda', v_status = 'avslutad');
    ELSIF r.kod = 'glapp' THEN
      INSERT INTO kontroll VALUES ('glapp: starttid = lastningen, inte 4 dagar före', f.starttid = r.t0);
      INSERT INTO kontroll VALUES ('glapp: underlagets datum = lastningsdagen', v_datum = r.t0::date);
      INSERT INTO kontroll VALUES ('glapp: rundan kopplas', f.flyttdag_id = r.dag);
    ELSIF r.kod = 'fore' THEN
      INSERT INTO kontroll VALUES ('fore: runda som slutade före lastningen kopplas inte', f.flyttdag_id IS NULL);
      INSERT INTO kontroll VALUES ('fore: den rundan rörs inte', v_status = 'ovrig_korning');
    ELSIF r.kod = 'vaken' THEN
      INSERT INTO kontroll VALUES ('vaken: starttid = när bilen startades (14 min före lastningen)', f.starttid = r.t0 - interval '14 minutes');
    ELSIF r.kod = 'tickar' THEN
      INSERT INTO kontroll VALUES ('tickar: ingen start inom timmen → sista tomma punkten', f.starttid = r.fran);
    ELSIF r.kod = 'tva' THEN
      INSERT INTO kontroll VALUES ('tva: rundan som pågick vid lastningen väljs', f.flyttdag_id = r.dag);
    END IF;
    INSERT INTO kontroll VALUES (r.kod || ': flytten skapad, 49 min lastad → lossad', (v_ut->>'skapad')::boolean AND f.tid_flytt_min = 49);
  END LOOP;
END
$k$;

DO $resultat$
DECLARE v_fel text; v_antal int;
BEGIN
  SELECT count(*) INTO v_antal FROM kontroll;
  SELECT string_agg(namn, E'\n  - ') INTO v_fel FROM kontroll WHERE ok IS NOT TRUE;
  IF v_fel IS NOT NULL THEN
    RAISE EXCEPTION E'TEST FEL: % av % kontroller föll:\n  - %', (SELECT count(*) FROM kontroll WHERE ok IS NOT TRUE), v_antal, v_fel;
  END IF;
  RAISE EXCEPTION 'TEST OK: % kontroller (transaktionen rullas tillbaka)', v_antal;
END
$resultat$;
