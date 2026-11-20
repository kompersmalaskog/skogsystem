-- Nivå 1 och nivå 2 visade olika tal för samma objekt: listan 4,07 för
-- Åbogen i augusti, objektskärmen 3,97. Båda var rätt — nivå 1 räknar månad,
-- nivå 2 räknade hela objektet — men ingenting på skärmen förklarade varför
-- de skilde sig. En växling löser det i stället för att välja bort det ena.
--
-- Månaden är FÖRVALD och ärvs från raden man tryckte på, så första talet man
-- ser är det man kom från.
--
-- Växlingen styr HELA skärmen — medellängd, volym, 3 m-stockar, sågbart,
-- avkap, trädslag och längdfördelning. Ett halvt omfång (rubriken för
-- månaden, resten för objektet) vore samma tankelucka en nivå ner.
--
-- Åbogen RP 2026, verifierat mot prod:
--   augusti        4,07 m   31,1 m³   3 m-stock 37 st    bandet 57, varav 37
--   hela objektet  3,97 m  126,7 m³   3 m-stock 192 st   bandet 266, varav 192
--
-- Månadslistan i botten är borta; perioden står som text under objekttalet.
-- Har objektet bara en månad göms växlingen — den har inget att välja mellan
-- — och då visas perioden ändå, annars stod talet utan angiven period.
--
-- mal_m heter nu onskad_medellangd_m. Bekräftat med Vida: 4,6 m är en ÖNSKAD
-- medellängd i vältan, inte ett avtalat golv. Därför står golv = 0 i
-- kravprofil, och därför gäller samma tal alla fyra kombinationer av åtgärd
-- och välta — bruket ser bara vältan.

DROP FUNCTION IF EXISTS massaved_niva2(text);

CREATE OR REPLACE FUNCTION massaved_niva2(p_objekt_id text, p_manad date DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE AS $n2$
WITH klass AS MATERIALIZED (
  SELECT ds.sortiment_id, ds.namn,
         COALESCE(normalisera('grupp', ds.produktgrupp), sg.grupp,
                  harled_produktgrupp(ds.namn)) AS grupp
  FROM dim_sortiment ds
  LEFT JOIN dim_sortiment_grupp sg ON sg.sortiment_id = ds.sortiment_id
),
-- Objektets HELA period, oberoende av valt omfång. Bär växlingen: finns bara
-- en månad har den inget att välja mellan och göms.
alla_manader AS (
  SELECT to_char(date_trunc('month', tidpunkt),'YYYY-MM') AS manad
  FROM detalj_stam WHERE objekt_id = p_objekt_id AND tidpunkt IS NOT NULL
  GROUP BY 1
),
-- Omfånget filtreras på STAMMEN, aldrig på stocken: fönsterfunktionen måste
-- se hela stammen för att veta var första sågbara stocken satt. Objektfiltret
-- ligger dessutom före fönstret av samma skäl som månadsfiltret i
-- massaved_rader — annars kan predikatet inte tryckas ner under det.
stam AS MATERIALIZED (
  SELECT sm.maskin_id, sm.stam_key, sm.objekt_id, sm.tradslag_id, sm.tidpunkt
  FROM detalj_stam sm
  WHERE sm.objekt_id = p_objekt_id AND sm.tidpunkt IS NOT NULL
    AND (p_manad IS NULL
         OR (sm.tidpunkt >= date_trunc('month', p_manad)
         AND sm.tidpunkt <  date_trunc('month', p_manad) + interval '1 month'))
),
stock AS (
  SELECT st.maskin_id, st.log_key, st.langd_cm, st.volym_m3sub, st.toppdia_ub_mm,
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
-- HPR-fönstret när det finns, härlett när det inte gör det. kalla följer med
-- ut till skärmen — "ur maskinen" och "härlett" får inte se likadana ut.
fonster AS MATERIALIZED (
  SELECT DISTINCT ds.namn, k.grupp,
         COALESCE(o.langd_min_cm, h.langd_min_cm)     AS langd_min_cm,
         o.langd_max_cm                               AS langd_max_cm,
         COALESCE(o.dia_min_top_mm, h.dia_min_mm)     AS dia_min_mm,
         COALESCE(o.dia_max_mm, h.dia_max_harledd_mm) AS dia_max_mm,
         CASE WHEN o.sortiment_id IS NOT NULL THEN 'hpr' ELSE 'harledd' END AS kalla
  FROM (SELECT DISTINCT sortiment_id FROM stock) s
  JOIN dim_sortiment ds     ON ds.sortiment_id = s.sortiment_id
  JOIN vy_sortiment_klass k ON k.sortiment_id  = s.sortiment_id
  LEFT JOIN vy_sagbart_fonster_harlett h ON h.sortiment_id = s.sortiment_id
  LEFT JOIN dim_objekt_sortiment_fonster o
         ON o.sortiment_id = s.sortiment_id AND o.objekt_id = p_objekt_id
  WHERE k.grupp IN ('Timmer','Kubb')
    AND COALESCE(o.dia_min_top_mm, h.dia_min_mm) IS NOT NULL
),
massa AS MATERIALIZED (
  SELECT s.*,
         (s.forsta_sagbar IS NOT NULL AND s.log_key < s.forsta_sagbar AND s.langd_cm < 320) AS ar_tre_m,
         -- Hela fönstret: längd OCH diameter. Inte bara diameter.
         EXISTS (SELECT 1 FROM fonster f
                  WHERE s.langd_cm >= f.langd_min_cm
                    AND (f.langd_max_cm IS NULL OR s.langd_cm <= f.langd_max_cm)
                    AND s.toppdia_ub_mm BETWEEN f.dia_min_mm AND f.dia_max_mm) AS sagbar
  FROM stock s
  WHERE s.grupp = 'Massa' AND lower(COALESCE(s.sortnamn,'')) NOT LIKE '%hemved%'
),
-- ETT pass över massan i stället för ett dussin skalära subselects. Utan
-- detta skannades CTE:n om per tal och spillde till temp på stora objekt:
-- 3 231 ms och 24 091 temp-block blev 2 518 ms och 16 082 (objekt 11177558,
-- 49 986 stockar, mätt som authenticated).
summa AS (
  SELECT SUM(volym_m3sub) AS m3, SUM(langd_cm*volym_m3sub) AS langdvol,
         COALESCE(SUM(volym_m3sub) FILTER (WHERE ar_tre_m),0) AS tre_m3,
         COALESCE(COUNT(*)        FILTER (WHERE ar_tre_m),0) AS tre_st,
         SUM(langd_cm*volym_m3sub) FILTER (WHERE NOT ar_tre_m) AS langdvol_utan,
         SUM(volym_m3sub)          FILTER (WHERE NOT ar_tre_m) AS m3_utan,
         COALESCE(SUM(volym_m3sub) FILTER (WHERE sagbar),0) AS sagbar_m3,
         COALESCE(SUM(volym_m3sub) FILTER (WHERE forsta_sagbar IS NULL AND langd_cm < 320),0) AS usm3,
         COALESCE(COUNT(*)         FILTER (WHERE forsta_sagbar IS NULL AND langd_cm < 320),0) AS usst
  FROM massa
),
per_sortiment AS (
  SELECT f.namn, f.grupp, f.langd_min_cm, f.langd_max_cm, f.dia_min_mm, f.dia_max_mm, f.kalla,
         COALESCE((SELECT SUM(m.volym_m3sub) FROM massa m
                    WHERE m.langd_cm >= f.langd_min_cm
                      AND (f.langd_max_cm IS NULL OR m.langd_cm <= f.langd_max_cm)
                      AND m.toppdia_ub_mm BETWEEN f.dia_min_mm AND f.dia_max_mm),0) AS m3
  FROM fonster f
),
tradslag_agg AS (
  SELECT CASE WHEN m.sortnamn = 'Massa: BmavFall_V3'     THEN 'Barr'
              WHEN m.sortnamn = 'Massa: BjörkmavFall_V3' THEN 'Björk'
              ELSE 'Övrig massaved' END AS valta,
         COALESCE(initcap(lower(dt.namn)),'Okänt trädslag') AS tradslag,
         SUM(m.volym_m3sub) AS m3fub,
         SUM(m.langd_cm*m.volym_m3sub)/NULLIF(SUM(m.volym_m3sub),0)/100 AS medellangd_m,
         COALESCE(SUM(m.volym_m3sub) FILTER (WHERE m.sagbar),0) AS sagbar_m3
  FROM massa m LEFT JOIN dim_tradslag dt ON dt.tradslag_id = m.tradslag_id
  GROUP BY 1,2
),
valta_agg AS (
  SELECT valta, SUM(m3fub) AS m3fub,
         SUM(medellangd_m*m3fub)/NULLIF(SUM(m3fub),0) AS medellangd_m,
         COUNT(*)::int AS antal_tradslag,
         jsonb_agg(jsonb_build_object('namn', tradslag, 'm3fub', ROUND(m3fub,1),
           'medellangd_m', ROUND(medellangd_m,2),
           'sagbar_m3', ROUND(sagbar_m3,1)) ORDER BY m3fub DESC) AS tradslag
  FROM tradslag_agg GROUP BY valta
),
-- Bandet bär sitt EGET varav-tal, så 57 och 37 står i samma rad i stället
-- för att motsäga varandra från var sin del av skärmen.
langd_agg AS (
  SELECT klass, ordning, niva, SUM(volym_m3sub) AS m3, COUNT(*)::int AS st,
         COUNT(*) FILTER (WHERE ar_tre_m)::int AS varav_tre_m_st,
         100*SUM(volym_m3sub)/NULLIF(SUM(SUM(volym_m3sub)) OVER (),0) AS andel
  FROM (
    SELECT volym_m3sub, ar_tre_m,
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
avkap AS (
  SELECT CASE WHEN s.langd_cm < 50 THEN '3 dm' ELSE '6 dm' END AS kap,
         COUNT(*)::int AS st, SUM(s.volym_m3sub) AS m3
  FROM stock s JOIN dim_sortiment ds ON ds.sortiment_id = s.sortiment_id
  WHERE ds.namn LIKE 'Energi: Avkap%' GROUP BY 1
)
SELECT jsonb_build_object(
  'objekt_id', p_objekt_id,
  'namn',   (SELECT object_name FROM dim_objekt WHERE objekt_id = p_objekt_id),
  'status', (SELECT CASE WHEN skotning_avslutad IS NOT NULL THEN 'Avslutat'
                         WHEN skordning_avslutad IS NOT NULL THEN 'Skördat, väntar skotning'
                         ELSE 'Pågår' END FROM dim_objekt WHERE objekt_id = p_objekt_id),
  'omfang', CASE WHEN p_manad IS NULL THEN 'objekt' ELSE 'manad' END,
  'manad',  to_char(date_trunc('month', p_manad),'YYYY-MM'),
  'manader', COALESCE((SELECT jsonb_agg(manad ORDER BY manad) FROM alla_manader),'[]'::jsonb),
  'period_fran', (SELECT MIN(manad) FROM alla_manader),
  'period_till', (SELECT MAX(manad) FROM alla_manader),
  'onskad_medellangd_m', massaved_mal(),
  'medellangd_m', ROUND(s.langdvol/NULLIF(s.m3,0)/100,2),
  'total_m3fub',  ROUND(COALESCE(s.m3,0),1),
  'tre_m_stock', jsonb_build_object(
     'm3fub', ROUND(s.tre_m3,1), 'st', s.tre_st,
     'andel', ROUND(100*s.tre_m3/NULLIF(s.m3,0),1),
     'medellangd_utan_m3', ROUND(s.langdvol_utan/NULLIF(s.m3_utan,0)/100,2)),
  'sagbar', jsonb_build_object(
     'm3fub', ROUND(s.sagbar_m3,1),
     'andel', ROUND(100*s.sagbar_m3/NULLIF(s.m3,0),1),
     'sortiment', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'namn', namn, 'grupp', grupp, 'langd_min_m', ROUND(langd_min_cm/100.0,2),
          'langd_max_m', ROUND(langd_max_cm/100.0,2),
          'dia_min_mm', dia_min_mm, 'dia_max_mm', dia_max_mm, 'kalla', kalla,
          'm3fub', ROUND(m3,1)) ORDER BY grupp, namn) FROM per_sortiment), '[]'::jsonb),
     -- Sortimentsraderna överlappar; totalen räknar varje bit en gång.
     'antal_ur_maskinen', (SELECT COUNT(*) FROM fonster WHERE kalla='hpr'),
     'antal_harledda',    (SELECT COUNT(*) FROM fonster WHERE kalla='harledd'),
     'overlapp_m3', ROUND(GREATEST(COALESCE((SELECT SUM(m3) FROM per_sortiment),0) - s.sagbar_m3, 0),1)),
  'valtor', COALESCE((SELECT jsonb_agg(jsonb_build_object('valta', valta, 'm3fub', ROUND(m3fub,1),
      'medellangd_m', ROUND(medellangd_m,2), 'antal_tradslag', antal_tradslag,
      'tradslag', tradslag) ORDER BY valta) FROM valta_agg), '[]'::jsonb),
  'langdfordelning', COALESCE((SELECT jsonb_agg(jsonb_build_object('klass', klass,
      'ordning', ordning, 'niva', niva, 'm3fub', ROUND(m3,1), 'st', st,
      'varav_tre_m_st', varav_tre_m_st, 'andel', ROUND(andel,1)) ORDER BY ordning)
      FROM langd_agg), '[]'::jsonb),
  'avkap', jsonb_build_object(
     'st',    COALESCE((SELECT SUM(st) FROM avkap),0),
     'm3fub', ROUND(COALESCE((SELECT SUM(m3) FROM avkap),0),2),
     'delar', COALESCE((SELECT jsonb_agg(jsonb_build_object('kap', kap, 'st', st,
                'm3fub', ROUND(m3,2)) ORDER BY kap) FROM avkap), '[]'::jsonb)),
  'hemved_m3', ROUND(COALESCE((SELECT SUM(volym_m3sub) FROM stock
       WHERE grupp='Massa' AND lower(COALESCE(sortnamn,'')) LIKE '%hemved%'),0),1),
  'massa_utan_sagbar_stock_m3', ROUND(s.usm3,1),
  'massa_utan_sagbar_stock_st', s.usst
) FROM summa s;
$n2$;

COMMENT ON FUNCTION massaved_niva2(text, date) IS
  'Nivå 2. p_manad NULL = hela objektet, annars den månaden. Omfånget filtreras på STAMMEN, aldrig på stocken — fönsterfunktionen måste se hela stammen för att veta var första sågbara stocken satt. manader/period_fran/period_till gäller alltid HELA objektet oavsett omfång, för de bär växlingen.';
