-- Planeringsflödet (STEG 1): tilldelning av förare + livscykel-timestamps.
--
-- Status-kolumnen utökas INTE i schemat — den är redan oconstrained TEXT.
-- 'oplanerad' tillkommer som värde via app-koden (import-trakt + app/objekt/page.tsx).
-- Befintliga värden ('planerad', 'pagaende', 'avslutad', 'skordning', 'skotning', 'klar')
-- behålls oförändrade. 'planerad' fortsätter betyda "klar att köra" och sätts nu även
-- av planeringsvyns nya "Klar — skicka till förare"-knapp (tillsammans med
-- klar_skickad_timestamp).

ALTER TABLE objekt
  ADD COLUMN IF NOT EXISTS assigned_skordare_user_id  uuid REFERENCES medarbetare(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_skotare_user_id   uuid REFERENCES medarbetare(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS klar_skickad_timestamp     timestamptz,
  ADD COLUMN IF NOT EXISTS pagaende_startad_timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS avslutad_timestamp         timestamptz;

CREATE INDEX IF NOT EXISTS objekt_assigned_skordare_idx
  ON objekt (assigned_skordare_user_id) WHERE assigned_skordare_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS objekt_assigned_skotare_idx
  ON objekt (assigned_skotare_user_id) WHERE assigned_skotare_user_id IS NOT NULL;
