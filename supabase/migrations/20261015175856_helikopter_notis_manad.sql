-- Månadsfacit-notis: första arbetsdagen i månaden 08:00 svensk tid, "Månadsfacit september: 109 %". 2026-10-16.
--
-- Bygger på 20261016090000_helikopter_manadsfacit.sql — KÖR DEN FÖRST (funktionen här anropar helikopter_manadsfacit).
--
-- FLÖDE (samma som veckonotisen — ingen ny infrastruktur):
--   pg_cron -> helikopter_notis_manad() -> rad i notis_kö (typ 'helikopter_manad', payload = helikopter_manadsfacit för FÖREGÅENDE månad)
--   -> Vercel-cronen /api/notis/flush bygger texten ur payloaden (formateraManadNotis i app/helikopter/_lib/manadsfacit.ts) och pushar.
--   Länk: /helikopter/manad?ar=&manad= för den föregående månaden.
--
-- TID: pg_cron går i UTC. Jobbet fyrar 06:00 OCH 07:00 UTC varje vardag (mån–fre); kommandot släpper bara igenom slaget där klockan är 08
--   i Europe/Stockholm (sommar = 06 UTC, vinter = 07 UTC) OCH dagen är månadens första arbetsdag. Arbetsdag = helikopter_ny_ar_arbetsdag
--   (helger + svenska helgdagar), samma definition som resten av helikopter-vyerna — första vardagen kan alltså vara den 2:a eller 3:e.
--   (day-of-month och day-of-week i samma cron-uttryck är ELLER i cron — därför filtreras dagen i kommandot, inte i schemat.)
--   Dedup per dag via notis_kö.datum (unikt index typ+mottagare+datum).
--
-- MOTTAGARE: samma som veckonotisen (helikopter_notis_vecka, 20261008_ta_bort_rollen_chef.sql): Martin och Joacim.
--
-- INGEN BESTÄLLNING föregående månad -> ingen notis (en push utan facit är brus).
--
-- MANUELLT: helikopter_notis_manad(p_manuell => true) köar en rad utan datum (ingen dedup), skickas direkt; kräver admin när anropet har JWT.
--
-- BEHÖRIGHET: SECURITY DEFINER (skriver i notis_kö). Anrop med JWT kräver medarbetare.roll = 'admin'; utan JWT (pg_cron, service) släpps igenom.
--   anon får inte köra.

CREATE OR REPLACE FUNCTION public.helikopter_notis_manad(p_idag date DEFAULT CURRENT_DATE, p_manuell boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c_mottagare_epost constant text[] := ARRAY['martin.lindqvist@kompersmalaskog.com', 'joacim.ringberg@kompersmalaskog.com'];
  c_typ             constant text   := 'helikopter_manad';
  v_forra     date := (date_trunc('month', p_idag) - interval '1 month')::date;
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
      RAISE EXCEPTION 'helikopter_notis_manad: kräver admin' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_payload := helikopter_manadsfacit(extract(year FROM v_forra)::int, extract(month FROM v_forra)::int, p_idag);
  IF v_payload->'totalt' IS NULL OR jsonb_typeof(v_payload->'totalt') = 'null' THEN
    RETURN 0;
  END IF;

  FOR r IN SELECT m.id FROM medarbetare m WHERE m.epost = ANY(c_mottagare_epost) LOOP
    IF p_manuell THEN
      INSERT INTO notis_kö (mottagare_id, typ, payload, skickas_at)
      VALUES (r.id, c_typ, v_payload || '{"manuell":true}'::jsonb, now());
      v_n := 1;
    ELSE
      INSERT INTO notis_kö (mottagare_id, typ, payload, skickas_at, datum)
      VALUES (r.id, c_typ, v_payload, now(), p_idag)
      ON CONFLICT (typ, mottagare_id, datum) WHERE datum IS NOT NULL DO NOTHING;
      GET DIAGNOSTICS v_n = ROW_COUNT;
    END IF;
    v_antal := v_antal + v_n;
  END LOOP;
  RETURN v_antal;
END;
$$;

REVOKE ALL ON FUNCTION public.helikopter_notis_manad(date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.helikopter_notis_manad(date, boolean) TO authenticated, service_role;

-- Är p_datum månadens första arbetsdag? (cron-vakten; ren, egen funktion så den går att testa)
CREATE OR REPLACE FUNCTION public.helikopter_ar_forsta_arbetsdagen(p_datum date)
RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT helikopter_ny_ar_arbetsdag(p_datum)
     AND NOT EXISTS (
       SELECT 1 FROM generate_series(date_trunc('month', p_datum)::date, p_datum - 1, interval '1 day') d
       WHERE helikopter_ny_ar_arbetsdag(d::date));
$$;

REVOKE ALL ON FUNCTION public.helikopter_ar_forsta_arbetsdagen(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.helikopter_ar_forsta_arbetsdagen(date) TO authenticated, service_role;

-- Vardagar 06:00 och 07:00 UTC; bara slaget där det är 08 i Stockholm, på månadens första arbetsdag, gör något.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'helikopter_notis_manad',
      '0 6,7 * * 1-5',
      $c$SELECT public.helikopter_notis_manad()
         WHERE extract(hour FROM (now() AT TIME ZONE 'Europe/Stockholm')) = 8
           AND public.helikopter_ar_forsta_arbetsdagen((now() AT TIME ZONE 'Europe/Stockholm')::date)$c$);
  END IF;
END $do$;
