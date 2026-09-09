-- /helikopter Uppföljning, sektion MASKINER: alla aktiva maskiner i ett anrop.
-- Per maskin: månadens volym (m³fub, alla objekt), var maskinen senast producerade,
-- takt (samma 5-dagarsfönster som helikopter_ny_maskin — anropas per rad via
-- LATERAL så talen är identiska med "Din maskin"), och för skotare oskotat på
-- det objektet. Aktiv = Harvester/Forwarder, inte extramaskin, aktiv_till ej passerad.
DROP FUNCTION IF EXISTS helikopter_ny_maskiner(int, int, date);
CREATE FUNCTION helikopter_ny_maskiner(p_ar int, p_manad int, p_idag date DEFAULT CURRENT_DATE)
RETURNS TABLE (
  maskin_id text, modell text, roll text, volym_manad numeric,
  objekt_namn text, takt_per_dag numeric, takt_dagar int, oskotat_objekt numeric, senast_datum date)
LANGUAGE sql STABLE AS $$
  WITH man AS (SELECT make_date(p_ar, p_manad, 1) AS fran, (make_date(p_ar, p_manad, 1) + interval '1 month')::date AS till_excl),
  maskiner AS (
    SELECT m.maskin_id, m.modell,
           CASE WHEN m.maskin_typ = 'Harvester' THEN 'skordare' ELSE 'skotare' END AS roll
    FROM dim_maskin m
    WHERE m.maskin_typ IN ('Harvester', 'Forwarder')
      AND COALESCE(m.extramaskin, false) = false
      AND (m.aktiv_till IS NULL OR m.aktiv_till >= p_idag))
  SELECT mk.maskin_id, mk.modell, mk.roll,
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
  ORDER BY mk.roll, mk.modell;
$$;
REVOKE ALL ON FUNCTION helikopter_ny_maskiner(int, int, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION helikopter_ny_maskiner(int, int, date) TO authenticated;
