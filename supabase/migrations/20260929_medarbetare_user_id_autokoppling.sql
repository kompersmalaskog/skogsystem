-- KÖRS AV MARTIN mot prod, FÖRE koden. Idempotent.
--
-- user_id kopplas automatiskt mellan inloggningskonto (auth.users) och
-- medarbetare, på e-post, ÅT BÅDA HÅLLEN — oavsett om kontot eller
-- medarbetaren skapas först. Oscar Ringberg (2026-09-29) hade konto sedan
-- 28 juli och medarbetarrad, men ingen koppling: RLS på medarbetare släpper
-- bara igenom raden när user_id = auth.uid(), så appen fick noll rader och
-- fastnade i "Laddar..." för evigt.
--
-- REGLER: kopplas bara vid EXAKT EN träff (e-post jämförs utan skiftläge och
-- blanksteg), och en befintlig koppling skrivs ALDRIG över. medarbetare har
-- redan UNIQUE(user_id) och UNIQUE(epost) — triggrarna respekterar båda.
-- Den gamla handle_new_user (skriver till tabellen anvandare) lämnas orörd.

-- 1. Nytt konto (eller ändrad e-post på kontot) → leta upp medarbetaren.
CREATE OR REPLACE FUNCTION public.koppla_medarbetare_till_konto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  traffar int;
BEGIN
  IF new.email IS NULL OR trim(new.email) = '' THEN
    RETURN new;
  END IF;
  SELECT count(*) INTO traffar
    FROM public.medarbetare
   WHERE lower(trim(epost)) = lower(trim(new.email));
  IF traffar = 1 THEN
    UPDATE public.medarbetare
       SET user_id = new.id
     WHERE lower(trim(epost)) = lower(trim(new.email))
       AND user_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.medarbetare x WHERE x.user_id = new.id);
  END IF;
  RETURN new;
END
$$;

DROP TRIGGER IF EXISTS koppla_medarbetare_vid_nytt_konto ON auth.users;
CREATE TRIGGER koppla_medarbetare_vid_nytt_konto
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.koppla_medarbetare_till_konto();

-- 2. Ny medarbetare (eller ändrad e-post) → leta upp kontot.
CREATE OR REPLACE FUNCTION public.koppla_konto_till_medarbetare()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  traffar int;
  konto uuid;
BEGIN
  IF new.user_id IS NOT NULL OR new.epost IS NULL OR trim(new.epost) = '' THEN
    RETURN new;
  END IF;
  SELECT count(*), min(id::text)::uuid INTO traffar, konto
    FROM auth.users
   WHERE lower(trim(email)) = lower(trim(new.epost));
  IF traffar = 1
     AND NOT EXISTS (SELECT 1 FROM public.medarbetare x WHERE x.user_id = konto AND x.id <> new.id) THEN
    new.user_id := konto;
  END IF;
  RETURN new;
END
$$;

DROP TRIGGER IF EXISTS koppla_konto_vid_medarbetare ON public.medarbetare;
CREATE TRIGGER koppla_konto_vid_medarbetare
  BEFORE INSERT OR UPDATE OF epost ON public.medarbetare
  FOR EACH ROW EXECUTE FUNCTION public.koppla_konto_till_medarbetare();

-- Verifiering:
-- 1) triggrarna finns:
-- SELECT tgname, tgrelid::regclass FROM pg_trigger
--  WHERE tgname IN ('koppla_medarbetare_vid_nytt_konto','koppla_konto_vid_medarbetare');
-- 2) ingen medarbetare står okopplad fast ett konto med samma e-post finns (ska ge 0 rader):
-- SELECT m.namn, m.epost FROM medarbetare m
--  WHERE m.user_id IS NULL
--    AND EXISTS (SELECT 1 FROM auth.users u WHERE lower(trim(u.email)) = lower(trim(m.epost)));
