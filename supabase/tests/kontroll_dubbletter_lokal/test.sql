\set ON_ERROR_STOP on
\i stub.sql
\i data.sql
\echo '--- före'
SELECT count(*) AS stockar_fore FROM detalj_kontroll_stock;
\i ../../migrations/20261022091051_kontroll_stock_dubbletter_1_rensa.sql
DO $$
DECLARE n int; m int; o text; k int;
BEGIN
  SELECT count(*) INTO n FROM detalj_kontroll_stock;
  -- Scorpion: stam1 st1+st2 (en rad var, äldsta) + omkontrollen + stam2 (en rad) = 4 ; Rössmåla 5
  IF n <> 4 + 5 THEN RAISE EXCEPTION 'FEL: % rader efter rensning, väntade 9', n; END IF;
  SELECT count(*) INTO m FROM detalj_kontroll_stock_matpunkt;
  IF m <> 9 * 2 THEN RAISE EXCEPTION 'FEL: % matpunkter, väntade 18 (cascade)', m; END IF;
  SELECT min(filnamn) INTO o FROM detalj_kontroll_stock WHERE maskin_id='PONS' AND stam_nummer=1 AND stock_nummer=1 AND operator_measurement_date < '2026-01-16';
  IF o <> 'a.hqc' THEN RAISE EXCEPTION 'FEL: behöll % i stället för äldsta a.hqc', o; END IF;
  SELECT count(*) INTO k FROM detalj_kontroll_stock WHERE maskin_id='R64428' AND objekt_id='11240372';
  IF k <> 5 THEN RAISE EXCEPTION 'FEL: Rössmåla-stockar med 11240372: %, väntade 5', k; END IF;
  SELECT count(*) INTO k FROM detalj_kontroll_stock WHERE objekt_id='11077137';
  IF k <> 0 THEN RAISE EXCEPTION 'FEL: % rader kvar på 11077137', k; END IF;
  -- omätt stock (operator-tid NULL) bara en gång
  SELECT count(*) INTO k FROM detalj_kontroll_stock WHERE stam_nummer=2;
  IF k <> 1 THEN RAISE EXCEPTION 'FEL: omätt stock % gånger', k; END IF;
END $$;
\echo '--- rensning ok'
\i ../../migrations/20261022091100_kontroll_stock_dubbletter_2_unikt_index.sql
-- Importens skrivning: ON CONFLICT mot den nya nyckeln, ignore-duplicates
DO $$
DECLARE n int; k int;
BEGIN
  -- ackumulerande ny fil: 2 gamla (andra filnamn) + 1 ny stock
  INSERT INTO detalj_kontroll_stock (filnamn, maskin_id, kontroll_datum, harvest_date, stam_nummer, stock_nummer,
    maskin_langd_cm, operator_langd_cm, machine_measurement_date, operator_measurement_date)
  VALUES ('g.hqc','PONS','2026-02-01','2026-01-15 10:07:40+00',1,1,343,343,'2026-01-15 10:07:40+00','2026-01-15 10:09:00+00'),
         ('g.hqc','PONS','2026-02-01','2026-01-19 08:00:00+00',2,1,400,400,'2026-01-19 08:00:00+00',NULL),
         ('g.hqc','PONS','2026-02-01','2026-02-01 08:00:00+00',3,1,500,500,'2026-02-01 08:00:00+00','2026-02-01 08:05:00+00')
  ON CONFLICT (maskin_id, harvest_date, stam_nummer, stock_nummer, machine_measurement_date, operator_measurement_date) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FEL: % rader insatta, väntade 1 (bara den nya)', n; END IF;
  -- samma fil igen: inget nytt
  INSERT INTO detalj_kontroll_stock (filnamn, maskin_id, kontroll_datum, harvest_date, stam_nummer, stock_nummer,
    maskin_langd_cm, operator_langd_cm, machine_measurement_date, operator_measurement_date)
  VALUES ('g.hqc','PONS','2026-02-01','2026-02-01 08:00:00+00',3,1,500,500,'2026-02-01 08:00:00+00','2026-02-01 08:05:00+00')
  ON CONFLICT (maskin_id, harvest_date, stam_nummer, stock_nummer, machine_measurement_date, operator_measurement_date) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FEL: omkörning satte in % rader', n; END IF;
  -- utan ON CONFLICT ger en ny kopia under nytt filnamn ett fel (indexet vaktar)
  BEGIN
    INSERT INTO detalj_kontroll_stock (filnamn, maskin_id, kontroll_datum, harvest_date, stam_nummer, stock_nummer,
      maskin_langd_cm, machine_measurement_date, operator_measurement_date)
    VALUES ('h.hqc','PONS','2026-02-02','2026-02-01 08:00:00+00',3,1,500,'2026-02-01 08:00:00+00','2026-02-01 08:05:00+00');
    RAISE EXCEPTION 'FEL: indexet släppte igenom en kopia';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;
\echo '--- index och ON CONFLICT ok'
\echo 'KLART'
