-- Scorpionen: stam 1 (2 stockar) i fyra ackumulerande filer + ny stam 2 i sista filen
INSERT INTO detalj_kontroll_stock (filnamn, maskin_id, kontroll_datum, harvest_date, stam_nummer, stock_nummer,
  maskin_langd_cm, operator_langd_cm, machine_measurement_date, operator_measurement_date)
SELECT f.filnamn, 'PONS', f.dag::date, '2026-01-15 10:07:40+00', 1, s.n, 343, 343, '2026-01-15 10:07:40+00', '2026-01-15 10:09:00+00'
FROM (VALUES ('a.hqc','2026-01-15'),('b.hqc','2026-01-16'),('c.hqc','2026-01-16'),('d.hqc','2026-01-19')) f(filnamn, dag),
     (VALUES (1),(2)) s(n);
INSERT INTO detalj_kontroll_stock (filnamn, maskin_id, kontroll_datum, harvest_date, stam_nummer, stock_nummer,
  maskin_langd_cm, operator_langd_cm, machine_measurement_date, operator_measurement_date)
VALUES ('d.hqc','PONS','2026-01-19','2026-01-19 08:00:00+00',2,1,400,400,'2026-01-19 08:00:00+00',NULL);
-- Omätt stock (operator-tid NULL) upprepad i en senare fil → ska räknas som lika
INSERT INTO detalj_kontroll_stock (filnamn, maskin_id, kontroll_datum, harvest_date, stam_nummer, stock_nummer,
  maskin_langd_cm, operator_langd_cm, machine_measurement_date, operator_measurement_date)
VALUES ('e.hqc','PONS','2026-01-20','2026-01-19 08:00:00+00',2,1,400,400,'2026-01-19 08:00:00+00',NULL);
-- Riktig omkontroll: samma stock, annan operatörsmättid → egen rad
INSERT INTO detalj_kontroll_stock (filnamn, maskin_id, kontroll_datum, harvest_date, stam_nummer, stock_nummer,
  maskin_langd_cm, operator_langd_cm, machine_measurement_date, operator_measurement_date)
VALUES ('f.hqc','PONS','2026-01-25','2026-01-15 10:07:40+00',1,1,343,344,'2026-01-15 10:07:40+00','2026-01-25 07:00:00+00');
-- Rössmåla: fem stockar, äldsta filen har fel objekt
INSERT INTO detalj_kontroll_stock (filnamn, maskin_id, objekt_id, kontroll_datum, harvest_date, stam_nummer, stock_nummer,
  maskin_langd_cm, operator_langd_cm, machine_measurement_date, operator_measurement_date)
SELECT f.filnamn, 'R64428', f.obj, f.dag::date, '2026-08-03 08:23:37.376596+00', 1, s.n, 300, 300, '2026-08-03 08:23:37+00', '2026-08-03 08:30:00+00'
FROM (VALUES ('r1.hqc','11077137','2026-08-03'),('r2.hqc','11240372','2026-08-05'),('r3.hqc','11240372','2026-08-12')) f(filnamn,obj,dag),
     (VALUES (1),(2),(3),(4),(5)) s(n);
-- Mätpunkter under varje rad
INSERT INTO detalj_kontroll_stock_matpunkt (detalj_kontroll_stock_id, position_cm)
SELECT id, p FROM detalj_kontroll_stock, (VALUES (100),(200)) q(p);
