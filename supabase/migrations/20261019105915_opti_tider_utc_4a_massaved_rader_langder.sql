CREATE OR REPLACE FUNCTION public.massaved_rader(p_manad date)
 RETURNS TABLE(objekt_id text, valta text, tradslag text, maskin_id text, m3fub numeric, antal_bitar integer, medellangd_m numeric, medellangd_utan_tre_m_stock_m numeric, tre_m_stock_m3 numeric, tre_m_stock_st integer, timmerdimension_m3 numeric, massa_utan_sagbar_stock_m3 numeric, massa_utan_sagbar_stock_st integer)
 LANGUAGE sql
 STABLE
AS $function$
WITH gr AS (
  SELECT date_trunc('month', p_manad)::date AS fran,
         (date_trunc('month', p_manad) + interval '1 month')::date AS till
),
klass AS MATERIALIZED (
  SELECT sortiment_id, namn, grupp FROM vy_sortiment_klass
),
stam AS MATERIALIZED (
  SELECT sm.maskin_id, sm.stam_key, sm.objekt_id, sm.tradslag_id
  FROM detalj_stam sm CROSS JOIN gr
  WHERE opti_tid_lokal(sm.tidpunkt, sm.tid_ar_utc) >= gr.fran AND opti_tid_lokal(sm.tidpunkt, sm.tid_ar_utc) < gr.till
),
stock AS (
  SELECT st.objekt_id, st.maskin_id, st.log_key, st.langd_cm, st.volym_m3sub,
         st.toppdia_ub_mm, sm.tradslag_id, k.grupp, k.namn AS sortnamn,
         MIN(CASE WHEN k.grupp IN ('Timmer','Kubb') THEN st.log_key END)
           OVER (PARTITION BY st.maskin_id, st.stem_key, st.objekt_id) AS forsta_sagbar
  FROM stam sm
  JOIN detalj_stock st
         ON st.objekt_id = sm.objekt_id AND st.maskin_id = sm.maskin_id
        AND st.stem_key = sm.stam_key
        AND st.stem_key IS NOT NULL AND st.log_key IS NOT NULL
  LEFT JOIN klass k ON k.sortiment_id = st.sortiment_id
)
SELECT s.objekt_id,
       CASE WHEN s.sortnamn = 'Massa: BmavFall_V3'     THEN 'Barr'
            WHEN s.sortnamn = 'Massa: BjörkmavFall_V3' THEN 'Björk'
            ELSE 'Övrig massaved' END,
       COALESCE(initcap(lower(dt.namn)), 'Okänt trädslag'),
       s.maskin_id,
       SUM(s.volym_m3sub),
       COUNT(*)::int,
       SUM(s.langd_cm*s.volym_m3sub)/NULLIF(SUM(s.volym_m3sub),0)/100,
       SUM(s.langd_cm*s.volym_m3sub) FILTER (WHERE s.forsta_sagbar IS NULL OR s.log_key >= s.forsta_sagbar)
         / NULLIF(SUM(s.volym_m3sub) FILTER (WHERE s.forsta_sagbar IS NULL OR s.log_key >= s.forsta_sagbar),0)/100,
       COALESCE(SUM(s.volym_m3sub) FILTER (WHERE s.forsta_sagbar IS NOT NULL
                  AND s.log_key < s.forsta_sagbar AND s.langd_cm < 320),0),
       COALESCE(COUNT(*) FILTER (WHERE s.forsta_sagbar IS NOT NULL
                  AND s.log_key < s.forsta_sagbar AND s.langd_cm < 320),0)::int,
       COALESCE(SUM(s.volym_m3sub) FILTER (WHERE s.forsta_sagbar IS NOT NULL
                  AND s.log_key < s.forsta_sagbar AND s.langd_cm < 320
                  AND s.toppdia_ub_mm >= 180),0),
       COALESCE(SUM(s.volym_m3sub) FILTER (WHERE s.forsta_sagbar IS NULL AND s.langd_cm < 320),0),
       COALESCE(COUNT(*) FILTER (WHERE s.forsta_sagbar IS NULL AND s.langd_cm < 320),0)::int
FROM stock s
LEFT JOIN dim_tradslag dt ON dt.tradslag_id = s.tradslag_id
WHERE s.grupp = 'Massa'
GROUP BY 1,2,3,4;
$function$;

CREATE OR REPLACE FUNCTION public.massaved_langder(p_manad date, p_atgard text DEFAULT 'Slutavverkning'::text, p_bolag text DEFAULT 'Vida'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
WITH gransen AS (
  SELECT date_trunc('month', p_manad)::date AS fran,
         (date_trunc('month', p_manad) + interval '1 month')::date AS till
),
objekt AS (
  SELECT o.objekt_id FROM dim_objekt o
  WHERE o.bolag = p_bolag
    AND CASE WHEN p_atgard = 'Allt'
             THEN (o.huvudtyp IN ('Slutavverkning','Gallring') OR o.huvudtyp IS NULL)
             ELSE o.huvudtyp = p_atgard END
),
allt AS (
  SELECT v.volym_m3sub, v.langd_cm, v.log_key, v.toppdia_ub_mm,
         COALESCE(dt.namn, 'Okänt trädslag') AS tradslag,
         COALESCE(normalisera('massasortiment', k.namn), 'Övrig massaved') AS sortiment,
         (k.grupp = 'Hemved') AS ar_hemved
  FROM vy_skordarmatt_stock v
  JOIN objekt ob ON ob.objekt_id = v.objekt_id
  CROSS JOIN gransen gr
  LEFT JOIN vy_sortiment_klass k ON k.sortiment_id = v.sortiment_id
  LEFT JOIN dim_tradslag dt ON dt.tradslag_id = v.tradslag_id
  WHERE v.tidpunkt_lokal >= gr.fran AND v.tidpunkt_lokal < gr.till
    AND k.grupp IN ('Massa','Hemved')
),
m AS (SELECT * FROM allt WHERE NOT ar_hemved),
per AS (
  SELECT sortiment, tradslag,
         SUM(volym_m3sub) AS volym,
         SUM(langd_cm*volym_m3sub)/NULLIF(SUM(volym_m3sub),0)/10 AS dm,
         SUM(volym_m3sub) FILTER (WHERE langd_cm BETWEEN 290 AND 310) AS tre_m,
         SUM(volym_m3sub) FILTER (WHERE langd_cm BETWEEN 290 AND 310 AND log_key=1) AS rotkap,
         SUM(volym_m3sub) FILTER (WHERE langd_cm BETWEEN 290 AND 310 AND log_key=1
                                    AND toppdia_ub_mm >= 180) AS timmermatt
  FROM m GROUP BY 1,2
),
synliga AS (SELECT * FROM per WHERE volym >= 1),
sort_tot AS (
  SELECT sortiment, SUM(volym) AS volym FROM synliga GROUP BY 1 HAVING SUM(volym) >= 1
)
SELECT jsonb_build_object(
  'manad',  (SELECT to_char(fran,'YYYY-MM') FROM gransen),
  'atgard', p_atgard,
  'bolag',  p_bolag,
  'total_volym',   ROUND(COALESCE((SELECT SUM(volym_m3sub) FROM m),0)::numeric,1),
  'medellangd_dm', ROUND((SELECT SUM(langd_cm*volym_m3sub)/NULLIF(SUM(volym_m3sub),0)/10 FROM m)::numeric,1),
  'hemved_volym',  ROUND(COALESCE((SELECT SUM(volym_m3sub) FROM allt WHERE ar_hemved),0)::numeric,1),
  'sortiment', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'namn',  st.sortiment,
      'volym', ROUND(st.volym::numeric,0),
      'tradslag', (SELECT jsonb_agg(jsonb_build_object(
            'namn',         initcap(lower(sv.tradslag)),
            'volym',        ROUND(sv.volym::numeric,0),
            'dm',           ROUND(sv.dm::numeric,1),
            'tre_m_andel',  ROUND(100*COALESCE(sv.tre_m,0)::numeric/NULLIF(sv.volym,0)::numeric,1),
            'tre_m_volym',  ROUND(COALESCE(sv.tre_m,0)::numeric,0),
            'rotkap',       ROUND(COALESCE(sv.rotkap,0)::numeric,0),
            'timmermatt',   ROUND(COALESCE(sv.timmermatt,0)::numeric,0))
          ORDER BY sv.volym DESC)
        FROM synliga sv WHERE sv.sortiment = st.sortiment))
    ORDER BY st.volym DESC) FROM sort_tot st), '[]'::jsonb),
  'dolda_rader', (SELECT COUNT(*) FROM per WHERE volym < 1)
);
$function$;
