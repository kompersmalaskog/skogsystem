-- Spärren: kopior med olika värden ska AVBRYTA rensningen (psql ska avsluta med fel, inget raderat).
\i stub.sql
\i data.sql
-- samma fysiska stock som a.hqc stam 1 stock 1, men olika objekt
INSERT INTO detalj_kontroll_stock (filnamn, maskin_id, objekt_id, kontroll_datum, harvest_date, stam_nummer, stock_nummer,
  maskin_langd_cm, operator_langd_cm, machine_measurement_date, operator_measurement_date)
VALUES ('x.hqc','PONS','ANNAT','2026-03-01','2026-01-15 10:07:40+00',9,1,343,343,'2026-01-15 10:07:40+00','2026-01-15 10:09:40+00');
\i ../../migrations/20261024180014_kontroll_stock_fysisk_1_rensa.sql
