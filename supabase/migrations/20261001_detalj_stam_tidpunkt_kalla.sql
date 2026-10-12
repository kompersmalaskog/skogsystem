-- detalj_stam.tidpunkt_kalla: varifrån stammens tidpunkt kommer när den
-- INTE är mätt på stammen.
--
-- Elva Scorpion-objekt från januari 2026 (filer PONS20SDJAA270231_202601xx
-- .hpr, 2–23 januari) är en StanForD-export utan HarvestDate och utan
-- ProcessingDate på stamnivå. Importen kan inte ge dem någon tidpunkt, så
-- detalj_stam.tidpunkt blev NULL: stammarna syns inte i någon månadsvy
-- (4 908,8 m³ "utan tidpunkt" 2026-10-01) och rebuild_fakt_sortiment
-- hoppar objekten eftersom datum kräver tidpunkt — så den gamla per-fil-
-- importens dubbelräknade tal låg kvar i fakt_sortiment (Jörgen Olsson
-- 1 168,7 m³ mot 507,5 verkliga).
--
-- KÄLLA: MOM-periodens dagar, fördelade i StemKey-ordning efter MOM:s
-- stamantal per dag. Inte filens exporttid, därför att:
--   * exporttiden ligger EFTER sista stammen och ger alla stammar samma
--     stämpel — Kompersmåla Lövhuggning skördades 19 dec–2 jan men
--     exporterades 2 jan, så hela objektet hade hamnat i januari;
--   * MOM (fakt_produktion) har uppmätt antal stammar per dag för exakt
--     dessa objekt, och StemKey är maskinens löpnummer i bearbetnings-
--     ordning. Stam nummer k av n får den dag där MOM:s ackumulerade
--     stamantal passerar k. Felet är inom dagen, aldrig över en månadsgräns.
-- Klockslaget sätts till 12:00 UTC så att datumet blir detsamma i UTC och
-- svensk tid (rebuild_fakt_sortiment tar datum i UTC).
--
-- tidpunkt_kalla är NULL för alla stammar vars tidpunkt kommer ur HPR-filen
-- (HarvestDate på Stem eller ProcessingDate i SingleTreeProcessedStem) —
-- det är normalfallet och importen rör inte kolumnen. 'mom_dagfordelning'
-- betyder härledd dag, inte mätt tid: använd aldrig klockslaget.
ALTER TABLE detalj_stam ADD COLUMN IF NOT EXISTS tidpunkt_kalla text;
COMMENT ON COLUMN detalj_stam.tidpunkt_kalla IS
  'NULL = tidpunkten är stammens egen ur HPR-filen (HarvestDate/ProcessingDate). ''mom_dagfordelning'' = filen saknade stamtid; dagen är härledd ur fakt_produktions stamantal per dag i StemKey-ordning, klockslaget är 12:00 UTC och betyder inget.';

-- Skydd: en omimport av samma fil ger tidpunkt NULL igen (filen har ingen),
-- och upserten skriver över. En härledd tidpunkt får inte raderas av NULL.
CREATE OR REPLACE FUNCTION detalj_stam_behall_harledd_tidpunkt()
RETURNS trigger LANGUAGE plpgsql AS $t$
BEGIN
  IF NEW.tidpunkt IS NULL AND OLD.tidpunkt IS NOT NULL AND OLD.tidpunkt_kalla IS NOT NULL THEN
    -- Filen har ingen tid; den härledda står kvar.
    NEW.tidpunkt := OLD.tidpunkt;
    NEW.tidpunkt_kalla := OLD.tidpunkt_kalla;
  ELSIF NEW.tidpunkt IS DISTINCT FROM OLD.tidpunkt
        AND NEW.tidpunkt_kalla IS NOT DISTINCT FROM OLD.tidpunkt_kalla THEN
    -- Tidpunkten byttes utan att källan sattes: det är filens egen tid
    -- (importen skriver aldrig tidpunkt_kalla). Markeringen släpps.
    -- Sätts källan i samma UPDATE (fördelningen nedan) står den kvar.
    NEW.tidpunkt_kalla := NULL;
  END IF;
  RETURN NEW;
END $t$;

DROP TRIGGER IF EXISTS trg_detalj_stam_behall_harledd_tidpunkt ON detalj_stam;
CREATE TRIGGER trg_detalj_stam_behall_harledd_tidpunkt
  BEFORE UPDATE OF tidpunkt ON detalj_stam
  FOR EACH ROW EXECUTE FUNCTION detalj_stam_behall_harledd_tidpunkt();

-- ── Fördelningen (körd 2026-10-01 för de elva objekten) ──────────────────
-- Dokumenterad här, inte en del av schemat. Kördes som:
--
-- WITH mom AS (
--   SELECT objekt_id, datum, sum(stammar) AS st FROM fakt_produktion
--   WHERE objekt_id = ANY (:elva) GROUP BY 1, 2),
-- mom_k AS (
--   SELECT objekt_id, datum, sum(st) OVER (PARTITION BY objekt_id ORDER BY datum) AS kum,
--          sum(st) OVER (PARTITION BY objekt_id) AS tot FROM mom),
-- stam AS (
--   SELECT id, objekt_id, row_number() OVER (PARTITION BY objekt_id ORDER BY stam_key::bigint) AS rn,
--          count(*) OVER (PARTITION BY objekt_id) AS n
--   FROM detalj_stam WHERE objekt_id = ANY (:elva) AND tidpunkt IS NULL)
-- UPDATE detalj_stam d
--    SET tidpunkt = (m.datum::timestamp + interval '12 hours') AT TIME ZONE 'UTC',
--        tidpunkt_kalla = 'mom_dagfordelning'
--   FROM stam s
--   JOIN LATERAL (SELECT datum FROM mom_k k WHERE k.objekt_id = s.objekt_id
--                   AND k.kum::numeric / k.tot >= (s.rn - 0.5) / s.n
--                 ORDER BY datum LIMIT 1) m ON true
--  WHERE d.id = s.id;
