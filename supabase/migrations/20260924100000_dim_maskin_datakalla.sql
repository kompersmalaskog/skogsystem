-- dim_maskin.datakalla: en maskin har EN källa för sina lass. 2026-09-24.
--
--   'auto'    = maskinfiler (FPR/MOM) via importen — som i dag.
--   'manuell' = ingen automatisk källa; föraren registrerar lass i arbetsrapporten
--               ("Lass idag"), som skriver vanliga rader i fakt_lass med filnamn 'manuell'.
--               Importen AVVISAR FPR-filer för sådana maskiner (skogsmaskin_import_version_6.py).
--
-- JD810E (John Deere 810E) sätts till 'manuell': den har aldrig sänt en fil (sander_filer=false
-- sedan 20260721) och har sedan 2026-09-24 fyra manuella rader i fakt_lass för september.
-- Admin ändrar fältet i /admin → Maskiner ("Manuell datakälla").
ALTER TABLE dim_maskin
  ADD COLUMN IF NOT EXISTS datakalla text NOT NULL DEFAULT 'auto';

ALTER TABLE dim_maskin DROP CONSTRAINT IF EXISTS dim_maskin_datakalla_check;
ALTER TABLE dim_maskin
  ADD CONSTRAINT dim_maskin_datakalla_check CHECK (datakalla IN ('auto', 'manuell'));

COMMENT ON COLUMN dim_maskin.datakalla IS
  'auto = lass ur maskinfiler (importen); manuell = föraren registrerar lass i arbetsrapporten (fakt_lass.filnamn = ''manuell''), importen avvisar FPR-filer för maskinen';

UPDATE dim_maskin SET datakalla = 'manuell' WHERE maskin_id = 'JD810E';
