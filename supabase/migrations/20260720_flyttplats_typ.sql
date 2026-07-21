-- Maskinflytt v4: generalisering — flyttplatser (verkstad/uppställning/kund
-- m.m.), främmande maskiner (fritext) och flytt-typ som styr fakturerbar.
--
-- fakturerbar per flytt_typ (beräknas i klienten via beraknaFakturerbar,
-- valideras av constraints nedan; priser räknas aldrig i appen):
--   produktion:  true endast om flytt_km >= 30 (som tidigare)
--   service:     ALDRIG — egen kostnad
--   kunduppdrag: ALLTID — vi kör åt någon annan; kund krävs (DB-spärr)
--   annat:       aldrig automatiskt
--
-- Enda icke-additiva raden: maskin_id DROP NOT NULL (data rörs ej).

CREATE TABLE IF NOT EXISTS flyttplats (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  namn       text NOT NULL,
  typ        text NOT NULL DEFAULT 'annat',   -- 'verkstad'|'uppstallning'|'gard'|'kund'|'annat'
  lat        double precision,
  lng        double precision,
  adress     text,
  kommentar  text,
  aktiv      boolean NOT NULL DEFAULT true,
  skapad_av  text,
  skapad_tid timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE flyttplats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS flyttplats_select ON flyttplats;
CREATE POLICY flyttplats_select ON flyttplats FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS flyttplats_insert ON flyttplats;
CREATE POLICY flyttplats_insert ON flyttplats FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS flyttplats_update ON flyttplats;
CREATE POLICY flyttplats_update ON flyttplats FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS flyttplats_admin_delete ON flyttplats;
CREATE POLICY flyttplats_admin_delete ON flyttplats FOR DELETE TO authenticated USING (ar_admin());

ALTER TABLE flyttplats DROP CONSTRAINT IF EXISTS flyttplats_typ_giltig;
ALTER TABLE flyttplats ADD CONSTRAINT flyttplats_typ_giltig
  CHECK (typ IN ('verkstad','uppstallning','gard','kund','annat'));

-- Båda ändarna: objekt ELLER flyttplats (aldrig båda — spärras nedan)
ALTER TABLE maskin_flytt ADD COLUMN IF NOT EXISTS fran_plats_id uuid REFERENCES flyttplats(id) ON DELETE SET NULL;
ALTER TABLE maskin_flytt ADD COLUMN IF NOT EXISTS till_plats_id uuid REFERENCES flyttplats(id) ON DELETE SET NULL;

-- Främmande maskin: fritext i stället för dim_maskin-koppling
ALTER TABLE maskin_flytt ADD COLUMN IF NOT EXISTS extern_maskin text;
ALTER TABLE maskin_flytt ALTER COLUMN maskin_id DROP NOT NULL;

-- Typ + kund styr fakturerbar
ALTER TABLE maskin_flytt ADD COLUMN IF NOT EXISTS flytt_typ text NOT NULL DEFAULT 'produktion';
ALTER TABLE maskin_flytt ADD COLUMN IF NOT EXISTS kund text;

-- Spärrar (idempotenta: DROP + ADD). Befintliga rader passerar alla.
ALTER TABLE maskin_flytt DROP CONSTRAINT IF EXISTS maskin_flytt_exakt_en_maskin;
ALTER TABLE maskin_flytt ADD CONSTRAINT maskin_flytt_exakt_en_maskin
  CHECK ((maskin_id IS NOT NULL) <> (extern_maskin IS NOT NULL));
ALTER TABLE maskin_flytt DROP CONSTRAINT IF EXISTS maskin_flytt_fran_en_kalla;
ALTER TABLE maskin_flytt ADD CONSTRAINT maskin_flytt_fran_en_kalla
  CHECK (fran_objekt_id IS NULL OR fran_plats_id IS NULL);
ALTER TABLE maskin_flytt DROP CONSTRAINT IF EXISTS maskin_flytt_till_en_kalla;
ALTER TABLE maskin_flytt ADD CONSTRAINT maskin_flytt_till_en_kalla
  CHECK (till_objekt_id IS NULL OR till_plats_id IS NULL);

-- Fritexten som styr pengar får aldrig falla igenom tyst (stavfel/versaler):
ALTER TABLE maskin_flytt DROP CONSTRAINT IF EXISTS maskin_flytt_typ_giltig;
ALTER TABLE maskin_flytt ADD CONSTRAINT maskin_flytt_typ_giltig
  CHECK (flytt_typ IN ('produktion','service','kunduppdrag','annat'));
ALTER TABLE maskin_flytt DROP CONSTRAINT IF EXISTS maskin_flytt_kund_kravs;
ALTER TABLE maskin_flytt ADD CONSTRAINT maskin_flytt_kund_kravs
  CHECK (flytt_typ <> 'kunduppdrag' OR (kund IS NOT NULL AND btrim(kund) <> ''));
