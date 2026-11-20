-- 2026-08-05  objekt: dokument-kolumner + importvarningar
--
-- valtlapp_url: känd dokumenttyp -> egen kolumn (som traktdirektiv_url, stamplingslangd_url,
-- kartbild_url, traktkarta_url). Kända typer får kolumner, okända hamnar i ovriga_dokument.
-- ovriga_dokument: jsonb [{namn, path}] för PDF:er utan känt suffix — originalnamnet bevarat
-- och synligt (t.ex. inskannad Mölleryd.pdf).
-- import_varningar: jsonb med hela varningslistan från importen (okänt Purpose, saknat
-- L_TRAKTDEL, oväntad envelope-version, PDF utan känt suffix, osäker stämplingslängd ...).
-- UI:t kan visa "N saker att kolla" på objektet.

ALTER TABLE objekt
  ADD COLUMN IF NOT EXISTS valtlapp_url     text,
  ADD COLUMN IF NOT EXISTS ovriga_dokument  jsonb,
  ADD COLUMN IF NOT EXISTS import_varningar jsonb;
