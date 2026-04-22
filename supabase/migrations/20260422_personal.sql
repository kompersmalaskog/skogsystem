-- Personal-vy: friskvårdsbudget + certifikat + anhörig på medarbetare.

ALTER TABLE medarbetare
  ADD COLUMN IF NOT EXISTS friskvard_budget_total  numeric,
  ADD COLUMN IF NOT EXISTS friskvard_budget_anvant numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS anhorig_namn            text,
  ADD COLUMN IF NOT EXISTS anhorig_telefon         text,
  ADD COLUMN IF NOT EXISTS anhorig_relation        text;

CREATE TABLE IF NOT EXISTS medarbetare_certifikat (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medarbetare_id   uuid NOT NULL REFERENCES medarbetare(id) ON DELETE CASCADE,
  namn             text NOT NULL,
  utfardad_datum   date,
  utgar_datum      date,
  anteckning       text,
  aktiv            boolean NOT NULL DEFAULT true,
  skapad           timestamptz NOT NULL DEFAULT now(),
  uppdaterad       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cert_medarbetare ON medarbetare_certifikat(medarbetare_id, aktiv);
CREATE INDEX IF NOT EXISTS idx_cert_utgar        ON medarbetare_certifikat(utgar_datum) WHERE utgar_datum IS NOT NULL;
