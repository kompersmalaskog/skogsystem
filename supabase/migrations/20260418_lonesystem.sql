-- Lönesystem-integration: koppling, artikelmappning, anställningsnummer per medarbetare

CREATE TABLE IF NOT EXISTS lonesystem_koppling (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foretag_id text,
  system_typ text NOT NULL,
  api_client_id text,
  api_client_secret text,
  access_token text,
  refresh_token text,
  token_utgar timestamptz,
  aktiv boolean DEFAULT false,
  senast_synkad timestamptz,
  skapad timestamptz DEFAULT now()
);

-- En koppling per system_typ (single-tenant). Multi-tenant kan utökas senare med (foretag_id, system_typ).
CREATE UNIQUE INDEX IF NOT EXISTS lonesystem_koppling_system_typ_idx
  ON lonesystem_koppling (system_typ);

CREATE TABLE IF NOT EXISTS lonesystem_artikelmappning (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foretag_id text,
  intern_typ text NOT NULL,
  extern_kod text NOT NULL,
  beskrivning text,
  uppdaterad timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lonesystem_artikelmappning_intern_typ_idx
  ON lonesystem_artikelmappning (intern_typ);

CREATE TABLE IF NOT EXISTS medarbetare_lonesystem (
  medarbetare_id text NOT NULL,
  lonesystem_id uuid NOT NULL REFERENCES lonesystem_koppling(id) ON DELETE CASCADE,
  anstallningsnummer text,
  uppdaterad timestamptz DEFAULT now(),
  PRIMARY KEY (medarbetare_id, lonesystem_id)
);
