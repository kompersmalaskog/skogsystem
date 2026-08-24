-- Massavedens längd som egen sida, tre nivåer — en fråga per nivå.
--
--   nivå 1  vilka objekt är korta?
--   nivå 2  varför är just det här objektet kort?
--   nivå 3  vilka rader byggdes talet av?
--
-- Basvyn äger definitionen; nivå 1 aggregerar bort trädslaget, nivå 2
-- använder det. EN definition, inte tre.
--
-- BEGREPPEN, som inte får blandas ihop:
--
--   3 M-STOCK = massavedsstock kapad till 3 m för att ta bort röta. Ligger
--   INUTI massavedsvolymen och är det som drar ner medellängden. Härledd,
--   inte avläst: biten är kort, sitter före första timmer- eller kubbstocken
--   på stammen, och blev massaved. kvalitet_kod är NULL på samtliga stockar
--   — maskinen har inte mätt röta, så beslutet syns bara i kapmönstret.
--
--   AVKAP = kapposten ur prislistan, 3 dm eller 6 dm. Eget sortiment
--   (Energi: Avkap*) och ligger UTANFÖR massavedsvolymen. Påverkar alltså
--   inte medellängden. Uppmätt: 3 dm-klustret 11–47 cm, 6 dm-klustret
--   60–66 cm, gapet 48–59 cm tomt.
--
-- Kravet på sågbar stock är bärande: utan den finns inget kapbeslut att
-- avläsa, bara ett klent träd. De bitarna redovisas separat som
-- massa_utan_sagbar_stock och räknas ALDRIG som 3 m-stockar.
--
-- Uppmätt augusti 2026, Vida, korta massabitar (< 320 cm):
--   före sågbar stock       600 st  115,5 m³  -> 3 m-stock
--   stam utan sågbar stock  507 st   24,0 m³  -> egen post
--   massa EFTER sågbar stock 298 st  15,2 m³  -> vanlig massaved
-- Summan 115,5 + 24,0 är alltså INTE uttömmande. Den tredje kategorin är
-- vanlig massaved som råkar vara kort; den namnges inte och bakas inte in.
--
-- Predikatet är < 320 cm, inte 300–314. Skillnaden är mätt: 4 bitar och
-- 0,5 m³ i hela augusti, och ingen bit under 300 cm. Längdklassen i nivå 2
-- heter 3,00–3,14 för att det är där stockarna faktiskt ligger; predikatet
-- lämnas vidare eftersom en hårdare gräns inte ändrar något tal.
--
-- HEMVED exkluderas överallt — den går till markägaren, aldrig till bruket.
-- TIMMERDIMENSION = 3 m-stock med toppdiameter ub >= 180 mm (Vislandas gräns).

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
         AS medellangd_utan_tre_m_stock_m,
       COALESCE(SUM(s.volym_m3sub) FILTER (WHERE s.forsta_sagbar IS NOT NULL
                  AND s.log_key < s.forsta_sagbar AND s.langd_cm < 320),0) AS tre_m_stock_m3,
       COALESCE(COUNT(*) FILTER (WHERE s.forsta_sagbar IS NOT NULL
                  AND s.log_key < s.forsta_sagbar AND s.langd_cm < 320),0)::int AS tre_m_stock_st,
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
  'Massaved per objekt, månad, välta, trädslag och maskin. Hemved exkluderad. EN definition av 3 m-kedjan — nivå 1 aggregerar bort trädslaget, nivå 2 använder det.';

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

-- NIVÅ 2 — ett objekt. Ordningen är läsordningen: talet, sedan det som
-- förklarar talet, sedan det som bara ligger bredvid.
CREATE OR REPLACE FUNCTION massaved_niva2(p_objekt_id text, p_manad date)
RETURNS jsonb LANGUAGE sql STABLE AS $n2$
WITH r AS (SELECT * FROM massaved_rader(p_manad) WHERE objekt_id = p_objekt_id),
gr AS (SELECT date_trunc('month',p_manad)::date AS fran,
              (date_trunc('month',p_manad)+interval '1 month')::date AS till),
bit AS (
  SELECT v.langd_cm, v.volym_m3sub, k.namn AS sortnamn, k.grupp, ds.namn AS dsnamn
  FROM vy_skordarmatt_stock v CROSS JOIN gr
  LEFT JOIN vy_sortiment_klass k ON k.sortiment_id = v.sortiment_id
  LEFT JOIN dim_sortiment ds ON ds.sortiment_id = v.sortiment_id
  WHERE v.objekt_id = p_objekt_id AND v.tidpunkt >= gr.fran AND v.tidpunkt < gr.till
),
massa AS (SELECT * FROM bit WHERE grupp='Massa' AND lower(COALESCE(sortnamn,'')) NOT LIKE '%hemved%'),
-- Klassgränsen går vid 4,60 — exakt vid målet, så färgen betyder det målet
-- säger och inte något i närheten av det.
--
-- Klasserna namnges efter LÄNGDEN, aldrig efter klassificeringen. Bandet
-- 300-314 rymmer även korta bitar som INTE är 3 m-stockar (sådana som sitter
-- efter en sågbar stock, eller kommer ur en stam utan sågbar stock). Hette
-- bandet "3 m-stock" stod dess 49,1 m³ bredvid kortets 46,3 m³ — två tal för
-- samma sak. Kortet ovanför bär 3 m-stocksiffran; bandet bär bara längden.
langd_agg AS (
  SELECT klass, ordning, niva, SUM(volym_m3sub) AS m3, COUNT(*)::int AS st,
         100*SUM(volym_m3sub)/NULLIF(SUM(SUM(volym_m3sub)) OVER (),0) AS andel
  FROM (
    SELECT volym_m3sub,
      CASE WHEN langd_cm < 300 THEN 'Under 3,00 m'
           WHEN langd_cm < 315 THEN '3,00–3,14 m'
           WHEN langd_cm < 350 THEN '3,15–3,49 m'
           WHEN langd_cm < 400 THEN '3,5–3,9 m'
           WHEN langd_cm < 460 THEN '4,0–4,59 m'
           WHEN langd_cm < 500 THEN '4,6–4,99 m'
           ELSE '5,0 m och över' END AS klass,
      CASE WHEN langd_cm < 300 THEN 0 WHEN langd_cm < 315 THEN 1 WHEN langd_cm < 350 THEN 2
           WHEN langd_cm < 400 THEN 3 WHEN langd_cm < 460 THEN 4
           WHEN langd_cm < 500 THEN 5 ELSE 6 END AS ordning,
      CASE WHEN langd_cm BETWEEN 300 AND 314 THEN 'tre_m'
           WHEN langd_cm < 460 THEN 'under_mal' ELSE 'over_mal' END AS niva
    FROM massa) x
  GROUP BY 1,2,3
),
-- Avkap ligger UTANFÖR massavedsvolymen: eget sortiment, egen post.
avkap AS (
  SELECT CASE WHEN langd_cm < 50 THEN '3 dm' ELSE '6 dm' END AS kap,
         COUNT(*)::int AS st, SUM(volym_m3sub) AS m3
  FROM bit WHERE dsnamn LIKE 'Energi: Avkap%' GROUP BY 1
),
valta_agg AS (
  SELECT valta, SUM(m3fub) AS m3fub,
         SUM(medellangd_m*m3fub)/NULLIF(SUM(m3fub),0) AS medellangd_m,
         COUNT(*)::int AS antal_tradslag,
         jsonb_agg(jsonb_build_object('namn', tradslag, 'm3fub', ROUND(m3fub,1),
           'medellangd_m', ROUND(medellangd_m,2),
           'timmerdimension_m3', ROUND(timmerdimension_m3,1)) ORDER BY m3fub DESC) AS tradslag
  FROM r GROUP BY valta
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
  'tre_m_stock', jsonb_build_object(
     'm3fub', ROUND(COALESCE((SELECT SUM(tre_m_stock_m3) FROM r),0),1),
     'st',    COALESCE((SELECT SUM(tre_m_stock_st) FROM r),0),
     'andel', ROUND(100*COALESCE((SELECT SUM(tre_m_stock_m3) FROM r),0)
                    /NULLIF((SELECT SUM(m3fub) FROM r),0),1),
     'medellangd_utan_m3', (SELECT ROUND(SUM(medellangd_utan_tre_m_stock_m*m3fub)/NULLIF(SUM(m3fub),0),2) FROM r)),
  'avkap', jsonb_build_object(
     'st',    COALESCE((SELECT SUM(st) FROM avkap),0),
     'm3fub', ROUND(COALESCE((SELECT SUM(m3) FROM avkap),0),2),
     'delar', COALESCE((SELECT jsonb_agg(jsonb_build_object('kap', kap, 'st', st,
                'm3fub', ROUND(m3,2)) ORDER BY kap) FROM avkap), '[]'::jsonb)),
  'valtor', COALESCE((SELECT jsonb_agg(jsonb_build_object('valta', valta, 'm3fub', ROUND(m3fub,1),
      'medellangd_m', ROUND(medellangd_m,2), 'antal_tradslag', antal_tradslag,
      'tradslag', tradslag) ORDER BY valta) FROM valta_agg), '[]'::jsonb),
  'langdfordelning', COALESCE((SELECT jsonb_agg(jsonb_build_object('klass', klass,
      'ordning', ordning, 'niva', niva, 'm3fub', ROUND(m3,1), 'st', st,
      'andel', ROUND(andel,1)) ORDER BY ordning) FROM langd_agg), '[]'::jsonb),
  'hemved_m3', ROUND(COALESCE((SELECT SUM(volym_m3sub) FROM bit
       WHERE grupp='Massa' AND lower(COALESCE(sortnamn,'')) LIKE '%hemved%'),0),1),
  'massa_utan_sagbar_stock_m3', ROUND(COALESCE((SELECT SUM(massa_utan_sagbar_stock_m3) FROM r),0),1),
  'massa_utan_sagbar_stock_st', COALESCE((SELECT SUM(massa_utan_sagbar_stock_st) FROM r),0)
);
$n2$;

COMMENT ON FUNCTION massaved_niva2(text, date) IS
  'Nivå 2: ett objekt — 3 m-stockar, avkap (3 dm/6 dm), trädslag med timmerdimension och längdfördelning. Klassgränsen ligger exakt på målet 4,60 m. Bär även fotnotsdata (hemved, massa utan sågbar stock).';

-- NIVÅ 3 — bitarna talet byggdes av. Inga aggregat, ingen tolkning.
--
-- WHERE appliceras FÖRE fönsterfunktionen. Låg grupp='Massa' i samma WHERE
-- som fönstret var timmerstockarna redan bortsållade när MIN() räknades:
-- forsta_sagbar blev alltid NULL och 3 m-flaggan alltid false — 0 av 196.
-- Aggregatet var rätt hela tiden, så felet syntes bara som en flagga som
-- aldrig tändes. Fönstret måste se HELA stammen; massafiltret kommer sedan.
CREATE OR REPLACE FUNCTION massaved_niva3(
  p_objekt_id text, p_manad date, p_valta text DEFAULT 'Barr', p_limit int DEFAULT 200
) RETURNS jsonb LANGUAGE sql STABLE AS $n3$
WITH gr AS (SELECT date_trunc('month',p_manad)::date AS fran,
                   (date_trunc('month',p_manad)+interval '1 month')::date AS till),
alla AS (
  SELECT v.stem_key, v.log_key, v.langd_cm, v.volym_m3sub, v.toppdia_ub_mm,
         v.tidpunkt, v.tradslag_id, k.grupp, ds.namn AS dsnamn,
         MIN(CASE WHEN k.grupp IN ('Timmer','Kubb') THEN v.log_key END)
           OVER (PARTITION BY v.maskin_id, v.stem_key, v.objekt_id) AS forsta_sagbar
  FROM vy_skordarmatt_stock v CROSS JOIN gr
  LEFT JOIN dim_sortiment ds     ON ds.sortiment_id = v.sortiment_id
  LEFT JOIN vy_sortiment_klass k ON k.sortiment_id  = v.sortiment_id
  WHERE v.objekt_id = p_objekt_id
    AND v.tidpunkt >= gr.fran AND v.tidpunkt < gr.till
),
b AS (
  SELECT a.*, COALESCE(initcap(lower(dt.namn)),'Okänt') AS tradslag,
         CASE WHEN a.dsnamn = 'Massa: BmavFall_V3' THEN 'Barr'
              WHEN a.dsnamn = 'Massa: BjörkmavFall_V3' THEN 'Björk'
              ELSE 'Övrig massaved' END AS valta
  FROM alla a LEFT JOIN dim_tradslag dt ON dt.tradslag_id = a.tradslag_id
  WHERE a.grupp = 'Massa' AND lower(COALESCE(a.dsnamn,'')) NOT LIKE '%hemved%'
)
SELECT jsonb_build_object(
  'objekt_id', p_objekt_id, 'valta', p_valta,
  'antal_totalt', (SELECT COUNT(*) FROM b WHERE valta = p_valta),
  'visas', LEAST(p_limit, (SELECT COUNT(*) FROM b WHERE valta = p_valta)),
  'bitar', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'stam', stem_key, 'bit', log_key,
      'langd_m', ROUND(langd_cm/100.0,2), 'volym_m3fub', ROUND(volym_m3sub,3),
      'toppdia_mm', toppdia_ub_mm, 'tradslag', tradslag,
      'dag', to_char(tidpunkt,'YYYY-MM-DD'),
      'tre_m_stock', (forsta_sagbar IS NOT NULL AND log_key < forsta_sagbar AND langd_cm < 320),
      'timmerdimension', (forsta_sagbar IS NOT NULL AND log_key < forsta_sagbar
                          AND langd_cm < 320 AND toppdia_ub_mm >= 180))
    ORDER BY langd_cm ASC, stem_key, log_key)
    FROM (SELECT * FROM b WHERE valta = p_valta ORDER BY langd_cm ASC LIMIT p_limit) x), '[]'::jsonb)
);
$n3$;

COMMENT ON FUNCTION massaved_niva3(text, date, text, int) IS
  'Nivå 3: enskilda massavedsbitar, kortast först. Finns för att kunna syna ett tal, inte för att läsas igenom. Verifierat mot aggregatet: 196 flaggade bitar och 46,3 m³ i båda leden för Ulfsnäs augusti 2026.';
