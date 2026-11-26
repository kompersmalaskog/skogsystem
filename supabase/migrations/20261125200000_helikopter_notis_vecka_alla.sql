-- Onsdagsnotisen till ALLA aktiva medarbetare (Martin 2026-11-25): lagets läge så alla vet hur vi ligger till.
-- Förut: bara Martin och Joacim (hårdkodade e-postadresser). Nu: alla aktiva i medarbetare, och payloaden bär `version`:
--   'full'  = admin (maskiner, objekt, stopp, "inga lass sedan") — formateraVeckoNotis
--   'kort'  = alla andra (lagets läge per spår och roll, inga namn, ingen frånvaro) — formateraVeckoNotisKort
-- Texten byggs vid utskick i app/api/notis/flush (payload.version saknas i äldre köade rader = full).
-- Medarbetarens egen växel (push_aktiv) respekteras av flush som för alla pushar (skippOrsak).
-- Manuell körning (knappen "Skicka veckoläge nu", admin): bara till admin, alltid full — den ska aldrig skicka till hela laget.
-- Dedup som förut: unikt index typ + mottagare + datum, en notis per onsdag och person.
-- Schemat (pg_cron onsdag 12:00 svensk tid) är oförändrat.

CREATE OR REPLACE FUNCTION public.helikopter_notis_vecka(p_idag date DEFAULT CURRENT_DATE, p_manuell boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c_typ             constant text   := 'helikopter_vecka';
  v_jwt_email text;
  v_roll      text;
  v_payload   jsonb;
  v_antal     int := 0;
  v_n         int;
  r           record;
BEGIN
  BEGIN
    v_jwt_email := (current_setting('request.jwt.claims', true)::json)->>'email';
  EXCEPTION WHEN OTHERS THEN
    v_jwt_email := NULL;
  END;
  IF v_jwt_email IS NOT NULL THEN
    SELECT m.roll INTO v_roll FROM medarbetare m WHERE m.epost = v_jwt_email LIMIT 1;
    IF v_roll IS NULL OR v_roll <> 'admin' THEN
      RAISE EXCEPTION 'helikopter_notis_vecka: kräver admin' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_payload := helikopter_veckolage(p_idag);

  FOR r IN
    SELECT m.id, (m.roll = 'admin') AS ar_admin
    FROM medarbetare m
    WHERE m.aktiv AND (NOT p_manuell OR m.roll = 'admin')
  LOOP
    IF p_manuell THEN
      INSERT INTO notis_kö (mottagare_id, typ, payload, skickas_at)
      VALUES (r.id, c_typ, v_payload || '{"manuell":true,"version":"full"}'::jsonb, now());
      v_n := 1;
    ELSE
      INSERT INTO notis_kö (mottagare_id, typ, payload, skickas_at, datum)
      VALUES (r.id, c_typ, v_payload || jsonb_build_object('version', CASE WHEN r.ar_admin THEN 'full' ELSE 'kort' END), now(), p_idag)
      ON CONFLICT (typ, mottagare_id, datum) WHERE datum IS NOT NULL DO NOTHING;
      GET DIAGNOSTICS v_n = ROW_COUNT;
    END IF;
    v_antal := v_antal + v_n;
  END LOOP;
  RETURN v_antal;
END;
$function$;

REVOKE ALL ON FUNCTION public.helikopter_notis_vecka(date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.helikopter_notis_vecka(date, boolean) TO authenticated, service_role;
