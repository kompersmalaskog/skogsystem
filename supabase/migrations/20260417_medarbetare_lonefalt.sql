-- Lägg till lönefält + anställningsdatum på medarbetare.
-- Anställningsnummer per lönesystem hanteras i en separat tabell (steg 6).
ALTER TABLE medarbetare ADD COLUMN IF NOT EXISTS timlon_kr numeric;
ALTER TABLE medarbetare ADD COLUMN IF NOT EXISTS manadslon_kr numeric;
ALTER TABLE medarbetare ADD COLUMN IF NOT EXISTS anstallningsdatum date;
