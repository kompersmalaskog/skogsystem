-- Massavedssidan gav 57014 statement timeout som authenticated.
--
-- MCP körde utan timeout och dolde det. Frågan tog 12 954 ms; gränsen för
-- authenticated är 8 s.
--
-- Timeouten höjdes INTE, och funktionerna gjordes INTE security definer.
-- Båda hade gömt problemet och lämnat sidan seg i hytten.
--
-- ── VAD PLANEN VISADE ────────────────────────────────────────────────────
-- Inte rotkedjan. Den var redan ETT fönsterpass
-- (MIN(...) OVER (PARTITION BY maskin_id, stem_key, objekt_id)) — ingen
-- korrelerad subquery, inget exists per stock.
--
-- Den verkliga orsaken: fönsterfunktionen är en OPTIMERINGSBARRIÄR.
-- tidpunkt ingår inte i PARTITION BY, så månadsfiltret kunde aldrig tryckas
-- ner under den. Som härledd kolumn i en vy hamnade filtret sist:
--     Rows Removed by Filter: 240 394 av 264 970
-- Nio tiondelar av arbetet kastades. Inget index kunde hjälpa, eftersom
-- predikatet aldrig nådde skanningen.
--
-- Andra kostnaden: vy_sortiment_klass slogs upp per stockrad — 264 rader,
-- 265 tusen varv, 1 622 119 buffers.
--
-- ── ÅTGÄRDERNA, I ORDNING, MED MÄTNING ───────────────────────────────────
--   utgångsläge                                   12 954 ms
--   1. index på det som filtreras och joinas      12 096 ms   (-7 %)
--   2. månaden som PARAMETER + klass hashad en gång 3 705 ms
--   2b. täckande index -> index-only scan             705 ms
--   2c. dim_tradslag direkt i stället för CTE         612 ms
-- End-to-end som authenticated efter allt:
--   niva1 Barr 2 405 ms · niva1 Björk 2 142 ms · niva2 118 ms · niva3 28 ms
--
-- Steg 3 (materialiserad mellantabell) behövdes inte. Extended statistics
-- på joinkolumnerna provades och gav ingen mätbar effekt — de togs bort
-- hellre än att ligga kvar som kult.
--
-- Kvar som enda strukturella brist: planeraren underskattar detalj_stock
-- 14× och väljer hash-join i stället för nested loop från de 22 555
-- stammarna. Blir 2,4 s för segt är det där nästa vinst finns.

-- Vyerna kunde inte lösa problemet — månadsfiltret var olösligt genom dem.
DROP VIEW IF EXISTS vy_massaved_rad;
DROP VIEW IF EXISTS vy_massaved_objekt;

-- Partiellt OCH täckande: bara de ~253 000 raderna med dedupe-nyckel, och
-- alla kolumner funktionen läser ligger i indexet -> index-only scan,
-- 15 440 heap-hämtningar i stället för 75 000 buffers.
DROP INDEX IF EXISTS idx_detalj_stock_join_massaved;
CREATE INDEX IF NOT EXISTS idx_detalj_stock_massaved
  ON detalj_stock (objekt_id, maskin_id, stem_key)
  INCLUDE (log_key, langd_cm, volym_m3sub, toppdia_ub_mm, sortiment_id)
  WHERE stem_key IS NOT NULL AND log_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_detalj_stam_tidpunkt_join
  ON detalj_stam (tidpunkt, objekt_id, maskin_id, stam_key)
  WHERE tidpunkt IS NOT NULL;

-- Basen: funktion, inte vy, ENBART för att månaden måste vara en parameter
-- som kan appliceras före fönsterfunktionen.
CREATE OR REPLACE FUNCTION massaved_rader(p_manad date)
RETURNS TABLE (
  objekt_id text, valta text, tradslag text, maskin_id text,
  m3fub numeric, antal_bitar int, medellangd_m numeric,
  medellangd_utan_rotkedja_m numeric, rotkap_m3 numeric, rotkap_st int,
  timmerdimension_m3 numeric, massa_utan_sagbar_stock_m3 numeric,
  massa_utan_sagbar_stock_st int
) LANGUAGE sql STABLE AS $f$
WITH gr AS (
  SELECT date_trunc('month', p_manad)::date AS fran,
         (date_trunc('month', p_manad) + interval '1 month')::date AS till
),
-- MATERIALIZED: 264 rader hashas EN gång. Utan det blev det ett
-- indexuppslag per stockrad — 1,6 M buffers.
klass AS MATERIALIZED (
  SELECT ds.sortiment_id, ds.namn,
         COALESCE(normalisera('grupp', ds.produktgrupp), sg.grupp,
                  harled_produktgrupp(ds.namn)) AS grupp
  FROM dim_sortiment ds
  LEFT JOIN dim_sortiment_grupp sg ON sg.sortiment_id = ds.sortiment_id
),
-- Datumintervallet FÖRE fönsterfunktionen: 22 555 stammar i stället för
-- 172 655. Det är hela poängen med att detta är en funktion.
stam AS MATERIALIZED (
  SELECT sm.maskin_id, sm.stam_key, sm.objekt_id, sm.tradslag_id
  FROM detalj_stam sm CROSS JOIN gr
  WHERE sm.tidpunkt >= gr.fran AND sm.tidpunkt < gr.till
),
stock AS (
  SELECT st.objekt_id, st.maskin_id, st.log_key, st.langd_cm, st.volym_m3sub,
         st.toppdia_ub_mm, sm.tradslag_id, k.grupp, k.namn AS sortnamn,
         -- Rotkedjan: ETT fönsterpass, aldrig en subquery per stock.
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
-- Direkt join, inte CTE: 37 rader som planeraren hashar. Som MATERIALIZED
-- CTE blev det en nested loop med 884 736 bortkastade rader.
LEFT JOIN dim_tradslag dt ON dt.tradslag_id = s.tradslag_id
WHERE s.grupp = 'Massa' AND lower(COALESCE(s.sortnamn,'')) NOT LIKE '%hemved%'
GROUP BY 1,2,3,4;
$f$;

COMMENT ON FUNCTION massaved_rader(date) IS
  'Massaved per objekt, välta, trädslag och maskin för EN månad. Funktion och inte vy eftersom månadsfiltret måste appliceras före fönsterfunktionen — som härledd vykolumn kunde det aldrig tryckas ner. Hemved exkluderad.';
