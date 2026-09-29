-- KÖRS AV MARTIN mot prod, FÖRE koden. Idempotent.
--
-- GEOKODNING AV HEMADRESSEN. Den fanns inte: kolumnerna hem_lat/hem_lng
-- (20260419) fylldes "manuellt tills vidare", och varken admin, Personal-vyn
-- eller Arbetsrapportens Inställningar gjorde något med adresstexten. Oscar
-- (Idekulla 6, Ryd) och andra med bara adress stod på 0 km varje dag — lön.
--
-- MODELLEN:
--  * hem_koord_kalla säger VARIFRÅN punkten kom: 'gps' (Maskinflytt "spara
--    nuvarande plats"), 'manuell' (satt för hand) eller 'geokod' (från
--    adressen). SAMMA skydd som km_kalla: en gps/manuell punkt skrivs ALDRIG
--    över av nattjobbet — bara om admin uttryckligen väljer "geokoda ändå".
--  * En ändrad adress (från formulär ELLER SQL — därför en trigger) märker
--    raden 'vantar'. Geokodade koordinater hör till den gamla adressen och
--    nollas; gps/manuell rörs inte. Nattjobbet (/api/km/nattjobb) och admin-
--    formuläret geokodar väntande rader med samma kartleverantör som km.
--  * hem_geokod_lat/lng/etikett/precision är vad adressen FAKTISKT hamnade på
--    — visas i admin så en landsbygdsadress som hamnat i tätortens mitt syns
--    (Idekulla ligger flera km utanför Ryd). Bara en träff på adressnivå
--    används automatiskt; allt grövre blir 'osaker' och väntar på admin.

ALTER TABLE medarbetare ADD COLUMN IF NOT EXISTS hem_koord_kalla text;
ALTER TABLE medarbetare ADD COLUMN IF NOT EXISTS hem_geokod_status text;
ALTER TABLE medarbetare ADD COLUMN IF NOT EXISTS hem_geokod_etikett text;
ALTER TABLE medarbetare ADD COLUMN IF NOT EXISTS hem_geokod_precision text;
ALTER TABLE medarbetare ADD COLUMN IF NOT EXISTS hem_geokod_lat numeric;
ALTER TABLE medarbetare ADD COLUMN IF NOT EXISTS hem_geokod_lng numeric;
ALTER TABLE medarbetare ADD COLUMN IF NOT EXISTS hem_geokod_tid timestamptz;

ALTER TABLE medarbetare DROP CONSTRAINT IF EXISTS medarbetare_hem_koord_kalla_check;
ALTER TABLE medarbetare ADD CONSTRAINT medarbetare_hem_koord_kalla_check
  CHECK (hem_koord_kalla IS NULL OR hem_koord_kalla IN ('gps', 'geokod', 'manuell'));

ALTER TABLE medarbetare DROP CONSTRAINT IF EXISTS medarbetare_hem_geokod_status_check;
ALTER TABLE medarbetare ADD CONSTRAINT medarbetare_hem_geokod_status_check
  CHECK (hem_geokod_status IS NULL OR hem_geokod_status IN ('vantar', 'klar', 'osaker', 'misslyckad', 'hoppad'));

COMMENT ON COLUMN medarbetare.hem_koord_kalla IS
  'Varifrån hem_lat/hem_lng kom: gps (Maskinflytt), manuell (för hand), geokod (adressen). '
  'gps/manuell skrivs aldrig över automatiskt — samma skydd som arbetsdag.km_kalla.';
COMMENT ON COLUMN medarbetare.hem_geokod_status IS
  'vantar = adressen ändrad, ej geokodad · klar = punkten kommer från adressen · '
  'osaker = träffen var grövre än adress (ort/gata) och används inte automatiskt · '
  'misslyckad = ingen träff · hoppad = gps/manuell punkt finns och skyddas.';

-- Befintliga koordinater är satta för hand eller med GPS → skyddade.
UPDATE medarbetare
   SET hem_koord_kalla = 'manuell'
 WHERE hem_lat IS NOT NULL AND hem_lng IS NOT NULL AND hem_koord_kalla IS NULL;

-- Adress utan koordinater → väntar på geokodning (Oscar).
UPDATE medarbetare
   SET hem_geokod_status = 'vantar'
 WHERE coalesce(trim(hemadress), '') <> ''
   AND hem_lat IS NULL
   AND hem_geokod_status IS NULL;

CREATE OR REPLACE FUNCTION public.hemadress_andrad()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR new.hemadress IS DISTINCT FROM old.hemadress THEN
    new.hem_geokod_etikett := NULL;
    new.hem_geokod_precision := NULL;
    new.hem_geokod_lat := NULL;
    new.hem_geokod_lng := NULL;
    new.hem_geokod_tid := NULL;
    IF coalesce(trim(new.hemadress), '') = '' THEN
      new.hem_geokod_status := NULL;
    ELSE
      new.hem_geokod_status := 'vantar';
    END IF;
    -- En geokodad punkt hör till den gamla adressen. gps/manuell rörs ALDRIG.
    IF new.hem_koord_kalla = 'geokod' THEN
      new.hem_lat := NULL;
      new.hem_lng := NULL;
      new.hem_koord_kalla := NULL;
    END IF;
  END IF;
  RETURN new;
END
$$;

DROP TRIGGER IF EXISTS hemadress_andrad ON medarbetare;
CREATE TRIGGER hemadress_andrad
  BEFORE INSERT OR UPDATE OF hemadress ON medarbetare
  FOR EACH ROW EXECUTE FUNCTION public.hemadress_andrad();

-- Verifiering:
-- SELECT namn, hemadress, hem_lat IS NOT NULL AS har_punkt, hem_koord_kalla, hem_geokod_status
--   FROM medarbetare ORDER BY namn;
-- Förväntat: Daniel/Martin/Max/Oskar/Stefan har_punkt=true, kalla=manuell, status NULL;
--            Oscar har_punkt=false, status=vantar; Joacim hemadress tom, status NULL.
