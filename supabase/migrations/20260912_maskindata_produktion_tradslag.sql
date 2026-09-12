-- Lägger till tradslag_id i maskindata_produktion-returtypen.
-- Exakt samma mönster som 20260805_maskindata_tid_objekt_id.sql: ny kolumn
-- SIST, signaturen oförändrad, befintliga anropare ignorerar den.
--
-- VARFÖR
-- Maskinvyn läser fakt_produktion BARA via den här funktionen (tabellen har
-- operatörs-RLS: en förare ser annars bara sina egna pass, #539). fetchAll i
-- OversiktShared ignorerar select-listan för RPC-tabeller och returnerar
-- funktionens kolumner — som hittills saknat tradslag_id. Därför:
--   * VolymDeepView ("volym per trädslag" bakom Volym-raden) får r.tradslag_id
--     = undefined för varje rad och visar all volym som EN grupp "Okänt
--     trädslag". Trasig sedan RPC-bytet 2026-07-21.
--   * Trädslag per period (etapp 5) behöver kolumnen.
-- Efter den här migrationen bär varje rad sin tradslag_id; namn slås upp i
-- dim_tradslag (alla läser) och normaliseras i lib/tradslag (löv-varianterna
-- slås ihop). Ingen tabell rörs. SECURITY DEFINER som förut — bara maskindata.
--
-- Kör i EN transaktion (DROP + CREATE) så ingen förfrågan hamnar mellan.
-- Ägare: postgres (som 20260805).

BEGIN;

DROP FUNCTION IF EXISTS public.maskindata_produktion(text[], date, date);

CREATE FUNCTION public.maskindata_produktion(
  p_maskin_ids  text[],
  p_datum_start date DEFAULT NULL,
  p_datum_slut  date DEFAULT NULL
)
RETURNS TABLE (
  datum       date,
  maskin_id   text,
  operator_id text,
  objekt_id   text,
  volym_m3sub numeric,
  stammar     int,
  skapad_tid  timestamptz,
  tradslag_id text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT datum, maskin_id, operator_id, objekt_id, volym_m3sub, stammar, skapad_tid,
         tradslag_id
  FROM fakt_produktion
  WHERE maskin_id = ANY(p_maskin_ids)
    AND (p_datum_start IS NULL OR datum >= p_datum_start)
    AND (p_datum_slut  IS NULL OR datum <= p_datum_slut)
$$;

GRANT EXECUTE ON FUNCTION public.maskindata_produktion(text[], date, date) TO authenticated;

COMMIT;
