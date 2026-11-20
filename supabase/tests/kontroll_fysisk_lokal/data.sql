-- Scorpionen: fyra ackumulerande filer. Maskinen numrerar om stammarna i varje fil:
--   stam T1 (skördad 15 jan, två stockar) heter 1 i a, 2 i b, 4 i c, 6 i d
--   stam T2 (skördad 16 jan, en stock) kommer med i b som stam 3, heter 5 i c och 7 i d
--   stam T3 (skördad 19 jan, en stock, omätt: operatörstid NULL) är ny i d som stam 8 och upprepas i e som stam 9
-- (inga kopior med SAMMA stam_nummer: dem tog förra rensningen redan bort)
-- kontroll_datum: a 15/1, b 16/1, c 16/1 (samma dag som b → lägst id avgör), d 19/1, e 20/1
INSERT INTO detalj_kontroll_stock (filnamn, maskin_id, objekt_id, kontroll_datum, harvest_date, stam_nummer, stock_nummer,
  maskin_langd_cm, operator_langd_cm, machine_measurement_date, operator_measurement_date, stem_selection)
SELECT t.filnamn, 'PONS', '1', t.dag::date, t.harvest::timestamptz, t.stam, t.nr,
       343, 343, t.harvest::timestamptz, t.harvest::timestamptz + interval '2 min', 'Randomly selected stem'
FROM (VALUES
  ('a.hqc','2026-01-15','2026-01-15 10:07:40+00',1,1),('a.hqc','2026-01-15','2026-01-15 10:07:40+00',1,2),
  ('b.hqc','2026-01-16','2026-01-15 10:07:40+00',2,1),('b.hqc','2026-01-16','2026-01-15 10:07:40+00',2,2),
  ('b.hqc','2026-01-16','2026-01-16 09:00:00+00',3,1),
  ('c.hqc','2026-01-16','2026-01-15 10:07:40+00',4,1),('c.hqc','2026-01-16','2026-01-15 10:07:40+00',4,2),
  ('c.hqc','2026-01-16','2026-01-16 09:00:00+00',5,1),
  ('d.hqc','2026-01-19','2026-01-15 10:07:40+00',6,1),('d.hqc','2026-01-19','2026-01-15 10:07:40+00',6,2),
  ('d.hqc','2026-01-19','2026-01-16 09:00:00+00',7,1)
) AS t(filnamn, dag, harvest, stam, nr);
-- T3: ny i d (omätt), upprepad i e under ett annat stam_nummer
INSERT INTO detalj_kontroll_stock (filnamn, maskin_id, objekt_id, kontroll_datum, harvest_date, stam_nummer, stock_nummer,
  maskin_langd_cm, operator_langd_cm, machine_measurement_date, operator_measurement_date, stem_selection)
VALUES ('d.hqc','PONS','1','2026-01-19','2026-01-19 08:00:00+00',8,1,400,400,'2026-01-19 08:00:00+00',NULL,'Randomly selected stem'),
       ('e.hqc','PONS','1','2026-01-20','2026-01-19 08:00:00+00',9,1,400,400,'2026-01-19 08:00:00+00',NULL,'Randomly selected stem');
-- En RIKTIG omkontroll av T1 stock 1 (annan operatörsmättid) → egen rad, ska bevaras
INSERT INTO detalj_kontroll_stock (filnamn, maskin_id, objekt_id, kontroll_datum, harvest_date, stam_nummer, stock_nummer,
  maskin_langd_cm, operator_langd_cm, machine_measurement_date, operator_measurement_date, stem_selection)
VALUES ('f.hqc','PONS','1','2026-01-25','2026-01-15 10:07:40+00',1,1,343,344,'2026-01-15 10:07:40+00','2026-01-25 07:00:00+00','Randomly selected stem');
-- Där kontroll_datum och id säger olika: sen fil med LÄGRE id men SENARE datum (g, id före h)
INSERT INTO detalj_kontroll_stock (filnamn, maskin_id, objekt_id, kontroll_datum, harvest_date, stam_nummer, stock_nummer,
  maskin_langd_cm, operator_langd_cm, machine_measurement_date, operator_measurement_date, stem_selection)
VALUES ('g.hqc','PONS','1','2026-02-10','2026-02-01 08:00:00+00',7,1,500,500,'2026-02-01 08:00:00+00','2026-02-01 08:05:00+00','Randomly selected stem'),
       ('h.hqc','PONS','1','2026-02-05','2026-02-01 08:00:00+00',2,1,500,500,'2026-02-01 08:00:00+00','2026-02-01 08:05:00+00','Randomly selected stem');
-- Annan maskin med exakt samma skördetid/stocknummer/mättider: är INTE samma fysiska stock (maskin_id ingår)
INSERT INTO detalj_kontroll_stock (filnamn, maskin_id, objekt_id, kontroll_datum, harvest_date, stam_nummer, stock_nummer,
  maskin_langd_cm, operator_langd_cm, machine_measurement_date, operator_measurement_date, stem_selection)
VALUES ('n.hqc','R64428','2','2026-01-17','2026-01-15 10:07:40+00',1,1,343,343,'2026-01-15 10:07:40+00','2026-01-15 10:09:40+00','Randomly selected stem');
-- Kontrollerna (en rad per fil) — i, j har inga stockar alls sedan förut (som de två i prod)
INSERT INTO fakt_kalibrering (filnamn, maskin_id, datum, tradslag)
SELECT f, CASE WHEN f = 'n.hqc' THEN 'R64428' ELSE 'PONS' END, d::date, 'gran' FROM (VALUES ('a.hqc','2026-01-15'),('b.hqc','2026-01-16'),('c.hqc','2026-01-16'),
  ('d.hqc','2026-01-19'),('e.hqc','2026-01-20'),('f.hqc','2026-01-25'),('g.hqc','2026-02-10'),('h.hqc','2026-02-05'),('i.hqc','2026-03-01'),('n.hqc','2026-01-17')) v(f,d);
-- Mätpunkter under varje rad
INSERT INTO detalj_kontroll_stock_matpunkt (detalj_kontroll_stock_id, position_cm, diameter_maskin_mm, diameter_operator_mm)
SELECT id, p, 100 + p, 101 + p FROM detalj_kontroll_stock, (VALUES (100),(200)) q(p);
-- En borttagen kopia (c.hqc, T2) har bara EN av mätpunkterna: delmängd av den behållnas, ingen information går förlorad
DELETE FROM detalj_kontroll_stock_matpunkt
 WHERE position_cm = 200 AND detalj_kontroll_stock_id IN (SELECT id FROM detalj_kontroll_stock WHERE filnamn = 'c.hqc' AND harvest_date = '2026-01-16 09:00:00+00');
