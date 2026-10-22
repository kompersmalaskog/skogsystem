-- detalj_kontroll_stock: EN rad per fysisk mätning (2026-10-22). Körs EFTER _1_rensa.
--
-- Mättiderna ingår så att en riktig omkontroll av samma stock (annan operatörsmättid)
-- blir en ny rad. NULLS NOT DISTINCT: 195 stockar saknar operator_measurement_date
-- (aldrig kontrollmätta) och två sådana kopior ska räknas som lika.
--
-- Importen (skogsmaskin_import_version_6.py, save_hqc_to_supabase) skriver mot den här
-- nyckeln med ignore-duplicates, så en ny ackumulerande fil lägger bara till det som är nytt.
-- Den gamla nyckeln (filnamn, stam_nummer, stock_nummer) ligger kvar.
CREATE UNIQUE INDEX IF NOT EXISTS detalj_kontroll_stock_matning_unik
  ON detalj_kontroll_stock (maskin_id, harvest_date, stam_nummer, stock_nummer,
                            machine_measurement_date, operator_measurement_date)
  NULLS NOT DISTINCT;
