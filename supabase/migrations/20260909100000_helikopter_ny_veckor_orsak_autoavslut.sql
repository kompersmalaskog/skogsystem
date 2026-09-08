-- ============================================================================
-- /helikopter — steg 2: Veckor, veckoorsak, oskotat per objekt, din maskin ur
-- senaste fakt-rad, auto-avslut av skotning. Förutsätter 20260908100000.
-- Rör inte de gamla helikopter-vyerna.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Veckoorsak: en fritext (≤ 60 tecken) per (år, månad, typ, ISO-vecka).
--    Läsa: alla inloggade. Skriva: admin. anon: inget.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS helikopter_veckoorsak (
  ar int NOT NULL,
  manad int NOT NULL CHECK (manad BETWEEN 1 AND 12),
  typ text NOT NULL,
  isovecka int NOT NULL CHECK (isovecka BETWEEN 1 AND 53),
  orsak text NOT NULL CHECK (char_length(orsak) BETWEEN 1 AND 60),
  uppdaterad timestamptz NOT NULL DEFAULT now(),
  av uuid,
  PRIMARY KEY (ar, manad, typ, isovecka)
);
ALTER TABLE helikopter_veckoorsak ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS veckoorsak_las ON helikopter_veckoorsak;
CREATE POLICY veckoorsak_las ON helikopter_veckoorsak FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS veckoorsak_skriv ON helikopter_veckoorsak;
CREATE POLICY veckoorsak_skriv ON helikopter_veckoorsak FOR ALL TO authenticated USING (ar_admin()) WITH CHECK (ar_admin());
REVOKE ALL ON helikopter_veckoorsak FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON helikopter_veckoorsak TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Veckor: en rad per ISO-vecka med minst en arbetsdag i månaden.
--    plan = veckans arbetsdagar i månaden × (beställt / månadens arbetsdagar).
--    Skördat/skotat ur helikopter_ny_dag, bara månadens dagar, samma bolagsurval
--    som spåret (beställda bolag om beställning finns, annars alla).
--    status: 'last' om veckans sista arbetsdag < idag, 'pagar' om idag ligger i
--    veckan, annars 'kommande'. maskiner = [{maskin_id, modell, roll, volym}].
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS helikopter_ny_veckor(int, int, text, date);
CREATE FUNCTION helikopter_ny_veckor(p_ar int, p_manad int, p_typ text, p_idag date DEFAULT CURRENT_DATE)
RETURNS TABLE (
  isovecka int, iso_ar int, fran date, till date,
  arbetsdagar int, arbetsdagar_kvar int, plan numeric,
  skordat numeric, skotat numeric, status text, orsak text, maskiner jsonb)
LANGUAGE sql STABLE AS $$
  WITH man AS (SELECT make_date(p_ar, p_manad, 1) AS fran, (make_date(p_ar, p_manad, 1) + interval '1 month')::date AS till_excl),
  ad AS (SELECT * FROM helikopter_ny_arbetsdagar(p_ar, p_manad, p_idag) WHERE maskin_id IS NULL),
  dagar AS (SELECT unnest(gangna_datum || kvar_datum) AS d FROM ad),
  best AS (
    SELECT btrim(b.bolag) AS bolag, sum(b.volym) AS volym
    FROM bestallningar b WHERE b.ar = p_ar AND b.manad = p_manad AND lower(btrim(b.typ)) = lower(p_typ) GROUP BY 1),
  bestallt AS (SELECT COALESCE(sum(volym), 0) AS v, count(*) > 0 AS finns FROM best),
  veckor AS (
    SELECT DISTINCT extract(isoyear FROM d)::int AS iso_ar, extract(week FROM d)::int AS isovecka,
           date_trunc('week', d)::date AS fran, (date_trunc('week', d) + interval '6 days')::date AS till
    FROM dagar),
  vd AS (SELECT v.iso_ar, v.isovecka, d.d FROM veckor v JOIN dagar d ON d.d BETWEEN v.fran AND v.till),
  vinfo AS (
    SELECT iso_ar, isovecka, count(*)::int AS arbetsdagar, count(*) FILTER (WHERE d >= p_idag)::int AS arbetsdagar_kvar, max(d) AS sista
    FROM vd GROUP BY 1, 2),
  dag AS (
    SELECT hd.* FROM helikopter_ny_dag hd, man
    WHERE hd.datum >= man.fran AND hd.datum < man.till_excl AND hd.typ = lower(p_typ)
      AND ((SELECT finns FROM bestallt) = false OR EXISTS (SELECT 1 FROM best b WHERE lower(b.bolag) = lower(hd.bolag)))),
  vol AS (
    SELECT v.iso_ar, v.isovecka, COALESCE(sum(d.skordat), 0) AS skordat, COALESCE(sum(d.skotat), 0) AS skotat
    FROM veckor v LEFT JOIN dag d ON d.datum BETWEEN v.fran AND v.till GROUP BY 1, 2),
  rader AS (
    SELECT p.datum, p.maskin_id, 'skordare'::text AS roll, p.volym_m3sub AS vol
    FROM fakt_produktion p JOIN dim_objekt d ON d.objekt_id = p.objekt_id, man
    WHERE p.datum >= man.fran AND p.datum < man.till_excl AND lower(btrim(d.huvudtyp)) = lower(p_typ)
      AND ((SELECT finns FROM bestallt) = false OR EXISTS (SELECT 1 FROM best b WHERE lower(b.bolag) = lower(btrim(d.bolag))))
    UNION ALL
    SELECT l.datum, l.maskin_id, 'skotare', l.volym_m3sub
    FROM fakt_lass l JOIN dim_objekt d ON d.objekt_id = l.objekt_id, man
    WHERE l.datum >= man.fran AND l.datum < man.till_excl AND lower(btrim(d.huvudtyp)) = lower(p_typ)
      AND ((SELECT finns FROM bestallt) = false OR EXISTS (SELECT 1 FROM best b WHERE lower(b.bolag) = lower(btrim(d.bolag))))),
  mask AS (
    SELECT v.iso_ar, v.isovecka, r.maskin_id, r.roll, sum(r.vol) AS vol
    FROM veckor v JOIN rader r ON r.datum BETWEEN v.fran AND v.till GROUP BY 1, 2, 3, 4)
  SELECT v.isovecka, v.iso_ar, v.fran, v.till,
         vi.arbetsdagar, vi.arbetsdagar_kvar,
         CASE WHEN (SELECT totalt FROM ad) > 0 THEN round(vi.arbetsdagar * (SELECT bv.v FROM bestallt bv) / (SELECT totalt FROM ad), 0) END AS plan,
         vol.skordat, vol.skotat,
         CASE WHEN vi.sista < p_idag THEN 'last' WHEN p_idag BETWEEN v.fran AND v.till THEN 'pagar' ELSE 'kommande' END AS status,
         (SELECT o.orsak FROM helikopter_veckoorsak o WHERE o.ar = p_ar AND o.manad = p_manad AND lower(o.typ) = lower(p_typ) AND o.isovecka = v.isovecka) AS orsak,
         COALESCE((SELECT jsonb_agg(jsonb_build_object('maskin_id', m.maskin_id, 'modell', dm.modell, 'roll', m.roll, 'volym', round(m.vol)) ORDER BY m.roll, m.vol DESC)
                   FROM mask m LEFT JOIN dim_maskin dm ON dm.maskin_id = m.maskin_id
                   WHERE m.iso_ar = v.iso_ar AND m.isovecka = v.isovecka), '[]'::jsonb) AS maskiner
  FROM veckor v
  JOIN vinfo vi ON vi.iso_ar = v.iso_ar AND vi.isovecka = v.isovecka
  JOIN vol ON vol.iso_ar = v.iso_ar AND vol.isovecka = v.isovecka
  ORDER BY v.fran;
$$;

-- ---------------------------------------------------------------------------
-- 3. helikopter_ny_spar: + oskotat_objekt = de två öppna objekten (ej
--    skotningsavslutade) med mest oskotat just nu (alla perioder), per typ och
--    bolagsurval: [{namn, oskotat}]. Övrigt oförändrat från 20260908100000.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS helikopter_ny_spar(int, int, date);
CREATE FUNCTION helikopter_ny_spar(p_ar int, p_manad int, p_idag date DEFAULT CURRENT_DATE)
RETURNS TABLE (
  typ text, bas text, bestallt numeric, bolag text[],
  skordat numeric, skotat numeric,
  takt_skordat numeric, takt_skotat numeric, takt_dagar int, takt_fonster date[],
  oskotat_forandring_per_dag numeric, ingaende_oskotat numeric, oskotat_objekt jsonb)
LANGUAGE sql STABLE AS $$
  WITH man AS (SELECT make_date(p_ar, p_manad, 1) AS fran, (make_date(p_ar, p_manad, 1) + interval '1 month')::date AS till_excl),
  gangna AS (SELECT unnest(gangna_datum) AS d FROM helikopter_ny_arbetsdagar(p_ar, p_manad, p_idag) WHERE maskin_id IS NULL),
  fonster AS (SELECT d FROM gangna ORDER BY d DESC LIMIT 5),
  best AS (
    SELECT lower(btrim(b.typ)) AS typ, btrim(b.bolag) AS bolag, sum(b.volym) AS volym
    FROM bestallningar b WHERE b.ar = p_ar AND b.manad = p_manad
    GROUP BY 1, 2),
  typer AS (SELECT unnest(ARRAY['slutavverkning', 'gallring']) AS typ),
  baser AS (SELECT unnest(ARRAY['bestallt', 'totalt']) AS bas),
  dag AS (
    SELECT hd.* FROM helikopter_ny_dag hd, man WHERE hd.datum >= man.fran AND hd.datum < man.till_excl),
  rader AS (
    SELECT t.typ, bs.bas, d.datum, d.skordat, d.skotat
    FROM typer t CROSS JOIN baser bs
    JOIN dag d ON d.typ = t.typ
    WHERE bs.bas = 'totalt'
       OR EXISTS (SELECT 1 FROM best b WHERE b.typ = t.typ AND lower(b.bolag) = lower(d.bolag))),
  oppna AS (
    SELECT d.objekt_id, d.object_name, COALESCE(NULLIF(lower(btrim(d.huvudtyp)), ''), 'okänd') AS typ, NULLIF(btrim(d.bolag), '') AS bolag
    FROM dim_objekt d
    WHERE d.skotning_avslutad IS NULL AND COALESCE(d.skotning_avslutad_auto, false) = false),
  obj_oskotat AS (
    SELECT o.objekt_id, o.object_name, o.typ, o.bolag,
           GREATEST(
             COALESCE((SELECT sum(p.volym_m3sub) FROM fakt_produktion p, man WHERE p.objekt_id = o.objekt_id AND p.datum < man.fran), 0)
           - COALESCE((SELECT sum(l.volym_m3sub) FROM fakt_lass l, man WHERE l.objekt_id = o.objekt_id AND l.datum < man.fran), 0), 0) AS oskotat_ingaende,
           GREATEST(
             COALESCE((SELECT sum(p.volym_m3sub) FROM fakt_produktion p WHERE p.objekt_id = o.objekt_id), 0)
           - COALESCE((SELECT sum(l.volym_m3sub) FROM fakt_lass l WHERE l.objekt_id = o.objekt_id), 0), 0) AS oskotat_nu
    FROM oppna o),
  ingaende AS (
    SELECT t.typ, bs.bas, COALESCE(sum(oo.oskotat_ingaende), 0) AS oskotat
    FROM typer t CROSS JOIN baser bs
    LEFT JOIN obj_oskotat oo ON oo.typ = t.typ
      AND (bs.bas = 'totalt' OR EXISTS (SELECT 1 FROM best b WHERE b.typ = t.typ AND lower(b.bolag) = lower(oo.bolag)))
    GROUP BY t.typ, bs.bas),
  topp AS (
    SELECT t.typ, bs.bas,
           COALESCE((SELECT jsonb_agg(jsonb_build_object('namn', x.object_name, 'oskotat', round(x.oskotat_nu)) ORDER BY x.oskotat_nu DESC)
                     FROM (SELECT oo.object_name, oo.oskotat_nu FROM obj_oskotat oo
                           WHERE oo.typ = t.typ AND oo.oskotat_nu > 0
                             AND (bs.bas = 'totalt' OR EXISTS (SELECT 1 FROM best b WHERE b.typ = t.typ AND lower(b.bolag) = lower(oo.bolag)))
                           ORDER BY oo.oskotat_nu DESC LIMIT 2) x), '[]'::jsonb) AS objekt
    FROM typer t CROSS JOIN baser bs),
  agg AS (
    SELECT t.typ, bs.bas,
           COALESCE(sum(r.skordat), 0) AS skordat,
           COALESCE(sum(r.skotat), 0) AS skotat,
           COALESCE(sum(r.skordat) FILTER (WHERE r.datum IN (SELECT d FROM fonster)), 0) AS f_skordat,
           COALESCE(sum(r.skotat)  FILTER (WHERE r.datum IN (SELECT d FROM fonster)), 0) AS f_skotat
    FROM typer t CROSS JOIN baser bs
    LEFT JOIN rader r ON r.typ = t.typ AND r.bas = bs.bas
    GROUP BY t.typ, bs.bas)
  SELECT a.typ, a.bas,
         COALESCE((SELECT sum(volym) FROM best b WHERE b.typ = a.typ), 0) AS bestallt,
         COALESCE((SELECT array_agg(b.bolag ORDER BY b.volym DESC, b.bolag) FROM best b WHERE b.typ = a.typ), '{}') AS bolag,
         a.skordat, a.skotat,
         CASE WHEN f.n > 0 THEN round(a.f_skordat / f.n, 1) END AS takt_skordat,
         CASE WHEN f.n > 0 THEN round(a.f_skotat  / f.n, 1) END AS takt_skotat,
         f.n::int AS takt_dagar,
         f.dagar AS takt_fonster,
         CASE WHEN f.n > 0 THEN round((a.f_skordat - a.f_skotat) / f.n, 1) END AS oskotat_forandring_per_dag,
         i.oskotat AS ingaende_oskotat,
         tp.objekt AS oskotat_objekt
  FROM agg a
  JOIN ingaende i ON i.typ = a.typ AND i.bas = a.bas
  JOIN topp tp ON tp.typ = a.typ AND tp.bas = a.bas
  CROSS JOIN (SELECT count(*) AS n, COALESCE(array_agg(d ORDER BY d), '{}') AS dagar FROM fonster) f
  ORDER BY a.typ, a.bas;
$$;

-- ---------------------------------------------------------------------------
-- 4. Din maskin: utgår från var maskinen SENAST producerade/lastade (senaste
--    fakt-raden per maskin_id; flera objekt samma dag → störst volym), inte från
--    tilldelningen. planerad_namn = tilldelat pågående objekt när det är ett annat.
--    Skördare: kvar = planerad volym (objekt.volym via vo) − skördat, NULL utan volym.
--    Skotare: kvar = skördat − skotat på objektet.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS helikopter_ny_maskin(text, date);
CREATE FUNCTION helikopter_ny_maskin(p_maskin_id text, p_idag date DEFAULT CURRENT_DATE)
RETURNS TABLE (roll text, objekt_id text, namn text, volym numeric, gjort numeric, kvar numeric,
               takt_per_dag numeric, takt_dagar int, nasta_namn text, planerad_namn text, senast_datum date)
LANGUAGE sql STABLE AS $$
  WITH m AS (
    SELECT CASE WHEN maskin_typ = 'Harvester' THEN 'skordare' WHEN maskin_typ = 'Forwarder' THEN 'skotare' END AS roll
    FROM dim_maskin WHERE maskin_id = p_maskin_id),
  senast AS (
    SELECT x.objekt_id, x.datum FROM (
      SELECT p.objekt_id, p.datum, sum(p.volym_m3sub) AS v FROM fakt_produktion p, m WHERE m.roll = 'skordare' AND p.maskin_id = p_maskin_id GROUP BY 1, 2
      UNION ALL
      SELECT l.objekt_id, l.datum, sum(l.volym_m3sub) FROM fakt_lass l, m WHERE m.roll = 'skotare' AND l.maskin_id = p_maskin_id GROUP BY 1, 2
    ) x ORDER BY x.datum DESC, x.v DESC LIMIT 1),
  dobj AS (
    SELECT d.objekt_id, d.object_name, NULLIF(btrim(d.vo_nummer), '') AS vo FROM dim_objekt d JOIN senast s ON s.objekt_id = d.objekt_id),
  dims AS (
    SELECT d2.objekt_id FROM dim_objekt d2, dobj
    WHERE d2.objekt_id = dobj.objekt_id OR (dobj.vo IS NOT NULL AND btrim(d2.vo_nummer) = dobj.vo)),
  planvol AS (
    SELECT o.volym::numeric AS v FROM objekt o, dobj
    WHERE dobj.vo IS NOT NULL AND btrim(o.vo_nummer) = dobj.vo AND o.volym IS NOT NULL
    ORDER BY o.ar DESC NULLS LAST, o.manad DESC NULLS LAST LIMIT 1),
  vol AS (
    SELECT COALESCE((SELECT sum(volym_m3sub) FROM fakt_produktion WHERE objekt_id IN (SELECT objekt_id FROM dims)), 0) AS skordat,
           COALESCE((SELECT sum(volym_m3sub) FROM fakt_lass       WHERE objekt_id IN (SELECT objekt_id FROM dims)), 0) AS skotat),
  kal AS (
    SELECT unnest(gangna_datum) AS d FROM (
      SELECT gangna_datum
      FROM helikopter_ny_arbetsdagar(extract(year FROM p_idag)::int, extract(month FROM p_idag)::int, p_idag)
      WHERE maskin_id = p_maskin_id OR maskin_id IS NULL
      ORDER BY maskin_id NULLS LAST LIMIT 1) k),
  fonster AS (SELECT d FROM kal ORDER BY d DESC LIMIT 5),
  takt AS (
    SELECT count(*) AS n,
           CASE WHEN (SELECT roll FROM m) = 'skordare'
                THEN COALESCE((SELECT sum(volym_m3sub) FROM fakt_produktion WHERE maskin_id = p_maskin_id AND datum IN (SELECT d FROM fonster)), 0)
                ELSE COALESCE((SELECT sum(volym_m3sub) FROM fakt_lass       WHERE maskin_id = p_maskin_id AND datum IN (SELECT d FROM fonster)), 0)
           END AS vol
    FROM fonster),
  tilldelad AS (
    SELECT o.namn, NULLIF(btrim(o.vo_nummer), '') AS vo FROM objekt o, m
    WHERE o.status = 'pagaende'
      AND ((m.roll = 'skordare' AND o.skordare_maskin_id = p_maskin_id) OR (m.roll = 'skotare' AND o.skotare_maskin_id = p_maskin_id))
    ORDER BY o.ar NULLS LAST, o.manad NULLS LAST, o.ordning NULLS LAST, o.namn
    LIMIT 1),
  nasta AS (
    SELECT o.namn FROM objekt o, m
    WHERE o.status = 'planerad'
      AND ((m.roll = 'skordare' AND o.skordare_maskin_id = p_maskin_id) OR (m.roll = 'skotare' AND o.skotare_maskin_id = p_maskin_id))
    ORDER BY o.ar NULLS LAST, o.manad NULLS LAST, o.ordning NULLS LAST, o.namn
    LIMIT 1)
  SELECT m.roll, dobj.objekt_id, dobj.object_name,
         (SELECT v FROM planvol) AS volym,
         CASE WHEN m.roll = 'skordare' THEN vol.skordat ELSE vol.skotat END AS gjort,
         CASE WHEN m.roll = 'skordare'
              THEN CASE WHEN (SELECT v FROM planvol) IS NOT NULL THEN GREATEST((SELECT v FROM planvol) - vol.skordat, 0) END
              ELSE GREATEST(vol.skordat - vol.skotat, 0) END AS kvar,
         CASE WHEN takt.n > 0 THEN round(takt.vol / takt.n, 1) END AS takt_per_dag,
         takt.n::int AS takt_dagar,
         (SELECT namn FROM nasta) AS nasta_namn,
         CASE WHEN (SELECT vo FROM tilldelad) IS DISTINCT FROM dobj.vo THEN (SELECT namn FROM tilldelad) END AS planerad_namn,
         (SELECT datum FROM senast) AS senast_datum
  FROM m JOIN dobj ON true CROSS JOIN vol CROSS JOIN takt;
$$;

-- ---------------------------------------------------------------------------
-- 5. Auto-avslut av skotning: öppna objekt (skotning_avslutad NULL, ej _auto)
--    som har produktion, där senaste fakt_produktion.datum OCH senaste
--    fakt_lass.datum båda är äldre än p_dagar (14) → skotning_avslutad_auto = true.
--    Objekt utan lass alls räknas som "inga lass på 14 dagar". Returnerar det
--    som stängdes. SECURITY DEFINER; bara service_role/cron får köra.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION helikopter_auto_avslut_skotning(p_idag date DEFAULT CURRENT_DATE, p_dagar int DEFAULT 14)
RETURNS TABLE (objekt_id text, object_name text, senast_produktion date, senast_lass date)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  WITH kand AS (
    SELECT d.objekt_id, d.object_name,
           (SELECT max(p.datum) FROM fakt_produktion p WHERE p.objekt_id = d.objekt_id) AS sp,
           (SELECT max(l.datum) FROM fakt_lass l WHERE l.objekt_id = d.objekt_id) AS sl
    FROM dim_objekt d
    WHERE d.skotning_avslutad IS NULL AND COALESCE(d.skotning_avslutad_auto, false) = false),
  stang AS (
    UPDATE dim_objekt d
       SET skotning_avslutad_auto = true
      FROM kand k
     WHERE d.objekt_id = k.objekt_id
       AND k.sp IS NOT NULL AND k.sp < p_idag - p_dagar
       AND COALESCE(k.sl, DATE '1900-01-01') < p_idag - p_dagar
    RETURNING d.objekt_id, k.object_name, k.sp, k.sl)
  SELECT * FROM stang ORDER BY 2;
$$;
REVOKE ALL ON FUNCTION helikopter_auto_avslut_skotning(date, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION helikopter_auto_avslut_skotning(date, int) TO service_role;

-- Nattlig körning via pg_cron (finns i projektet sedan 20260421). Namngivet jobb = upsert.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('helikopter_auto_avslut_skotning', '20 3 * * *', 'SELECT public.helikopter_auto_avslut_skotning()');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Rättigheter för de nya/ersatta funktionerna
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION helikopter_ny_veckor(int, int, text, date), helikopter_ny_spar(int, int, date), helikopter_ny_maskin(text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION helikopter_ny_veckor(int, int, text, date), helikopter_ny_spar(int, int, date), helikopter_ny_maskin(text, date) TO authenticated;
