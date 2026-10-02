-- utfall_objekt: löv i volym per objekt (lov_m3, lov_pct) — så att lövdominerade objekt kan hållas
-- utanför kalkylunderlaget på /affarsuppfoljning/medelstam, synligt och inte tyst.
--
-- Bakgrund: "Vildt timkörning" (PONS20SDJAA270231_76) är ett björkbestånd — 65 % löv av volymen, 95 %
-- massaved vid 0,28 m³/stam. Det är ett riktigt utfall, men det svarar inte på "vad kan man vänta sig
-- vid medelstam 0,28 i våra barrdominerade bestånd": det sänkte spannets undre gräns från 33 till 3 %
-- i fönstren 0,26–0,32. Medelstammen förklarar inte utfallet där, arten gör det.
--
-- LÖV = trädslagen BJÖRK, ÖVR_LÖV, 'ÖVR LÖV', LÖV, LOV2 i dim_tradslag (maskinernas egna namn; GRAN och TALL
-- är barr). Volymen är samma bas som resten av raden: stockarnas m³sub utan hemved, så lov_pct är en andel
-- av samma `volym` som timmer_pct/kubb_pct/massa_pct. Trädslaget kommer ur vy_skordarmatt_stock
-- (detalj_stam.tradslag_id), som funktionen redan läser — ingen ny join per stock.
--
-- lov_m3 är NULL tills raden räknats om (NULL = okänt, inte noll). Funktionen räknar därför om varje rad
-- med NULL i lov_m3 vid nästa körning, utan --alla, och ett objekt med okänd löv hålls INTE utanför.
--
-- OBS radslut: mönstren nedan innehåller radbrytningar och matchas mot funktionstexten i databasen (LF). Körs filen med CRLF
-- (git på Windows) hittas inget mönster och körningen avbryts av kontrollen — kör den med LF-radslut.
--
-- Funktionen skrivs om ur den GÄLLANDE texten (pg_get_functiondef), inte ur migrationsfilen. Varje
-- ändring måste hittas exakt en gång, annars avbryts allt. Idempotent: är ändringen redan gjord händer
-- ingenting. Inga andra tal i raden ändras — volym, timmer, kubb och massa räknas som förut.

ALTER TABLE utfall_objekt ADD COLUMN IF NOT EXISTS lov_m3 numeric;
ALTER TABLE utfall_objekt ADD COLUMN IF NOT EXISTS lov_pct numeric
  GENERATED ALWAYS AS (CASE WHEN volym > 0 AND lov_m3 IS NOT NULL THEN 100 * lov_m3 / volym END) STORED;

COMMENT ON COLUMN utfall_objekt.lov_m3 IS
  'Volym (m³sub, utan hemved) från lövträdslagen BJÖRK, ÖVR_LÖV, ÖVR LÖV, LÖV, LOV2 — samma bas som volym. NULL = ännu inte räknad (inte noll).';
COMMENT ON COLUMN utfall_objekt.lov_pct IS
  'Andel löv av volymen utan hemved, procent. NULL om lov_m3 inte är räknad. Över 50 hålls objektet utanför medelstamsvyns fönster, spann och kurva.';

DO $$
DECLARE
  d text := pg_get_functiondef('berakna_utfall_objekt(boolean,integer,timestamptz)'::regprocedure);
  par text[][] := ARRAY[
    -- 1. variabeln
    [$q$  v_hemved text[];
$q$,
     $q$  v_hemved text[];
  v_lov text[];
$q$],
    -- 2. lövträdslagen som en ARRAY (samma skäl som hemved: = ANY mot ett par värden går inte att planera fel)
    [$q$  FROM vy_sortiment_klass WHERE grupp = 'Hemved';
$q$,
     $q$  FROM vy_sortiment_klass WHERE grupp = 'Hemved';

  -- Lövträdslagen som en ARRAY av tradslag_id, av samma skäl som hemved ovan.
  SELECT coalesce(array_agg(tradslag_id), '{}') INTO v_lov
  FROM dim_tradslag WHERE namn IN ('BJÖRK', 'ÖVR_LÖV', 'ÖVR LÖV', 'LÖV', 'LOV2');
$q$],
    -- 3. trädslaget följer med stocken
    [$q$    SELECT v.objekt_id, v.maskin_id, v.stem_key, v.sortiment_id, v.volym_m3sub, v.tidpunkt
$q$,
     $q$    SELECT v.objekt_id, v.maskin_id, v.stem_key, v.sortiment_id, v.volym_m3sub, v.tidpunkt, v.tradslag_id
$q$],
    -- 4. löv-volymen per objekt
    [$q$           count(DISTINCT (maskin_id, stem_key)) AS stammar, sum(volym_m3sub) AS volym
    FROM stock GROUP BY 1
$q$,
     $q$           count(DISTINCT (maskin_id, stem_key)) AS stammar, sum(volym_m3sub) AS volym,
           coalesce(sum(volym_m3sub) FILTER (WHERE tradslag_id = ANY (v_lov)), 0) AS lov
    FROM stock GROUP BY 1
$q$],
    -- 5-6. löv genom tal-steget (en kolumn till i SELECT och GROUP BY)
    [$q$    SELECT o.objekt_id, o.forsta, o.stammar, o.volym,
           coalesce(sum(g.volym) FILTER (WHERE g.grupp = 'Timmer'), 0) AS timmer,
$q$,
     $q$    SELECT o.objekt_id, o.forsta, o.stammar, o.volym, o.lov,
           coalesce(sum(g.volym) FILTER (WHERE g.grupp = 'Timmer'), 0) AS timmer,
$q$],
    [$q$    GROUP BY 1, 2, 3, 4
  ),
  skrivna AS ($q$,
     $q$    GROUP BY 1, 2, 3, 4, 5
  ),
  skrivna AS ($q$],
    -- 7-9. skrivs med raden
    [$q$    INSERT INTO utfall_objekt (objekt_id, forsta, stammar, volym, timmer_m3, kubb_m3, massa_m3,
$q$,
     $q$    INSERT INTO utfall_objekt (objekt_id, forsta, stammar, volym, timmer_m3, kubb_m3, massa_m3, lov_m3,
$q$],
    [$q$           coalesce(t.timmer, 0), coalesce(t.kubb, 0), coalesce(t.massa, 0),
$q$,
     $q$           coalesce(t.timmer, 0), coalesce(t.kubb, 0), coalesce(t.massa, 0), coalesce(t.lov, 0),
$q$],
    [$q$kubb_m3 = EXCLUDED.kubb_m3, massa_m3 = EXCLUDED.massa_m3,
$q$,
     $q$kubb_m3 = EXCLUDED.kubb_m3, massa_m3 = EXCLUDED.massa_m3, lov_m3 = EXCLUDED.lov_m3,
$q$],
    -- 10. rader med okänd löv räknas om vid nästa körning, utan --alla
    [$q$       OR (p_allt AND u.beraknad < p_fore)
$q$,
     $q$       OR (p_allt AND u.beraknad < p_fore)
       OR u.lov_m3 IS NULL
$q$]
  ];
  i int; n int; ny text := d;
BEGIN
  IF position('lov_m3' IN d) > 0 THEN
    RAISE NOTICE 'berakna_utfall_objekt räknar redan lov_m3 — inget att göra';
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
