-- Maskin service/underhåll tabeller
CREATE TABLE IF NOT EXISTS maskin_service (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maskin_id uuid REFERENCES maskiner(id) ON DELETE CASCADE,
  del text NOT NULL,
  kategori text NOT NULL CHECK (kategori IN ('service','hydraulik','slang','punktering','motor','kran','aggregat','elektrisk','ovrigt')),
  beskrivning text,
  timmar float,
  kostnad float DEFAULT 0,
  utford_av text,
  datum date NOT NULL DEFAULT CURRENT_DATE,
  skapad_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_paminnelser (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maskin_id uuid REFERENCES maskiner(id) ON DELETE CASCADE,
  typ text NOT NULL,
  intervall_timmar int NOT NULL,
  senast_utford_timmar float DEFAULT 0,
  aktiv boolean DEFAULT true
);

-- RLS
ALTER TABLE maskin_service ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_paminnelser ENABLE ROW LEVEL SECURITY;

CREATE POLICY "maskin_service_all" ON maskin_service FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_paminnelser_all" ON service_paminnelser FOR ALL USING (true) WITH CHECK (true);

-- Index
CREATE INDEX idx_maskin_service_maskin ON maskin_service(maskin_id);
CREATE INDEX idx_maskin_service_datum ON maskin_service(datum DESC);
CREATE INDEX idx_service_paminnelser_maskin ON service_paminnelser(maskin_id);
