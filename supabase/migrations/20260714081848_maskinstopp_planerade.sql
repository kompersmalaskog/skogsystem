-- Spegel av remote-migration 20260714081848_maskinstopp_planerade,
-- applicerad direkt mot prod 2026-07-14. Körs INTE igen — versionsnumret
-- finns redan i databasens migrationshistorik. Filen finns för att repo
-- och databas ska vara i synk.
CREATE TABLE IF NOT EXISTS maskinstopp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maskin_id text NOT NULL REFERENCES dim_maskin(maskin_id),
  fran_datum date NOT NULL,
  till_datum date NOT NULL,
  orsak text NOT NULL,
  kommentar text,
  skapad_av text,
  skapad_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maskinstopp_datum_ordning CHECK (till_datum >= fran_datum)
);

CREATE INDEX IF NOT EXISTS maskinstopp_maskin_datum_idx
  ON maskinstopp (maskin_id, fran_datum, till_datum);

ALTER TABLE maskinstopp ENABLE ROW LEVEL SECURITY;

-- OBS: write-policyn är helt öppen för alla inloggade (speglar prod).
-- Åtstramning planerad i ledighetsomgörningens steg 2 (en stopp-modell).
CREATE POLICY maskinstopp_select ON maskinstopp
  FOR SELECT TO authenticated USING (true);
CREATE POLICY maskinstopp_write ON maskinstopp
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
