-- SQL-test: helikopter_ny_klar (migrationen 20261017142154_helikopter_ny_klar.sql — kör den FÖRST).
--
-- Körs i EN transaktion som alltid rullas tillbaka: allt som skapas (trakter, beställning, lass, tid, ledighet) försvinner.
-- Köra: klistra in hela filen i Supabase-SQL-editorn (eller via MCP execute_sql). Resultatet kommer som ett fel på sista raden:
-- "TEST OK: N kontroller" eller "TEST FEL: <de som föll>" — det är avsikten, det är så transaktionen rullas tillbaka.
--
-- Månad: mars 2024 (helt utan riktig data → ingen uppmätt G15, alla maskiner räknas på 8 h/dag, "ej mätt"). Arbetsdagar i mars 2024: 1, 4–8,
-- 11–15, 18–22, 25–28 (långfredag 29:e är röd dag) = 20 st.
--
-- Fall (kommande månad = idag 2024-02-20; innevarande = idag 2024-03-20):
--   Giant (skördare)   A (ordning 1, 16 h) + B (ordning 2, 8 h)         → klar efter 3 dagar; B börjar dag 3
--   Elefant 26 (skot.) E (förra månaden, prognos 40 h, 16 h utförda)    → 24 h kvar (ÖVERFÖRS) + A (24 h) + B (8 h); Daniel ledig 11–13 mars
--   H8E (skördare)     C (gallring, 12 h)
--   Wisent (skotare)   C: prognos saknas                                → maskinen saknar prognos, klar_datum null
--   810E (manuell)     F (gallring, ingen prognos, volym 100)           → räknas med snittakt mot kvarvarande volym (innevarande månad)
--                      G (gallring, volym 800, 800 skotade av 810E)     → ger takten; helt skotad → ingen kö
--   D                  ingen maskin                                      → finns bland trakterna, ligger på ingen maskin
--   Beställning        saknas först (har_bestallning false), sedan Vida slutavverkning 1 000 · gallring 500

-- ── Data ────────────────────────────────────────────────────────────────────
INSERT INTO objekt (id, namn, typ, status, ar, manad, ordning, volym, bolag, skordare_maskin_id, skotare_maskin_id, manuell_prognos, vo_nummer) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'Test A', 'slutavverkning', 'planerad', 2024, 3, 1, 1000, 'Vida', 'PONS20SDJAA270231', 'A130743', '{"skordare": "16", "skotare": "24"}', 'T-A'),
  ('00000000-0000-0000-0000-00000000000b', 'Test B', 'slutavverkning', 'planerad', 2024, 3, 2, 500,  'Vida', 'PONS20SDJAA270231', 'A130743', '{"skordare": "8", "skotare": "8"}', 'T-B'),
  ('00000000-0000-0000-0000-00000000000c', 'Test C', 'gallring',       'planerad', 2024, 3, 1, 200,  'Vida', 'R64428',            'A030353', '{"skordare": "12"}', 'T-C'),
  ('00000000-0000-0000-0000-00000000000d', 'Test D', 'gallring',       'planerad', 2024, 3, 2, 100,  'Vida', NULL,                NULL,      '{"skordare": "8", "skotare": "8"}', 'T-D'),
  ('00000000-0000-0000-0000-00000000000e', 'Test E', 'slutavverkning', 'pagaende', 2024, 2, 1, 300,  'Vida', NULL,                'A130743', '{"skordare": "8", "skotare": "40"}', 'T-E'),
  ('00000000-0000-0000-0000-00000000000f', 'Test F', 'gallring',       'planerad', 2024, 3, 3, 100,  'Vida', NULL,                'JD810E',  NULL, 'T-F'),
  ('00000000-0000-0000-0000-000000000010', 'Test G', 'gallring',       'pagaende', 2024, 3, 4, 800,  'Vida', NULL,                NULL,      NULL, 'T-G');

-- Förra månadens trakt E: 16 av 40 skotartimmar utförda (fakt_tid kopplas via dim_objekt.vo_nummer).
INSERT INTO dim_objekt (objekt_id, vo_nummer) VALUES ('TEST-E', 'T-E'), ('TEST-G', 'T-G');
INSERT INTO fakt_tid (datum, maskin_id, objekt_id, processing_sek, terrain_sek, other_work_sek)
SELECT d::date, 'A130743', 'TEST-E', 8 * 3600, 0, 0 FROM unnest(ARRAY['2024-02-05', '2024-02-06']::date[]) d;

-- 810E: manuellt lass i mars på trakt G (snittakt = månadens volym / rapportdagar; G är därmed helt skotad och ligger inte i kön), Daniel (Elefant 26) ledig 11–13 mars.
INSERT INTO fakt_lass (datum, maskin_id, objekt_id, lass_nummer, volym_m3sub, filnamn)
SELECT d::date, 'JD810E', 'TEST-G', 1, 200, 'manuell' FROM unnest(ARRAY['2024-03-05', '2024-03-06', '2024-03-07', '2024-03-08']::date[]) d;
INSERT INTO ledighet_ansokningar (anvandare_id, typ, startdatum, slutdatum, status, medarbetare_id)
SELECT 'test', 'semester', '2024-03-11', '2024-03-13', 'godkänd', m.id FROM medarbetare m WHERE split_part(m.namn, ' ', 1) = 'Daniel' AND m.maskin_id = 'A130743';

-- ── Kontroller ──────────────────────────────────────────────────────────────
DO $t$
DECLARE
  fel text[] := '{}';
  n int := 0;
  k jsonb; k2 jsonb; kn jsonb;
  giant jsonb; ele jsonb; h8e jsonb; wis jsonb; jd jsonb; tk jsonb;
  g15 numeric; dg jsonb; takt numeric;
BEGIN
  -- 1. Kommande månad (mars, idag 20 feb): ingen beställning än.
  k := helikopter_ny_klar(2024, 3, '2024-02-20');
  n := n + 1; IF (k->>'har_bestallning')::boolean IS DISTINCT FROM false THEN fel := fel || 'har_bestallning ska vara false utan beställning'; END IF;
  n := n + 1; IF k->>'start' <> '2024-03-01' THEN fel := fel || ('kommande månad räknas från första dagen: ' || (k->>'start')); END IF;
  n := n + 1; IF k->>'sista_arbetsdag' <> '2024-03-28' THEN fel := fel || ('sista arbetsdag ska vara 28 mars (långfredag 29:e är röd): ' || (k->>'sista_arbetsdag')); END IF;

  INSERT INTO bestallningar (ar, manad, bolag, typ, volym) VALUES (2024, 3, 'Vida', 'slutavverkning', 1000), (2024, 3, 'Vida', 'gallring', 500);
  k := helikopter_ny_klar(2024, 3, '2024-02-20');
  n := n + 1; IF (k->>'har_bestallning')::boolean IS DISTINCT FROM true THEN fel := fel || 'har_bestallning ska vara true med beställning'; END IF;
  n := n + 1; IF (SELECT (s->>'bestallt')::numeric FROM jsonb_array_elements(k->'spar') s WHERE s->>'typ' = 'slutavverkning') <> 1000 THEN fel := fel || 'beställt slutavverkning 1000'; END IF;
  n := n + 1; IF (SELECT (s->>'bestallt')::numeric FROM jsonb_array_elements(k->'spar') s WHERE s->>'typ' = 'gallring') <> 500 THEN fel := fel || 'beställt gallring 500'; END IF;

  SELECT m INTO giant FROM jsonb_array_elements(k->'maskiner') m WHERE m->>'maskin_id' = 'PONS20SDJAA270231';
  SELECT m INTO ele   FROM jsonb_array_elements(k->'maskiner') m WHERE m->>'maskin_id' = 'A130743';
  SELECT m INTO h8e   FROM jsonb_array_elements(k->'maskiner') m WHERE m->>'maskin_id' = 'R64428';
  SELECT m INTO wis   FROM jsonb_array_elements(k->'maskiner') m WHERE m->>'maskin_id' = 'A030353';
  n := n + 1; IF giant IS NULL OR ele IS NULL OR h8e IS NULL OR wis IS NULL THEN fel := fel || 'kapacitetsmaskinerna ska finnas'; END IF;

  -- 2. Giant: A (16 h) + B (8 h) på uppmätt/8 h kapacitet → dagar = timmar / g15; från–till ur maskinens egna dagar.
  g15 := (giant->>'g15_per_dag')::numeric;
  dg := giant->'dagar';
  n := n + 1; IF (giant->'trakter'->0->>'objekt_id') <> '00000000-0000-0000-0000-00000000000a' OR (giant->'trakter'->1->>'objekt_id') <> '00000000-0000-0000-0000-00000000000b' THEN fel := fel || 'Giant: A före B (objekt.ordning)'; END IF;
  n := n + 1; IF giant->'trakter'->0->>'fran' <> dg->>0 THEN fel := fel || 'Giant: A börjar på första arbetsdagen'; END IF;
  n := n + 1; IF giant->'trakter'->0->>'till' <> dg->>(ceil(round(16 / g15, 6)) - 1)::int THEN fel := fel || 'Giant: A slutar på dag ceil(16/g15)'; END IF;
  n := n + 1; IF giant->'trakter'->1->>'fran' <> dg->>(floor(round(16 / g15, 6)))::int THEN fel := fel || 'Giant: B börjar på dag floor(16/g15)+1'; END IF;
  n := n + 1; IF giant->>'klar_datum' <> dg->>(ceil(round(24 / g15, 6)) - 1)::int THEN fel := fel || 'Giant: klar efter ceil(24/g15) dagar'; END IF;
  n := n + 1; IF (giant->>'ej_matt')::boolean AND g15 <> 8 THEN fel := fel || 'Giant: utan mätning gäller 8 h/dag'; END IF;

  -- 3. Elefant 26: förra månadens trakt E överförs med det som är kvar (40 − 16 = 24 h) och går FÖRE A (äldre månad); Daniel ledig 11–13 mars → inga av de dagarna.
  g15 := (ele->>'g15_per_dag')::numeric;
  dg := ele->'dagar';
  n := n + 1; IF (ele->'trakter'->0->>'objekt_id') <> '00000000-0000-0000-0000-00000000000e' THEN fel := fel || 'Elefant 26: förra månadens E först'; END IF;
  SELECT t INTO tk FROM jsonb_array_elements(k->'trakter') t WHERE t->>'objekt_id' = '00000000-0000-0000-0000-00000000000e' AND t->>'roll' = 'skotare';
  n := n + 1; IF (tk->>'timmar')::numeric <> 24 OR (tk->>'forra_manaden')::boolean IS DISTINCT FROM true THEN fel := fel || ('E: 24 h kvar, förra månaden: ' || tk::text); END IF;
  n := n + 1; IF dg ?| ARRAY['2024-03-11', '2024-03-12', '2024-03-13'] THEN fel := fel || 'Elefant 26: Daniels ledighet 11–13 mars ska vara borträknad'; END IF;
  n := n + 1; IF ele->>'klar_datum' <> dg->>(ceil(round((24 + 24 + 8) / g15, 6)) - 1)::int THEN fel := fel || 'Elefant 26: klar efter ceil(56/g15) dagar (E 24 + A 24 + B 8)'; END IF;

  -- 4. E har ingen skördare tilldelad → ligger på Giants kö inte alls (och A står först där, som i 2).
  n := n + 1; IF EXISTS (SELECT 1 FROM jsonb_array_elements(giant->'trakter') x WHERE x->>'objekt_id' = '00000000-0000-0000-0000-00000000000e') THEN fel := fel || 'E (skördare saknar maskin) ska inte ligga på Giant'; END IF;

  -- 5. Wisent: skotarens prognos saknas på C → maskinen saknar prognos, inget datum, inga från–till.
  n := n + 1; IF (wis->>'saknar_prognos')::boolean IS DISTINCT FROM true OR wis->>'klar_datum' IS NOT NULL OR (wis->'trakter'->0->>'till') IS NOT NULL THEN fel := fel || ('Wisent: saknar prognos → klar_datum null: ' || wis::text); END IF;
  n := n + 1; IF (SELECT (t->>'saknar_prognos')::boolean FROM jsonb_array_elements(k->'trakter') t WHERE t->>'objekt_id' = '00000000-0000-0000-0000-00000000000c' AND t->>'roll' = 'skotare') IS DISTINCT FROM true THEN fel := fel || 'C skotare: saknar_prognos'; END IF;

  -- 6. H8E: C (12 h) → ceil(12/g15) dagar.
  g15 := (h8e->>'g15_per_dag')::numeric;
  n := n + 1; IF h8e->>'klar_datum' <> (h8e->'dagar')->>(ceil(round(12 / g15, 6)) - 1)::int THEN fel := fel || 'H8E: klar efter ceil(12/g15) dagar'; END IF;

  -- 7. D har ingen maskin: finns bland trakterna men på ingen maskins kö.
  n := n + 1; IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(k->'trakter') t WHERE t->>'objekt_id' = '00000000-0000-0000-0000-00000000000d' AND t->>'maskin_id' IS NULL) THEN fel := fel || 'D ska finnas utan maskin'; END IF;
  n := n + 1; IF EXISTS (SELECT 1 FROM jsonb_array_elements(k->'maskiner') m, jsonb_array_elements(m->'trakter') x WHERE x->>'objekt_id' = '00000000-0000-0000-0000-00000000000d') THEN fel := fel || 'D ska inte ligga på någon maskin'; END IF;

  -- 8. Spåren: trakt_volym = Σ månadens volym (A+B = 1 500 slutavverkning; C+D+F+G = 1 200 gallring) + förra månadens kvarvarande (E: 300 − skördat 0 = 300).
  n := n + 1; IF (SELECT (s->>'trakt_volym')::numeric FROM jsonb_array_elements(k->'spar') s WHERE s->>'typ' = 'slutavverkning') <> 1800 THEN fel := fel || 'slutavverkning trakt_volym = A 1000 + B 500 + E 300'; END IF;
  n := n + 1; IF (SELECT (s->>'trakt_volym')::numeric FROM jsonb_array_elements(k->'spar') s WHERE s->>'typ' = 'gallring') <> 1200 THEN fel := fel || 'gallring trakt_volym = C 200 + D 100 + F 100 + G 800'; END IF;

  -- 9. Innevarande månad (idag 20 mars): räknas från idag, inte från 1 mars.
  k2 := helikopter_ny_klar(2024, 3, '2024-03-20');
  n := n + 1; IF k2->>'start' <> '2024-03-20' THEN fel := fel || ('innevarande månad räknas från idag: ' || (k2->>'start')); END IF;
  n := n + 1; IF EXISTS (SELECT 1 FROM jsonb_array_elements(k2->'maskiner') m, jsonb_array_elements_text(m->'dagar') d WHERE d::date < '2024-03-20') THEN fel := fel || 'innevarande månad: inga dagar före idag'; END IF;
  SELECT m INTO giant FROM jsonb_array_elements(k2->'maskiner') m WHERE m->>'maskin_id' = 'PONS20SDJAA270231';
  n := n + 1; IF giant->'dagar'->>0 <> '2024-03-20' THEN fel := fel || ('Giants första dag ska vara idag 20 mars: ' || (giant->'dagar'->>0)); END IF;
  n := n + 1; IF (giant->>'efter_manad')::boolean IS DISTINCT FROM false THEN fel := fel || 'Giant hinner före månadens slut'; END IF;

  -- 10. 810E (manuell): snittakt (m³/dag) mot kvarvarande volym — samma takt som helikopter_ny_takt, dagar = rest_volym / takt.
  SELECT m INTO jd FROM jsonb_array_elements(k2->'maskiner') m WHERE m->>'maskin_id' = 'JD810E';
  SELECT t.takt INTO takt FROM helikopter_ny_takt(2024, 3, '2024-03-20') t WHERE t.maskin_id = 'JD810E' AND t.bas = 'totalt' AND t.typ = 'gallring';
  n := n + 1; IF (jd->>'manuell')::boolean IS DISTINCT FROM true THEN fel := fel || '810E är manuell'; END IF;
  n := n + 1; IF takt IS NULL OR abs((jd->'takt'->>'gallring')::numeric - takt) > 0.0001 THEN fel := fel || ('810E: takt i klar = helikopter_ny_takt: ' || coalesce(takt::text, 'null') || ' mot ' || coalesce(jd->'takt'->>'gallring', 'null')); END IF;
  n := n + 1; IF takt > 0 AND jd->>'klar_datum' IS DISTINCT FROM (jd->'dagar')->>(ceil(round(100 / takt, 6)) - 1)::int THEN fel := fel || ('810E: klar efter ceil(100/takt) dagar: ' || coalesce(jd->>'klar_datum', 'null')); END IF;

  -- 11. Rätt rättighet: bara inloggade/servicen får anropa (inte anon).
  n := n + 1; IF has_function_privilege('anon', 'public.helikopter_ny_klar(integer, integer, date)', 'EXECUTE') THEN fel := fel || 'anon får inte anropa helikopter_ny_klar'; END IF;
  n := n + 1; IF NOT has_function_privilege('authenticated', 'public.helikopter_ny_klar(integer, integer, date)', 'EXECUTE') THEN fel := fel || 'authenticated ska få anropa helikopter_ny_klar'; END IF;

  IF array_length(fel, 1) IS NULL THEN
    RAISE EXCEPTION 'TEST OK: % kontroller', n;
  ELSE
    RAISE EXCEPTION 'TEST FEL: %', array_to_string(fel, E'\n  · ');
  END IF;
END $t$;
