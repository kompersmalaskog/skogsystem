-- Lägg till bio_energy_adaption-kolumn på hpr_stammar
-- Innehåller t.ex. "Logging residues" för stammar med GROT-flagga
-- Kör i Supabase SQL Editor

ALTER TABLE hpr_stammar
  ADD COLUMN IF NOT EXISTS bio_energy_adaption text;

COMMENT ON COLUMN hpr_stammar.bio_energy_adaption IS 'BioEnergyAdaption från StanForD2010, t.ex. "Logging residues" = GROT ska tas tillvara';

-- Index för snabb filtrering av GROT-stammar
CREATE INDEX IF NOT EXISTS idx_hpr_stammar_bio_energy ON hpr_stammar (bio_energy_adaption) WHERE bio_energy_adaption IS NOT NULL;
