-- SQL-test: helikoptern räknar Optis lass OCH appens lass utan dubbel (migration 20261027183608_helikopter_lass_app_och_opti.sql).
--
-- Körs i EN transaktion som alltid rullas tillbaka. Klistra in hela filen i SQL-editorn (eller via MCP execute_sql) EFTER migrationen.
-- Resultatet är ett fel på sista raden: "TEST OK: N kontroller" eller "TEST FEL: …" — det är så transaktionen rullas tillbaka.
--
-- Månad: mars 2024 (utan riktig data). Testobjektet TEST_LASS (dim_objekt, VO 99990001, slutavverkning Vida) och ett appjobb
-- i objekt med samma VO. Skotaren A030353.
--   1 mars  Opti 50 · appen 20 (ett lass, Klar)            → 50 (Opti störst)
--   4 mars  Opti 40 · appen 60                              → 60 (appen störst), aldrig 100
--   5 mars  bara appen 30                                   → 30
--   6 mars  bara Opti 25                                    → 25
--   7 mars  appen 80 men bekraftad_av = 'auto'              → räknas inte (0)
--   8 mars  appen 70 men status 'vantar_forare'             → räknas inte (0)
--   11 mars appen 10 skalad med faktor 2 (Färdigskotad)     → 20
--   12 mars (avslutsdag) tillägg 15                         → 15 på skotaren
--   Summa skotat i spåret = 50 + 60 + 30 + 25 + 20 + 15 = 200; maskindag 1, 4, 5, 6, 11, 12 mars körda, 7 och 8 mars inte körda av appen.

CREATE TEMP TABLE kontroll (namn text, ok boolean);

INSERT INTO dim_objekt (objekt_id, object_name, huvudtyp, bolag, vo_nummer) VALUES ('TEST_LASS', 'Testtrakt lass', 'Slutavverkning', 'Vida', '99990001');
INSERT INTO objekt (id, namn, vo_nummer) VALUES ('00000000-0000-0000-0000-0000000000a1', 'Testtrakt lass', '99990001');

INSERT INTO fakt_lass (datum, maskin_id, objekt_id, lass_nummer, volym_m3sub) VALUES
  ('2024-03-01', 'A030353', 'TEST_LASS', 1, 50),
  ('2024-03-04', 'A030353', 'TEST_LASS', 1, 40),
  ('2024-03-06', 'A030353', 'TEST_LASS', 1, 25);

INSERT INTO skotar_lass (id, objekt_id, vo_nummer, maskin_id, lass_nummer, datum, status, bekraftad_av, bekraftad_tid) VALUES
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', '99990001', 'A030353', 1, '2024-03-01', 'bekraftat', 'forare', '2024-03-01 10:00+01'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1', '99990001', 'A030353', 2, '2024-03-04', 'bekraftat', 'forare', '2024-03-04 10:00+01'),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a1', '99990001', 'A030353', 3, '2024-03-05', 'bekraftat', 'forare', '2024-03-05 10:00+01'),
  ('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000a1', '99990001', 'A030353', 4, '2024-03-07', 'bekraftat', 'auto',   '2024-03-07 10:00+01'),
  ('00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000000a1', '99990001', 'A030353', 5, '2024-03-08', 'vantar_forare', null, null),
  ('00000000-0000-0000-0000-0000000000b6', '00000000-0000-0000-0000-0000000000a1', '99990001', 'A030353', 6, '2024-03-11', 'bekraftat', 'forare', '2024-03-11 10:00+01');
INSERT INTO skotar_lass_del (lass_id, del_nr, lossad_tid, lat, lng)
SELECT id, 1, (datum::text || ' 09:30+01')::timestamptz, 56.5, 15.0 FROM skotar_lass WHERE id::text LIKE '00000000-0000-0000-0000-0000000000b%';
INSERT INTO skotar_lass_sortiment (lass_id, del_nr, sortiment_nyckel, sortiment_namn, m3_forare) VALUES
  ('00000000-0000-0000-0000-0000000000b1', 1, 'timmer', 'Timmer', 20),
  ('00000000-0000-0000-0000-0000000000b2', 1, 'timmer', 'Timmer', 60),
  ('00000000-0000-0000-0000-0000000000b3', 1, 'timmer', 'Timmer', 30),
  ('00000000-0000-0000-0000-0000000000b4', 1, 'timmer', 'Timmer', 80),
  ('00000000-0000-0000-0000-0000000000b5', 1, 'timmer', 'Timmer', 70),
  ('00000000-0000-0000-0000-0000000000b6', 1, 'massa',  'Massa', 10);

-- Före Färdigskotad: faktor 1 på allt
INSERT INTO kontroll
SELECT 'vyn: per dag största källan, aldrig summan (1: 50 opti · 4: 60 app · 5: 30 app · 6: 25 opti · 7 och 8: inget)',
       (SELECT string_agg(datum::text || '=' || round(volym_m3sub) || kalla, ' ' ORDER BY datum)
          FROM helikopter_lass WHERE objekt_id = 'TEST_LASS')
       = '2024-03-01=50opti 2024-03-04=60app 2024-03-05=30app 2024-03-06=25opti 2024-03-11=10app';

-- Färdigskotad: massa × 2, tillägg 15 timmer på avslutsdagen 12 mars
INSERT INTO skotar_trakt_avslut (objekt_id, vo_nummer, avslutad_tid, skordat, rapporterat, faktorer, tillagg, skillnad_m3)
VALUES ('00000000-0000-0000-0000-0000000000a1', '99990001', '2024-03-12 15:00+01', '{}', '{}', '{"massa": 2}', '{"timmer": 15}', 0);

INSERT INTO kontroll
SELECT 'Färdigskotad: appens lass skalas (11 mars 10 × 2 = 20) och tillägget ligger på avslutsdagen (12 mars 15)',
       (SELECT string_agg(datum::text || '=' || round(volym_m3sub), ' ' ORDER BY datum)
          FROM helikopter_lass WHERE objekt_id = 'TEST_LASS' AND datum >= '2024-03-11')
       = '2024-03-11=20 2024-03-12=15';

INSERT INTO kontroll
SELECT 'spåret: skotat i mars = 200 (50 + 60 + 30 + 25 + 20 + 15)',
       (SELECT round(s.skotat) FROM helikopter_ny_spar(2024, 3, '2024-03-20') s WHERE s.typ = 'slutavverkning' AND s.bas = 'totalt') = 200;

INSERT INTO kontroll
SELECT 'dagvyn: 4 mars 60, 7 och 8 mars inga rader från TEST_LASS',
       (SELECT round(sum(skotat)) FROM helikopter_ny_dag WHERE datum = '2024-03-04' AND typ = 'slutavverkning' AND bolag = 'Vida') = 60
       AND NOT EXISTS (SELECT 1 FROM helikopter_ny_dag WHERE datum IN ('2024-03-07', '2024-03-08') AND skotat > 0);

INSERT INTO kontroll
SELECT 'maskindag: ett app-lass gör dagen körd (5 mars), ett auto-lass gör det inte (7 mars)',
       (SELECT md.status FROM helikopter_ny_maskindag(2024, 3, '2024-03-20') md WHERE md.maskin_id = 'A030353' AND md.datum = '2024-03-05') = 'kord'
       AND (SELECT md.status FROM helikopter_ny_maskindag(2024, 3, '2024-03-20') md WHERE md.maskin_id = 'A030353' AND md.datum = '2024-03-07') <> 'kord';

INSERT INTO kontroll
SELECT 'ingen helikopterfunktion läser fakt_lass direkt',
       NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.proname LIKE 'helikopter%' AND pg_get_functiondef(p.oid) LIKE '%FROM fakt_lass%');

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
