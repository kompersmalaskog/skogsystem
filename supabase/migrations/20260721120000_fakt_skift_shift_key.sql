-- Timvisa MOM-filer gav en NY fakt_skift-rad per fil (filnamn ingick i
-- upsert-nyckeln) — 20 juli blev 14 rader / 73,9h i stället för 1 rad / 10,5h.
-- ShifKey (StanForD:s stavning) är maskinens eget skift-id, stabilt genom
-- skiftets livscykel. Verifierat 2026-07-21 över 1031 keys / 3 Ponsse-maskiner:
-- en key = ett skift = ett startdatum, alltid. Rottne saknar ShifKey och får
-- syntetiskt SYN_{datum}_{operator} från importen.
--
-- datum i indexet = billig försäkring mot framtida ShifKey-återställning
-- (t.ex. maskindatorbyte); startdatum per skift är verifierat stabilt.
--
-- Första halvan (kolumn + 2-kolumnsindex) kördes manuellt mot prod 2026-07-21;
-- IF NOT EXISTS/IF EXISTS gör filen idempotent.

ALTER TABLE fakt_skift ADD COLUMN IF NOT EXISTS shift_key text;

COMMENT ON COLUMN fakt_skift.shift_key IS
  'Maskinens eget skift-id (StanForD ShifKey). Rottne: syntetiskt SYN_{datum}_{operator}. Del av upsert-nyckeln (maskin_id, datum, shift_key).';

DROP INDEX IF EXISTS fakt_skift_maskin_shift_key;

CREATE UNIQUE INDEX IF NOT EXISTS fakt_skift_maskin_datum_shift_key
  ON fakt_skift (maskin_id, datum, shift_key);
