-- Ett maskinnamn i hela appen: COALESCE(visningsnamn, modell, maskin_id).
-- helikopter_ny_veckor: maskiner-jsonb får nyckeln "namn" (modell ligger kvar).
-- helikopter_ny_maskiner: ny kolumn namn (modell ligger kvar). Signaturerna oförändrade.
-- Förutsätter 20260909100000 och 20260910100100.

CREATE OR REPLACE FUNCTION helikopter_ny_veckor(p_ar int, p_manad int, p_typ text, p_idag date DEFAULT CURRENT_DATE)
RETURNS TABLE (
  isovecka int, iso_ar int, fran date, till date,
  arbetsdagar int, arbetsdagar_kvar int, plan numeric,
  skordat numeric, skotat numeric, status text, orsak text, maskiner jsonb)
LANGUAGE sql STABLE AS $$
  WITH man AS (SELECT make_date(p_ar, p_manad, 1) AS fran, (make_date(p_ar, p_manad, 1) + interval '1 month')::date AS till_excl),
  ad AS (SELECT * FROM helikopter_ny_arbetsdagar(p_ar, p_manad, p_idag) WHERE maskin_id IS NULL),
  dagar AS (SELECT unnest(gangna_datum || kvar_datum) AS d FROM ad),
  best AS (
    SELECT btrim(b.bolag) AS bolag, sum(b.volym)::numeric AS volym  -- bestallningar.volym är double precision
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
         CASE WHEN (SELECT totalt FROM ad) > 0 THEN round((vi.arbetsdagar * (SELECT bv.v FROM bestallt bv) / (SELECT totalt FROM ad))::numeric, 0) END AS plan,
         vol.skordat, vol.skotat,
         CASE WHEN vi.sista < p_idag THEN 'last' WHEN p_idag BETWEEN v.fran AND v.till THEN 'pagar' ELSE 'kommande' END AS status,
         (SELECT o.orsak FROM helikopter_veckoorsak o WHERE o.ar = p_ar AND o.manad = p_manad AND lower(o.typ) = lower(p_typ) AND o.isovecka = v.isovecka) AS orsak,
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
                     'maskin_id', m.maskin_id,
                     'modell', dm.modell,
                     'namn', COALESCE(NULLIF(btrim(dm.visningsnamn), ''), dm.modell, m.maskin_id),
                     'roll', m.roll,
                     'volym', round(m.vol)) ORDER BY m.roll, m.vol DESC)
                   FROM mask m LEFT JOIN dim_maskin dm ON dm.maskin_id = m.maskin_id
                   WHERE m.iso_ar = v.iso_ar AND m.isovecka = v.isovecka), '[]'::jsonb) AS maskiner
  FROM veckor v
  JOIN vinfo vi ON vi.iso_ar = v.iso_ar AND vi.isovecka = v.isovecka
  JOIN vol ON vol.iso_ar = v.iso_ar AND vol.isovecka = v.isovecka
  ORDER BY v.fran;
$$;

DROP FUNCTION IF EXISTS helikopter_ny_maskiner(int, int, date);
CREATE FUNCTION helikopter_ny_maskiner(p_ar int, p_manad int, p_idag date DEFAULT CURRENT_DATE)
RETURNS TABLE (
  maskin_id text, modell text, namn text, roll text, volym_manad numeric,
  objekt_namn text, takt_per_dag numeric, takt_dagar int, oskotat_objekt numeric, senast_datum date)
LANGUAGE sql STABLE AS $$
  WITH man AS (SELECT make_date(p_ar, p_manad, 1) AS fran, (make_date(p_ar, p_manad, 1) + interval '1 month')::date AS till_excl),
  maskiner AS (
    SELECT m.maskin_id, m.modell,
           COALESCE(NULLIF(btrim(m.visningsnamn), ''), m.modell, m.maskin_id) AS namn,
           CASE WHEN m.maskin_typ = 'Harvester' THEN 'skordare' ELSE 'skotare' END AS roll
    FROM dim_maskin m
    WHERE m.maskin_typ IN ('Harvester', 'Forwarder')
      AND COALESCE(m.extramaskin, false) = false
      AND (m.aktiv_till IS NULL OR m.aktiv_till >= p_idag))
  SELECT mk.maskin_id, mk.modell, mk.namn, mk.roll,
         (CASE WHEN mk.roll = 'skordare'
               THEN COALESCE((SELECT sum(p.volym_m3sub) FROM fakt_produktion p, man WHERE p.maskin_id = mk.maskin_id AND p.datum >= man.fran AND p.datum < man.till_excl), 0)
               ELSE COALESCE((SELECT sum(l.volym_m3sub) FROM fakt_lass l, man WHERE l.maskin_id = mk.maskin_id AND l.datum >= man.fran AND l.datum < man.till_excl), 0)
          END)::numeric AS volym_manad,
         lage.namn AS objekt_namn,
         lage.takt_per_dag::numeric,
         lage.takt_dagar,
         (CASE WHEN mk.roll = 'skotare' THEN lage.kvar END)::numeric AS oskotat_objekt,
         lage.senast_datum
  FROM maskiner mk
  LEFT JOIN LATERAL helikopter_ny_maskin(mk.maskin_id, p_idag) lage ON true
  ORDER BY mk.roll, mk.namn;
$$;
REVOKE ALL ON FUNCTION helikopter_ny_maskiner(int, int, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION helikopter_ny_maskiner(int, int, date) TO authenticated;
