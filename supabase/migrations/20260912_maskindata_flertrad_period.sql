-- maskindata_flertrad_period — flerträd per dag för en eller flera skördare,
-- härlett ur detalj_stam.stam_bunt_nyckel (HPR MultiTreeProcessedStem, #460).
--
-- VARFÖR EN FUNKTION OCH INTE KLIENT-PAGINERING
-- PostgREST cappar varje svar på 1 000 rader oavsett .limit(). Ett år på
-- Scorpion är 40 000+ stammar; att räkna distinkta grepp i klienten kräver
-- alla buntrader. Här returneras EN rad per dag (≤ 366 rader per anrop) och
-- klienten summerar till vecka/månad/period.
--
-- MÄTT POPULATION — regeln som landade efter två omtag (#528):
-- Importen upsertar detalj_stam på (maskin_id, stam_key) med filnamn i
-- payloaden, men rör INTE skapad_tid på befintliga rader. Därför:
--   * "stammar med skapad_tid ≥ 2026-08-23" duger inte som nämnare — vid
--     omimport av en gammal fil ser bara buntraderna nya ut (Svinhult hade
--     gett falska 100 %).
--   * En FIL med minst en rad skriven ≥ 2026-08-23 är skriven av den
--     flerträdsmedvetna importen → ALLA stammar med det filnamnet är mätta.
--   * Täljare (bunt) och nämnare (mätta) räknas på SAMMA filer.
-- Stammar i filer utan sådan rad är OMÄTTA: deras flerträdsstammar hoppades
-- över av den gamla importen och finns inte i tabellen. De ska visas som
-- "ej mätt", ALDRIG som 0 %. Därför returneras stammar_alla bredvid
-- stammar_matta: alla > 0 och matta = 0 → "ej mätt".
--
-- GREPP = distinkta (maskin_id, objekt_id, stam_bunt_nyckel) per dag. Nyckeln
-- börjar om per fil (migration 20260823_detalj_stam_bunt_nyckel) men är
-- stabil inom en fil, och ett grepp är ögonblickligt — inom en och samma dag
-- är samma nyckel på samma maskin och objekt samma grepp.
--
-- Dag = tidpunkt i svensk tid (avverkningens klockslag, inte importens).
--
-- SECURITY INVOKER (default): detalj_stam läses av alla inloggade (policy
-- detalj_stam_select, 20260524153632). Ingen eskalering behövs. Läsande.
-- Referens read-only 2026-09-10 (per objekt, samma regel): Svinhult 11109652
-- 11,8 % · 2,1 st/grepp · 1 248 grepp; Hålabäck 11219961 1,5 %; 9955 23,9 %.

CREATE OR REPLACE FUNCTION public.maskindata_flertrad_period(
  p_maskin_ids text[],
  p_start      date,
  p_slut       date
)
RETURNS TABLE (
  dag            date,
  stammar_alla   bigint,   -- alla stammar avverkade den dagen (mätta + omätta)
  stammar_matta  bigint,   -- stammar i filer skrivna av den flerträdsmedvetna importen
  bunt_stammar   bigint,   -- mätta stammar med buntnyckel (flerträdshanterade)
  grepp          bigint    -- distinkta (maskin_id, objekt_id, buntnyckel) bland dem
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH matta_filer AS (
    -- Filer som den nya importen skrivit: minst en rad med skapad_tid ≥ 2026-08-23.
    SELECT DISTINCT filnamn
    FROM detalj_stam
    WHERE maskin_id = ANY(p_maskin_ids)
      AND filnamn IS NOT NULL
      AND skapad_tid >= TIMESTAMPTZ '2026-08-23 00:00:00+00'
  ),
  rader AS (
    SELECT
      (s.tidpunkt AT TIME ZONE 'Europe/Stockholm')::date AS dag,
      s.maskin_id,
      s.objekt_id,
      s.stam_bunt_nyckel,
      (s.filnamn IS NOT NULL AND s.filnamn IN (SELECT filnamn FROM matta_filer)) AS matt
    FROM detalj_stam s
    WHERE s.maskin_id = ANY(p_maskin_ids)
      AND s.tidpunkt IS NOT NULL
      -- Grovt intervall på råa tidpunkt (indexerat), exakt på svensk dag nedan.
      AND s.tidpunkt >= (p_start - 1)::timestamp AT TIME ZONE 'Europe/Stockholm'
      AND s.tidpunkt <  (p_slut  + 2)::timestamp AT TIME ZONE 'Europe/Stockholm'
      AND (s.tidpunkt AT TIME ZONE 'Europe/Stockholm')::date BETWEEN p_start AND p_slut
  )
  SELECT
    dag,
    COUNT(*)                                                       AS stammar_alla,
    COUNT(*) FILTER (WHERE matt)                                   AS stammar_matta,
    COUNT(*) FILTER (WHERE matt AND stam_bunt_nyckel IS NOT NULL)  AS bunt_stammar,
    COUNT(DISTINCT (maskin_id, objekt_id, stam_bunt_nyckel))
      FILTER (WHERE matt AND stam_bunt_nyckel IS NOT NULL)         AS grepp
  FROM rader
  GROUP BY dag
  ORDER BY dag
$$;

GRANT EXECUTE ON FUNCTION public.maskindata_flertrad_period(text[], date, date) TO authenticated;

COMMENT ON FUNCTION public.maskindata_flertrad_period(text[], date, date) IS
  'Flerträd per dag ur detalj_stam.stam_bunt_nyckel. Mätta = stammar i filer '
  'med minst en rad skapad ≥ 2026-08-23; bunt räknas på samma filer. '
  'stammar_alla > 0 och stammar_matta = 0 betyder "ej mätt", aldrig 0 %.';
