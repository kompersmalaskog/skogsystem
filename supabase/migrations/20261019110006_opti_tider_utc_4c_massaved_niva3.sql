CREATE OR REPLACE FUNCTION public.massaved_niva3(p_objekt_id text, p_valta text DEFAULT 'Barr'::text, p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
WITH klass AS MATERIALIZED (
  SELECT sortiment_id, namn, grupp FROM vy_sortiment_klass
),
stam AS MATERIALIZED (
  SELECT sm.maskin_id, sm.stam_key, sm.objekt_id, sm.tradslag_id, opti_tid_lokal(sm.tidpunkt, sm.tid_ar_utc) AS tidpunkt
  FROM detalj_stam sm WHERE sm.objekt_id = p_objekt_id AND sm.tidpunkt IS NOT NULL
),
alla AS (
  SELECT st.stem_key, st.log_key, st.langd_cm, st.volym_m3sub, st.toppdia_ub_mm,
         st.sortiment_id, sm.tradslag_id, sm.tidpunkt, k.grupp, k.namn AS sortnamn,
         MIN(CASE WHEN k.grupp IN ('Timmer','Kubb') THEN st.log_key END)
           OVER (PARTITION BY st.maskin_id, st.stem_key, st.objekt_id) AS forsta_sagbar
  FROM stam sm
  JOIN detalj_stock st
         ON st.objekt_id = sm.objekt_id AND st.maskin_id = sm.maskin_id
        AND st.stem_key  = sm.stam_key
        AND st.stem_key IS NOT NULL AND st.log_key IS NOT NULL
  LEFT JOIN klass k ON k.sortiment_id = st.sortiment_id
),
-- HPR-fonstret nar det finns, harlett nar det inte gor det. kalla foljer
-- med ut till skarmen: "ur maskinen" och "harlett" far inte se likadana ut.
fonster AS MATERIALIZED (
  SELECT DISTINCT ds.namn, k.grupp,
         COALESCE(o.langd_min_cm, h.langd_min_cm)     AS langd_min_cm,
         o.langd_max_cm                               AS langd_max_cm,
         COALESCE(o.dia_min_top_mm, h.dia_min_mm)     AS dia_min_mm,
         COALESCE(o.dia_max_mm, h.dia_max_harledd_mm) AS dia_max_mm,
         CASE WHEN o.sortiment_id IS NOT NULL THEN 'hpr' ELSE 'harledd' END AS kalla
  FROM (SELECT DISTINCT sortiment_id FROM alla) s
  JOIN dim_sortiment ds     ON ds.sortiment_id = s.sortiment_id
  JOIN vy_sortiment_klass k ON k.sortiment_id  = s.sortiment_id
  LEFT JOIN vy_sagbart_fonster_harlett h ON h.sortiment_id = s.sortiment_id
  LEFT JOIN dim_objekt_sortiment_fonster o
         ON o.sortiment_id = s.sortiment_id AND o.objekt_id = p_objekt_id
  WHERE k.grupp IN ('Timmer','Kubb')
    AND COALESCE(o.dia_min_top_mm, h.dia_min_mm) IS NOT NULL
),
b AS (
  SELECT a.*, COALESCE(initcap(lower(dt.namn)),'Okänt') AS tradslag,
         CASE WHEN a.sortnamn = 'Massa: BmavFall_V3'     THEN 'Barr'
              WHEN a.sortnamn = 'Massa: BjörkmavFall_V3' THEN 'Björk'
              ELSE 'Övrig massaved' END AS valta,
         EXISTS (SELECT 1 FROM fonster f
                  WHERE a.langd_cm >= f.langd_min_cm
                    AND (f.langd_max_cm IS NULL OR a.langd_cm <= f.langd_max_cm)
                    AND a.toppdia_ub_mm BETWEEN f.dia_min_mm AND f.dia_max_mm) AS sagbar
  FROM alla a LEFT JOIN dim_tradslag dt ON dt.tradslag_id = a.tradslag_id
  WHERE a.grupp = 'Massa'
)
SELECT jsonb_build_object(
  'objekt_id', p_objekt_id, 'valta', p_valta,
  'namn', (SELECT object_name FROM dim_objekt WHERE objekt_id = p_objekt_id),
  'antal_totalt', (SELECT COUNT(*) FROM b WHERE valta = p_valta),
  'visas', LEAST(p_limit, (SELECT COUNT(*) FROM b WHERE valta = p_valta)),
  'bitar', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'stam', stem_key, 'bit', log_key,
      'langd_m', ROUND(langd_cm/100.0,2), 'volym_m3fub', ROUND(volym_m3sub,3),
      'toppdia_mm', toppdia_ub_mm, 'tradslag', tradslag,
      'dag', to_char(tidpunkt,'YYYY-MM-DD'),
      'tre_m_stock', (forsta_sagbar IS NOT NULL AND log_key < forsta_sagbar AND langd_cm < 320),
      'sagbar', sagbar)
    ORDER BY langd_cm ASC, stem_key, log_key)
    FROM (SELECT * FROM b WHERE valta = p_valta ORDER BY langd_cm ASC LIMIT p_limit) x), '[]'::jsonb)
);
$function$;
