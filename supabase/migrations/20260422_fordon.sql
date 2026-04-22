-- Fordonsöversikt: besiktning/försäkring/skatt/service per fordon.
-- Håller reda på bilar, lastbilar, släp (king cabar), skogsmaskiner.

CREATE TABLE IF NOT EXISTS fordon (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  namn              text NOT NULL,
  regnr             text,
  typ               text NOT NULL CHECK (typ IN ('lastbil','bil','slap','king_cab','skordare','skotare','annan')),
  grupp             text NOT NULL CHECK (grupp IN ('lastbil_slap','bil','maskin')),
  besiktning_datum  date,
  forsakring_datum  date,
  skatt_datum       date,
  service_datum     date,
  service_timmar    int,
  nuvarande_timmar  int,
  service_km        int,
  nuvarande_km      int,
  anteckning        text,
  aktiv             boolean NOT NULL DEFAULT true,
  skapad            timestamptz NOT NULL DEFAULT now(),
  uppdaterad        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fordon_grupp_aktiv ON fordon(grupp, aktiv);
CREATE INDEX IF NOT EXISTS idx_fordon_besiktning ON fordon(besiktning_datum) WHERE besiktning_datum IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fordon_forsakring ON fordon(forsakring_datum) WHERE forsakring_datum IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fordon_skatt      ON fordon(skatt_datum) WHERE skatt_datum IS NOT NULL;

CREATE TABLE IF NOT EXISTS fordon_pamin_skickad (
  id              bigserial PRIMARY KEY,
  fordon_id       uuid NOT NULL REFERENCES fordon(id) ON DELETE CASCADE,
  handelse_typ    text NOT NULL CHECK (handelse_typ IN ('besiktning','forsakring','skatt','service')),
  datum           date NOT NULL,
  dagar_fore      int NOT NULL CHECK (dagar_fore IN (30, 7, 0)),
  skickad_tid     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fordon_id, handelse_typ, datum, dagar_fore)
);

CREATE INDEX IF NOT EXISTS idx_fordon_pamin_skickad_tid ON fordon_pamin_skickad(skickad_tid);
