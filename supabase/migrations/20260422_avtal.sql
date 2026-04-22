-- Avtal & Abonnemang: telefon, friskvård, försäkring, leasing, programvara, övrigt.
-- Påminnelser vid 30d/7d/0d via pg_cron (se notify-cron-migration).

CREATE TABLE IF NOT EXISTS avtal (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  namn               text NOT NULL,
  kategori           text NOT NULL CHECK (kategori IN ('telefon','friskvard','forsakring','leasing','programvara','ovrigt')),
  leverantor         text,
  kopplad_till       text,
  start_datum        date,
  slut_datum         date,
  belopp_per_manad   numeric,
  belopp_per_ar      numeric,
  budget_total       numeric,
  budget_anvant      numeric DEFAULT 0,
  anteckning         text,
  aktiv              boolean NOT NULL DEFAULT true,
  skapad             timestamptz NOT NULL DEFAULT now(),
  uppdaterad         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_avtal_kategori_aktiv ON avtal(kategori, aktiv);
CREATE INDEX IF NOT EXISTS idx_avtal_slut_datum     ON avtal(slut_datum) WHERE slut_datum IS NOT NULL;

CREATE TABLE IF NOT EXISTS avtal_pamin_skickad (
  id           bigserial PRIMARY KEY,
  avtal_id     uuid NOT NULL REFERENCES avtal(id) ON DELETE CASCADE,
  datum        date NOT NULL,
  dagar_fore   int NOT NULL CHECK (dagar_fore IN (30, 7, 0)),
  skickad_tid  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (avtal_id, datum, dagar_fore)
);
