-- SQL-test: ett struket underlag visar samma platser som flytten
-- (migration 20261116094755_ratta_flytt_struket_underlag_platser.sql ska vara körd).
-- Körs i EN transaktion som alltid rullas tillbaka; resultatet kommer som ett fel på sista raden: "TEST OK: …" / "TEST FEL: …".
-- Kräver en admin i medarbetare (ratta_flytt kräver ar_admin()) och två trakter i objekt. Inget riktigt rörs.
CREATE TEMP TABLE kontroll (namn text, ok boolean);
CREATE TEMP TABLE t AS
SELECT gen_random_uuid() flytt,
       (SELECT id FROM objekt ORDER BY id LIMIT 1) a,
       (SELECT id FROM objekt ORDER BY id OFFSET 1 LIMIT 1) b,
       (SELECT id FROM objekt ORDER BY id OFFSET 2 LIMIT 1) c;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT user_id FROM medarbetare WHERE roll = 'admin' AND user_id IS NOT NULL LIMIT 1), 'role', 'authenticated')::text, true);

-- En fakturerbar flytt a → b (40 km, produktion, Vida); triggern skapar underlaget.
INSERT INTO maskin_flytt (id, maskin_id, fran_objekt_id, till_objekt_id, fran_lat, fran_lng, till_lat, till_lng, flytt_km, flytt_typ, kund, fakturerbar,
                          starttid, hamtad_tid, sluttid, tid_flytt_min, avbruten)
SELECT flytt, 'R64428', a, b, 56.5, 14.7, 56.6, 14.8, 40, 'produktion', 'Vida', true,
       '2099-11-13 15:00+00', '2099-11-13 15:10+00', '2099-11-13 16:00+00', 50, false FROM t;

DO $k$
DECLARE r record; u fakturaunderlag_flytt%rowtype;
BEGIN
  SELECT * INTO r FROM t;
  SELECT * INTO u FROM fakturaunderlag_flytt WHERE flytt_id = r.flytt;
  INSERT INTO kontroll VALUES ('underlaget skapades aktivt till b', u.status = 'aktiv' AND u.till_objekt_id = r.b::text);

  -- Rätta till typ annat OCH ny till-plats i samma rättning: underlaget stryks och får den nya platsen.
  PERFORM ratta_flytt(r.flytt, jsonb_build_object('flytt_typ', 'annat', 'till_objekt_id', r.c), 'Skogsdag', 'Test');
  SELECT * INTO u FROM fakturaunderlag_flytt WHERE flytt_id = r.flytt;
  INSERT INTO kontroll VALUES ('struket', u.status = 'struken');
  INSERT INTO kontroll VALUES ('struket underlag visar flyttens nya till', u.till_objekt_id = r.c::text);

  -- Rätta från-platsen på en flytt som redan är struken: underlaget följer med.
  PERFORM ratta_flytt(r.flytt, jsonb_build_object('fran_objekt_id', r.b), 'Rätt från', 'Test');
  SELECT * INTO u FROM fakturaunderlag_flytt WHERE flytt_id = r.flytt;
  INSERT INTO kontroll VALUES ('struket underlag visar flyttens nya från', u.fran_objekt_id = r.b::text AND u.status = 'struken');
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
