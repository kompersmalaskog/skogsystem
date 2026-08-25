-- Tre fel i massavedsvyn, alla verifierade mot prod innan de rättades.
--
-- ── 1. "Sågbar dimension" räknade bara toppdiameter ──────────────────────
-- Ett sortiment kräver BÅDA gränserna. Åbogen körde exakt två sågbara
-- sortiment, och deras fönster är:
--   Kubb: Alvesta305_V3      >= 305 cm  och  123-220 mm
--   Timmer: Vislanda_195_1-2 >= 372 cm  och  180-440 mm
-- Gamla testet var "toppdia >= 123", alltså minsta diametergränsen i hela
-- prislistan utan hänsyn till längd:
--   enbart diameter   88,6 m³   70 %   <- fel
--   hela fönstret     35,2 m³   28 %   <- rätt
-- av 126,7 m³ massaved.
--
-- Fönstren scopas till de sortiment objektet FAKTISKT körde. Annars svarar
-- talet på fel fråga: "Klentimmer: Krylbo305" (>= 305 cm, >= 100 mm) finns i
-- prislistan och släpper igenom 101 av 126,7 m³ på ett objekt som aldrig
-- körde det sortimentet.
--
-- ÖVRE DIAMETERGRÄNS FINNS INTE I dim_sortiment_pris. Den härleds ur högsta
-- prisklassens undre gräns. Det är en approximation och den är INTE marginell
-- här: 62,8 m³ av Åbogens massaved är grövre än kubbtaket 220 mm. Känslighet,
-- samma objekt, bara taket flyttat:
--   tak 220 -> 35,2 m³ (27,8 %)      tak 260 -> 47,2 m³ (37,3 %)
--   tak 240 -> 41,6 m³ (32,9 %)      tak 300 -> 56,9 m³ (44,9 %)
-- Timmertaket 440 biter inte alls (grövsta massabiten är 429 mm). Det är
-- alltså KUBBTAKET ensamt som bär osäkerheten.
--
-- AVGJORT MOT HPR-FILEN (Åbogen RP 2026_PONS20SDJAA270231_20260803094447.hpr).
-- Maskinens egen apteringsdefinition har både undre OCH övre gränser:
--
--   Alvesta305_V3 (Kubb)     DiameterMINTop 123  DiameterClassMAX 260
--                            LengthClassLowerLimit 305  LengthClassMAX 325
--   Vislanda_195_1-2 (Timmer) DiameterMINTop 180  DiameterClassMAX 650
--                            LengthClass 372..606       LengthClassMAX 620
--
-- Två fel i den härledda modellen, och de drar åt olika håll:
--   diametertaket är 260, inte 220        kubb 23,7 -> 40,7 m³
--   OCH kubb har ett LÄNGDTAK på 325 cm   kubb 40,7 -> 12,9 m³
-- Kubb är en fastlängdsprodukt: 305-325 cm, och systerprodukten
-- Alvesta275_V3 är 275-295. Samma fönster i fyra objekt och två maskiner.
-- "langd >= 305 utan tak" var alltså strukturellt fel, inte fel i kanten.
--
-- Rätt svar för Åbogen blir 30,3 m³ = 23,9 %, inte 35,2 = 27,8 %.
--
-- BERÄKNINGEN ÄR INTE ÄNDRAD HÄR. Gränserna måste importeras först, och det
-- beslutet är Martins. Tills dess skriver vyn ut taket på skärmen med ordet
-- "härlett", så att antagandet syns i stället för att gömmas i procenttalet.
--
-- ── 2. Två tal för samma sak på samma skärm ──────────────────────────────
-- Kortet visade 37 st / 7,1 m³, längdklassen 3,00-3,14 visade 57 st / 8,8 m³.
-- Båda var rätt, för olika saker. Uppdelningen av bandet (Åbogen augusti):
--   före sågbar stock      37 st  7,1 m³  = 3 m-stock, kapbeslutet
--   efter sågbar stock     20 st  1,7 m³  = vanlig massaved som är 3 m lång
--   stam utan sågbar stock  0 st  0,0 m³
-- Längdfördelningen MÅSTE summera till totalen, så bandet kan inte visa 37.
-- I stället bär bandet nu sitt eget varav-tal, så att 57 och 37 står i
-- samma rad och förklarar varandra i stället för att motsäga varandra.
--
-- ── 3. Nivå 2 visade bara vald månad ─────────────────────────────────────
-- Åbogen är avslutat men visade 31,1 av 126,7 m³ — en fjärdedel, och den
-- bättre fjärdedelen (4,07 m mot objektets 3,97 m). Objektet är enheten:
--   hela objektet  3,97 m  126,7 m³
--   juli           3,93 m   95,6 m³
--   augusti        4,07 m   31,1 m³
-- Månaderna blir en lista i botten. Nivå 1 behåller månaden — där är den
-- rätt frågan, för då jämför man objekt med varandra.

-- Sortimentens fönster. Ett sortiment kan ha flera längd- och diameter-
-- klasser; det som gäller för "ryms den?" är den lägsta av varje, plus det
-- härledda taket.
CREATE OR REPLACE VIEW vy_sagbart_fonster
WITH (security_invoker = true) AS
SELECT p.sortiment_id, ds.namn, k.grupp,
       MIN(p.langd_min_cm) AS langd_min_cm,
       MIN(p.dia_min_mm)   AS dia_min_mm,
       MAX(p.dia_min_mm)   AS dia_max_harledd_mm
FROM dim_sortiment_pris p
JOIN dim_sortiment ds     ON ds.sortiment_id = p.sortiment_id
JOIN vy_sortiment_klass k ON k.sortiment_id  = p.sortiment_id
WHERE k.grupp IN ('Timmer','Kubb')
GROUP BY p.sortiment_id, ds.namn, k.grupp;

COMMENT ON VIEW vy_sagbart_fonster IS
  'Längd- och diameterfönster per sågbart sortiment. dia_max_harledd_mm är INTE en riktig övre gräns — den är högsta prisklassens undre gräns, eftersom dim_sortiment_pris saknar övre gränser.';

-- NIVÅ 2 — objektet, inte månaden.
DROP FUNCTION IF EXISTS massaved_niva2(text, date);
CREATE OR REPLACE FUNCTION massaved_niva2(p_objekt_id text)
RETURNS jsonb LANGUAGE sql STABLE AS $n2$
WITH klass AS MATERIALIZED (
  SELECT ds.sortiment_id, ds.namn,
         COALESCE(normalisera('grupp', ds.produktgrupp), sg.grupp,
                  harled_produktgrupp(ds.namn)) AS grupp
  FROM dim_sortiment ds
  LEFT JOIN dim_sortiment_grupp sg ON sg.sortiment_id = ds.sortiment_id
),
-- Objektfiltret före fönsterfunktionen, av samma skäl som månadsfiltret i
-- massaved_rader: annars kan predikatet inte tryckas ner under fönstret.
stam AS MATERIALIZED (
  SELECT sm.maskin_id, sm.stam_key, sm.objekt_id, sm.tradslag_id, sm.tidpunkt
  FROM detalj_stam sm
  WHERE sm.objekt_id = p_objekt_id AND sm.tidpunkt IS NOT NULL
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
-- Bara de sågbara sortiment som DETTA objekt faktiskt körde. DISTINCT på
-- fönstret, inte på sortiment_id: dim_sortiment har en rad per maskin, så
-- samma sortiment finns i flera exemplar med identiskt fönster.
fonster AS MATERIALIZED (
  SELECT DISTINCT f.namn, f.grupp, f.langd_min_cm, f.dia_min_mm, f.dia_max_harledd_mm
  FROM vy_sagbart_fonster f
  WHERE f.sortiment_id IN (SELECT DISTINCT sortiment_id FROM stock)
),
massa AS MATERIALIZED (
  SELECT s.*,
         (s.forsta_sagbar IS NOT NULL AND s.log_key < s.forsta_sagbar AND s.langd_cm < 320) AS ar_tre_m,
         -- Hela fönstret: längd OCH diameter. Inte bara diameter.
         EXISTS (SELECT 1 FROM fonster f
                  WHERE s.langd_cm >= f.langd_min_cm
                    AND s.toppdia_ub_mm BETWEEN f.dia_min_mm AND f.dia_max_harledd_mm) AS sagbar
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
  SELECT f.namn, f.grupp, f.langd_min_cm, f.dia_min_mm, f.dia_max_harledd_mm,
         COALESCE((SELECT SUM(m.volym_m3sub) FROM massa m
                    WHERE m.langd_cm >= f.langd_min_cm
                      AND m.toppdia_ub_mm BETWEEN f.dia_min_mm AND f.dia_max_harledd_mm),0) AS m3
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
manad_agg AS (
  SELECT to_char(date_trunc('month', tidpunkt),'YYYY-MM') AS manad,
         SUM(volym_m3sub) AS m3fub,
         SUM(langd_cm*volym_m3sub)/NULLIF(SUM(volym_m3sub),0)/100 AS medellangd_m
  FROM massa GROUP BY 1
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
  'mal_m', massaved_mal(),
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
          'dia_min_mm', dia_min_mm, 'dia_max_mm', dia_max_harledd_mm,
          'm3fub', ROUND(m3,1)) ORDER BY grupp, namn) FROM per_sortiment), '[]'::jsonb),
     -- Sortimentsraderna överlappar; totalen räknar varje bit en gång.
     'overlapp_m3', ROUND(GREATEST(COALESCE((SELECT SUM(m3) FROM per_sortiment),0) - s.sagbar_m3, 0),1)),
  'valtor', COALESCE((SELECT jsonb_agg(jsonb_build_object('valta', valta, 'm3fub', ROUND(m3fub,1),
      'medellangd_m', ROUND(medellangd_m,2), 'antal_tradslag', antal_tradslag,
      'tradslag', tradslag) ORDER BY valta) FROM valta_agg), '[]'::jsonb),
  'langdfordelning', COALESCE((SELECT jsonb_agg(jsonb_build_object('klass', klass,
      'ordning', ordning, 'niva', niva, 'm3fub', ROUND(m3,1), 'st', st,
      'varav_tre_m_st', varav_tre_m_st, 'andel', ROUND(andel,1)) ORDER BY ordning)
      FROM langd_agg), '[]'::jsonb),
  'manader', COALESCE((SELECT jsonb_agg(jsonb_build_object('manad', manad,
      'm3fub', ROUND(m3fub,1), 'medellangd_m', ROUND(medellangd_m,2)) ORDER BY manad)
      FROM manad_agg), '[]'::jsonb),
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

COMMENT ON FUNCTION massaved_niva2(text) IS
  'Nivå 2: HELA objektet, alla månader. Månaden var fel enhet här — ett avslutat objekt visade en fjärdedel av sin volym. Sågbar dimension kräver både längd och diameter ur objektets egna sortimentsfönster.';

-- NIVÅ 3 följer med till objektnivå: nivå 2 har ingen månad att skicka vidare.
DROP FUNCTION IF EXISTS massaved_niva3(text, date, text, int);
CREATE OR REPLACE FUNCTION massaved_niva3(
  p_objekt_id text, p_valta text DEFAULT 'Barr', p_limit int DEFAULT 200
) RETURNS jsonb LANGUAGE sql STABLE AS $n3$
WITH klass AS MATERIALIZED (
  SELECT ds.sortiment_id, ds.namn,
         COALESCE(normalisera('grupp', ds.produktgrupp), sg.grupp,
                  harled_produktgrupp(ds.namn)) AS grupp
  FROM dim_sortiment ds
  LEFT JOIN dim_sortiment_grupp sg ON sg.sortiment_id = ds.sortiment_id
),
stam AS MATERIALIZED (
  SELECT sm.maskin_id, sm.stam_key, sm.objekt_id, sm.tradslag_id, sm.tidpunkt
  FROM detalj_stam sm WHERE sm.objekt_id = p_objekt_id AND sm.tidpunkt IS NOT NULL
),
-- Fönstret måste se HELA stammen: läggs massafiltret här sållas timmer-
-- stockarna bort innan MIN() räknas och forsta_sagbar blir alltid NULL.
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
fonster AS MATERIALIZED (
  SELECT DISTINCT f.namn, f.grupp, f.langd_min_cm, f.dia_min_mm, f.dia_max_harledd_mm
  FROM vy_sagbart_fonster f
  WHERE f.sortiment_id IN (SELECT DISTINCT sortiment_id FROM alla)
),
b AS (
  SELECT a.*, COALESCE(initcap(lower(dt.namn)),'Okänt') AS tradslag,
         CASE WHEN a.sortnamn = 'Massa: BmavFall_V3'     THEN 'Barr'
              WHEN a.sortnamn = 'Massa: BjörkmavFall_V3' THEN 'Björk'
              ELSE 'Övrig massaved' END AS valta,
         EXISTS (SELECT 1 FROM fonster f
                  WHERE a.langd_cm >= f.langd_min_cm
                    AND a.toppdia_ub_mm BETWEEN f.dia_min_mm AND f.dia_max_harledd_mm) AS sagbar
  FROM alla a LEFT JOIN dim_tradslag dt ON dt.tradslag_id = a.tradslag_id
  WHERE a.grupp = 'Massa' AND lower(COALESCE(a.sortnamn,'')) NOT LIKE '%hemved%'
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
$n3$;

COMMENT ON FUNCTION massaved_niva3(text, text, int) IS
  'Nivå 3: enskilda massavedsbitar för hela objektet, kortast först. Finns för att kunna syna ett tal, inte för att läsas igenom.';
