-- Maskiner som aldrig sänder filer ska inte ge gula "data saknas"-varningar.
-- sander_filer=false -> filvyn visar grå "Förväntas ej (sänder inte filer)"
-- och uppräkningsfrågan för skotad volym blir proaktiv.
-- Endast JD810E flaggas (0 rader i någon faktatabell någonsin).
-- Elephant King AF (A110148) SÄNDER filer (426 lassrader) — rörs inte;
-- dess objektluckor hanteras av skotning-avslutad-villkoret i vyn.

ALTER TABLE dim_maskin
  ADD COLUMN IF NOT EXISTS sander_filer boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN dim_maskin.sander_filer IS
  'false = maskinen sänder aldrig StanForD-filer; vyer ska inte förvänta data (grå, ej gul)';

UPDATE dim_maskin SET sander_filer = false WHERE maskin_id = 'JD810E';
