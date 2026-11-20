-- Veckoläget som egen datakälla: helikopter_veckolage(p_idag) → jsonb. 2026-09-13.
--
-- Payload-bygget ur helikopter_notis_vecka (20260912110200) bryts ut till en STABLE
-- SECURITY INVOKER-funktion så att sidan /helikopter/veckolage kan läsa exakt samma
-- data via RPC (som inloggad — de underliggande helikopter_ny_* är INVOKER och
-- får köras av authenticated). Notisfunktionen anropar den. Innehållet är
-- oförändrat mot 20260912110200; formen i app/helikopter/_lib/veckolage.ts.
--
-- Nycklar: idag, ar, manad, isovecka, dagar (helikopter_ny_arbetsdagar global rad),
-- dagar_tom_idag (arbetsdagar ≤ idag), vecka_gangna (samma inom ISO-veckan),
-- spar (helikopter_ny_spar), veckor {typ: pågående vecka}, planerade {typ: antal},
-- maskiner (helikopter_ny_maskiner + objekt_typ + maskinens egna dagar_tom_idag).

CREATE OR REPLACE FUNCTION helikopter_veckolage(p_idag date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE sql STABLE AS $$
  WITH p AS (SELECT extract(year FROM p_idag)::int AS ar, extract(month FROM p_idag)::int AS manad),
  ad AS (SELECT a.* FROM p, helikopter_ny_arbetsdagar(p.ar, p.manad, p_idag) a),
  dagar AS (SELECT a.maskin_id, unnest(a.gangna_datum || a.kvar_datum) AS d FROM ad a)
  SELECT jsonb_build_object(
    'idag',           p_idag,
    'ar',             p.ar,
    'manad',          p.manad,
    'isovecka',       extract(week FROM p_idag)::int,
    'dagar',          (SELECT to_jsonb(a) FROM ad a WHERE a.maskin_id IS NULL),
    'dagar_tom_idag', (SELECT COALESCE(jsonb_agg(x.d ORDER BY x.d), '[]'::jsonb) FROM dagar x WHERE x.maskin_id IS NULL AND x.d <= p_idag),
    'vecka_gangna',   (SELECT count(*) FROM dagar x WHERE x.maskin_id IS NULL AND x.d <= p_idag AND x.d >= date_trunc('week', p_idag)::date),
    'spar',           (SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]'::jsonb) FROM helikopter_ny_spar(p.ar, p.manad, p_idag) s),
    'veckor',         (SELECT COALESCE(jsonb_object_agg(t.typ,
                          (SELECT to_jsonb(v) FROM helikopter_ny_veckor(p.ar, p.manad, t.typ, p_idag) v WHERE v.status = 'pagar' LIMIT 1)), '{}'::jsonb)
                       FROM (VALUES ('slutavverkning'), ('gallring')) AS t(typ)),
    'planerade',      (SELECT jsonb_build_object(
                          'slutavverkning', count(*) FILTER (WHERE lower(pl.typ) = 'slutavverkning'),
                          'gallring',       count(*) FILTER (WHERE lower(pl.typ) = 'gallring'))
                       FROM helikopter_ny_planering(p.ar, p.manad) pl),
    'maskiner',       (SELECT COALESCE(jsonb_agg(
                          to_jsonb(m) || jsonb_build_object(
                            'objekt_typ', (SELECT NULLIF(lower(btrim(d.huvudtyp)), '')
                                             FROM helikopter_ny_maskin(m.maskin_id, p_idag) l
                                             JOIN dim_objekt d ON d.objekt_id = l.objekt_id
                                            LIMIT 1),
                            'dagar_tom_idag', (SELECT COALESCE(jsonb_agg(x.d ORDER BY x.d), '[]'::jsonb)
                                                 FROM dagar x WHERE x.maskin_id = m.maskin_id AND x.d <= p_idag))
                          ORDER BY m.roll, m.namn), '[]'::jsonb)
                       FROM helikopter_ny_maskiner(p.ar, p.manad, p_idag) m)
  )
  FROM p;
$$;
REVOKE ALL ON FUNCTION helikopter_veckolage(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION helikopter_veckolage(date) TO authenticated, service_role;

-- Notisfunktionen: samma som 20260912110200, men payloaden kommer ur helikopter_veckolage.
CREATE OR REPLACE FUNCTION helikopter_notis_vecka(p_idag date DEFAULT CURRENT_DATE, p_manuell boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  -- MOTTAGARE. Byt till en lista av roller när fler ska ha notisen.
  c_mottagare_epost constant text[] := ARRAY['martin.lindqvist@kompersmalaskog.com'];
  c_typ             constant text   := 'helikopter_vecka';
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

  v_payload := helikopter_veckolage(p_idag);

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
