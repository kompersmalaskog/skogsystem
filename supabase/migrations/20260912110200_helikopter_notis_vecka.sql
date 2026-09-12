-- Onsdagsnotis: helikopterns veckoläge som push, onsdagar 12:00 svensk tid. 2026-09-12.
--
-- FLÖDE (samma som dagsslut/månadsskifte — ingen ny infrastruktur):
--   pg_cron -> helikopter_notis_vecka() -> rad i notis_kö (typ 'helikopter_vecka',
--   payload = datan ur helikopter_ny_spar/_veckor/_maskiner/_arbetsdagar/_planering)
--   -> Vercel-cronen /api/notis/flush (var 5:e minut) bygger texten ur payloaden
--   med den rena funktionen formateraVeckoNotis (app/helikopter/_lib/veckoNotis.ts,
--   testad i veckoNotis.test.ts) och pushar. Texten räknas alltså med exakt
--   samma funktioner som vyn (raknaSpar/valjBas).
--
-- TID: pg_cron går i UTC. Jobbet fyrar 10:00 OCH 11:00 UTC varje onsdag; kommandot
--   släpper bara igenom det slag där klockan är 12 i Europe/Stockholm (sommar =
--   10 UTC, vinter = 11 UTC). Det andra slaget gör ingenting. Dedup per dag via
--   notis_kö.datum (unikt index typ+mottagare+datum) — en notis per onsdag även
--   om jobbet skulle köras om.
--
-- MOTTAGARE: bara Martin tills vidare — konstanten c_mottagare_epost nedan.
--   (Joacim har också roll admin; därför e-post, inte roll.)
--
-- MANUELLT: knappen "Skicka veckoläge nu" på /helikopter Uppföljning (admin) anropar
--   helikopter_notis_vecka(p_manuell => true): ny rad utan datum (ingen dedup),
--   skickas_at = now(), och appen tömmer kön direkt via POST /api/notis/flush.
--
-- BEHÖRIGHET: SECURITY DEFINER (skriver i notis_kö och läser allt). Anrop med
--   JWT (appen) kräver medarbetare.roll admin/chef; utan JWT (pg_cron, service)
--   släpps igenom. anon får inte köra.

CREATE OR REPLACE FUNCTION helikopter_notis_vecka(p_idag date DEFAULT CURRENT_DATE, p_manuell boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  -- MOTTAGARE. Byt till en lista av roller när fler ska ha notisen.
  c_mottagare_epost constant text[] := ARRAY['martin.lindqvist@kompersmalaskog.com'];
  c_typ             constant text   := 'helikopter_vecka';
  v_ar        int := extract(year FROM p_idag)::int;
  v_manad     int := extract(month FROM p_idag)::int;
  v_jwt_email text;
  v_roll      text;
  v_payload   jsonb;
  v_antal     int := 0;
  v_n         int;
  r           record;
BEGIN
  -- Behörighet: med JWT-claims krävs admin/chef. pg_cron/service har inga claims.
  BEGIN
    v_jwt_email := (current_setting('request.jwt.claims', true)::json)->>'email';
  EXCEPTION WHEN OTHERS THEN
    v_jwt_email := NULL;
  END;
  IF v_jwt_email IS NOT NULL THEN
    SELECT m.roll INTO v_roll FROM medarbetare m WHERE m.epost = v_jwt_email LIMIT 1;
    IF v_roll IS NULL OR v_roll NOT IN ('admin', 'chef') THEN
      RAISE EXCEPTION 'helikopter_notis_vecka: kräver admin' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Payload = rådatan som vyn läser, för innevarande månad, per p_idag.
  -- dagar_tom_idag: arbetsdagar t.o.m. i dag (i dag räknas — notisen går mitt på dagen
  -- och "hittills" innehåller dagens data). vecka_gangna: samma inom innevarande ISO-vecka.
  WITH ad AS (SELECT * FROM helikopter_ny_arbetsdagar(v_ar, v_manad, p_idag)),
  dagar AS (SELECT a.maskin_id, unnest(a.gangna_datum || a.kvar_datum) AS d FROM ad a)
  SELECT jsonb_build_object(
    'idag',           p_idag,
    'ar',             v_ar,
    'manad',          v_manad,
    'isovecka',       extract(week FROM p_idag)::int,
    'dagar',          (SELECT to_jsonb(a) FROM ad a WHERE a.maskin_id IS NULL),
    'dagar_tom_idag', (SELECT COALESCE(jsonb_agg(x.d ORDER BY x.d), '[]'::jsonb) FROM dagar x WHERE x.maskin_id IS NULL AND x.d <= p_idag),
    'vecka_gangna',   (SELECT count(*) FROM dagar x WHERE x.maskin_id IS NULL AND x.d <= p_idag AND x.d >= date_trunc('week', p_idag)::date),
    'spar',           (SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]'::jsonb) FROM helikopter_ny_spar(v_ar, v_manad, p_idag) s),
    'veckor',         (SELECT COALESCE(jsonb_object_agg(t.typ,
                          (SELECT to_jsonb(v) FROM helikopter_ny_veckor(v_ar, v_manad, t.typ, p_idag) v WHERE v.status = 'pagar' LIMIT 1)), '{}'::jsonb)
                       FROM (VALUES ('slutavverkning'), ('gallring')) AS t(typ)),
    'planerade',      (SELECT jsonb_build_object(
                          'slutavverkning', count(*) FILTER (WHERE lower(p.typ) = 'slutavverkning'),
                          'gallring',       count(*) FILTER (WHERE lower(p.typ) = 'gallring'))
                       FROM helikopter_ny_planering(v_ar, v_manad) p),
    'maskiner',       (SELECT COALESCE(jsonb_agg(
                          to_jsonb(m) || jsonb_build_object(
                            'objekt_typ', (SELECT NULLIF(lower(btrim(d.huvudtyp)), '')
                                             FROM helikopter_ny_maskin(m.maskin_id, p_idag) l
                                             JOIN dim_objekt d ON d.objekt_id = l.objekt_id
                                            LIMIT 1),
                            'dagar_tom_idag', (SELECT COALESCE(jsonb_agg(x.d ORDER BY x.d), '[]'::jsonb)
                                                 FROM dagar x WHERE x.maskin_id = m.maskin_id AND x.d <= p_idag))
                          ORDER BY m.roll, m.namn), '[]'::jsonb)
                       FROM helikopter_ny_maskiner(v_ar, v_manad, p_idag) m)
  ) INTO v_payload;

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

REVOKE ALL ON FUNCTION helikopter_notis_vecka(date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION helikopter_notis_vecka(date, boolean) TO authenticated, service_role;

-- Onsdagar 10:00 och 11:00 UTC; bara slaget där det är 12 i Stockholm gör något.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'helikopter_notis_vecka',
      '0 10,11 * * 3',
      $c$SELECT public.helikopter_notis_vecka() WHERE extract(hour FROM (now() AT TIME ZONE 'Europe/Stockholm')) = 12$c$);
  END IF;
END $do$;
