-- Notis-kön får producenten den saknat (dagsslut-notiser från mom-import).
-- MOM-filerna är kumulativa — synken kör många gånger per dag för samma
-- datum, så dedupen är bärande: EN dagsslut-notis per (typ, mottagare, dag),
-- aldrig spam. Partiellt index så befintliga/framtida notistyper utan
-- datum (t.ex. atk_återställd) inte påverkas.

ALTER TABLE notis_kö ADD COLUMN IF NOT EXISTS datum date;

COMMENT ON COLUMN notis_kö.datum IS
  'Dagen notisen avser (dagsslut m.fl.) — del av dedup-nyckeln. NULL för notistyper utan dagskoppling.';

CREATE UNIQUE INDEX IF NOT EXISTS notis_ko_dedup_typ_mottagare_datum
  ON notis_kö (typ, mottagare_id, datum)
  WHERE datum IS NOT NULL;
