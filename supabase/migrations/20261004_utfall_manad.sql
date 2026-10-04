-- utfall_manad: volym per objekt och MÅNAD, förberäknad efter import.
--
-- Affärsuppföljningens startsida svarar på "hur går året": månadsstaplar, årssumma, sortimentsfördelning
-- och massavedens medellängd. Det får aldrig räknas live över detalj_stock (3 M stockrader; månadssidans
-- RPC sortimentsutfall_manad tar sekunder per månad). Så månadssiffrorna räknas EN gång, efter import,
-- i samma anrop och med samma ändringsnyckel som utfall_objekt — berakna_utfall_objekt() skriver nu
-- även objektets månadsrader.
--
-- SAMMA BAS SOM MÅNADSSIDAN. Stammens tidpunkt avgör månaden, stockarnas m³sub summeras och HEMVED ÄR BORT
-- (går till markägaren, ingår aldrig i redovisad volym — samma regel som sortimentsutfall_manad och
-- utfall_objekt, på gruppen och inte på namnet). Provat mot RPC:n för alla tio månader 2026, Vida/Allt och
-- Vida/Slutavverkning: identiska på en decimal.
--   volym         alla stockar utom hemved
--   timmer_m3     grupp Timmer
--   kubb_m3       grupp Kubb PLUS Klentimmer (klentimmer går till såg som kubb — som i utfall_objekt)
--   massa_m3      grupp Massa
--   (övrigt = volym - timmer - kubb - massa: energived, avkap, oklassat — räknas vid läsning)
--   massa_barr_m3 / massa_barr_lm   barrmassaved ('Massa: BmavFall_V3', samma urval som massaved_rader):
--                 volymen och summan av längd_cm * volym, så medellängden = massa_barr_lm / massa_barr_m3 / 100,
--                 viktad över objekt och månader utan att något annat behöver läsas.
--
-- BOLAG OCH ÅTGÄRD FILTRERAS VID LÄSNING ur dim_objekt (som utfall_objekt gör med huvudtyp): en rättad
-- bolagsuppgift kräver ingen omräkning.
--
-- Ändringsnyckeln är utfall_objekts: ett objekt vars stock- eller stamantal ändrats räknas om, och då byts
-- ALLA dess månadsrader (inaktuella månader tas bort). Nya kolumnen utfall_objekt.manad_beraknad är NULL tills
-- månadsraderna räknats; funktionen räknar om varje sådan rad vid nästa körning, utan --alla. Stockar utan
-- tidpunkt kan inte placeras i en månad och ligger bara i utfall_objekt, som månadssidans RPC.
--
-- Funktionen skrivs om ur den GÄLLANDE texten (pg_get_functiondef), inte ur migrationsfilen. Varje ändring
-- måste hittas exakt en gång, annars avbryts allt. Idempotent. Kör filen med LF-radslut (mönstren innehåller
-- radbrytningar; med CRLF hittas inget och körningen avbryts av kontrollen).
--
-- Rättigheter: tabellen är läsbar för inloggade och ingenting annat (REVOKE ALL, GRANT SELECT) — samma
-- som utfall_objekt. Standardrättigheterna i Supabase ger annars authenticated allt, även TRUNCATE.

CREATE TABLE IF NOT EXISTS utfall_manad (
  objekt_id      text        NOT NULL,
  manad          date        NOT NULL,                  -- första dagen i månaden för stammens tidpunkt
  volym          numeric     NOT NULL,                  -- m³sub, hemved bort
  timmer_m3      numeric     NOT NULL DEFAULT 0,
  kubb_m3        numeric     NOT NULL DEFAULT 0,        -- Kubb + Klentimmer
  massa_m3       numeric     NOT NULL DEFAULT 0,
  massa_barr_m3  numeric     NOT NULL DEFAULT 0,
  massa_barr_lm  numeric     NOT NULL DEFAULT 0,        -- summa av längd_cm * volym för barrmassaved
  stockar        integer     NOT NULL DEFAULT 0,
  beraknad       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (objekt_id, manad)
);

COMMENT ON TABLE utfall_manad IS
  'Volym per objekt och månad (stammens tidpunkt), hemved bort, förberäknad av berakna_utfall_objekt() efter import. Samma bas som sortimentsutfall_manad. Bolag och åtgärd filtreras vid läsning ur dim_objekt.';
COMMENT ON COLUMN utfall_manad.kubb_m3 IS 'Kubb PLUS Klentimmer — samma definition som utfall_objekt.kubb_m3.';
COMMENT ON COLUMN utfall_manad.massa_barr_lm IS 'Summa av längd_cm * volym_m3sub för barrmassaved (Massa: BmavFall_V3). Medellängd i meter = massa_barr_lm / massa_barr_m3 / 100.';

ALTER TABLE utfall_manad ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS utfall_manad_las ON utfall_manad;
CREATE POLICY utfall_manad_las ON utfall_manad FOR SELECT TO authenticated USING (true);
REVOKE ALL ON utfall_manad FROM anon, authenticated;
GRANT SELECT ON utfall_manad TO authenticated;

ALTER TABLE utfall_objekt ADD COLUMN IF NOT EXISTS manad_beraknad timestamptz;
COMMENT ON COLUMN utfall_objekt.manad_beraknad IS
  'När objektets månadsrader i utfall_manad senast räknades. NULL = inte räknade — funktionen räknar om raden vid nästa körning.';

DO $$
DECLARE
  d text := pg_get_functiondef('berakna_utfall_objekt(boolean,integer,timestamptz)'::regprocedure);
  par text[][] := ARRAY[
    -- 1. klassens namn behövs för barrmassaved
    [$q$  klass AS MATERIALIZED (SELECT sortiment_id, grupp FROM vy_sortiment_klass),
$q$,
     $q$  klass AS MATERIALIZED (SELECT sortiment_id, namn, grupp FROM vy_sortiment_klass),
$q$],
    -- 2. stockens längd följer med (hemved är redan bortsorterad i stock)
    [$q$    SELECT v.objekt_id, v.maskin_id, v.stem_key, v.sortiment_id, v.volym_m3sub, v.tidpunkt, v.tradslag_id
$q$,
     $q$    SELECT v.objekt_id, v.maskin_id, v.stem_key, v.sortiment_id, v.volym_m3sub, v.tidpunkt, v.tradslag_id, v.langd_cm
$q$],
    -- 3. volym per objekt och månad ur samma stock
    [$q$  tal AS (
    SELECT o.objekt_id, o.forsta, o.stammar, o.volym, o.lov,
$q$,
     $q$  -- Per objekt och MÅNAD (stammens tidpunkt), hemved bort: samma bas som sortimentsutfall_manad.
  manad_tal AS (
    SELECT m.objekt_id, m.manad, sum(m.volym) AS volym,
           coalesce(sum(m.volym) FILTER (WHERE k.grupp = 'Timmer'), 0) AS timmer,
           coalesce(sum(m.volym) FILTER (WHERE k.grupp IN ('Kubb', 'Klentimmer')), 0) AS kubb,
           coalesce(sum(m.volym) FILTER (WHERE k.grupp = 'Massa'), 0) AS massa,
           coalesce(sum(m.volym) FILTER (WHERE k.grupp = 'Massa' AND k.namn = 'Massa: BmavFall_V3'), 0) AS massa_barr,
           coalesce(sum(m.lm) FILTER (WHERE k.grupp = 'Massa' AND k.namn = 'Massa: BmavFall_V3'), 0) AS massa_barr_lm,
           sum(m.stockar)::int AS stockar
    FROM (SELECT objekt_id, date_trunc('month', tidpunkt)::date AS manad, sortiment_id,
                 sum(volym_m3sub) AS volym, sum(langd_cm * volym_m3sub) AS lm, count(*) AS stockar
          FROM stock WHERE tidpunkt IS NOT NULL GROUP BY 1, 2, 3) m
    LEFT JOIN klass k ON k.sortiment_id = m.sortiment_id
    GROUP BY 1, 2
  ),
  tal AS (
    SELECT o.objekt_id, o.forsta, o.stammar, o.volym, o.lov,
$q$],
    -- 4. objektraden märks med när månaderna räknades
    [$q$stockar_antal, stammar_antal, beraknad, kontrollerad)
$q$,
     $q$stockar_antal, stammar_antal, beraknad, kontrollerad, manad_beraknad)
$q$],
    [$q$           a.stockar_antal, a.stammar_antal, now(), now()
$q$,
     $q$           a.stockar_antal, a.stammar_antal, now(), now(), now()
$q$],
    -- 5. månadsraderna skrivs i samma sats; slutet av satsen byts mot det som skriver båda tabellerna
    [$q$      beraknad = now(), kontrollerad = now()
    RETURNING 1
  )
  SELECT count(*), (SELECT count(*) FROM alla_andrade) - count(*)
$q$,
     $q$      beraknad = now(), kontrollerad = now(), manad_beraknad = now()
    RETURNING 1
  ),
  skrivna_manad AS (
    INSERT INTO utfall_manad (objekt_id, manad, volym, timmer_m3, kubb_m3, massa_m3,
                              massa_barr_m3, massa_barr_lm, stockar, beraknad)
    SELECT objekt_id, manad, volym, timmer, kubb, massa, massa_barr, massa_barr_lm, stockar, now()
    FROM manad_tal
    ON CONFLICT (objekt_id, manad) DO UPDATE SET
      volym = EXCLUDED.volym, timmer_m3 = EXCLUDED.timmer_m3, kubb_m3 = EXCLUDED.kubb_m3, massa_m3 = EXCLUDED.massa_m3,
      massa_barr_m3 = EXCLUDED.massa_barr_m3, massa_barr_lm = EXCLUDED.massa_barr_lm, stockar = EXCLUDED.stockar,
      beraknad = now()
    RETURNING 1
  )
  SELECT count(*), (SELECT count(*) FROM alla_andrade) - count(*)
$q$],
    -- 6. rader utan räknade månader räknas om vid nästa körning, utan --alla
    [$q$       OR u.lov_m3 IS NULL
$q$,
     $q$       OR u.lov_m3 IS NULL
       OR u.manad_beraknad IS NULL
$q$],
    -- 7. städning: månadsrader för objekt som inte längre finns, och inaktuella månader för dem som räknades om nu
    [$q$  GET DIAGNOSTICS v_borttagna = ROW_COUNT;
$q$,
     $q$  GET DIAGNOSTICS v_borttagna = ROW_COUNT;

  DELETE FROM utfall_manad m
  WHERE NOT EXISTS (SELECT 1 FROM utfall_objekt u WHERE u.objekt_id = m.objekt_id);
  -- En månad som objektet inte längre har stockar i: raden skrevs inte om nu, och objektet gjorde det.
  DELETE FROM utfall_manad m
  USING utfall_objekt u
  WHERE u.objekt_id = m.objekt_id AND u.manad_beraknad = now() AND m.beraknad < now();
$q$],
    -- 8. svaret säger hur många månadsrader som finns
    [$q$    'rader', (SELECT count(*) FROM utfall_objekt),
$q$,
     $q$    'rader', (SELECT count(*) FROM utfall_objekt),
    'manadrader', (SELECT count(*) FROM utfall_manad),
$q$]
  ];
  i int; n int; ny text := d;
BEGIN
  IF position('utfall_manad' IN d) > 0 THEN
    RAISE NOTICE 'berakna_utfall_objekt skriver redan utfall_manad — inget att göra';
    RETURN;
  END IF;
  FOR i IN 1 .. array_length(par, 1) LOOP
    n := (length(ny) - length(replace(ny, par[i][1], ''))) / length(par[i][1]);
    IF n <> 1 THEN
      RAISE EXCEPTION 'ändring % i berakna_utfall_objekt hittades % gånger (väntade 1) — avbryter', i, n;
    END IF;
    ny := replace(ny, par[i][1], par[i][2]);
  END LOOP;
  EXECUTE ny;
END $$;
