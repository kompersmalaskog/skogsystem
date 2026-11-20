-- Lägg till sortiment-kolumn i hpr_stammar (t.ex. "Grantimmer", "Tallkubb")
ALTER TABLE hpr_stammar ADD COLUMN IF NOT EXISTS sortiment TEXT;
