-- Lägger till objekt_id i maskindata_lass-returtypen.
-- Icke-brytande ändring: befintliga anropare ignorerar det tillkommande fältet.
-- Krävs av DEL B (skotarvolym-del-b-maskinvy): byggVolymPerDag behöver objekt_id
-- för att veta vilka lass som tillhör vilka objekt med manuell volym.
--
-- DROP + CREATE i transaktion: PostgreSQL tillåter inte CREATE OR REPLACE när
-- returtypen förändras (ny kolumn i RETURNS TABLE). Transaktionen är atomär —
-- misslyckas CREATE rullas DROPen tillbaka automatiskt.
--
-- Bakåtkompatibilitet: kod på main ignorerar det nya fältet → migrationen är
-- säker att köra mot prod FÖRE PR-merge.
-- maskindata_tid: orörd — inget i denna migration berör den.

BEGIN;

DROP FUNCTION IF EXISTS public.maskindata_lass(text[], date, date);

CREATE FUNCTION public.maskindata_lass(
  p_maskin_ids  text[],
  p_datum_start date DEFAULT NULL,
  p_datum_slut  date DEFAULT NULL
)
RETURNS TABLE (
  datum         date,
  maskin_id     text,
  operator_id   text,
  lossnings_tid timestamptz,
  volym_m3sub   numeric,
  korstracka_m  numeric,
  objekt_id     text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT datum, maskin_id, operator_id, lossnings_tid, volym_m3sub, korstracka_m, objekt_id
  FROM fakt_lass
  WHERE maskin_id = ANY(p_maskin_ids)
    AND (p_datum_start IS NULL OR datum >= p_datum_start)
    AND (p_datum_slut  IS NULL OR datum <= p_datum_slut)
$$;

GRANT EXECUTE ON FUNCTION public.maskindata_lass TO authenticated;

COMMIT;
