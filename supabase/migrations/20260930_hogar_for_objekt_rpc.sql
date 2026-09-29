-- Perf-gate för kartans produktionshögar: objekt över ~20 000 stammar klustras
-- SERVER-SIDE i stället för att ladda alla stammar till webbläsaren. Klientens
-- greedy-klustring är O(n²) och laddar varje stam; för mega-objekt (t.ex. framtida
-- slutavverkningar) skulle det hänga. Denna funktion gör en rutnäts-klustring
-- (~10 m celler, samma upplösning som klientens radie) och returnerar färdiga högar.
-- MapLibres clusterRadius sköter zoom-aggregeringen ovanpå, precis som i klient-vägen.
--
-- Returnerar per cell: centroid, total volym, antal stammar, antal GROT-stammar,
-- trädslag-fördelning (namn→antal) och sortiment-fördelning (sortiment→volym).
-- Klienten formaterar dem till samma feature-form som greedy-vägen (byggHog).
-- Totalvolymen är exakt oavsett rutnätet (varje stam räknas en gång).

CREATE OR REPLACE FUNCTION hogar_for_objekt(p_objekt_id text)
RETURNS TABLE (
  lat            double precision,
  lng            double precision,
  volym          numeric,
  stammar        integer,
  grot_stammar   integer,
  tradslag_json  jsonb,
  sortiment_json jsonb,
  datum          date
)
LANGUAGE sql
STABLE
AS $$
  WITH stam AS (
    SELECT
      ds.latitude,
      ds.longitude,
      COALESCE(ds.total_volym, 0) AS vol,
      COALESCE(dt.namn, 'OKÄNT')  AS tradslag,
      ds.sortiment,
      ds.bio_energy_adaption,
      ds.tidpunkt,
      -- ~10 m rutnät vid 56°N: 0.00009° lat, 0.00016° lng (klientens CLUSTER_RAD)
      floor(ds.latitude  / 0.00009)::bigint AS gy,
      floor(ds.longitude / 0.00016)::bigint AS gx
    FROM detalj_stam ds
    LEFT JOIN dim_tradslag dt ON dt.tradslag_id = ds.tradslag_id
    WHERE ds.objekt_id = p_objekt_id
      AND ds.latitude IS NOT NULL
      AND ds.longitude IS NOT NULL
  ),
  grp AS (
    SELECT
      gx, gy,
      avg(latitude)  AS lat,
      avg(longitude) AS lng,
      sum(vol)       AS volym,
      count(*)       AS stammar,
      count(*) FILTER (WHERE bio_energy_adaption IS NOT NULL) AS grot_stammar,
      max(tidpunkt)  AS tid
    FROM stam
    GROUP BY gx, gy
  ),
  ts AS (
    SELECT gx, gy, jsonb_object_agg(tradslag, c) AS j
    FROM (
      SELECT gx, gy, tradslag, count(*) AS c
      FROM stam GROUP BY gx, gy, tradslag
    ) x
    GROUP BY gx, gy
  ),
  so AS (
    SELECT gx, gy, jsonb_object_agg(sortiment, v) AS j
    FROM (
      SELECT gx, gy, sortiment, sum(vol) AS v
      FROM stam WHERE sortiment IS NOT NULL
      GROUP BY gx, gy, sortiment
    ) y
    GROUP BY gx, gy
  )
  SELECT
    grp.lat,
    grp.lng,
    round(grp.volym::numeric, 2) AS volym,
    grp.stammar::integer,
    grp.grot_stammar::integer,
    COALESCE(ts.j, '{}'::jsonb)  AS tradslag_json,
    COALESCE(so.j, '{}'::jsonb)  AS sortiment_json,
    grp.tid::date                AS datum
  FROM grp
  LEFT JOIN ts USING (gx, gy)
  LEFT JOIN so USING (gx, gy)
  WHERE grp.volym > 0.01;
$$;

GRANT EXECUTE ON FUNCTION hogar_for_objekt(text) TO anon, authenticated;
