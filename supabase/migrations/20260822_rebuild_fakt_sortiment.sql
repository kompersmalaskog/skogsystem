-- fakt_sortiment härleds ur detalj_stock istället för att skrivas per fil.
--
-- ─────────────────────────────────────────────────────────────────────────
-- VARFÖR
-- ─────────────────────────────────────────────────────────────────────────
-- Importen upsertade fakt_sortiment med merge-duplicates på
-- (datum, maskin_id, objekt_id, sortiment_id) — sista skrivaren vinner per
-- nyckel. HPR-filerna för ett objekt är INTE en serie kumulativa snapshots
-- utan en MIX: en stor fil kapad av Scorpions 4000-stammarstak plus små
-- inkrementfiler (_1-suffix) som täcker enstaka dagar.
--
-- När inkrementfilen skrevs efter den stora ERSATTE den den stora filens
-- dagssiffror för varje delad sortimentnyckel, istället för att läggas till.
--
-- Verifierat 2026-08-07, objekt 11217392, per sortiment (sant → lagrat):
--   _332  916 st / 61,5 m³  →  154 / 10,4   (rörd av inkrementfilen)
--   _315  529 / 40,9        →  152 / 12,0   (rörd)
--   _343    8 / 0,6         →    8 /  0,6   (EJ rörd — exakt rätt)
--   _484    6 / 1,3         →    6 /  1,3   (EJ rörd — exakt rätt)
-- Varje rad inkrementfilen rörde är för låg. De den inte rörde stämmer.
--
-- Ingen per-fil-strategi kan lösa det, eftersom ingen enskild fil känner till
-- de andra:
--   * snapshot-vakten från hpr_filer (stammar_count-jämförelse) skulle kasta
--     inkrementfilen helt (146 < 4000) — dataförlust, inte en fix
--   * sum-on-conflict dubblar vid ominläsning av samma fil
--   * delete+insert per fil låter inkrementfilen radera den stora filens rader
--
-- detalj_stock är däremot redan korrekt deduplicerad på
-- (maskin_id, stem_key, log_key) och ackumulerar unionen över alla filer.
-- Härleds fakt_sortiment därifrån kan de två aldrig gå isär igen, och
-- ominläsning blir idempotent av konstruktion.
--
-- ─────────────────────────────────────────────────────────────────────────
-- SPÄRREN — läs innan någon kör detta brett
-- ─────────────────────────────────────────────────────────────────────────
-- Funktionen bygger den härledda mängden FÖRST och rör ingenting om den är
-- tom. Utan den spärren är detta ett raderingsverktyg:
--
--   88 (maskin, objekt)-par i fakt_sortiment
--   57 av dem har NOLL joinbara stockar
--   28 084,7 m³ av 50 254,7 skulle försvinna
--
-- Orsaken är de 2,83 M äldre detalj_stock-raderna med stem_key = NULL
-- (importerade före detalj_stock_logical_unique, migration 20260507). De kan
-- inte joinas mot detalj_stam, så för de objekten blir den härledda mängden
-- tom och en rak DELETE+INSERT skulle radera utan att skriva tillbaka något.
--
-- Anropas därför SCOPAT per importerat objekt, aldrig som en global
-- ombyggnad. De 57 paren behåller sina nuvarande siffror tills detalj_stocks
-- legacy-rader är rensade och backfillade — samma jobb som gör april 2026
-- synlig igen. Detta stoppar blödningen framåt; det läker inte det gamla.
--
-- ─────────────────────────────────────────────────────────────────────────
-- PENGAR
-- ─────────────────────────────────────────────────────────────────────────
-- Kartlagt 2026-08-22: ackordvolymen kommer INTE härifrån.
--   skördarens ackordvolym = fakt_produktion.volym_m3sub (MOM)
--   skotarens ackordvolym  = fakt_lass.volym_m3sub (FPR) + manuell korrigering
--   fakt_sortiment används av ekonomikoden ENBART för att räkna ANTALET
--   distinkta sortimentgrupper (lib/ekonomi/ackordgrund.ts sortimentgrupperAuto
--   → acord.ts sortimentTillagg, kr/m³ över ett grundantal). Aldrig volym.
--
-- Verifierat att ombyggnaden inte ändrar gruppantalet för något av de 31
-- byggbara objekten (noll differenser). Fixen är alltså pengarneutral på
-- ackordvägen. Ändras det påståendet — t.ex. om någon börjar läsa
-- fakt_sortiment.volym_m3sub i ekonomikoden — måste det mätas om FÖRE deploy.

CREATE OR REPLACE FUNCTION rebuild_fakt_sortiment(p_maskin_id text, p_objekt_id text)
RETURNS jsonb
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_nya       int;
  v_gamla     int;
  v_vol_fore  numeric;
  v_vol_efter numeric;
BEGIN
  -- Härledd mängd FÖRST — inget raderas innan vi vet att det finns ersättning.
  CREATE TEMP TABLE _ny_fakt_sortiment ON COMMIT DROP AS
  SELECT (sm.tidpunkt AT TIME ZONE 'UTC')::date AS datum,
         st.maskin_id,
         st.objekt_id,
         st.sortiment_id,
         COUNT(*)::int                    AS stockar,
         SUM(st.volym_m3sob)              AS volym_m3sob,
         SUM(st.volym_m3sub)              AS volym_m3sub,
         AVG(NULLIF(st.langd_cm, 0))      AS medel_langd_cm,
         AVG(NULLIF(st.toppdia_ob_mm, 0)) AS medel_toppdia_mm
  FROM detalj_stock st
  JOIN detalj_stam sm
         ON sm.maskin_id = st.maskin_id
        AND sm.stam_key  = st.stem_key
        AND sm.objekt_id = st.objekt_id
  WHERE st.maskin_id = p_maskin_id
    AND st.objekt_id = p_objekt_id
    AND st.stem_key  IS NOT NULL
    AND st.log_key   IS NOT NULL
    AND sm.tidpunkt  IS NOT NULL
  GROUP BY 1, 2, 3, 4;

  SELECT COUNT(*) INTO v_nya FROM _ny_fakt_sortiment;

  SELECT COUNT(*), COALESCE(SUM(volym_m3sub), 0) INTO v_gamla, v_vol_fore
  FROM fakt_sortiment WHERE maskin_id = p_maskin_id AND objekt_id = p_objekt_id;

  -- Spärren. Tom härledd mängd = vi vet inget bättre än det som redan står.
  IF v_nya = 0 THEN
    RETURN jsonb_build_object(
      'status', 'hoppad', 'skal', 'inga joinbara stockar — rör ingenting',
      'maskin_id', p_maskin_id, 'objekt_id', p_objekt_id,
      'rader_fore', v_gamla, 'rader_efter', v_gamla,
      'volym_fore', ROUND(v_vol_fore, 1), 'volym_efter', ROUND(v_vol_fore, 1));
  END IF;

  DELETE FROM fakt_sortiment WHERE maskin_id = p_maskin_id AND objekt_id = p_objekt_id;

  -- filnamn lämnas NULL med avsikt: raden är en summering över ALLA filer som
  -- bidragit med stockar. Att stoppa in ett av filnamnen vore en lögn om
  -- härkomsten, och det var just per-fil-tänket som orsakade felet.
  INSERT INTO fakt_sortiment (datum, maskin_id, objekt_id, sortiment_id, stockar,
                              volym_m3sob, volym_m3sub, medel_langd_cm, medel_toppdia_mm, filnamn)
  SELECT datum, maskin_id, objekt_id, sortiment_id, stockar,
         volym_m3sob, volym_m3sub, medel_langd_cm, medel_toppdia_mm, NULL
  FROM _ny_fakt_sortiment;

  SELECT COALESCE(SUM(volym_m3sub), 0) INTO v_vol_efter
  FROM fakt_sortiment WHERE maskin_id = p_maskin_id AND objekt_id = p_objekt_id;

  RETURN jsonb_build_object(
    'status', 'ombyggd',
    'maskin_id', p_maskin_id, 'objekt_id', p_objekt_id,
    'rader_fore', v_gamla, 'rader_efter', v_nya,
    'volym_fore', ROUND(v_vol_fore, 1), 'volym_efter', ROUND(v_vol_efter, 1));
END
$fn$;

COMMENT ON FUNCTION rebuild_fakt_sortiment(text, text) IS
  'Bygger om fakt_sortiment för ETT (maskin, objekt) ur detalj_stock. Rör ingenting om den härledda mängden är tom — 57 av 88 par saknar joinbara stockar och skulle annars raderas. Anropas scopat av importen, aldrig brett.';

-- Bara importen (service_role) ska kunna anropa. En inloggad användare stoppas
-- ändå av RLS på DELETE (ar_admin), men explicit är bättre än underförstått.
REVOKE ALL ON FUNCTION rebuild_fakt_sortiment(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION rebuild_fakt_sortiment(text, text) FROM anon, authenticated;
