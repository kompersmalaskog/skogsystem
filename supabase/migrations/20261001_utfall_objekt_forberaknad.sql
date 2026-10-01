-- Utfall per objekt, förberäknat efter import. Vyn blir en uppslagning.
--
-- /affarsuppfoljning/medelstam gav 57014 statement timeout som authenticated:
-- utfall_per_medelstam räknade live per stock över hela stockdatan vid varje
-- anrop. Som authenticated, timeout 0, tog den 9 381 ms. Gränsen är 8 s.
--
-- Planen visade var tiden gick: vy_sortiment_klass slogs upp per stockrad —
-- 219 654 varv, vardera två indexuppslag och upp till tre anrop till
-- normalisera() — 1,93 av 1,97 miljoner buffers. Samma andra orsak som i
-- #461 (massaved_rader). Med klassen hashad en gång tog frågan 1 105 ms.
--
-- Men det ska inte räknas live alls. Ett avslutat objekts utfall ändras
-- aldrig: medelstam, timmer-, kubb- och massaandel är färdiga när objektet
-- är klart. Så det räknas EN gång, efter import, i samma kedja som
-- berakna_rotkap.py — och bara för objekt vars stockar eller stammar
-- ändrats sedan sist. Samma mönster som sim_rotkap.
--
-- Timeouten är inte höjd och ingen funktion är security definer.
--
-- Talen är OFÖRÄNDRADE: beräkningen är samma uttryck som
-- utfall_per_medelstam hade när den räknade live (20260908_utfall_per_
-- medelstam.sql), flyttade från läsning till import. Hemved exkluderas på
-- GRUPPEN (vy_sortiment_klass), aldrig på namnet, ur både volym och
-- medelstam. Verifierat vid applicering: gamla funktionen inline som
-- service_role mot den nya i samma sats gav identiskt svar.

-- ── TABELLEN ─────────────────────────────────────────────────────────────
-- En rad per objekt med stockdata, oavsett huvudtyp — huvudtypen filtreras
-- vid läsning ur dim_objekt, så en rättad huvudtyp kräver ingen omräkning.
-- m³-talen lagras oavrundade; andelarna och medelstammen är genererade ur
-- dem med exakt samma uttryck som live-funktionen hade, så det finns ingen
-- andra sanning att hålla i synk.
CREATE TABLE IF NOT EXISTS utfall_objekt (
  objekt_id      text PRIMARY KEY,
  forsta         date,                                  -- första stammens tidpunkt
  stammar        int     NOT NULL DEFAULT 0,            -- stammar med minst en stock som inte är hemved
  volym          numeric NOT NULL DEFAULT 0,            -- m³sub utan hemved
  timmer_m3      numeric NOT NULL DEFAULT 0,
  kubb_m3        numeric NOT NULL DEFAULT 0,
  massa_m3       numeric NOT NULL DEFAULT 0,
  medelstam      numeric GENERATED ALWAYS AS (CASE WHEN stammar > 0 THEN volym / stammar END) STORED,
  timmer_pct     numeric GENERATED ALWAYS AS (CASE WHEN volym > 0 THEN 100 * timmer_m3 / volym END) STORED,
  kubb_pct       numeric GENERATED ALWAYS AS (CASE WHEN volym > 0 THEN 100 * kubb_m3   / volym END) STORED,
  massa_pct      numeric GENERATED ALWAYS AS (CASE WHEN volym > 0 THEN 100 * massa_m3  / volym END) STORED,
  stockar_antal  int NOT NULL DEFAULT 0,                -- ändringsnyckel: räknas om när
  stammar_antal  int NOT NULL DEFAULT 0,                --   någon av dessa ändrats
  beraknad       timestamptz NOT NULL DEFAULT now(),    -- när radens tal räknades
  kontrollerad   timestamptz NOT NULL DEFAULT now()     -- när raden senast stämdes av mot nycklarna
);

COMMENT ON TABLE utfall_objekt IS
  'Utfall per objekt förberäknat av berakna_utfall_objekt() efter import: medelstam (volym/stam) och timmer-, kubb- och massaandel av volymen, hemved exkluderad på gruppen. Läses av utfall_per_medelstam(). Skrivs bara av service-rollen. Ett avslutat objekts utfall ändras aldrig — därför räknas det en gång, inte vid varje anrop.';
COMMENT ON COLUMN utfall_objekt.stammar IS
  'Stammar med minst en stock som inte är hemved — samma stammar som volymen bygger på, så medelstammen är volym/stam utan hemved i båda leden.';
COMMENT ON COLUMN utfall_objekt.kontrollerad IS
  'Flyttas vid varje körning, även när raden inte räknades om. Skärmen visar max(kontrollerad) som "Uppdaterat" — står den stilla har kedjan efter import dött.';

ALTER TABLE utfall_objekt ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS utfall_objekt_las ON utfall_objekt;
CREATE POLICY utfall_objekt_las ON utfall_objekt FOR SELECT TO authenticated USING (true);
REVOKE ALL ON utfall_objekt FROM anon, authenticated;
GRANT SELECT ON utfall_objekt TO authenticated;

-- ── BERÄKNINGEN ──────────────────────────────────────────────────────────
-- Körs av service-rollen efter import (berakna_utfall_objekt.py). Vanlig
-- funktion, inte security definer: rättigheten ligger på rollen som kör.
--
-- Nycklarna först: antal stockar och stammar per objekt, index-only på
-- idx_detalj_stock_massaved utan klassning. Bara objekt vars nycklar
-- avviker från raden räknas om. p_allt räknar om rader beräknade före
-- p_fore — använd det efter en ändring i normalisering_karta, som ändrar
-- grupp utan att röra en stock.
--
-- Högst p_max objekt per anrop. Service-rollen har OCKSÅ 8 s statement
-- timeout genom PostgREST (skriptet läste "8s" ur svaret), och en full
-- omräkning av 45 objekt i ett anrop tog 5,7 s: en seq scan av detalj_stam
-- och en sortering som spiller till disk. Stockdatan växte 15 % på tre
-- veckor. Så varje anrop är begränsat, svaret säger hur många som är kvar,
-- och skriptet anropar tills kvar = 0. Timeouten är inte höjd.
--
-- Mätt som service_role efter att klassningen flyttats från stocknivå till
-- (objekt, sortiment) och hemved blivit ett arrayfilter: tio objekt per
-- anrop 1 645 ms varm (141 149 stockar: 950 ms är uppslag i detalj_stam per
-- stock, 150 ms sortering till disk, 250 ms nycklarna) och 2 762 ms kall
-- genom REST. Fem per anrop är marginal nog. Inkrementell körning utan
-- ändringar: ~200 ms.
DROP FUNCTION IF EXISTS berakna_utfall_objekt(boolean);
CREATE OR REPLACE FUNCTION berakna_utfall_objekt(p_allt boolean DEFAULT false,
                                                 p_max int DEFAULT 5,
                                                 p_fore timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE
  t0 timestamptz := clock_timestamp();
  v_hemved text[];
  v_raknade int; v_kvar int; v_borttagna int;
BEGIN
  -- Hemvedsortimenten som en ARRAY, inte en join. Som CTE valde planeraren
  -- nested loop anti join mot den per stock — 143 396 × 277 rader, 6 s för
  -- tio objekt — eftersom den underskattar batchen till tolv rader. Ett
  -- = ANY mot tjugo värden går inte att planera fel.
  SELECT coalesce(array_agg(sortiment_id), '{}') INTO v_hemved
  FROM vy_sortiment_klass WHERE grupp = 'Hemved';

  WITH nyckel AS (
    SELECT s.objekt_id, s.n::int AS stockar_antal, coalesce(m.n, 0)::int AS stammar_antal
    FROM (SELECT objekt_id, count(*) AS n FROM detalj_stock
          WHERE stem_key IS NOT NULL AND log_key IS NOT NULL AND objekt_id IS NOT NULL
          GROUP BY 1) s
    LEFT JOIN (SELECT objekt_id, count(*) AS n FROM detalj_stam
               WHERE objekt_id IS NOT NULL GROUP BY 1) m ON m.objekt_id = s.objekt_id
  ),
  alla_andrade AS (
    SELECT n.* FROM nyckel n
    LEFT JOIN utfall_objekt u ON u.objekt_id = n.objekt_id
    WHERE u.objekt_id IS NULL
       OR u.stockar_antal <> n.stockar_antal OR u.stammar_antal <> n.stammar_antal
       OR (p_allt AND u.beraknad < p_fore)
  ),
  andrade AS (SELECT * FROM alla_andrade ORDER BY objekt_id LIMIT p_max),
  klass AS MATERIALIZED (SELECT sortiment_id, grupp FROM vy_sortiment_klass),
  -- Batchens stockar, hemved bort på gruppen INNAN något summeras. IS NULL-
  -- vakten: en stock utan sortiment ska vara kvar, precis som
  -- coalesce(grupp, '') <> 'Hemved' höll den kvar live.
  stock AS (
    SELECT v.objekt_id, v.maskin_id, v.stem_key, v.sortiment_id, v.volym_m3sub, v.tidpunkt
    FROM vy_skordarmatt_stock v
    JOIN andrade a ON a.objekt_id = v.objekt_id
    WHERE v.sortiment_id IS NULL OR NOT (v.sortiment_id = ANY (v_hemved))
  ),
  -- Klassen sätts på (objekt, sortiment) — ett par hundra rader — inte per
  -- stock. Per stock underskattade planeraren batchen till tolv rader och
  -- valde nested loop mot klasslistan: 143 396 stockar × 277 rader, 9,5 s
  -- för tio objekt. Summorna är desamma, numeric adderas exakt.
  per_objekt AS (
    SELECT objekt_id, min(tidpunkt)::date AS forsta,
           count(DISTINCT (maskin_id, stem_key)) AS stammar, sum(volym_m3sub) AS volym
    FROM stock GROUP BY 1
  ),
  per_grupp AS (
    SELECT s.objekt_id, k.grupp, sum(s.volym) AS volym
    FROM (SELECT objekt_id, sortiment_id, sum(volym_m3sub) AS volym FROM stock GROUP BY 1, 2) s
    LEFT JOIN klass k ON k.sortiment_id = s.sortiment_id
    GROUP BY 1, 2
  ),
  tal AS (
    SELECT o.objekt_id, o.forsta, o.stammar, o.volym,
           coalesce(sum(g.volym) FILTER (WHERE g.grupp = 'Timmer'), 0) AS timmer,
           coalesce(sum(g.volym) FILTER (WHERE g.grupp = 'Kubb'),   0) AS kubb,
           coalesce(sum(g.volym) FILTER (WHERE g.grupp = 'Massa'),  0) AS massa
    FROM per_objekt o LEFT JOIN per_grupp g ON g.objekt_id = o.objekt_id
    GROUP BY 1, 2, 3, 4
  ),
  skrivna AS (
    INSERT INTO utfall_objekt (objekt_id, forsta, stammar, volym, timmer_m3, kubb_m3, massa_m3,
                               stockar_antal, stammar_antal, beraknad, kontrollerad)
    -- LEFT JOIN: ett objekt vars alla stockar är hemved får en rad med noll,
    -- annars vore det "ändrat" vid varje körning.
    SELECT a.objekt_id, t.forsta, coalesce(t.stammar, 0), coalesce(t.volym, 0),
           coalesce(t.timmer, 0), coalesce(t.kubb, 0), coalesce(t.massa, 0),
           a.stockar_antal, a.stammar_antal, now(), now()
    FROM andrade a LEFT JOIN tal t ON t.objekt_id = a.objekt_id
    ON CONFLICT (objekt_id) DO UPDATE SET
      forsta = EXCLUDED.forsta, stammar = EXCLUDED.stammar, volym = EXCLUDED.volym,
      timmer_m3 = EXCLUDED.timmer_m3, kubb_m3 = EXCLUDED.kubb_m3, massa_m3 = EXCLUDED.massa_m3,
      stockar_antal = EXCLUDED.stockar_antal, stammar_antal = EXCLUDED.stammar_antal,
      beraknad = now(), kontrollerad = now()
    RETURNING 1
  )
  SELECT count(*), (SELECT count(*) FROM alla_andrade) - count(*)
    INTO v_raknade, v_kvar FROM skrivna;

  -- Objekt som inte längre har stockdata (omimport under ny nyckel): raden bort.
  DELETE FROM utfall_objekt u
  WHERE NOT EXISTS (SELECT 1 FROM detalj_stock s
                    WHERE s.objekt_id = u.objekt_id AND s.stem_key IS NOT NULL AND s.log_key IS NOT NULL);
  GET DIAGNOSTICS v_borttagna = ROW_COUNT;

  -- Oförändrade rader: bara avstämningstiden flyttas.
  UPDATE utfall_objekt SET kontrollerad = now() WHERE kontrollerad < now();

  RETURN jsonb_build_object(
    'raknade', v_raknade, 'kvar', v_kvar, 'borttagna', v_borttagna,
    'rader', (SELECT count(*) FROM utfall_objekt),
    'ms', round(extract(epoch FROM clock_timestamp() - t0) * 1000),
    'roll', current_user,
    'statement_timeout', current_setting('statement_timeout'));
END $f$;

COMMENT ON FUNCTION berakna_utfall_objekt(boolean, int, timestamptz) IS
  'Fyller utfall_objekt efter import: räknar om objekt vars antal stockar eller stammar ändrats, högst p_max per anrop (svaret säger kvar; service-rollen har 8 s genom PostgREST). p_allt => även rader beräknade före p_fore. Samma uttryck som utfall_per_medelstam räknade live med fram till 2026-10-01. Bara service-rollen får köra den; anropas av berakna_utfall_objekt.py i efterberäkningskedjan.';

REVOKE ALL ON FUNCTION berakna_utfall_objekt(boolean, int, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION berakna_utfall_objekt(boolean, int, timestamptz) TO service_role;

-- ── UPPSLAGNINGEN ────────────────────────────────────────────────────────
-- Samma signatur och samma svar som förut, plus 'uppdaterad'. Läser bara
-- utfall_objekt och dim_objekt: ett fyrtiotal rader, ingen stockdata.
-- Klasser, median och spann räknas här — tröskeln är fortfarande en
-- parameter och namnet följer dim_objekt om det rättas.
CREATE OR REPLACE FUNCTION utfall_per_medelstam(p_min_stammar int DEFAULT 200)
RETURNS jsonb LANGUAGE sql STABLE AS $f$
WITH urval AS (
  SELECT u.objekt_id, o.object_name AS namn, u.forsta, u.stammar, u.volym,
         u.medelstam, u.timmer_pct, u.kubb_pct, u.massa_pct,
         floor(u.medelstam * 10)::int AS i
  FROM utfall_objekt u
  JOIN dim_objekt o ON o.objekt_id = u.objekt_id
  WHERE o.huvudtyp = 'Slutavverkning'
    AND u.stammar >= p_min_stammar AND u.volym > 0
),
klasser AS (SELECT generate_series(2, 7) AS i),
per_klass AS (
  SELECT k.i, count(u.objekt_id) AS antal,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY u.timmer_pct) AS t_med, min(u.timmer_pct) AS t_min, max(u.timmer_pct) AS t_max,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY u.kubb_pct)   AS k_med, min(u.kubb_pct)   AS k_min, max(u.kubb_pct)   AS k_max,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY u.massa_pct)  AS m_med, min(u.massa_pct)  AS m_min, max(u.massa_pct)  AS m_max
  FROM klasser k LEFT JOIN urval u ON u.i = k.i
  GROUP BY k.i
)
SELECT jsonb_build_object(
  'min_stammar', p_min_stammar,
  'antal_objekt', (SELECT count(*) FROM urval WHERE i BETWEEN 2 AND 7),
  'utanfor', (SELECT count(*) FROM urval WHERE i NOT BETWEEN 2 AND 7),
  'sedan_ar', (SELECT min(extract(year FROM forsta))::int FROM urval),
  'uppdaterad', (SELECT max(kontrollerad) FROM utfall_objekt),
  'klasser', (SELECT jsonb_agg(jsonb_build_object(
      'fran', round(pk.i / 10.0, 1), 'till', round((pk.i + 1) / 10.0, 1), 'antal', pk.antal,
      'timmer', jsonb_build_object('median', round(pk.t_med::numeric, 1), 'min', round(pk.t_min::numeric, 1), 'max', round(pk.t_max::numeric, 1)),
      'kubb',   jsonb_build_object('median', round(pk.k_med::numeric, 1), 'min', round(pk.k_min::numeric, 1), 'max', round(pk.k_max::numeric, 1)),
      'massa',  jsonb_build_object('median', round(pk.m_med::numeric, 1), 'min', round(pk.m_min::numeric, 1), 'max', round(pk.m_max::numeric, 1)),
      'objekt', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'objekt_id', u.objekt_id, 'namn', u.namn,
          'medelstam', round(u.medelstam::numeric, 2),
          'timmer', round(u.timmer_pct::numeric, 1), 'kubb', round(u.kubb_pct::numeric, 1), 'massa', round(u.massa_pct::numeric, 1),
          'stammar', u.stammar, 'volym', round(u.volym::numeric, 0), 'forsta', u.forsta)
        ORDER BY u.timmer_pct DESC, u.namn)
        FROM urval u WHERE u.i = pk.i), '[]'::jsonb))
    ORDER BY pk.i) FROM per_klass pk)
);
$f$;

COMMENT ON FUNCTION utfall_per_medelstam(int) IS
  'Kalkylunderlag: timmer-, kubb- och massaandel per medelstamsklass (0,1 från 0,2 till 0,8) över slutavverkningsobjekt med minst p_min_stammar stammar. Uppslagning i utfall_objekt — ingen stockdata läses vid anrop. Hemved exkluderad på gruppen. Median OCH spann per klass — spannet får aldrig döljas. Inget bolag: ingen jämförelse mellan inköpare.';
