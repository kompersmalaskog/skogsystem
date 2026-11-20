-- Spärren: kopior med olika mätvärden ska AVBRYTA rensningen (psql ska avsluta med fel, inget raderat).
\i stub.sql
\i data.sql
INSERT INTO detalj_kontroll_stock (filnamn, maskin_id, kontroll_datum, harvest_date, stam_nummer, stock_nummer,
  maskin_langd_cm, operator_langd_cm, machine_measurement_date, operator_measurement_date)
VALUES ('x.hqc','PONS','2026-03-01','2026-01-15 10:07:40+00',1,2,999,343,'2026-01-15 10:07:40+00','2026-01-15 10:09:00+00');
\i ../../migrations/20261022091051_kontroll_stock_dubbletter_1_rensa.sql
