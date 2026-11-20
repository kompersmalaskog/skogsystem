-- fpr_tider_till_utc() nollställer importmarkeringen först. Triggern fpr_tid_markera_gammal_import sätter en
-- transaktionsvariabel när en äldre import skriver; i SAMMA transaktion hade en flytt därefter märkt de rättade raderna
-- false igen (upptäckt i rollback-körningen: ny rad → flytt i en transaktion). Funktionen körs i egen transaktion i
-- drift, men ska inte bero på det.
CREATE OR REPLACE FUNCTION fpr_tider_till_utc()
RETURNS TABLE (tabell text, rader bigint)
LANGUAGE plpgsql AS $f$
DECLARE n bigint;
BEGIN
  PERFORM set_config('app.fpr_tid_gammal_import', '', true);

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
