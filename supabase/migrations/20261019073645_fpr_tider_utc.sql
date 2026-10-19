-- FPR-tider som verkliga UTC-ögonblick: fakt_lass.lastnings_tid / lossnings_tid och fakt_skotning_status.start_tid / slut_tid.
--
-- PROBLEMET. Opti-filerna skriver maskinens LOKALA klocka med offset ("2026-04-30T17:28:54+02:00"). Importens
-- parse_datetime() klippte offseten och PostgREST tolkade det som UTC i timestamptz-kolumnen: lossnings_tid stod 2 h
-- (sommar) eller 1 h (vinter) FÖR SEN. Uppmätt 2026-10-19: skotarens hyttspår står still vid avlägget vid
-- lossnings_tid − 125 min (2 h + ca 5 min maskinklocka före; klockdriften rättas INTE här). 947 av 2 160 lass hade en
-- lossningstid EFTER sin egen importtid, och en skotningsstatus slutade 09:05 UTC kl 07:40 UTC.
--
-- ÅTGÄRD. (1) Importen skriver nu det verkliga ögonblicket (parse_tid_utc, offseten ur filen) och tid_ar_utc = true.
-- (2) De befintliga raderna flyttas EN gång: (tid AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Stockholm' — svensk
-- sommar-/vintertid, inte ett fast tillägg. tid_ar_utc skiljer rättade rader (true) från äldre (false), så
-- omkörning av funktionen är ofarlig och aldrig dubbelkorrigerar.
--
-- LÄSARE (kartlagt 2026-10-19; ingen behövde ändras — de tolkar redan kolumnen som äkta UTC):
--   * RPC maskindata_lass / maskindata_lass_senaste (returnerar lossnings_tid oförändrad)
--   * app/maskinvy/SkotareIdagNy.tsx: toStockholmHour() / fmtStockholmHHMM() — visade förut allt 2 h för sent
--   * helikopter_ny_senaste_data() använder avsiktligt skapad_tid, inte lossnings_tid (kommentaren där om "~2 h efter"
--     beskrev just det här felet)
-- Inga vyer, inga andra funktioner, ingen TypeScript-kod läser lastnings_tid / lossnings_tid / start_tid / slut_tid ur
-- dessa tabeller. fakt_lass.datum är maskinens lokala dag och rörs inte.
--
-- ÖVERGÅNGEN. Importskriptet körs på Martins dator och uppdateras separat. En äldre version skriver lokal tid som UTC:
--   * nya rader får tid_ar_utc = false (kolumnens default) → fpr_tider_till_utc() flyttar dem när som helst;
--   * en omimport av en redan rättad rad (importen skickar ingen tid_ar_utc) hade skrivit över tiden men lämnat flaggan
--     true. Triggrarna nedan märker den raden false igen — så ingen felaktig tid kan ligga kvar som "rättad".
-- Efter att importen uppdaterats: `select * from fpr_tider_till_utc();` ska ge 0 rader, och
--   select count(*) from fakt_lass where lossnings_tid is not null and not tid_ar_utc;   -- = 0
--
-- ÅNGRA (flyttar tillbaka allt som rättats; kör bara om importen också rullas tillbaka):
--   update fakt_lass set lastnings_tid = (lastnings_tid at time zone 'Europe/Stockholm') at time zone 'UTC',
--          lossnings_tid = (lossnings_tid at time zone 'Europe/Stockholm') at time zone 'UTC', tid_ar_utc = false
--    where tid_ar_utc;
--   (samma för fakt_skotning_status med start_tid / slut_tid)

ALTER TABLE fakt_lass              ADD COLUMN IF NOT EXISTS tid_ar_utc boolean NOT NULL DEFAULT false;
ALTER TABLE fakt_skotning_status   ADD COLUMN IF NOT EXISTS tid_ar_utc boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN fakt_lass.tid_ar_utc IS
  'true = lastnings_tid/lossnings_tid är verkliga UTC-ögonblick. false = äldre rad där maskinens lokala klocka lagrats som UTC (flyttas av fpr_tider_till_utc()).';
COMMENT ON COLUMN fakt_skotning_status.tid_ar_utc IS
  'true = start_tid/slut_tid är verkliga UTC-ögonblick. false = äldre rad där maskinens lokala klocka lagrats som UTC (flyttas av fpr_tider_till_utc()).';

CREATE OR REPLACE FUNCTION fpr_tider_till_utc()
RETURNS TABLE (tabell text, rader bigint)
LANGUAGE plpgsql AS $f$
DECLARE n bigint;
BEGIN
  UPDATE fakt_lass
     SET lastnings_tid = (lastnings_tid AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Stockholm',
         lossnings_tid = (lossnings_tid AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Stockholm',
         tid_ar_utc = true
   WHERE NOT tid_ar_utc;
  GET DIAGNOSTICS n = ROW_COUNT;
  tabell := 'fakt_lass'; rader := n; RETURN NEXT;

  UPDATE fakt_skotning_status
     SET start_tid = (start_tid AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Stockholm',
         slut_tid  = (slut_tid  AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Stockholm',
         tid_ar_utc = true
   WHERE NOT tid_ar_utc;
  GET DIAGNOSTICS n = ROW_COUNT;
  tabell := 'fakt_skotning_status'; rader := n; RETURN NEXT;
END $f$;
REVOKE ALL ON FUNCTION fpr_tider_till_utc() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fpr_tider_till_utc() TO service_role;

-- ── Skydd mot att en äldre importversion skriver lokal tid över en rättad rad ─────────────────────────────────────────
-- INSERT … ON CONFLICT DO UPDATE kör BEFORE INSERT-triggern för den föreslagna raden först. En äldre import skickar
-- ingen tid_ar_utc (→ default false): då märks transaktionen, och BEFORE UPDATE sätter flaggan false om tiden ändras.
CREATE OR REPLACE FUNCTION fpr_tid_markera_gammal_import() RETURNS trigger
LANGUAGE plpgsql AS $t$
BEGIN
  IF NEW.tid_ar_utc IS NOT TRUE THEN
    PERFORM set_config('app.fpr_tid_gammal_import', '1', true);
  END IF;
  RETURN NEW;
END $t$;

CREATE OR REPLACE FUNCTION fpr_lass_tid_flagga() RETURNS trigger
LANGUAGE plpgsql AS $t$
BEGIN
  IF current_setting('app.fpr_tid_gammal_import', true) = '1'
     AND (NEW.lastnings_tid IS DISTINCT FROM OLD.lastnings_tid OR NEW.lossnings_tid IS DISTINCT FROM OLD.lossnings_tid) THEN
    NEW.tid_ar_utc := false;
  END IF;
  RETURN NEW;
END $t$;

CREATE OR REPLACE FUNCTION fpr_skotstatus_tid_flagga() RETURNS trigger
LANGUAGE plpgsql AS $t$
BEGIN
  IF current_setting('app.fpr_tid_gammal_import', true) = '1'
     AND (NEW.start_tid IS DISTINCT FROM OLD.start_tid OR NEW.slut_tid IS DISTINCT FROM OLD.slut_tid) THEN
    NEW.tid_ar_utc := false;
  END IF;
  RETURN NEW;
END $t$;

CREATE OR REPLACE TRIGGER trg_fakt_lass_tid_markera BEFORE INSERT ON fakt_lass
  FOR EACH ROW EXECUTE FUNCTION fpr_tid_markera_gammal_import();
CREATE OR REPLACE TRIGGER trg_fakt_lass_tid_flagga BEFORE UPDATE ON fakt_lass
  FOR EACH ROW EXECUTE FUNCTION fpr_lass_tid_flagga();
CREATE OR REPLACE TRIGGER trg_fakt_skotstatus_tid_markera BEFORE INSERT ON fakt_skotning_status
  FOR EACH ROW EXECUTE FUNCTION fpr_tid_markera_gammal_import();
CREATE OR REPLACE TRIGGER trg_fakt_skotstatus_tid_flagga BEFORE UPDATE ON fakt_skotning_status
  FOR EACH ROW EXECUTE FUNCTION fpr_skotstatus_tid_flagga();

-- ── Flytten av de befintliga raderna (en gång) ───────────────────────────────────────────────────────────────────────
SELECT * FROM fpr_tider_till_utc();

-- Kvitto: efter flytten får ingen tid ligga i framtiden. Före: 947 lass efter sin importtid, en status slut 09:05 UTC.
DO $kvitto$
BEGIN
  IF EXISTS (SELECT 1 FROM fakt_lass WHERE lossnings_tid > now() + interval '30 minutes')
     OR EXISTS (SELECT 1 FROM fakt_skotning_status WHERE start_tid > now() + interval '30 minutes' OR slut_tid > now() + interval '30 minutes') THEN
    RAISE EXCEPTION 'FPR-tider ligger fortfarande i framtiden efter flytten — avbryter';
  END IF;
END $kvitto$;
