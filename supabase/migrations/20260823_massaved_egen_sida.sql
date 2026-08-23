-- Massavedens längd som egen sida, tre nivåer — en fråga per nivå.
--
--   nivå 1  vilka objekt är korta?
--   nivå 2  varför är just det här objektet kort?
--   nivå 3  vilka rader byggdes talet av?
--
-- Basvyn vy_massaved_rad äger rotkedjedefinitionen; nivå 1 aggregerar bort
-- trädslaget, nivå 2 använder det. EN definition, inte tre.
--
-- ROTKEDJA = sammanhängande massabitar från stammens början fram till första
-- timmer- eller kubbstocken. ROTKAP = sådan bit kortare än 320 cm, och
-- KRÄVER att stammen fått en sågbar stock — rotkap är ett kapbeslut för att
-- nå sågbart virke. Har stammen ingen sågbar stock finns inget beslut att
-- avläsa, bara ett klent träd; de bitarna redovisas som
-- massa_utan_sagbar_stock och ordet rotkap förekommer inte i fältnamnet.
--
-- Uppmätt augusti 2026, Vida, korta massabitar (< 320 cm):
--   rotkedja före sågbar stock   600 st  115,5 m³  -> rotkap
--   stam utan sågbar stock       507 st   24,0 m³  -> egen post
--   massa EFTER sågbar stock     298 st   15,2 m³  -> vanlig massaved
-- Summan 115,5 + 24,0 är alltså INTE uttömmande. Den tredje kategorin är
-- vanlig massaved som råkar vara kort; den namnges inte och bakas inte in.
--
-- HEMVED exkluderas överallt — den går till markägaren, aldrig till bruket.
-- TIMMERDIMENSION = rotkapsbit med toppdiameter ub >= 180 mm (Vislandas gräns).

CREATE OR REPLACE VIEW vy_massaved_rad
WITH (security_invoker = true) AS
WITH stock AS (
  SELECT v.objekt_id, v.maskin_id, v.stem_key, v.log_key, v.langd_cm, v.volym_m3sub,
         v.toppdia_ub_mm, v.tidpunkt, v.tradslag_id, k.grupp, ds.namn AS sortnamn,
         MIN(CASE WHEN k.grupp IN ('Timmer','Kubb') THEN v.log_key END)
           OVER (PARTITION BY v.maskin_id, v.stem_key, v.objekt_id) AS forsta_sagbar
  FROM vy_skordarmatt_stock v
  LEFT JOIN dim_sortiment ds     ON ds.sortiment_id = v.sortiment_id
  LEFT JOIN vy_sortiment_klass k ON k.sortiment_id  = v.sortiment_id
  WHERE v.tidpunkt IS NOT NULL
)
SELECT s.objekt_id,
       date_trunc('month', s.tidpunkt)::date AS manad,
       CASE WHEN s.sortnamn = 'Massa: BmavFall_V3'     THEN 'Barr'
            WHEN s.sortnamn = 'Massa: BjörkmavFall_V3' THEN 'Björk'
            ELSE 'Övrig massaved' END AS valta,
       COALESCE(initcap(lower(dt.namn)), 'Okänt trädslag') AS tradslag,
       s.maskin_id,
       SUM(s.volym_m3sub)                                   AS m3fub,
       COUNT(*)::int                                        AS antal_bitar,
       SUM(s.langd_cm*s.volym_m3sub)/NULLIF(SUM(s.volym_m3sub),0)/100 AS medellangd_m,
       SUM(s.langd_cm*s.volym_m3sub) FILTER (WHERE s.forsta_sagbar IS NULL OR s.log_key >= s.forsta_sagbar)
         / NULLIF(SUM(s.volym_m3sub) FILTER (WHERE s.forsta_sagbar IS NULL OR s.log_key >= s.forsta_sagbar),0)/100
         AS medellangd_utan_rotkedja_m,
       COALESCE(SUM(s.volym_m3sub) FILTER (WHERE s.forsta_sagbar IS NOT NULL
                  AND s.log_key < s.forsta_sagbar AND s.langd_cm < 320),0) AS rotkap_m3,
       COALESCE(COUNT(*) FILTER (WHERE s.forsta_sagbar IS NOT NULL
                  AND s.log_key < s.forsta_sagbar AND s.langd_cm < 320),0)::int AS rotkap_st,
       COALESCE(SUM(s.volym_m3sub) FILTER (WHERE s.forsta_sagbar IS NOT NULL
                  AND s.log_key < s.forsta_sagbar AND s.langd_cm < 320
                  AND s.toppdia_ub_mm >= 180),0) AS timmerdimension_m3,
       COALESCE(SUM(s.volym_m3sub) FILTER (WHERE s.forsta_sagbar IS NULL AND s.langd_cm < 320),0)
         AS massa_utan_sagbar_stock_m3,
       COALESCE(COUNT(*) FILTER (WHERE s.forsta_sagbar IS NULL AND s.langd_cm < 320),0)::int
         AS massa_utan_sagbar_stock_st
FROM stock s
LEFT JOIN dim_tradslag dt ON dt.tradslag_id = s.tradslag_id
WHERE s.grupp = 'Massa'
  AND lower(COALESCE(s.sortnamn,'')) NOT LIKE '%hemved%'
GROUP BY 1,2,3,4,5;

COMMENT ON VIEW vy_massaved_rad IS
  'Massaved per objekt, månad, välta, trädslag och maskin. Hemved exkluderad. EN definition av rotkedjan — nivå 1 aggregerar bort trädslaget, nivå 2 använder det.';

-- ── NIVÅ 1 ───────────────────────────────────────────────────────────────
-- Objekt utan bolag räknas INTE in i rubriktalet men göms inte heller — de
-- returneras separat. Marie Krokshult vindf har bolag NULL, inte bara
-- huvudtyp NULL som först antogs.
CREATE OR REPLACE FUNCTION massaved_niva1(p_manad date, p_valta text DEFAULT 'Barr')
RETURNS jsonb LANGUAGE sql STABLE AS $n1$
WITH rad AS (
  SELECT r.objekt_id, o.object_name AS namn, o.bolag,
         CASE WHEN o.skotning_avslutad  IS NOT NULL THEN 'Avslutat'
              WHEN o.skordning_avslutad IS NOT NULL THEN 'Skördat, väntar skotning'
              ELSE 'Pågår' END AS status,
         SUM(r.m3fub) AS m3fub,
         SUM(r.medellangd_m*r.m3fub)/NULLIF(SUM(r.m3fub),0) AS medellangd_m,
         string_agg(DISTINCT r.maskin_id, ', ') AS maskiner
  FROM vy_massaved_rad r
  JOIN dim_objekt o ON o.objekt_id = r.objekt_id
  WHERE r.manad = date_trunc('month', p_manad)::date AND r.valta = p_valta
  GROUP BY 1,2,3,4
),
vida AS (SELECT * FROM rad WHERE bolag = 'Vida'),
utan AS (SELECT * FROM rad WHERE bolag IS NULL)
SELECT jsonb_build_object(
  'manad', to_char(date_trunc('month', p_manad),'YYYY-MM'),
  'valta', p_valta,
  'mal_m', massaved_mal(),
  'medellangd_m', (SELECT ROUND(SUM(medellangd_m*m3fub)/NULLIF(SUM(m3fub),0),2) FROM vida),
  'total_m3fub', ROUND(COALESCE((SELECT SUM(m3fub) FROM vida),0),1),
  'antal_objekt', (SELECT COUNT(*) FROM vida),
  'antal_under_mal', (SELECT COUNT(*) FROM vida WHERE medellangd_m < massaved_mal()),
  'objekt', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'objekt_id', objekt_id, 'namn', namn, 'status', status,
      'medellangd_m', ROUND(medellangd_m,2), 'm3fub', ROUND(m3fub,1), 'maskiner', maskiner)
    ORDER BY medellangd_m ASC) FROM vida), '[]'::jsonb),
  'utan_bolag', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'objekt_id', objekt_id, 'namn', namn, 'status', status,
      'medellangd_m', ROUND(medellangd_m,2), 'm3fub', ROUND(m3fub,1), 'maskiner', maskiner)
    ORDER BY medellangd_m ASC) FROM utan), '[]'::jsonb)
);
$n1$;

COMMENT ON FUNCTION massaved_niva1(date, text) IS
  'Nivå 1: objektlista, kortast först. Objekt utan bolag returneras separat — inte inräknade i rubriktalet, men inte gömda.';

-- ── NIVÅ 2 ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION massaved_niva2(p_objekt_id text, p_manad date)
RETURNS jsonb LANGUAGE sql STABLE AS $n2$
WITH r AS (
  SELECT * FROM vy_massaved_rad
  WHERE objekt_id = p_objekt_id AND manad = date_trunc('month', p_manad)::date
),
langd AS (
  SELECT CASE WHEN v.langd_cm < 350 THEN 'Under 3,5 m' WHEN v.langd_cm < 400 THEN '3,5–3,9 m'
              WHEN v.langd_cm < 450 THEN '4,0–4,4 m'   WHEN v.langd_cm < 500 THEN '4,5–4,9 m'
              WHEN v.langd_cm < 550 THEN '5,0–5,4 m'   ELSE '5,5 m och över' END AS klass,
         CASE WHEN v.langd_cm < 350 THEN 1 WHEN v.langd_cm < 400 THEN 2
              WHEN v.langd_cm < 450 THEN 3 WHEN v.langd_cm < 500 THEN 4
              WHEN v.langd_cm < 550 THEN 5 ELSE 6 END AS ordning,
         v.volym_m3sub
  FROM vy_skordarmatt_stock v
  LEFT JOIN vy_sortiment_klass k ON k.sortiment_id = v.sortiment_id
  WHERE v.objekt_id = p_objekt_id AND k.grupp = 'Massa'
    AND lower(COALESCE(k.namn,'')) NOT LIKE '%hemved%'
    AND date_trunc('month', v.tidpunkt)::date = date_trunc('month', p_manad)::date
),
langd_agg AS (
  SELECT klass, ordning, SUM(volym_m3sub) AS m3,
         100*SUM(volym_m3sub)/NULLIF(SUM(SUM(volym_m3sub)) OVER (),0) AS andel
  FROM langd GROUP BY 1,2
),
valta_agg AS (
  SELECT valta, SUM(m3fub) AS m3fub,
         SUM(medellangd_m*m3fub)/NULLIF(SUM(m3fub),0) AS medellangd_m,
         jsonb_agg(jsonb_build_object(
           'namn', tradslag, 'm3fub', ROUND(m3fub,1),
           'medellangd_m', ROUND(medellangd_m,2),
           'rotkap_m3', ROUND(rotkap_m3,1),
           'timmerdimension_m3', ROUND(timmerdimension_m3,1)) ORDER BY m3fub DESC) AS tradslag
  FROM r GROUP BY valta
),
hemved AS (
  SELECT COALESCE(SUM(v.volym_m3sub),0) AS m3 FROM vy_skordarmatt_stock v
  LEFT JOIN vy_sortiment_klass k ON k.sortiment_id = v.sortiment_id
  WHERE v.objekt_id = p_objekt_id AND k.grupp='Massa'
    AND lower(COALESCE(k.namn,'')) LIKE '%hemved%'
    AND date_trunc('month', v.tidpunkt)::date = date_trunc('month', p_manad)::date
),
avk AS (
  SELECT COALESCE(SUM(v.volym_m3sub),0) AS m3, COUNT(*)::int AS st
  FROM vy_skordarmatt_stock v JOIN dim_sortiment ds ON ds.sortiment_id=v.sortiment_id
  WHERE v.objekt_id = p_objekt_id
    AND ds.namn IN ('Energi: AvkapGran_V3','Energi: AvkapTall_V3')
    AND date_trunc('month', v.tidpunkt)::date = date_trunc('month', p_manad)::date
)
SELECT jsonb_build_object(
  'objekt_id', p_objekt_id,
  'namn',   (SELECT object_name FROM dim_objekt WHERE objekt_id = p_objekt_id),
  'status', (SELECT CASE WHEN skotning_avslutad IS NOT NULL THEN 'Avslutat'
                         WHEN skordning_avslutad IS NOT NULL THEN 'Skördat, väntar skotning'
                         ELSE 'Pågår' END FROM dim_objekt WHERE objekt_id = p_objekt_id),
  'manad', to_char(date_trunc('month', p_manad),'YYYY-MM'),
  'mal_m', massaved_mal(),
  'medellangd_m', (SELECT ROUND(SUM(medellangd_m*m3fub)/NULLIF(SUM(m3fub),0),2) FROM r),
  'total_m3fub',  ROUND(COALESCE((SELECT SUM(m3fub) FROM r),0),1),
  'valtor', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'valta', valta, 'm3fub', ROUND(m3fub,1),
      'medellangd_m', ROUND(medellangd_m,2), 'tradslag', tradslag) ORDER BY valta)
    FROM valta_agg), '[]'::jsonb),
  'langdfordelning', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'klass', klass, 'ordning', ordning, 'm3fub', ROUND(m3,1), 'andel', ROUND(andel,1))
    ORDER BY ordning) FROM langd_agg), '[]'::jsonb),
  'hemved_m3', ROUND((SELECT m3 FROM hemved),1),
  'massa_utan_sagbar_stock_m3', ROUND(COALESCE((SELECT SUM(massa_utan_sagbar_stock_m3) FROM r),0),1),
  'massa_utan_sagbar_stock_st', COALESCE((SELECT SUM(massa_utan_sagbar_stock_st) FROM r),0),
  'avkap_m3', ROUND((SELECT m3 FROM avk),2),
  'avkap_st', (SELECT st FROM avk)
);
$n2$;

COMMENT ON FUNCTION massaved_niva2(text, date) IS
  'Nivå 2: ett objekt — vältor, trädslag med rotkap och timmerdimension, längdfördelning. Bär även fotnotsdata (hemved, massa utan sågbar stock, avkap).';

-- ── NIVÅ 3 ───────────────────────────────────────────────────────────────
-- Finns endast för när ett tal ifrågasätts. Inga aggregat, ingen tolkning.
CREATE OR REPLACE FUNCTION massaved_niva3(
  p_objekt_id text, p_manad date, p_valta text DEFAULT 'Barr', p_limit int DEFAULT 200
) RETURNS jsonb LANGUAGE sql STABLE AS $n3$
WITH b AS (
  SELECT v.stem_key, v.log_key, v.langd_cm, v.volym_m3sub, v.toppdia_ub_mm,
         COALESCE(initcap(lower(dt.namn)),'Okänt') AS tradslag, v.tidpunkt,
         MIN(CASE WHEN k.grupp IN ('Timmer','Kubb') THEN v.log_key END)
           OVER (PARTITION BY v.maskin_id, v.stem_key, v.objekt_id) AS forsta_sagbar,
         CASE WHEN ds.namn = 'Massa: BmavFall_V3' THEN 'Barr'
              WHEN ds.namn = 'Massa: BjörkmavFall_V3' THEN 'Björk'
              ELSE 'Övrig massaved' END AS valta
  FROM vy_skordarmatt_stock v
  LEFT JOIN dim_sortiment ds     ON ds.sortiment_id = v.sortiment_id
  LEFT JOIN vy_sortiment_klass k ON k.sortiment_id  = v.sortiment_id
  LEFT JOIN dim_tradslag dt      ON dt.tradslag_id  = v.tradslag_id
  WHERE v.objekt_id = p_objekt_id AND k.grupp = 'Massa'
    AND lower(COALESCE(ds.namn,'')) NOT LIKE '%hemved%'
    AND date_trunc('month', v.tidpunkt)::date = date_trunc('month', p_manad)::date
)
SELECT jsonb_build_object(
  'objekt_id', p_objekt_id, 'valta', p_valta,
  'antal_totalt', (SELECT COUNT(*) FROM b WHERE valta = p_valta),
  'visas', LEAST(p_limit, (SELECT COUNT(*) FROM b WHERE valta = p_valta)),
  'bitar', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'stam', stem_key, 'bit', log_key,
      'langd_m', ROUND(langd_cm/100.0,2),
      'volym_m3fub', ROUND(volym_m3sub,3),
      'toppdia_mm', toppdia_ub_mm, 'tradslag', tradslag,
      'dag', to_char(tidpunkt,'YYYY-MM-DD'),
      'rotkap', (forsta_sagbar IS NOT NULL AND log_key < forsta_sagbar AND langd_cm < 320),
      'timmerdimension', (forsta_sagbar IS NOT NULL AND log_key < forsta_sagbar
                          AND langd_cm < 320 AND toppdia_ub_mm >= 180))
    ORDER BY langd_cm ASC, stem_key, log_key)
    FROM (SELECT * FROM b WHERE valta = p_valta ORDER BY langd_cm ASC LIMIT p_limit) x), '[]'::jsonb)
);
$n3$;

COMMENT ON FUNCTION massaved_niva3(text, date, text, int) IS
  'Nivå 3: bitarna talet byggdes av, kortast först. Endast för när ett tal ifrågasätts.';
