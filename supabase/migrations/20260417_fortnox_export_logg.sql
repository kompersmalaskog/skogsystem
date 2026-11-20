-- Spårar vad som skickats till Fortnox per medarbetare+period.
-- Förhindrar dubbelskick och visar status i admin-vyn.
CREATE TABLE IF NOT EXISTS fortnox_export_logg (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medarbetare_id uuid NOT NULL,
  period text NOT NULL,
  status text NOT NULL DEFAULT 'utkast',
  rader jsonb,
  skickad_at timestamptz,
  skickad_av uuid,
  fel_meddelande text,
  skapad timestamptz DEFAULT now(),
  UNIQUE (medarbetare_id, period)
);
