-- Stämplingsvyn: vad får vi ut i timmer, kubb och massaved av en stämplingslängd,
-- enligt vår egen avverkade skog?
--
-- Stämplingsrapportens utbyteskalkyl är en formel med två variabler (Dgv och
-- minsta toppdiameter). Den kan inte se röta eller krök. Jeppshoka 1:14:
-- förrättaren räknade 86 % timmer, verkligheten blev 57,6. Vår stockdata
-- innehåller rötan, kröken och våra egna prislistor — därför en modell ur den.
--
-- MODELLEN: per trädslag (tall, gran, annat) och 5 cm-klass i brösthöjd
-- (5 = under 10 cm, 10, 15 … 50, 55 = 55 cm och grövre), ur detalj_stam
-- joinat mot detalj_stock, BARA objekt med huvudtyp Slutavverkning, hemved
-- bort på GRUPPEN (vy_sortiment_klass) innan något summeras:
--   m3_per_stam   medelvolym m³fub (= m³sub, stockarnas volym under bark)
--   timmer_pct    andel Timmer
--   kubb_pct      andel Kubb + Klentimmer (klentimmer går till såg som kubb)
--   massa_pct     andel Massa
--   ovrigt_pct    resten: energived, avkap, oklassat
-- Tre rader per klass: rot = 'alla' (datans egen blandning), 'ja' (stammar
-- vars första stock är massaved — rotbiten föraren kapade bort) och 'nej'.
-- Skärmen blandar ja/nej med användarens rötandel i klasser från 20 cm
-- (under 20 cm är första stocken massaved av dimension, inte av röta) och
-- använder 'alla' där ja/nej har färre än 50 stammar.
--
-- GRUPPEN: coalesce(vy_sortiment_klass.grupp, harled_produktgrupp(stockens
-- eget sortimentnamn)). Tio sortiment-id:n (PONS…_299 "Massa: BmavFall_V3"
-- m.fl., 1 380 m³ på elva objekt) står med TOMT namn i dim_sortiment och
-- klassas därför inte av vyn — stockens eget namn räddar dem. Utan det
-- hade Jeppshokas 640 m³ massaved räknats som "övrigt".
--
-- FÖRBERÄKNAT, som utfall_objekt: berakna_stamplingsmodell() körs efter
-- import av berakna_stamplingsmodell.py (samma kedja som berakna_rotkap.py
-- och berakna_utfall_objekt.py). Service-rollen har också 8 s genom PostgREST,
-- så funktionen räknar högst p_max objekt per anrop till stamplings_cell
-- (en rad per objekt × slag × klass × rot) och bygger sedan om den lilla
-- modelltabellen stamplings_klass ur cellerna — det är den skärmen läser,
-- aldrig stockdatan. Bara objekt vars stock-/stamantal ändrats räknas om.
--
-- VERIFIERAT 2026-10-02 mot Jeppshoka 1:14 (11146159), modellen byggd UTAN
-- Jeppshoka: på skördarens egen diameterfördelning 2 751 m³ mot verkliga
-- 2 827 (−2,7 %), timmer 58,6 % mot 57,8. På förrättarens stämplingslängd
-- 2 493 m³: klaven hade 350 färre träd i 32–46 cm än skördaren mätte.
-- Andelarna stämmer, volymen hänger på klavningen — det står i vyn.

CREATE TABLE IF NOT EXISTS stamplings_objekt (
  objekt_id      text PRIMARY KEY,
  slutavverkning boolean NOT NULL,
  stockar_antal  int NOT NULL,
  stammar_antal  int NOT NULL,
  stammar20      int,                 -- stammar ≥ 20 cm (tall+gran)
  rot20          numeric,             -- andel av dem vars första stock är massaved
  beraknad       timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE stamplings_objekt IS
  'Nyckel för stämplingsmodellen: stock-/stamantal per objekt vid senaste räkning (ändringsdetektering) och objektets rötandel. Skrivs av berakna_stamplingsmodell(). Inte läst av skärmen.';

CREATE TABLE IF NOT EXISTS stamplings_cell (
  objekt_id text NOT NULL REFERENCES stamplings_objekt (objekt_id) ON DELETE CASCADE,
  slag      text NOT NULL,            -- tall | gran | annat
  klass     int  NOT NULL,            -- 5, 10, 15 … 55
  rot       boolean NOT NULL,         -- första stocken massaved
  stammar   int NOT NULL,
  volym     numeric NOT NULL,         -- m³fub, hemved borträknad
  timmer    numeric NOT NULL,
  kubb      numeric NOT NULL,         -- Kubb + Klentimmer
  massa     numeric NOT NULL,
  PRIMARY KEY (objekt_id, slag, klass, rot)
);
COMMENT ON TABLE stamplings_cell IS
  'Stämplingsmodellens celler per objekt: summerad volym per trädslag, 5 cm-klass och rot/ej rot. Byggs om per objekt när objektets stockar ändrats; stamplings_klass summerar dem.';

CREATE TABLE IF NOT EXISTS stamplings_klass (
  slag        text NOT NULL,
  klass       int  NOT NULL,
  rot         text NOT NULL CHECK (rot IN ('alla', 'ja', 'nej')),
  stammar     int NOT NULL,
  objekt      int NOT NULL,
  m3_per_stam numeric NOT NULL,
  timmer_pct  numeric NOT NULL,
  kubb_pct    numeric NOT NULL,
  massa_pct   numeric NOT NULL,
  ovrigt_pct  numeric NOT NULL,
  beraknad    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (slag, klass, rot)
);
COMMENT ON TABLE stamplings_klass IS
  'Stämplingsmodellen: medelvolym per stam och sortimentandelar per trädslag, 5 cm-klass och rot (alla/ja/nej), ur alla slutavverkningar. Läses av /affarsuppfoljning/stampling. Förberäknad — ingen stockdata vid anrop.';

CREATE TABLE IF NOT EXISTS stamplings_meta (
  nyckel   text PRIMARY KEY,
  varde    numeric,
  text     text,
  beraknad timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE stamplings_meta IS
  'Stämplingsmodellens nyckeltal: rot20_median/q1/q3/min/max (andel stammar ≥ 20 cm med massaved i rotändan, per objekt med minst 200 stammar), objekt_antal, stammar_antal, sedan_ar.';

ALTER TABLE stamplings_objekt ENABLE ROW LEVEL SECURITY;
ALTER TABLE stamplings_cell   ENABLE ROW LEVEL SECURITY;
ALTER TABLE stamplings_klass  ENABLE ROW LEVEL SECURITY;
ALTER TABLE stamplings_meta   ENABLE ROW LEVEL SECURITY;
-- Skärmen läser bara de två små tabellerna. Cellerna och nyckeln är servicens.
DROP POLICY IF EXISTS stamplings_klass_las ON stamplings_klass;
CREATE POLICY stamplings_klass_las ON stamplings_klass FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS stamplings_meta_las ON stamplings_meta;
CREATE POLICY stamplings_meta_las ON stamplings_meta FOR SELECT TO authenticated USING (true);
REVOKE ALL ON stamplings_objekt, stamplings_cell, stamplings_klass, stamplings_meta FROM anon;
GRANT SELECT ON stamplings_klass, stamplings_meta TO authenticated;

-- OBS: PostgREST-rollen kör pg-safeupdate — varje DELETE/UPDATE i en RPC måste
-- ha WHERE ("DELETE requires a WHERE clause", kod 21000), även på temporära
-- tabeller. 'WHERE true' är avsiktligt.
CREATE OR REPLACE FUNCTION berakna_stamplingsmodell(
  p_allt boolean DEFAULT false, p_max int DEFAULT 5, p_fore timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE
  v_t0      timestamptz := clock_timestamp();
  v_raknade int := 0;
  v_kvar    int := 0;
  v_bort    int := 0;
  v_rader   int;
BEGIN
  -- 1. Vilka objekt har ändrats? Samma nyckel som utfall_objekt: antal
  --    joinbara stockar och antal stammar. huvudtyp räknas in, så ett objekt
  --    som byter typ räknas om.
  CREATE TEMP TABLE IF NOT EXISTS _andrade (objekt_id text PRIMARY KEY, slutavverkning boolean,
                                            stockar_antal int, stammar_antal int) ON COMMIT DROP;
  DELETE FROM _andrade WHERE true;
  INSERT INTO _andrade
  SELECT n.objekt_id, n.slutavverkning, n.stockar_antal, n.stammar_antal
  FROM (
    SELECT s.objekt_id, s.n::int AS stockar_antal, coalesce(m.n, 0)::int AS stammar_antal,
           coalesce(o.huvudtyp = 'Slutavverkning', false) AS slutavverkning
    FROM (SELECT objekt_id, count(*) AS n FROM detalj_stock
          WHERE stem_key IS NOT NULL AND log_key IS NOT NULL AND objekt_id IS NOT NULL GROUP BY 1) s
    LEFT JOIN (SELECT objekt_id, count(*) AS n FROM detalj_stam WHERE objekt_id IS NOT NULL GROUP BY 1) m
           ON m.objekt_id = s.objekt_id
    LEFT JOIN dim_objekt o ON o.objekt_id = s.objekt_id) n
  LEFT JOIN stamplings_objekt u ON u.objekt_id = n.objekt_id
  WHERE u.objekt_id IS NULL
     OR u.stockar_antal <> n.stockar_antal OR u.stammar_antal <> n.stammar_antal
     OR u.slutavverkning <> n.slutavverkning
     OR (p_allt AND u.beraknad < p_fore)
  ORDER BY n.objekt_id;

  SELECT count(*) INTO v_kvar FROM _andrade;

  -- 2. Batchen: de p_max första. Cellerna byggs om från grunden för dem.
  CREATE TEMP TABLE IF NOT EXISTS _batch (objekt_id text PRIMARY KEY, slutavverkning boolean,
                                          stockar_antal int, stammar_antal int) ON COMMIT DROP;
  DELETE FROM _batch WHERE true;
  INSERT INTO _batch SELECT * FROM _andrade ORDER BY objekt_id LIMIT p_max;
  SELECT count(*) INTO v_raknade FROM _batch;

  INSERT INTO stamplings_objekt (objekt_id, slutavverkning, stockar_antal, stammar_antal, beraknad)
  SELECT objekt_id, slutavverkning, stockar_antal, stammar_antal, now() FROM _batch
  ON CONFLICT (objekt_id) DO UPDATE SET
    slutavverkning = EXCLUDED.slutavverkning, stockar_antal = EXCLUDED.stockar_antal,
    stammar_antal = EXCLUDED.stammar_antal, beraknad = now();

  DELETE FROM stamplings_cell c USING _batch b WHERE c.objekt_id = b.objekt_id;

  WITH klass AS MATERIALIZED (SELECT sortiment_id, grupp FROM vy_sortiment_klass),
  stock AS (
    -- Gruppen på sortimentet, med stockens eget namn som reserv (tomma namn i
    -- dim_sortiment). Hemved bort INNAN något summeras.
    SELECT d.maskin_id, d.stem_key, d.objekt_id, d.log_key, d.volym_m3sub,
           coalesce(k.grupp, harled_produktgrupp(d.sortiment_namn), 'Övrigt') AS grupp
    FROM detalj_stock d
    JOIN _batch b ON b.objekt_id = d.objekt_id AND b.slutavverkning
    LEFT JOIN klass k ON k.sortiment_id = d.sortiment_id
    WHERE d.stem_key IS NOT NULL AND d.log_key IS NOT NULL
      AND coalesce(k.grupp, harled_produktgrupp(d.sortiment_namn), '') <> 'Hemved'),
  forsta AS (
    SELECT DISTINCT ON (maskin_id, objekt_id, stem_key) maskin_id, objekt_id, stem_key, (grupp = 'Massa') AS rot
    FROM stock ORDER BY maskin_id, objekt_id, stem_key, log_key),
  stam AS (
    SELECT s.maskin_id, s.stam_key, s.objekt_id,
           CASE WHEN t.namn = 'TALL' THEN 'tall' WHEN t.namn = 'GRAN' THEN 'gran' ELSE 'annat' END AS slag,
           CASE WHEN s.dbh_mm < 100 THEN 5 WHEN s.dbh_mm >= 550 THEN 55 ELSE (s.dbh_mm / 50) * 5 END AS klass
    FROM detalj_stam s
    JOIN _batch b ON b.objekt_id = s.objekt_id AND b.slutavverkning
    LEFT JOIN dim_tradslag t ON t.tradslag_id = s.tradslag_id
    WHERE s.dbh_mm IS NOT NULL),
  per_stam AS (
    SELECT st.objekt_id, st.slag, st.klass, f.rot,
           sum(sk.volym_m3sub) AS vol,
           coalesce(sum(sk.volym_m3sub) FILTER (WHERE sk.grupp = 'Timmer'), 0) AS timmer,
           coalesce(sum(sk.volym_m3sub) FILTER (WHERE sk.grupp IN ('Kubb', 'Klentimmer')), 0) AS kubb,
           coalesce(sum(sk.volym_m3sub) FILTER (WHERE sk.grupp = 'Massa'), 0) AS massa
    FROM stam st
    JOIN stock sk ON sk.maskin_id = st.maskin_id AND sk.stem_key = st.stam_key AND sk.objekt_id = st.objekt_id
    JOIN forsta f ON f.maskin_id = st.maskin_id AND f.stem_key = st.stam_key AND f.objekt_id = st.objekt_id
    GROUP BY st.objekt_id, st.slag, st.klass, f.rot, st.maskin_id, st.stam_key)
  INSERT INTO stamplings_cell (objekt_id, slag, klass, rot, stammar, volym, timmer, kubb, massa)
  SELECT objekt_id, slag, klass, rot, count(*), sum(vol), sum(timmer), sum(kubb), sum(massa)
  FROM per_stam GROUP BY 1, 2, 3, 4;

  -- Objektets rötandel: stammar ≥ 20 cm (tall + gran) med massaved i rotändan.
  UPDATE stamplings_objekt u SET
    stammar20 = r.n, rot20 = r.rot
  FROM (SELECT b.objekt_id,
               sum(c.stammar) AS n,
               CASE WHEN sum(c.stammar) > 0 THEN coalesce(sum(c.stammar) FILTER (WHERE c.rot), 0)::numeric / sum(c.stammar) END AS rot
        FROM _batch b LEFT JOIN stamplings_cell c
               ON c.objekt_id = b.objekt_id AND c.klass >= 20 AND c.slag IN ('tall', 'gran')
        GROUP BY b.objekt_id) r
  WHERE u.objekt_id = r.objekt_id;

  -- 3. Objekt som inte längre har stockdata: bort (cellerna följer med).
  DELETE FROM stamplings_objekt u
  WHERE NOT EXISTS (SELECT 1 FROM detalj_stock s
                    WHERE s.objekt_id = u.objekt_id AND s.stem_key IS NOT NULL AND s.log_key IS NOT NULL);
  GET DIAGNOSTICS v_bort = ROW_COUNT;

  -- 4. Modelltabellen byggs om ur cellerna — billig, och alltid färsk.
  DELETE FROM stamplings_klass WHERE true;
  INSERT INTO stamplings_klass (slag, klass, rot, stammar, objekt, m3_per_stam, timmer_pct, kubb_pct, massa_pct, ovrigt_pct, beraknad)
  SELECT slag, klass, CASE WHEN rot THEN 'ja' ELSE 'nej' END, sum(stammar), count(DISTINCT objekt_id),
         sum(volym) / sum(stammar),
         100 * sum(timmer) / sum(volym), 100 * sum(kubb) / sum(volym), 100 * sum(massa) / sum(volym),
         100 * (sum(volym) - sum(timmer) - sum(kubb) - sum(massa)) / sum(volym), now()
  FROM stamplings_cell WHERE volym > 0 GROUP BY slag, klass, rot
  UNION ALL
  SELECT slag, klass, 'alla', sum(stammar), count(DISTINCT objekt_id),
         sum(volym) / sum(stammar),
         100 * sum(timmer) / sum(volym), 100 * sum(kubb) / sum(volym), 100 * sum(massa) / sum(volym),
         100 * (sum(volym) - sum(timmer) - sum(kubb) - sum(massa)) / sum(volym), now()
  FROM stamplings_cell WHERE volym > 0 GROUP BY slag, klass;

  -- 5. Nyckeltalen. Rötandelen över objekt med minst 200 stammar.
  DELETE FROM stamplings_meta WHERE true;
  INSERT INTO stamplings_meta (nyckel, varde, text, beraknad)
  SELECT * FROM (
    SELECT 'rot20_median', percentile_cont(0.5) WITHIN GROUP (ORDER BY rot20), NULL::text, now()
    FROM stamplings_objekt WHERE slutavverkning AND stammar_antal >= 200 AND rot20 IS NOT NULL
    UNION ALL
    SELECT 'rot20_q1', percentile_cont(0.25) WITHIN GROUP (ORDER BY rot20), NULL, now()
    FROM stamplings_objekt WHERE slutavverkning AND stammar_antal >= 200 AND rot20 IS NOT NULL
    UNION ALL
    SELECT 'rot20_q3', percentile_cont(0.75) WITHIN GROUP (ORDER BY rot20), NULL, now()
    FROM stamplings_objekt WHERE slutavverkning AND stammar_antal >= 200 AND rot20 IS NOT NULL
    UNION ALL
    SELECT 'rot20_min', min(rot20), NULL, now()
    FROM stamplings_objekt WHERE slutavverkning AND stammar_antal >= 200 AND rot20 IS NOT NULL
    UNION ALL
    SELECT 'rot20_max', max(rot20), NULL, now()
    FROM stamplings_objekt WHERE slutavverkning AND stammar_antal >= 200 AND rot20 IS NOT NULL
    UNION ALL
    SELECT 'rot20_objekt', count(*), NULL, now()
    FROM stamplings_objekt WHERE slutavverkning AND stammar_antal >= 200 AND rot20 IS NOT NULL
    UNION ALL
    SELECT 'objekt_antal', count(DISTINCT objekt_id), NULL, now() FROM stamplings_cell
    UNION ALL
    SELECT 'stammar_antal', sum(stammar), NULL, now() FROM stamplings_cell
    UNION ALL
    SELECT 'sedan_ar', min(extract(year FROM u.forsta)), NULL, now()
    FROM utfall_objekt u JOIN stamplings_objekt o ON o.objekt_id = u.objekt_id AND o.slutavverkning
    WHERE u.forsta IS NOT NULL
  ) m;

  SELECT count(*) INTO v_rader FROM stamplings_klass;
  RETURN jsonb_build_object(
    'raknade', v_raknade, 'kvar', v_kvar - v_raknade, 'borttagna', v_bort, 'rader', v_rader,
    'ms', round(extract(epoch FROM clock_timestamp() - v_t0) * 1000),
    'roll', current_user, 'statement_timeout', current_setting('statement_timeout'));
END $f$;

COMMENT ON FUNCTION berakna_stamplingsmodell(boolean, int, timestamptz) IS
  'Förberäknar stämplingsmodellen: celler per objekt (högst p_max ändrade objekt per anrop, p_allt räknar om alla beräknade före p_fore), sedan stamplings_klass och stamplings_meta ur cellerna. Körs av berakna_stamplingsmodell.py efter import. Bara service_role.';

REVOKE ALL ON FUNCTION berakna_stamplingsmodell(boolean, int, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION berakna_stamplingsmodell(boolean, int, timestamptz) TO service_role;
