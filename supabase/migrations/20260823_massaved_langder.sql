-- Massavedens längder — underlag för drill-down bakom massaraden.
--
-- Bakgrund: massabruket hör av sig om att vår massaved är för kort. Analysen
-- visar att det gäller granen, och att de korta bitarna nästan uteslutande är
-- rotkap vid röta — ett medvetet val som räddar timmervolym.
--
-- REGELN, en och samma överallt i den här funktionen:
--   massaved, hemved borträknad, inget annat.
--
-- Hemved levereras aldrig till bruket och hör inte hemma i ett snitt som
-- beskriver längden på det de får. Volymen redovisas ändå i svaret
-- (hemved_volym) så att avgränsningen aldrig är tyst.
--
-- Ingen avgränsning på "stammar där samtliga massavedsbitar är 3 meter".
-- Bruket TAR EMOT de stammarna — räknas de bort beskriver talet inte längden
-- på det de får, och då är det inte längre svar på deras fråga.
--
-- MEDELLÄNGDEN ÄR VOLYMVÄGD:
--   sum(langd_cm * volym_m3sub) / sum(volym_m3sub)
-- ALDRIG avg(langd_cm). Bruket och åkeriet betalar per volym, inte per stock.
--
-- Omfattningen ärver sidans urval: bolag, månad och åtgärdsfilter. Den sitter
-- på Vida-sidan och ska följa den.
--
-- Verifierat mot prod, Vida augusti 2026, alla åtgärder:
--   alla trädslag  1 833,1 m³  44,6 dm   (hemved 17,3 m³ utanför)
--   gran           1 086 m³    43,7 dm   3m 121 · rotkap 96 · timmermått 91
--   björk            510 m³    45,8 dm   3m 0
--   tall             238 m³    46,6 dm   3m 8 · rotkap 6
--   ÖVR_LÖV 0,4 m³ — under 1 m³, visas inte (brus)

-- Vyn behövde längd och trädslag. Additivt: nya kolumner sist, befintliga
-- läsare (sortimentsutfall_manad) rörs inte. Verifierat att augusti står
-- kvar på 4 609,1 m³ / 9 objekt efter ändringen.
CREATE OR REPLACE VIEW vy_skordarmatt_stock
WITH (security_invoker = true) AS
SELECT
  st.id             AS stock_id,
  st.maskin_id,
  st.objekt_id,
  st.stem_key,
  st.log_key,
  st.sortiment_id,
  st.volym_m3sub,
  st.toppdia_ub_mm,
  sm.tidpunkt,
  st.langd_cm,
  sm.tradslag_id
FROM detalj_stock st
JOIN detalj_stam sm
       ON sm.maskin_id = st.maskin_id
      AND sm.stam_key  = st.stem_key
      AND sm.objekt_id = st.objekt_id
WHERE st.stem_key IS NOT NULL
  AND st.log_key  IS NOT NULL;

CREATE OR REPLACE FUNCTION massaved_langder(
  p_manad  date,
  p_atgard text DEFAULT 'Slutavverkning',
  p_bolag  text DEFAULT 'Vida'
) RETURNS jsonb LANGUAGE sql STABLE AS $m$
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
         (lower(COALESCE(k.namn,'')) LIKE '%hemved%') AS ar_hemved
  FROM vy_skordarmatt_stock v
  JOIN objekt ob ON ob.objekt_id = v.objekt_id
  CROSS JOIN gransen gr
  LEFT JOIN vy_sortiment_klass k ON k.sortiment_id = v.sortiment_id
  LEFT JOIN dim_tradslag dt ON dt.tradslag_id = v.tradslag_id
  WHERE v.tidpunkt >= gr.fran AND v.tidpunkt < gr.till
    AND k.grupp = 'Massa'
),
m AS (SELECT * FROM allt WHERE NOT ar_hemved),
per_tradslag AS (
  SELECT tradslag,
         SUM(volym_m3sub) AS volym,
         SUM(langd_cm * volym_m3sub) / NULLIF(SUM(volym_m3sub),0) / 10 AS dm,
         SUM(volym_m3sub) FILTER (WHERE langd_cm BETWEEN 290 AND 310) AS tre_m,
         -- Rotkap: 3-metersbiten som sitter FÖRST på stammen (log_key = 1)
         -- och blev massaved. Härlett, inte mätt — se fotnoten i vyn.
         SUM(volym_m3sub) FILTER (WHERE langd_cm BETWEEN 290 AND 310 AND log_key = 1) AS rotkap,
         -- Vislandas timmergräns: hade biten dugt som timmer om den inte
         -- kapats bort?
         SUM(volym_m3sub) FILTER (WHERE langd_cm BETWEEN 290 AND 310 AND log_key = 1
                                    AND toppdia_ub_mm >= 180) AS timmermatt
  FROM m GROUP BY 1
)
SELECT jsonb_build_object(
  'manad',  (SELECT to_char(fran,'YYYY-MM') FROM gransen),
  'atgard', p_atgard,
  'bolag',  p_bolag,
  'total_volym',  ROUND(COALESCE((SELECT SUM(volym_m3sub) FROM m),0)::numeric,1),
  'medellangd_dm', ROUND((SELECT SUM(langd_cm*volym_m3sub)/NULLIF(SUM(volym_m3sub),0)/10 FROM m)::numeric,1),
  'hemved_volym', ROUND(COALESCE((SELECT SUM(volym_m3sub) FROM allt WHERE ar_hemved),0)::numeric,1),
  'gran', (SELECT jsonb_build_object(
             'volym',      ROUND(volym::numeric,0),
             'tre_m',      ROUND(COALESCE(tre_m,0)::numeric,0),
             'rotkap',     ROUND(COALESCE(rotkap,0)::numeric,0),
             'timmermatt', ROUND(COALESCE(timmermatt,0)::numeric,0))
           FROM per_tradslag WHERE upper(tradslag) LIKE 'GRAN%'),
  'tradslag', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'namn',  initcap(lower(tradslag)),
      'volym', ROUND(volym::numeric,0),
      'dm',    ROUND(dm::numeric,1),
      'tre_m_volym', ROUND(COALESCE(tre_m,0)::numeric,0),
      'tre_m_andel', ROUND(100*COALESCE(tre_m,0)::numeric/NULLIF(volym,0)::numeric,1),
      'rotkap_volym', ROUND(COALESCE(rotkap,0)::numeric,0))
    ORDER BY volym DESC)
    -- Under 1 m³ är brus och göms. Antalet redovisas i dolda_tradslag så
    -- gränsen syns i stället för att tysta bort en rad.
    FROM per_tradslag WHERE volym >= 1), '[]'::jsonb),
  'dolda_tradslag', (SELECT COUNT(*) FROM per_tradslag WHERE volym < 1)
);
$m$;

COMMENT ON FUNCTION massaved_langder(date, text, text) IS
  'Massavedens längder för drill-down bakom massaraden. Regel: massaved, hemved borträknad, inget annat. Volymvägd medellängd — aldrig avg(langd_cm); bruket och åkeriet betalar per volym, inte per stock.';
