-- Spegel av remote-migration 20260716144545_add_visningsnamn_to_dim_maskin,
-- applicerad direkt mot prod 2026-07-16. Körs INTE igen — versionsnumret
-- finns redan i databasens migrationshistorik.
ALTER TABLE dim_maskin ADD COLUMN IF NOT EXISTS visningsnamn text;

UPDATE dim_maskin SET visningsnamn = 'Ponsse Scorpion' WHERE maskin_id = 'PONS20SDJAA270231' AND visningsnamn IS NULL;
UPDATE dim_maskin SET visningsnamn = 'Rottne H8E'      WHERE maskin_id = 'R64428'            AND visningsnamn IS NULL;
UPDATE dim_maskin SET visningsnamn = 'Wisent'          WHERE maskin_id = 'A030353'           AND visningsnamn IS NULL;
UPDATE dim_maskin SET visningsnamn = 'Elefant'         WHERE maskin_id = 'A110148'           AND visningsnamn IS NULL;
UPDATE dim_maskin SET visningsnamn = 'John Deere 810E' WHERE maskin_id = 'JD810E'            AND visningsnamn IS NULL;
-- R64101 (avställd 2026-03-11) lämnas medvetet NULL — precis som i prod.
