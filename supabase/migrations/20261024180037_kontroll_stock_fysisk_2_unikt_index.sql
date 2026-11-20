-- detalj_kontroll_stock: EN rad per FYSISK mätning, stam_nummer ingår inte (2026-10-24). Körs EFTER _1_rensa.
--
-- Maskinen numrerar om stammarna i varje kumulativ HQC-fil, så stam_nummer säger inget om vilken stam
-- det är; harvest_date gör det. Mättiderna ingår så att en riktig omkontroll av samma stock (annan
-- operatörsmättid) blir en ny rad. NULLS NOT DISTINCT: stockar som saknar operator_measurement_date
-- (aldrig kontrollmätta) och två sådana kopior ska räknas som lika.
--
-- Importen (skogsmaskin_import_version_6.py, KONTROLL_STOCK_NYCKEL) skriver mot den här nyckeln med
-- ignore-duplicates. Körordning: migrationerna först, sedan deploy_import.ps1 — den nya importen
-- begär ON CONFLICT mot just de här kolumnerna och faller (42P10) om indexet inte finns.
--
-- Det äldre indexet detalj_kontroll_stock_matning_unik (med stam_nummer) ligger kvar tills importen
-- är deployad och tas bort i en egen migration; det är redan överflödigt (den här nyckeln har färre
-- kolumner, så allt som är unikt här är unikt där) men skadar inte.
CREATE UNIQUE INDEX IF NOT EXISTS detalj_kontroll_stock_fysisk_unik
  ON detalj_kontroll_stock (maskin_id, harvest_date, stock_nummer,
                            machine_measurement_date, operator_measurement_date)
  NULLS NOT DISTINCT;
