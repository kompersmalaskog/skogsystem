-- Minimal efterbildning av detalj_kontroll_stock + matpunkt för det lokala testet.
CREATE TABLE detalj_kontroll_stock (
  id bigserial PRIMARY KEY,
  filnamn text NOT NULL,
  maskin_id text NOT NULL,
  objekt_id text,
  kontroll_datum date,
  harvest_date timestamptz,
  stam_nummer int NOT NULL,
  stock_nummer int NOT NULL,
  maskin_langd_cm int, operator_langd_cm int,
  maskin_toppdia_mm int, operator_toppdia_mm int,
  maskin_volym_sub numeric, operator_volym_sub numeric,
  stem_lat numeric, stem_lon numeric,
  machine_measurement_date timestamptz,
  operator_measurement_date timestamptz,
  CONSTRAINT detalj_kontroll_stock_unik UNIQUE (filnamn, stam_nummer, stock_nummer)
);
CREATE TABLE detalj_kontroll_stock_matpunkt (
  id bigserial PRIMARY KEY,
  detalj_kontroll_stock_id bigint NOT NULL REFERENCES detalj_kontroll_stock(id) ON DELETE CASCADE,
  position_cm int NOT NULL,
  UNIQUE (detalj_kontroll_stock_id, position_cm)
);
