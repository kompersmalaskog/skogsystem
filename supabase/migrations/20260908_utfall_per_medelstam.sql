-- Utfall per medelstam: vad kan man vänta sig vid en given medelstam?
--
-- Ett kalkylunderlag för att värdera en post FÖRE köp — inte en uppföljning
-- av vem som köpt vad. Därför finns inget bolag i svaret: underlaget räcker
-- inte för en jämförelse mellan inköpare, och skillnaderna som syns är
-- skillnader i skogen, inte i skickligheten.
--
-- Per objekt: medelstam = volym per stam, och timmer-, kubb- och massaandel
-- av objektets volym. Bara huvudtyp Slutavverkning, bara objekt med minst
-- p_min_stammar stammar. Hemved räknas inte in — på GRUPPEN, aldrig på
-- namnet — vare sig i volymen eller i medelstammen.
--
-- Objekten grupperas i medelstamsklasser om 0,1 från 0,2 till 0,8. Per
-- klass: antal objekt, median och spann (min–max) för varje andel. Spannet
-- är lika viktigt som medianen: vid samma stamstorlek har objekt fallit ut
-- tio procentenheter isär i timmer. Objekten i klassen sorteras på
-- timmerandel så kanterna syns.
--
-- Talet uppdaterar sig självt när fler objekt kommer in: ingen tabell,
-- ingen förberäkning. 23 objekt idag, tre till fem per klass —
-- fingervisning, inte facit, och det ska stå på skärmen.
CREATE OR REPLACE FUNCTION utfall_per_medelstam(p_min_stammar int DEFAULT 200)
RETURNS jsonb LANGUAGE sql STABLE AS $f$
WITH per_objekt AS (
  SELECT v.objekt_id, o.object_name AS namn,
         min(v.tidpunkt)::date AS forsta,
         count(DISTINCT (v.maskin_id, v.stem_key)) AS stammar,
         sum(v.volym_m3sub) AS volym,
         coalesce(sum(v.volym_m3sub) FILTER (WHERE k.grupp = 'Timmer'), 0) AS timmer,
         coalesce(sum(v.volym_m3sub) FILTER (WHERE k.grupp = 'Kubb'),   0) AS kubb,
         coalesce(sum(v.volym_m3sub) FILTER (WHERE k.grupp = 'Massa'),  0) AS massa
  FROM vy_skordarmatt_stock v
  JOIN dim_objekt o ON o.objekt_id = v.objekt_id
  LEFT JOIN vy_sortiment_klass k ON k.sortiment_id = v.sortiment_id
  WHERE o.huvudtyp = 'Slutavverkning'
    AND coalesce(k.grupp, '') <> 'Hemved'
  GROUP BY 1, 2
),
urval AS (
  SELECT p.*,
         volym / stammar AS medelstam,
         100 * timmer / volym AS timmer_pct,
         100 * kubb   / volym AS kubb_pct,
         100 * massa  / volym AS massa_pct,
         floor(volym / stammar * 10)::int AS i
  FROM per_objekt p
  WHERE stammar >= p_min_stammar AND volym > 0
),
klasser AS (SELECT generate_series(2, 7) AS i),
per_klass AS (
  SELECT k.i, count(u.objekt_id) AS antal,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY u.timmer_pct) AS t_med, min(u.timmer_pct) AS t_min, max(u.timmer_pct) AS t_max,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY u.kubb_pct)   AS k_med, min(u.kubb_pct)   AS k_min, max(u.kubb_pct)   AS k_max,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY u.massa_pct)  AS m_med, min(u.massa_pct)  AS m_min, max(u.massa_pct)  AS m_max
  FROM klasser k LEFT JOIN urval u ON u.i = k.i
  GROUP BY k.i
)
SELECT jsonb_build_object(
  'min_stammar', p_min_stammar,
  'antal_objekt', (SELECT count(*) FROM urval WHERE i BETWEEN 2 AND 7),
  'utanfor', (SELECT count(*) FROM urval WHERE i NOT BETWEEN 2 AND 7),
  'sedan_ar', (SELECT min(extract(year FROM forsta))::int FROM urval),
  'klasser', (SELECT jsonb_agg(jsonb_build_object(
      'fran', round(pk.i / 10.0, 1), 'till', round((pk.i + 1) / 10.0, 1), 'antal', pk.antal,
      'timmer', jsonb_build_object('median', round(pk.t_med::numeric, 1), 'min', round(pk.t_min::numeric, 1), 'max', round(pk.t_max::numeric, 1)),
      'kubb',   jsonb_build_object('median', round(pk.k_med::numeric, 1), 'min', round(pk.k_min::numeric, 1), 'max', round(pk.k_max::numeric, 1)),
      'massa',  jsonb_build_object('median', round(pk.m_med::numeric, 1), 'min', round(pk.m_min::numeric, 1), 'max', round(pk.m_max::numeric, 1)),
      'objekt', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'objekt_id', u.objekt_id, 'namn', u.namn,
          'medelstam', round(u.medelstam::numeric, 2),
          'timmer', round(u.timmer_pct::numeric, 1), 'kubb', round(u.kubb_pct::numeric, 1), 'massa', round(u.massa_pct::numeric, 1),
          'stammar', u.stammar, 'volym', round(u.volym::numeric, 0), 'forsta', u.forsta)
        ORDER BY u.timmer_pct DESC, u.namn)
        FROM urval u WHERE u.i = pk.i), '[]'::jsonb))
    ORDER BY pk.i) FROM per_klass pk)
);
$f$;

COMMENT ON FUNCTION utfall_per_medelstam(int) IS
  'Kalkylunderlag: timmer-, kubb- och massaandel per medelstamsklass (0,1 från 0,2 till 0,8) över slutavverkningsobjekt med minst p_min_stammar stammar. Hemved exkluderad på gruppen. Median OCH spann per klass — spannet får aldrig döljas. Inget bolag: ingen jämförelse mellan inköpare. Läser vy_skordarmatt_stock, aldrig fakt_sortiment.';
