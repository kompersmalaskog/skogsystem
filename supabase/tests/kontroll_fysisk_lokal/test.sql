\set ON_ERROR_STOP on
\i stub.sql
\i data.sql
\echo '--- före'
SELECT count(*) AS stockar_fore FROM detalj_kontroll_stock;
-- Förra rensningens index släpper igenom omnumrerade kopior: så såg prod ut
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM (SELECT 1 FROM detalj_kontroll_stock GROUP BY maskin_id, harvest_date, stock_nummer, machine_measurement_date, operator_measurement_date HAVING count(*) > 1) g;
  IF n <> 5 THEN RAISE EXCEPTION 'FEL: % fysiska grupper med kopior i testdatan, väntade 5', n; END IF;
END $$;
\i ../../migrations/20261024180014_kontroll_stock_fysisk_1_rensa.sql
DO $$
DECLARE n int; m int; k int; o text;
BEGIN
  SELECT count(*) INTO n FROM detalj_kontroll_stock;
  -- T1 st1+st2 (2) + T2 (1) + T3 (1) + omkontrollen (1) + g/h-stocken (1) + andra maskinens (1) = 7; före: 11 + 2 + 1 + 2 + 1 = 17 → 10 borttagna
  IF n <> 7 THEN RAISE EXCEPTION 'FEL: % rader efter rensning, väntade 7', n; END IF;
  SELECT count(*) INTO m FROM detalj_kontroll_stock_matpunkt;
  IF m <> 7 * 2 THEN RAISE EXCEPTION 'FEL: % matpunkter, väntade 14 (cascade, de behållna raderna har alla sina)', m; END IF;
  -- T1 stock 1: behåller a.hqc (tidigast kontroll_datum) och omkontrollen i f.hqc
  SELECT string_agg(filnamn, ',' ORDER BY filnamn) INTO o FROM detalj_kontroll_stock WHERE maskin_id = 'PONS' AND harvest_date = '2026-01-15 10:07:40+00' AND stock_nummer = 1;
  IF o <> 'a.hqc,f.hqc' THEN RAISE EXCEPTION 'FEL: T1 stock 1 ligger i %, väntade a.hqc,f.hqc', o; END IF;
  -- T2: b och c har samma kontroll_datum (16/1) → lägst id (b) behålls
  SELECT filnamn INTO o FROM detalj_kontroll_stock WHERE harvest_date = '2026-01-16 09:00:00+00';
  IF o <> 'b.hqc' THEN RAISE EXCEPTION 'FEL: T2 behölls i %, väntade b.hqc (lika datum → lägst id)', o; END IF;
  -- T3 (omätt, NULL-mättid): äldsta d.hqc, inte e.hqc
  SELECT filnamn INTO o FROM detalj_kontroll_stock WHERE harvest_date = '2026-01-19 08:00:00+00';
  IF o <> 'd.hqc' THEN RAISE EXCEPTION 'FEL: omätt stock behölls i %, väntade d.hqc', o; END IF;
  -- tidigast KONTROLL_DATUM går före lägst id: g.hqc har lägre id men h.hqc äldre datum
  SELECT filnamn INTO o FROM detalj_kontroll_stock WHERE harvest_date = '2026-02-01 08:00:00+00';
  IF o <> 'h.hqc' THEN RAISE EXCEPTION 'FEL: behöll % i stället för h.hqc (tidigast kontroll_datum)', o; END IF;
  -- stam_nummer på den behållna raden är den ur den behållna filen
  SELECT stam_nummer INTO k FROM detalj_kontroll_stock WHERE filnamn = 'h.hqc';
  IF k <> 2 THEN RAISE EXCEPTION 'FEL: stam_nummer ändrades (%)', k; END IF;
END $$;
\echo '--- rensning ok'
\i ../../migrations/20261024180037_kontroll_stock_fysisk_2_unikt_index.sql
-- Importens skrivning: ON CONFLICT mot den fysiska nyckeln, ignore-duplicates
DO $$
DECLARE n int;
BEGIN
  -- ny ackumulerande fil: 2 kända stockar under NYA stam_nummer + 1 ny stock
  INSERT INTO detalj_kontroll_stock (filnamn, maskin_id, kontroll_datum, harvest_date, stam_nummer, stock_nummer,
    maskin_langd_cm, operator_langd_cm, machine_measurement_date, operator_measurement_date)
  VALUES ('k.hqc','PONS','2026-03-02','2026-01-15 10:07:40+00',8,1,343,343,'2026-01-15 10:07:40+00','2026-01-15 10:09:40+00'),
         ('k.hqc','PONS','2026-03-02','2026-01-19 08:00:00+00',9,1,400,400,'2026-01-19 08:00:00+00',NULL),
         ('k.hqc','PONS','2026-03-02','2026-03-02 08:00:00+00',10,1,500,500,'2026-03-02 08:00:00+00','2026-03-02 08:05:00+00')
  ON CONFLICT (maskin_id, harvest_date, stock_nummer, machine_measurement_date, operator_measurement_date) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FEL: % rader insatta, väntade 1 (bara den nya)', n; END IF;
  -- samma fil igen: inget nytt
  INSERT INTO detalj_kontroll_stock (filnamn, maskin_id, kontroll_datum, harvest_date, stam_nummer, stock_nummer,
    maskin_langd_cm, operator_langd_cm, machine_measurement_date, operator_measurement_date)
  VALUES ('k.hqc','PONS','2026-03-02','2026-03-02 08:00:00+00',10,1,500,500,'2026-03-02 08:00:00+00','2026-03-02 08:05:00+00')
  ON CONFLICT (maskin_id, harvest_date, stock_nummer, machine_measurement_date, operator_measurement_date) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FEL: omkörning satte in % rader', n; END IF;
  -- utan ON CONFLICT: en omnumrerad kopia under nytt filnamn stoppas av indexet (det gamla släppte igenom den)
  BEGIN
    INSERT INTO detalj_kontroll_stock (filnamn, maskin_id, kontroll_datum, harvest_date, stam_nummer, stock_nummer,
      maskin_langd_cm, machine_measurement_date, operator_measurement_date)
    VALUES ('l.hqc','PONS','2026-03-03','2026-03-02 08:00:00+00',77,1,500,'2026-03-02 08:00:00+00','2026-03-02 08:05:00+00');
    RAISE EXCEPTION 'FEL: indexet släppte igenom en omnumrerad kopia';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  -- omätt stock (operatörstid NULL) räknas som lika: en omnumrerad kopia av den stoppas också
  BEGIN
    INSERT INTO detalj_kontroll_stock (filnamn, maskin_id, kontroll_datum, harvest_date, stam_nummer, stock_nummer,
      maskin_langd_cm, machine_measurement_date, operator_measurement_date)
    VALUES ('o.hqc','PONS','2026-03-03','2026-01-19 08:00:00+00',55,1,400,'2026-01-19 08:00:00+00',NULL);
    RAISE EXCEPTION 'FEL: indexet släppte igenom en kopia av en omätt stock';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  -- en riktig omkontroll (annan operatörsmättid) är fortfarande en egen rad
  INSERT INTO detalj_kontroll_stock (filnamn, maskin_id, kontroll_datum, harvest_date, stam_nummer, stock_nummer,
    maskin_langd_cm, machine_measurement_date, operator_measurement_date)
  VALUES ('m.hqc','PONS','2026-03-04','2026-03-02 08:00:00+00',1,1,500,'2026-03-02 08:00:00+00','2026-03-04 07:00:00+00');
END $$;
\echo '--- index och ON CONFLICT ok'
\i ../../migrations/20261024180041_kalibrering_kontroller_funktion.sql
DO $$
DECLARE n int; saknas text; med text;
BEGIN
  SELECT count(*) INTO n FROM fakt_kalibrering;
  IF n <> 10 THEN RAISE EXCEPTION 'FEL: testdatan har % kontroller', n; END IF;
  -- Efter rensningen: c, e, g saknar egna stockar (b respektive d/a/h behöll allt) + i hade aldrig några; n har en egen (annan maskin).
  SELECT string_agg(filnamn, ',' ORDER BY filnamn) INTO saknas FROM fakt_kalibrering k
    WHERE NOT EXISTS (SELECT 1 FROM kalibrering_kontroller() c WHERE c.filnamn = k.filnamn);
  IF saknas <> 'c.hqc,e.hqc,g.hqc,i.hqc' THEN RAISE EXCEPTION 'FEL: dolda kontroller: %', saknas; END IF;
  SELECT string_agg(filnamn, ',' ORDER BY filnamn) INTO med FROM kalibrering_kontroller();
  IF med <> 'a.hqc,b.hqc,d.hqc,f.hqc,h.hqc,n.hqc' THEN RAISE EXCEPTION 'FEL: synliga kontroller: %', med; END IF;
  -- raderna finns kvar i fakt_kalibrering (inget raderas)
  SELECT count(*) INTO n FROM fakt_kalibrering;
  IF n <> 10 THEN RAISE EXCEPTION 'FEL: fakt_kalibrering ändrades (%)', n; END IF;
  -- kolumnerna följer tabellen: en ny kolumn syns direkt i funktionens rader
  ALTER TABLE fakt_kalibrering ADD COLUMN ny_kolumn text DEFAULT 'x';
  PERFORM ny_kolumn FROM kalibrering_kontroller() LIMIT 1;
  -- samma filnamn hos en annan maskin räknas inte som en egen stock
  INSERT INTO fakt_kalibrering (filnamn, maskin_id, datum) VALUES ('a.hqc2', 'ANNAN', '2026-04-01');
  INSERT INTO detalj_kontroll_stock (filnamn, maskin_id, kontroll_datum, harvest_date, stam_nummer, stock_nummer, machine_measurement_date, operator_measurement_date)
    VALUES ('a.hqc2', 'PONS', '2026-04-01', '2026-04-01 08:00:00+00', 1, 1, '2026-04-01 08:00:00+00', NULL);
  SELECT count(*) INTO n FROM kalibrering_kontroller() WHERE filnamn = 'a.hqc2';
  IF n <> 0 THEN RAISE EXCEPTION 'FEL: kontrollen räknades med stock från en annan maskin'; END IF;
END $$;
\echo '--- funktionen ok'
\echo 'KLART'
