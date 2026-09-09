-- Objektets svårighet: normal / svår / VF (vindfälle). Datainsamling för en
-- kommande prognosmodell — används inte i någon beräkning än. Sätts i
-- objektformuläret (segmenterad kontroll, default Normal) och visas som
-- liten etikett i objektlistan när den inte är normal.
ALTER TABLE objekt
  ADD COLUMN IF NOT EXISTS svarighet text NOT NULL DEFAULT 'normal'
  CHECK (svarighet IN ('normal', 'svar', 'vf'));
