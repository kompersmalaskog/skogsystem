-- Maskinvy-RPC:er — SECURITY DEFINER-funktioner som kringgår RLS för
-- fakt_produktion, fakt_tid, fakt_avbrott och fakt_lass.
--
-- Bakgrund: RLS på dessa tabeller filtrerar på operator_id IN mina_operator_ids().
-- Förare ser bara sina egna rader — i maskinvyn ska ALLA inloggade se hela
-- maskinens data (Martin + Stefan i samma kurva, fördrat av alla inblandade).
--
-- Säkerhet: funktionerna returnerar BARA maskindata (produktion, tid, avbrott,
-- lass per maskin/datum). Inga löner, priser, personuppgifter eller känsliga
-- uppgifter exponeras. RLS-policyerna på tabellerna förblir OFÖRÄNDRADE —
-- direkta SELECT-anrop från andra vyer (ekonomi, uppföljning, arbetsrapport)
-- träffas fortfarande av operator_id-filtret.

-- ── 1. maskindata_produktion ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.maskindata_produktion(
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
  skapad_tid  timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT datum, maskin_id, operator_id, objekt_id, volym_m3sub, stammar, skapad_tid
  FROM fakt_produktion
  WHERE maskin_id = ANY(p_maskin_ids)
    AND (p_datum_start IS NULL OR datum >= p_datum_start)
    AND (p_datum_slut  IS NULL OR datum <= p_datum_slut)
$$;
GRANT EXECUTE ON FUNCTION public.maskindata_produktion TO authenticated;

-- ── 2. maskindata_produktion_senaste ────────────────────────────────────────
-- Returnerar senaste datum + skapad_tid för maskinen (en rad).
-- Används av IdagNy för att hitta vilket datum som ska visas.
CREATE OR REPLACE FUNCTION public.maskindata_produktion_senaste(
  p_maskin_ids text[]
)
RETURNS TABLE (datum date, skapad_tid timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT datum, skapad_tid
  FROM fakt_produktion
  WHERE maskin_id = ANY(p_maskin_ids)
  ORDER BY datum DESC, skapad_tid DESC
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.maskindata_produktion_senaste TO authenticated;

-- ── 3. maskindata_tid ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.maskindata_tid(
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
  other_work_sek  int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT datum, maskin_id, operator_id,
    processing_sek, terrain_sek, kort_stopp_sek,
    rast_sek, bransle_liter, tomgang_sek, engine_time_sek, other_work_sek
  FROM fakt_tid
  WHERE maskin_id = ANY(p_maskin_ids)
    AND (p_datum_start IS NULL OR datum >= p_datum_start)
    AND (p_datum_slut  IS NULL OR datum <= p_datum_slut)
$$;
GRANT EXECUTE ON FUNCTION public.maskindata_tid TO authenticated;

-- ── 4. maskindata_avbrott ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.maskindata_avbrott(
  p_maskin_ids  text[],
  p_datum_start date DEFAULT NULL,
  p_datum_slut  date DEFAULT NULL
)
RETURNS TABLE (
  datum        date,
  maskin_id    text,
  operator_id  text,
  kategori_kod text,
  langd_sek    int,
  klockslag    text,
  typ          text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT datum, maskin_id, operator_id, kategori_kod, langd_sek, klockslag, typ
  FROM fakt_avbrott
  WHERE maskin_id = ANY(p_maskin_ids)
    AND (p_datum_start IS NULL OR datum >= p_datum_start)
    AND (p_datum_slut  IS NULL OR datum <= p_datum_slut)
$$;
GRANT EXECUTE ON FUNCTION public.maskindata_avbrott TO authenticated;

-- ── 5. maskindata_lass ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.maskindata_lass(
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
  korstracka_m  numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT datum, maskin_id, operator_id, lossnings_tid, volym_m3sub, korstracka_m
  FROM fakt_lass
  WHERE maskin_id = ANY(p_maskin_ids)
    AND (p_datum_start IS NULL OR datum >= p_datum_start)
    AND (p_datum_slut  IS NULL OR datum <= p_datum_slut)
$$;
GRANT EXECUTE ON FUNCTION public.maskindata_lass TO authenticated;

-- ── 6. maskindata_lass_senaste ──────────────────────────────────────────────
-- Returnerar senaste datum + lossnings_tid för skotaren (en rad).
-- Används av SkotareIdagNy för att hitta vilket datum som ska visas.
CREATE OR REPLACE FUNCTION public.maskindata_lass_senaste(
  p_maskin_ids text[]
)
RETURNS TABLE (datum date, lossnings_tid timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT datum, lossnings_tid
  FROM fakt_lass
  WHERE maskin_id = ANY(p_maskin_ids)
  ORDER BY lossnings_tid DESC
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.maskindata_lass_senaste TO authenticated;

-- Verifiering: RLS-policyerna på tabellerna är OFÖRÄNDRADE.
-- Kontrollera med:
--   SELECT schemaname, tablename, policyname, cmd, qual
--   FROM pg_policies
--   WHERE tablename IN ('fakt_produktion','fakt_tid','fakt_avbrott','fakt_lass');
-- Förväntad policy för SELECT på dessa tabeller:
--   (operator_id IN (SELECT mina_operator_ids()) OR ar_admin())
