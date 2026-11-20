-- Lägger till objekt_id i maskindata_tid-returtypen.
-- Exakt samma mönster som 20260804_maskindata_lass_objekt_id.sql.
-- Krävs av skotarvolym.ts DEL B-bugfix: byggVolymPerDag måste skicka
-- enbart OBJEKTETS egna tid-rader (ej maskinens all-time) till
-- fordelaSkotadVolymFrånDB — annars smetas volymen ut mot hela historiken.
--
-- Bakåtkompatibilitet: befintliga anropare ignorerar ny kolumn sist.
-- Ägare: postgres (verifierat i prod, ingen ALTER OWNER behövs).

DROP FUNCTION IF EXISTS public.maskindata_tid(text[], date, date);

CREATE FUNCTION public.maskindata_tid(
  p_maskin_ids  text[],
  p_datum_start date DEFAULT NULL,
  p_datum_slut  date DEFAULT NULL
)
RETURNS TABLE (
  datum           date,
  maskin_id       text,
  operator_id     text,
  processing_sek  int,
  terrain_sek     int,
  kort_stopp_sek  int,
  rast_sek        int,
  bransle_liter   numeric,
  tomgang_sek     int,
  engine_time_sek int,
  other_work_sek  int,
  objekt_id       text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT datum, maskin_id, operator_id,
    processing_sek, terrain_sek, kort_stopp_sek,
    rast_sek, bransle_liter, tomgang_sek, engine_time_sek, other_work_sek,
    objekt_id
  FROM fakt_tid
  WHERE maskin_id = ANY(p_maskin_ids)
    AND (p_datum_start IS NULL OR datum >= p_datum_start)
    AND (p_datum_slut  IS NULL OR datum <= p_datum_slut)
$$;

GRANT EXECUTE ON FUNCTION public.maskindata_tid TO authenticated;
