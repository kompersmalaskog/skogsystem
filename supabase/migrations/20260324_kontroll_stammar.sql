-- Kontrollmätning / kalibrering – tre tabeller
-- kontroll_stammar: en rad per kontrollmätningssession (en stam per dag)
-- kontroll_stockar: en rad per stock i kontrollstammen
-- kontroll_matpunkter: en rad per diametrisk mätpunkt på en stock

CREATE TABLE IF NOT EXISTS kontroll_stammar (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  datum         DATE NOT NULL,
  maskin_id     TEXT,
  objekt_id     UUID REFERENCES objekt(id) ON DELETE SET NULL,
  stam_nummer   INTEGER NOT NULL,
  tradslag      TEXT NOT NULL,            -- 'Gran', 'Tall'
  antal_stockar INTEGER NOT NULL DEFAULT 0,
  typ           TEXT NOT NULL DEFAULT 'check',  -- 'check', 'calib', 'missing'
  kalibrering   TEXT,                     -- t.ex. '+2mm' eller '−1mm@D100, +1mm@D300'
  temperatur    NUMERIC,                  -- °C vid mätning
  volym_m3fub   NUMERIC,                  -- volym producerad den dagen (för typ='missing')
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kontroll_stockar (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kontroll_stam_id  UUID NOT NULL REFERENCES kontroll_stammar(id) ON DELETE CASCADE,
  stock_nummer      INTEGER NOT NULL,
  sortiment         TEXT NOT NULL,          -- 'Massaved', 'Timmer', 'Kubb'
  langd_maskin      INTEGER NOT NULL,       -- cm
  langd_operator    INTEGER NOT NULL,       -- cm
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kontroll_matpunkter (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kontroll_stock_id UUID NOT NULL REFERENCES kontroll_stockar(id) ON DELETE CASCADE,
  position          INTEGER NOT NULL,       -- cm från rotände
  benamning         TEXT NOT NULL,           -- 'D130', 'D200', 'Topp' etc.
  diameter_maskin   INTEGER NOT NULL,        -- mm
  diameter_operator INTEGER NOT NULL,        -- mm
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- Index för vanliga frågor
CREATE INDEX idx_kontroll_stammar_datum ON kontroll_stammar(datum DESC);
CREATE INDEX idx_kontroll_stammar_maskin ON kontroll_stammar(maskin_id);
CREATE INDEX idx_kontroll_stockar_stam ON kontroll_stockar(kontroll_stam_id);
CREATE INDEX idx_kontroll_matpunkter_stock ON kontroll_matpunkter(kontroll_stock_id);

-- RLS policies (tillåt läsning för alla autentiserade + anon)
ALTER TABLE kontroll_stammar ENABLE ROW LEVEL SECURITY;
ALTER TABLE kontroll_stockar ENABLE ROW LEVEL SECURITY;
ALTER TABLE kontroll_matpunkter ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kontroll_stammar_read" ON kontroll_stammar FOR SELECT USING (true);
CREATE POLICY "kontroll_stammar_write" ON kontroll_stammar FOR ALL USING (true);
CREATE POLICY "kontroll_stockar_read" ON kontroll_stockar FOR SELECT USING (true);
CREATE POLICY "kontroll_stockar_write" ON kontroll_stockar FOR ALL USING (true);
CREATE POLICY "kontroll_matpunkter_read" ON kontroll_matpunkter FOR SELECT USING (true);
CREATE POLICY "kontroll_matpunkter_write" ON kontroll_matpunkter FOR ALL USING (true);
