-- SQL-test: planerat stopp härlett ur ledighet + filer (migration 20261017120000_helikopter_planerat_stopp.sql).
--
-- Körs i EN transaktion som alltid rullas tillbaka: allt som skapas (syntetiska filer, ledighet, ett registrerat stopp) försvinner.
-- Köra: klistra in hela filen i Supabase SQL-editorn (eller via MCP execute_sql) EFTER att migrationen körts. Resultatet kommer som
-- ett fel på sista raden: "TEST OK: N kontroller" eller "TEST FEL: <de som föll>" — det är avsikten, det är så transaktionen rullas tillbaka.
--
-- Månad: mars 2024 (helt utan riktig data), idag = 2024-03-20. Arbetsdagar: 1, 4–8, 11–15, 18–22, 25–28 (långfredag 29:e är röd dag).
--   Gångna: 1, 4–8, 11–15, 18, 19 (13 st). Kvar: 20, 21, 22, 25, 26, 27, 28 (7 st).
-- Förare: Giant = Stefan + Joacim, Wisent = Max, 810E (manuell) = Oscar, R64428 = Oskar, Elefant 26 = Daniel.
--
-- Fall:
--   Giant   fil 1,4–8,14,19 · Stefan ledig 11–13 utan fil → planerat · 15 utan fil och ingen ledig → oförklarat
--           · 18 Joacim ledig (Stefan inte) utan fil → planerat (två förare, en ledig)
--   Wisent  fil på 13 fast Max är ledig → körd · Max "väntar" 6 (inte godkänd) utan fil → oförklarat · 12 utan fil → oförklarat
--   810E    fakt_lass filnamn 'manuell' 5 och 6 → körda (manuell fil är en fil) · övriga gångna dagar oförklarade
--   R64428  Oskar har DELDAG 14 (atk 12:00–) utan fil → oförklarat · registrerat stopp 25–26 (stopp + stopp_maskin) → registrerat
--   Elefant Daniel ledig 26–27 (framåt: inga filer än) → planerat, inte arbetsdag kvar

-- ── Data ────────────────────────────────────────────────────────────────────
INSERT INTO fakt_produktion (datum, maskin_id, objekt_id, volym_m3sub, monitoring_start)
SELECT d::date, 'PONS20SDJAA270231', '11083733', 100, d::timestamptz
FROM unnest(ARRAY['2024-03-01','2024-03-04','2024-03-05','2024-03-06','2024-03-07','2024-03-08','2024-03-14','2024-03-19']::date[]) d;
INSERT INTO fakt_produktion (datum, maskin_id, objekt_id, volym_m3sub, monitoring_start)
SELECT d::date, 'R64428', '11083733', 30, d::timestamptz
FROM unnest(ARRAY['2024-03-01','2024-03-04','2024-03-05','2024-03-06','2024-03-07','2024-03-08','2024-03-11','2024-03-12','2024-03-13','2024-03-15','2024-03-18','2024-03-19']::date[]) d;
INSERT INTO fakt_lass (datum, maskin_id, objekt_id, lass_nummer, volym_m3sub)
SELECT d::date, 'A030353', '11083733', 1, 50
FROM unnest(ARRAY['2024-03-01','2024-03-04','2024-03-05','2024-03-07','2024-03-08','2024-03-11','2024-03-13','2024-03-14','2024-03-15','2024-03-18','2024-03-19']::date[]) d;
INSERT INTO fakt_lass (datum, maskin_id, objekt_id, lass_nummer, volym_m3sub)
SELECT d::date, 'A130743', '11083733', 1, 60
FROM unnest(ARRAY['2024-03-01','2024-03-04','2024-03-05','2024-03-06','2024-03-07','2024-03-08','2024-03-11','2024-03-12','2024-03-13','2024-03-14','2024-03-15','2024-03-18','2024-03-19']::date[]) d;
INSERT INTO fakt_lass (datum, maskin_id, objekt_id, lass_nummer, volym_m3sub, filnamn)
SELECT d::date, 'JD810E', '11083733', 1, 40, 'manuell'
FROM unnest(ARRAY['2024-03-05','2024-03-06']::date[]) d;

INSERT INTO ledighet_ansokningar (anvandare_id, typ, startdatum, slutdatum, status, medarbetare_id)
SELECT 'test', 'semester', v.fran::date, v.till::date, v.status, m.id
FROM (VALUES
  ('Stefan',  '2024-03-11', '2024-03-13', 'godkänd'),
  ('Joacim',  '2024-03-18', '2024-03-18', 'godkänd'),
  ('Max',     '2024-03-13', '2024-03-13', 'godkänd'),
  ('Max',     '2024-03-06', '2024-03-06', 'väntar'),
  ('Daniel',  '2024-03-26', '2024-03-27', 'godkänd')
) AS v(fornamn, fran, till, status)
JOIN medarbetare m ON split_part(m.namn, ' ', 1) = v.fornamn AND m.maskin_id IS NOT NULL;
INSERT INTO ledighet_ansokningar (anvandare_id, typ, startdatum, slutdatum, status, medarbetare_id, fran_tid)
SELECT 'test', 'atk', '2024-03-14', '2024-03-14', 'godkänd', m.id, '12:00'
FROM medarbetare m WHERE split_part(m.namn, ' ', 1) = 'Oskar' AND m.maskin_id = 'R64428';

WITH s AS (INSERT INTO stopp (fran_datum, till_datum, orsak) VALUES ('2024-03-25', '2024-03-26', 'semesterstopp') RETURNING id)
INSERT INTO stopp_maskin (stopp_id, maskin_id) SELECT id, 'R64428' FROM s;

-- ── Kontroller ──────────────────────────────────────────────────────────────
CREATE TEMP TABLE kontroll (namn text, ok boolean);

-- helikopter_ny_maskindag: status/orsak per maskin och dag
INSERT INTO kontroll
SELECT v.namn, (SELECT md.status || COALESCE('/' || md.orsak, '') FROM helikopter_ny_maskindag(2024, 3, '2024-03-20') md WHERE md.maskin_id = v.maskin AND md.datum = v.dag::date) IS NOT DISTINCT FROM v.forvantat
FROM (VALUES
  ('fil → körd (Giant 4 mars)',                                     'PONS20SDJAA270231', '2024-03-04', 'kord'),
  ('ingen fil + Stefan ledig → planerat stopp (Giant 11 mars)',     'PONS20SDJAA270231', '2024-03-11', 'planerat/ledig:Stefan'),
  ('planerat stopp 13 mars',                                        'PONS20SDJAA270231', '2024-03-13', 'planerat/ledig:Stefan'),
  ('fil efter ledigheten → körd (Giant 14 mars)',                   'PONS20SDJAA270231', '2024-03-14', 'kord'),
  ('ingen fil + ingen ledighet → oförklarat (Giant 15 mars)',       'PONS20SDJAA270231', '2024-03-15', 'oforklarat'),
  ('två förare, bara Joacim ledig, ingen fil → planerat stopp',     'PONS20SDJAA270231', '2024-03-18', 'planerat/ledig:Joacim'),
  ('fil + ledig förare → körd (Wisent 13 mars)',                    'A030353',           '2024-03-13', 'kord'),
  ('ledighet som väntar är inte ledig → oförklarat (Wisent 6 mars)','A030353',           '2024-03-06', 'oforklarat'),
  ('ingen fil, ingen ledighet → oförklarat (Wisent 12 mars)',       'A030353',           '2024-03-12', 'oforklarat'),
  ('manuellt lass (filnamn manuell) → körd (810E 5 mars)',          'JD810E',            '2024-03-05', 'kord'),
  ('manuellt lass → körd (810E 6 mars)',                            'JD810E',            '2024-03-06', 'kord'),
  ('810E utan lass och utan ledighet → oförklarat (4 mars)',        'JD810E',            '2024-03-04', 'oforklarat'),
  ('deldag är inte en ledig dag → oförklarat (R64428 14 mars)',     'R64428',            '2024-03-14', 'oforklarat'),
  ('registrerat stopp (stopp_maskin) gäller som förut → registrerat','R64428',           '2024-03-25', 'registrerat/registrerat:semesterstopp'),
  ('framåt + ledig förare → planerat stopp, inte arbetsdag',        'A130743',           '2024-03-26', 'planerat/ledig:Daniel'),
  ('framåt utan ledighet → arbetsdag',                              'A130743',           '2024-03-25', 'arbetsdag'),
  ('idag utan fil och utan ledighet → arbetsdag, inte oförklarat',  'PONS20SDJAA270231', '2024-03-20', 'arbetsdag')
) AS v(namn, maskin, dag, forvantat);

-- helikopter_ny_arbetsdagar: per maskin = körda + oförklarade (gångna) + arbetsdagar kvar; global rad räknas som förut
INSERT INTO kontroll
SELECT v.namn, (SELECT ARRAY[a.totalt, a.gangna, a.kvar] FROM helikopter_ny_arbetsdagar(2024, 3, '2024-03-20') a WHERE a.maskin_id IS NOT DISTINCT FROM v.maskin) = v.forvantat
FROM (VALUES
  ('Giant: 16 dagar (20 − 4 planerade), 9 gångna, 7 kvar',            'PONS20SDJAA270231', ARRAY[16, 9, 7]),
  ('Wisent: alla dagar (oförklarat räknas)',                          'A030353',           ARRAY[20, 13, 7]),
  ('810E: alla dagar',                                                'JD810E',            ARRAY[20, 13, 7]),
  ('R64428: registrerat stopp tar 25–26',                             'R64428',            ARRAY[18, 13, 5]),
  ('Elefant 26: ledigheten 26–27 är inte arbetsdag kvar',             'A130743',           ARRAY[18, 13, 5])
) AS v(namn, maskin, forvantat);
INSERT INTO kontroll
SELECT 'global rad oförändrad: 20 / 13 / 7 (bara registrerade stopp räknas, någon maskin kör alltid)',
       (SELECT ARRAY[a.totalt, a.gangna, a.kvar] FROM helikopter_ny_arbetsdagar(2024, 3, '2024-03-20') a WHERE a.maskin_id IS NULL) = ARRAY[20, 13, 7];
INSERT INTO kontroll
SELECT 'planerade dagar finns inte i Giants takt-fönster (gangna_datum saknar 11–13 och 18 mars)',
       (SELECT NOT (a.gangna_datum && ARRAY['2024-03-11', '2024-03-12', '2024-03-13', '2024-03-18']::date[]) FROM helikopter_ny_arbetsdagar(2024, 3, '2024-03-20') a WHERE a.maskin_id = 'PONS20SDJAA270231');

-- helikopter_ny_stopp: närmaste stopp, oförklarade dagar, takt-fönster
INSERT INTO kontroll
SELECT 'Giant: senaste stoppet som varit = 18 mars (Joacim), 4 planerade dagar i månaden, oförklarat 15 mars, takt-fönstret börjar 7 mars',
       (SELECT ROW(s.stopp_fran, s.stopp_till, s.stopp_orsak, s.stopp_status, s.stopp_dagar_manad, s.oforklarade_datum, s.takt_fran)::text
          FROM helikopter_ny_stopp(2024, 3, '2024-03-20') s WHERE s.maskin_id = 'PONS20SDJAA270231')
       = ROW('2024-03-18'::date, '2024-03-18'::date, 'ledig:Joacim', 'varit', 4, ARRAY['2024-03-15']::date[], '2024-03-07'::date)::text;
INSERT INTO kontroll
SELECT 'Elefant 26: kommande stopp 26–27 mars (Daniel), kör igen 28 mars, inget oförklarat',
       (SELECT ROW(s.stopp_fran, s.stopp_till, s.stopp_orsak, s.stopp_status, s.stopp_kor_igen, s.stopp_dagar, s.oforklarade_datum)::text
          FROM helikopter_ny_stopp(2024, 3, '2024-03-20') s WHERE s.maskin_id = 'A130743')
       = ROW('2024-03-26'::date, '2024-03-27'::date, 'ledig:Daniel', 'kommande', '2024-03-28'::date, 2, ARRAY[]::date[])::text;
INSERT INTO kontroll
SELECT 'R64428: registrerat stopp 25–26 mars kommande, kör igen 27 mars; deldagen 14 mars är oförklarad',
       (SELECT ROW(s.stopp_fran, s.stopp_till, s.stopp_orsak, s.stopp_status, s.stopp_kor_igen, s.oforklarade_datum)::text
          FROM helikopter_ny_stopp(2024, 3, '2024-03-20') s WHERE s.maskin_id = 'R64428')
       = ROW('2024-03-25'::date, '2024-03-26'::date, 'registrerat:semesterstopp', 'kommande', '2024-03-27'::date, ARRAY['2024-03-14']::date[])::text;
INSERT INTO kontroll
SELECT 'Wisent: inget stopp och inget oförklarat i takt-fönstret (12 mars ligger utanför de 5 dagarna)',
       (SELECT s.oforklarade_datum FROM helikopter_ny_stopp(2024, 3, '2024-03-20') s WHERE s.maskin_id = 'A030353') = ARRAY[]::date[]
       AND (SELECT s.stopp_fran FROM helikopter_ny_stopp(2024, 3, '2024-03-20') s WHERE s.maskin_id = 'A030353') IS NULL;
INSERT INTO kontroll
SELECT '810E: alla fem dagar i fönstret oförklarade (ingen fil, ingen ledighet)',
       (SELECT s.oforklarade_datum FROM helikopter_ny_stopp(2024, 3, '2024-03-20') s WHERE s.maskin_id = 'JD810E')
       = ARRAY['2024-03-13', '2024-03-14', '2024-03-15', '2024-03-18', '2024-03-19']::date[];

-- helikopter_ny_takt: snitt över maskinens 5 senaste körda/oförklarade dagar, planerade stopp hoppas över
INSERT INTO kontroll
SELECT v.namn, (SELECT ROW(t.takt, t.takt_dagar, t.kvar)::text FROM helikopter_ny_takt(2024, 3, '2024-03-20') t
                WHERE t.typ = 'slutavverkning' AND t.bas = 'totalt' AND t.maskin_id = v.maskin) = v.forvantat
FROM (VALUES
  ('Giant: fönstret 7, 8, 14, 15, 19 mars = 4 filer × 100 + oförklarat 15 mars (0) → 80/dag, 7 dagar kvar', 'PONS20SDJAA270231', '(80.0000,5,7)'),
  ('Wisent: fönstret 13–19 mars, filen 13 mars räknas fast Max var ledig → 50/dag',                        'A030353',           '(50.0000,5,7)'),
  ('810E: inga lass i fönstret → 0/dag (oförklarat räknas som 0, inte som utebliven dag)',                 'JD810E',            '(0.0000,5,7)'),
  ('R64428: deldagen 14 mars räknas som 0 → 4 × 30 / 5 = 24/dag, 5 dagar kvar (registrerat stopp)',        'R64428',            '(24.0000,5,5)'),
  ('Elefant 26: 60/dag, bara 5 dagar kvar (ledig 26–27 mars)',                                            'A130743',           '(60.0000,5,5)')
) AS v(namn, maskin, forvantat);

-- helikopter_ny_spar: takten är summan av maskinernas takt (skördare 80 + 24, skotare 50 + 0 + 60)
INSERT INTO kontroll
SELECT 'spår: takt_skordat 104, takt_skotat 110, oskotat −6/dag, takt_dagar 5',
       (SELECT ROW(s.takt_skordat, s.takt_skotat, s.oskotat_forandring_per_dag, s.takt_dagar)::text
          FROM helikopter_ny_spar(2024, 3, '2024-03-20') s WHERE s.typ = 'slutavverkning' AND s.bas = 'totalt')
       = '(104.0,110.0,-6.0,5)';

-- Härledda stopp lagras aldrig: bara vårt eget registrerade stopp finns i stopp
INSERT INTO kontroll
SELECT 'stopp/stopp_maskin: bara det registrerade stoppet (inga härledda rader)',
       (SELECT count(*) FROM stopp WHERE fran_datum BETWEEN '2024-03-01' AND '2024-03-31') = 1
       AND (SELECT count(*) FROM stopp_maskin sm JOIN stopp s ON s.id = sm.stopp_id WHERE s.fran_datum BETWEEN '2024-03-01' AND '2024-03-31') = 1;

-- Veckoläget (och onsdagsnotisen) bär samma takt och stopp
INSERT INTO kontroll
SELECT 'helikopter_veckolage: nycklarna takt och stopp finns och har rader',
       jsonb_array_length(helikopter_veckolage('2024-03-20') -> 'takt') > 0 AND jsonb_array_length(helikopter_veckolage('2024-03-20') -> 'stopp') = 7;  -- 7 aktiva maskiner i mars 2024 (även de som såldes senare)

-- ── Resultat (rullar alltid tillbaka) ───────────────────────────────────────
DO $resultat$
DECLARE
  v_fel text;
  v_antal int;
BEGIN
  SELECT count(*) INTO v_antal FROM kontroll;
  SELECT string_agg(namn, E'\n  - ') INTO v_fel FROM kontroll WHERE ok IS NOT TRUE;
  IF v_fel IS NOT NULL THEN
    RAISE EXCEPTION E'TEST FEL: % av % kontroller föll:\n  - %', (SELECT count(*) FROM kontroll WHERE ok IS NOT TRUE), v_antal, v_fel;
  END IF;
  RAISE EXCEPTION 'TEST OK: % kontroller (transaktionen rullas tillbaka)', v_antal;
END
$resultat$;
