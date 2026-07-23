-- import_fel — verifierade datatapp från Python-importen.
-- Skrivs från upsert_data:s felgren (central passage för ALLA tabellskrivfel).
-- Läses av: datahälsan (/datahalsa, sektionen "Tappades något vid import?")
-- och gap_check (Del 4, larmar på rader senaste 8 dygnen).
-- Bakgrund (Wisent-läxan 2026-07-21): skiftdata tappades i tysthet — felet
-- loggades i importerns egen logg som ingen läser, och upptäcktes bara för
-- att Martin råkade kolla sin arbetsdag.

CREATE TABLE IF NOT EXISTS import_fel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tid timestamptz NOT NULL DEFAULT now(),
  tabell text NOT NULL,
  filnamn text,
  antal_rader integer,
  felkod text,
  feltext text
);

CREATE INDEX IF NOT EXISTS import_fel_tid_idx ON import_fel (tid DESC);

-- RLS: inloggade får läsa (datahälsan), bara service role skriver
-- (Python-importen). Ingen INSERT/UPDATE/DELETE-policy = stängt för klienter.
ALTER TABLE import_fel ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS import_fel_las ON import_fel;
CREATE POLICY import_fel_las ON import_fel FOR SELECT TO authenticated USING (true);
