-- Apteringsfönstret ur HPR-filen: både undre OCH övre gränser.
--
-- Bakgrund: "sågbar dimension" vilade på ett härlett tak — högsta prisklassens
-- undre gräns — eftersom dim_sortiment_pris saknar övre gränser. Det var fel
-- på två sätt, och de drog åt olika håll:
--
--   Alvesta305_V3 (Kubb)   härlett 123-220, inget längdtak
--                          RIKTIGT 123-260 OCH längd 305-325
--
-- Kubb är en FASTLÄNGDSPRODUKT. Alvesta305 är 3,05 m med 20 cm tolerans,
-- systern Alvesta275 är 275-295. "langd >= 305 utan tak" var strukturellt
-- fel, inte fel i kanten: en fyrametersbit räknades som kubbdimension.
--
-- Åbogen RP 2026:  härlett 35,2 m³ (27,8 %)  ->  riktigt 30,3 m³ (23,9 %)
--   kubb  23,7 -> 40,7 (taket 220->260) -> 12,9 (längdtaket 325)
--   timmer 17,4 oförändrat (taket 440->650 biter inte; grövsta bit 429 mm)
--
-- ── VARFÖR PER OBJEKT OCH INTE PÅ dim_sortiment ──────────────────────────
-- Fönstret ändrar sig över tid. Byter Vida prislista byter produkten fönster,
-- och skrivs det rakt på dim_sortiment räknas augusti om med septembers
-- gränser — historien skrivs om tyst, utan att någon siffra ser konstig ut.
-- Objektet bär redan vilken lista maskinen körde, så nyckeln är
-- (objekt_id, sortiment_id).
--
-- Ändras fönstret ÄNDÅ inom ett objekt (prislistbyte mitt i en trakt) skriver
-- importen en rad i import_fel i stället för att byta tyst.

-- ORDNINGEN ÄR INTE FRI: baslinjen fryses medan de GAMLA funktionerna
-- fortfarande kör, för de läser vyn som droppas längst ner.
INSERT INTO kontroll_baslinje (nyckel, varde)
SELECT 'apteringsfonster_fore_deploy', jsonb_build_object(
  'abogen_total_m3fub', (massaved_niva2('11217413')->>'total_m3fub')::numeric,
  'abogen_sagbar_m3fub', (massaved_niva2('11217413')->'sagbar'->>'m3fub')::numeric,
  'abogen_andel', (massaved_niva2('11217413')->'sagbar'->>'andel')::numeric)
ON CONFLICT (nyckel) DO NOTHING;

CREATE TABLE IF NOT EXISTS dim_objekt_sortiment_fonster (
  objekt_id        text    NOT NULL,
  sortiment_id     text    NOT NULL,
  dia_min_top_mm   int,
  dia_max_mm       int,
  dia_max_butt_mm  int,
  dia_under_bark   boolean,
  langd_min_cm     int,
  langd_max_cm     int,
  filnamn          text,
  uppdaterad       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (objekt_id, sortiment_id)
);

COMMENT ON TABLE dim_objekt_sortiment_fonster IS
  'Maskinens apteringsfönster per objekt och sortiment, läst ur HPR-filens ClassifiedProductDefinition. Per OBJEKT eftersom prislistan byts över tid — skrevs det på dim_sortiment skulle ett byte räkna om historiken tyst.';
COMMENT ON COLUMN dim_objekt_sortiment_fonster.dia_max_mm IS
  'DiameterClassMAX — maskinens riktiga tak, till skillnad från det härledda i vy_sagbart_fonster_harlett.';
COMMENT ON COLUMN dim_objekt_sortiment_fonster.langd_max_cm IS
  'LengthClassMAX. NULL betyder att inget tak är känt, inte att taket saknas.';

ALTER TABLE dim_objekt_sortiment_fonster ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dim_objekt_sortiment_fonster_select ON dim_objekt_sortiment_fonster;
CREATE POLICY dim_objekt_sortiment_fonster_select ON dim_objekt_sortiment_fonster FOR SELECT USING (true);
DROP POLICY IF EXISTS dim_objekt_sortiment_fonster_admin_write ON dim_objekt_sortiment_fonster;
CREATE POLICY dim_objekt_sortiment_fonster_admin_write ON dim_objekt_sortiment_fonster FOR ALL USING (ar_admin());

-- Det härledda fönstret blir uttryckligen "det vi gissar när HPR saknas".
-- Namnet säger vad det är, så ingen läser det som ett mätvärde.
CREATE OR REPLACE VIEW vy_sagbart_fonster_harlett
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

COMMENT ON VIEW vy_sagbart_fonster_harlett IS
  'FALLBACK. Undre gränserna är riktiga (de står i prislistan). dia_max_harledd_mm är INTE ett tak utan högsta prisklassens undre gräns, och det finns inget längdtak alls. Används bara när dim_objekt_sortiment_fonster saknar rad.';

-- ── KONTROLL ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION kontroll_apteringsfonster()
RETURNS jsonb LANGUAGE sql STABLE AS $k$
WITH bas AS (SELECT varde FROM kontroll_baslinje WHERE nyckel = 'apteringsfonster_fore_deploy'),
-- 1: fylls fälten?
falt AS (
  SELECT COUNT(*) AS rader,
         COUNT(*) FILTER (WHERE dia_max_mm IS NOT NULL)   AS med_diatak,
         COUNT(*) FILTER (WHERE langd_max_cm IS NOT NULL) AS med_langdtak,
         COUNT(DISTINCT objekt_id) AS objekt
  FROM dim_objekt_sortiment_fonster
),
-- 2: hur många sågbara (objekt, sortiment) täcks av HPR kontra härlett?
tackning AS (
  SELECT COUNT(*) AS sagbara_par,
         COUNT(f.sortiment_id) AS ur_maskinen,
         COUNT(*) - COUNT(f.sortiment_id) AS harlett
  FROM (SELECT DISTINCT s.objekt_id, s.sortiment_id
        FROM detalj_stock s JOIN vy_sortiment_klass k ON k.sortiment_id = s.sortiment_id
        WHERE k.grupp IN ('Timmer','Kubb') AND s.objekt_id IS NOT NULL) par
  LEFT JOIN dim_objekt_sortiment_fonster f
         ON f.objekt_id = par.objekt_id AND f.sortiment_id = par.sortiment_id
),
-- 3: har importen sett ett fönster byta inom ett objekt?
motsagelser AS (
  SELECT COUNT(*) AS antal FROM import_fel
  WHERE tabell = 'dim_objekt_sortiment_fonster' AND tid > now() - interval '30 days'
),
-- 4: Åbogen är facit. Volymen får ALDRIG röra sig; sågbart SKA röra sig,
--    men bara till det tal HPR-filen säger.
abogen AS (
  SELECT (massaved_niva2('11217413')->>'total_m3fub')::numeric AS total,
         (massaved_niva2('11217413')->'sagbar'->>'m3fub')::numeric AS sagbar,
         (massaved_niva2('11217413')->'sagbar'->>'andel')::numeric AS andel
)
SELECT jsonb_build_object(
 'kord', now(),
 'kontroll_1_falt_fylls', jsonb_build_object(
    'status', CASE WHEN f.rader = 0 THEN 'väntar'
                   WHEN f.med_diatak = f.rader AND f.med_langdtak > 0 THEN 'ok'
                   ELSE 'AVVIKELSE' END,
    'rader', f.rader, 'objekt', f.objekt,
    'med_diatak', f.med_diatak, 'med_langdtak', f.med_langdtak,
    'not', 'Ett fönster utan diametertak är inte läst — då är hela poängen borta.'),
 'kontroll_2_tackning', jsonb_build_object(
    'status', CASE WHEN t.ur_maskinen = 0 THEN 'väntar' ELSE 'ok' END,
    'sagbara_par', t.sagbara_par, 'ur_maskinen', t.ur_maskinen, 'harlett', t.harlett,
    'not', 'Härlett är inte ett fel — gamla objekt har inga nya HPR-filer. Men andelen ska STIGA över tid, aldrig falla.'),
 'kontroll_3_motsagelser', jsonb_build_object(
    'status', CASE WHEN m.antal = 0 THEN 'ok' ELSE 'AVVIKELSE' END,
    'antal', m.antal,
    'atgard', 'Läs import_fel. Ett fönster som byter inom ett objekt betyder prislistbyte mitt i en trakt — då är per-objekt-nyckeln för grov och historiken behöver ett datum.'),
 'kontroll_4_abogen', jsonb_build_object(
    'status', CASE WHEN a.total <> 126.7 THEN 'AVVIKELSE'
                   WHEN a.sagbar = 30.3 THEN 'ok — fönstret har landat'
                   WHEN a.sagbar = 35.2 THEN 'väntar — fortfarande härlett'
                   ELSE 'AVVIKELSE' END,
    'total_m3fub', a.total, 'sagbar_m3fub', a.sagbar, 'andel', a.andel,
    'vantat_harlett', 35.2, 'vantat_hpr', 30.3,
    'not', 'total_m3fub 126,7 är massavedsvolymen och får ALDRIG ändras av den här migrationen. Rör den sig har fönstret läckt in i fel beräkning.'),
 'status', CASE WHEN (SELECT COUNT(*) FROM import_fel
                      WHERE tabell='dim_objekt_sortiment_fonster' AND tid > now() - interval '30 days') > 0
                     OR a.total <> 126.7
                     OR (f.rader > 0 AND f.med_diatak <> f.rader)
                THEN 'avvikelse' WHEN f.rader = 0 THEN 'väntar' ELSE 'ok' END
) FROM falt f, tackning t, motsagelser m, abogen a;
$k$;

COMMENT ON FUNCTION kontroll_apteringsfonster() IS
  'Fyra kontroller för apteringsfönstret. Åbogen är facit: 126,7 m³ massaved får aldrig röra sig, sågbart ska gå 35,2 -> 30,3 när fönstret landar.';

-- Baslinjen fryses FÖRE deploy, annars finns inget att jämföra mot.


-- ── FUNKTIONERNA LÄSER NYA FÖNSTRET, MED FALLBACK ───────────────────────
-- Saknas HPR-rad blir langd_max_cm NULL och predikatet beter sig EXAKT som
-- före migrationen. Ingen historik räknas om av att tabellen skapas.
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
-- HPR-fönstret när det finns, härlett när det inte gör det. kalla följer med
-- ut till skärmen — "ur maskinen" och "härlett" får inte se likadana ut.
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

-- Sist av allt: ingen funktion pekar längre hit.
DROP VIEW IF EXISTS vy_sagbart_fonster;
