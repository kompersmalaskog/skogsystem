-- Källmärkning för avslutsförslag (PR B). När Martin godkänner ett
-- maskindata-förslag (end_date/stale) sätts avslutsdatumet OCH auto-flaggan;
-- vid manuell ändring rensas flaggan. Två boolean-kolumner, symmetri med
-- avslutsfälten. Läses defensivt (=== true) så appen tål DB utan kolumnerna.
-- Additivt, default false — rör ingen befintlig data.

ALTER TABLE dim_objekt
  ADD COLUMN IF NOT EXISTS skordning_avslutad_auto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS skotning_avslutad_auto  boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN dim_objekt.skordning_avslutad_auto IS
  'true = skordning_avslutad sattes genom att godkänna ett maskindata-förslag (end_date/stale), inte manuellt. Rensas vid manuell ändring.';
COMMENT ON COLUMN dim_objekt.skotning_avslutad_auto IS
  'true = skotning_avslutad sattes genom att godkänna ett maskindata-förslag (end_date/stale), inte manuellt. Rensas vid manuell ändring.';
