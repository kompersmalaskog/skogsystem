-- Rotorsak till dubbelrundan (10 aug): koden ANTAR ett partiellt unikt index
-- flyttdag_en_oppen_per_vin ("bara en öppen runda per bil") — men det fanns
-- aldrig i någon migration, så två öppna rundor med samma vin kunde samexistera
-- när förarens ensureDag och cron:ens auto-öppning racade. Skapa det idempotent
-- (0 öppna rundor just nu → skapas rent). Efter detta avvisar DB:n den andra
-- insert:en; ensureDag fångar 23505 och tar över cron:ens runda i stället.

CREATE UNIQUE INDEX IF NOT EXISTS flyttdag_en_oppen_per_vin
  ON flyttdag (vin)
  WHERE sluttid IS NULL AND vin IS NOT NULL;
