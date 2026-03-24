-- Ledighet & ATK-hantering
CREATE TABLE IF NOT EXISTS ledighet_ansokningar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anvandare_id TEXT NOT NULL,
  typ TEXT NOT NULL CHECK (typ IN ('semester', 'atk', 'stillestand')),
  startdatum DATE NOT NULL,
  slutdatum DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'väntar' CHECK (status IN ('väntar', 'godkänd', 'nekad')),
  kommentar TEXT,
  skapad_av TEXT,
  skapad_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index för snabba uppslag
CREATE INDEX IF NOT EXISTS idx_ledighet_anvandare ON ledighet_ansokningar(anvandare_id);
CREATE INDEX IF NOT EXISTS idx_ledighet_status ON ledighet_ansokningar(status);
CREATE INDEX IF NOT EXISTS idx_ledighet_datum ON ledighet_ansokningar(startdatum, slutdatum);
