-- Spärr 2: en mätpunkt under en kopia som tas bort och som INTE finns under den behållna raden ska AVBRYTA rensningen.
\i stub.sql
\i data.sql
-- c.hqc T2 (en borttagen kopia) får en extra mätpunkt som b.hqc (den behållna) saknar
INSERT INTO detalj_kontroll_stock_matpunkt (detalj_kontroll_stock_id, position_cm, diameter_maskin_mm, diameter_operator_mm)
SELECT id, 300, 1, 2 FROM detalj_kontroll_stock WHERE filnamn = 'c.hqc' AND harvest_date = '2026-01-16 09:00:00+00';
\i ../../migrations/20261024180014_kontroll_stock_fysisk_1_rensa.sql
