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
  diameter_maskin_mm int, diameter_operator_mm int, klave_first_mm int, klave_second_mm int,
  UNIQUE (detalj_kontroll_stock_id, position_cm)
);
-- Kolumnerna som spärren och funktionen läser, och fakt_kalibrering
ALTER TABLE detalj_kontroll_stock
  ADD COLUMN stem_selection text, ADD COLUMN sortiment_namn text, ADD COLUMN cutting_reason text,
  ADD COLUMN stem_dbh_mm int, ADD COLUMN log_diameter_mid_ob_mm int, ADD COLUMN log_diameter_butt_ob_mm int,
  ADD COLUMN measurer_name text, ADD COLUMN measurement_mode text, ADD COLUMN rejected_reason text,
  ADD COLUMN processing_category text;
CREATE TABLE fakt_kalibrering (
  id bigserial PRIMARY KEY, filnamn text NOT NULL UNIQUE, maskin_id text NOT NULL, datum date NOT NULL, tradslag text
);
-- Tillståndet i prod före den här ändringen: förra rensningens index (med stam_nummer) finns
CREATE UNIQUE INDEX detalj_kontroll_stock_matning_unik
  ON detalj_kontroll_stock (maskin_id, harvest_date, stam_nummer, stock_nummer,
                            machine_measurement_date, operator_measurement_date) NULLS NOT DISTINCT;
