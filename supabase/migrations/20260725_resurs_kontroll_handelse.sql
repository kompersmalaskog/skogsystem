-- Fordonsvyn: ny datamodell — resurs / kontroll / händelse.
-- Ersätter gamla `fordon` med fyra fasta datumkolumner. Skatt & försäkring
-- utgår (autogiro / rullande avtal). Gamla tabellen bevaras orörd som
-- `fordon_gammal` tills migreringen är verifierad.
--
-- Re-runnable: deterministiska id:n + ON CONFLICT DO NOTHING. Kör om utan skada.

-- ── #7: ID-formeln på EXAKT ett ställe ─────────────────────────────────────
-- Både datamigreringen (steg 3) och pamin-omkopplingen (steg 4) anropar denna.
CREATE OR REPLACE FUNCTION kontroll_uuid(p_resurs_id uuid, p_typ text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS
$$ SELECT md5(p_resurs_id::text || ':' || p_typ)::uuid $$;

-- ── Steg 1: nya tabeller ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resurs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  namn           text NOT NULL,
  typ            text NOT NULL CHECK (typ IN ('bil','lastbil','slap','maskin','cistern')),
  regnr          text,
  serienr        text,
  marke          text,
  modell         text,
  arsmodell      int,
  avstalld       boolean NOT NULL DEFAULT false,
  matarstallning int,          -- enhet härleds ur typ (km/timmar/ingen)
  matare_avlast  date,
  inkopsdatum    date,         -- EKONOMI: filtreras i select() + avvisas i write för icke-admin
  inkopspris     int,          -- EKONOMI
  anteckning     text,
  aktiv          boolean NOT NULL DEFAULT true,
  skapad         timestamptz NOT NULL DEFAULT now(),
  uppdaterad     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kontroll (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resurs_id             uuid NOT NULL REFERENCES resurs(id) ON DELETE CASCADE,
  typ                   text NOT NULL CHECK (typ IN ('besiktning','service','cisternkontroll','brandskydd')),
  intervall_manader     int,
  intervall_timmar      int,
  intervall_km          int,
  senast_utford         date,
  senast_matarstallning int,
  nasta_forfall         date,   -- cache (datum): explicit ELLER härlett ur senast_utford + intervall
  nasta_matarvarde      int,    -- cache (mätare): mätarmotsvarighet till nasta_forfall
  anteckning            text,
  aktiv                 boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS handelse (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resurs_id      uuid NOT NULL REFERENCES resurs(id) ON DELETE CASCADE,
  kontroll_id    uuid REFERENCES kontroll(id) ON DELETE SET NULL,
  typ            text NOT NULL CHECK (typ IN ('besiktning','service','reparation','byte','ovrigt')),
  benamning      text,          -- fritext, t.ex. "Lager, höger boggi"; normaliseras vid spara
  datum          date NOT NULL,
  matarstallning int,
  kostnad        int,
  utford_av      text,
  anteckning     text,
  skapad         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kontroll_resurs   ON kontroll(resurs_id);
CREATE INDEX IF NOT EXISTS idx_kontroll_forfall  ON kontroll(nasta_forfall) WHERE nasta_forfall IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_handelse_resurs   ON handelse(resurs_id);
-- "Senast gjort" grupperar på (typ, lower(trim(benamning))) — stöd uppslaget:
CREATE INDEX IF NOT EXISTS idx_handelse_grupp    ON handelse(resurs_id, typ, lower(trim(benamning)));

-- RLS på men inga policies → låst; endast service-role-API kommer åt.
ALTER TABLE resurs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE kontroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE handelse ENABLE ROW LEVEL SECURITY;

-- ── Steg 2: döp om gamla tabellen (idempotent, bevaras orörd) ──────────────
DO $$ BEGIN
  IF to_regclass('public.fordon') IS NOT NULL
     AND to_regclass('public.fordon_gammal') IS NULL THEN
    ALTER TABLE fordon RENAME TO fordon_gammal;
  END IF;
END $$;

-- ── Steg 3: migrera data ───────────────────────────────────────────────────
-- resurs.id = fordon_gammal.id återanvänds → re-run infogar inga dubbletter,
-- och fordon_pamin_skickad.fordon_id pekar redan på rätt id.
-- #1: mätaren väljs PÅ TYP (aldrig COALESCE — fel enhet om båda fyllda).
INSERT INTO resurs (id, namn, typ, regnr, matarstallning, anteckning, aktiv)
SELECT
  g.id,
  g.namn,
  m.ny_typ,
  g.regnr,
  CASE m.ny_typ
    WHEN 'maskin'  THEN g.nuvarande_timmar
    WHEN 'bil'     THEN g.nuvarande_km
    WHEN 'lastbil' THEN g.nuvarande_km
    ELSE NULL                       -- slap / cistern: ingen mätare
  END,
  g.anteckning,
  g.aktiv
FROM fordon_gammal g
CROSS JOIN LATERAL (SELECT
  CASE g.typ
    WHEN 'lastbil'  THEN 'lastbil'
    WHEN 'bil'      THEN 'bil'
    WHEN 'king_cab' THEN 'bil'
    WHEN 'slap'     THEN 'slap'
    WHEN 'skordare' THEN 'maskin'
    WHEN 'skotare'  THEN 'maskin'
    ELSE 'maskin'                    -- annan → maskin
  END AS ny_typ
) m
ON CONFLICT (id) DO NOTHING;

-- besiktning → kontroll (datummål). forsakring/skatt migreras INTE.
INSERT INTO kontroll (id, resurs_id, typ, intervall_manader, nasta_forfall)
SELECT kontroll_uuid(g.id, 'besiktning'), g.id, 'besiktning', 12, g.besiktning_datum
FROM fordon_gammal g
WHERE g.besiktning_datum IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- service → kontroll. Absolut mål rakt in i nasta_matarvarde (#svar: ingen
-- fabricerad historik — senast/intervall lämnas NULL, självläker vid nästa service).
INSERT INTO kontroll (id, resurs_id, typ, nasta_forfall, nasta_matarvarde)
SELECT
  kontroll_uuid(g.id, 'service'),
  g.id,
  'service',
  g.service_datum,
  CASE
    WHEN g.typ IN ('skordare','skotare') THEN g.service_timmar
    WHEN g.typ IN ('bil','lastbil','king_cab') THEN g.service_km
    ELSE NULL
  END
FROM fordon_gammal g
WHERE g.service_datum IS NOT NULL
   OR g.service_timmar IS NOT NULL
   OR g.service_km IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- ── Steg 4: koppla om fordon_pamin_skickad till kontroll ───────────────────
ALTER TABLE fordon_pamin_skickad ADD COLUMN IF NOT EXISTS kontroll_id uuid REFERENCES kontroll(id) ON DELETE CASCADE;

-- #7: samma formel som steg 3 → pamin-kopplingen kan aldrig glida isär.
UPDATE fordon_pamin_skickad p
SET kontroll_id = kontroll_uuid(p.fordon_id, p.handelse_typ)
WHERE p.handelse_typ IN ('besiktning','service') AND p.kontroll_id IS NULL;

-- #5: forsakring/skatt-rader RADERAS INTE — lämnas med kontroll_id NULL.
--     (Vi rör inte gammal historik medan fordon_gammal fortfarande är facit.)

-- Frigör tabellen från gamla fordon-formen så nya kontroll-rader kan dedupas:
ALTER TABLE fordon_pamin_skickad ALTER COLUMN fordon_id    DROP NOT NULL;
ALTER TABLE fordon_pamin_skickad ALTER COLUMN handelse_typ DROP NOT NULL;
ALTER TABLE fordon_pamin_skickad DROP CONSTRAINT IF EXISTS fordon_pamin_skickad_fordon_id_fkey;
ALTER TABLE fordon_pamin_skickad DROP CONSTRAINT IF EXISTS fordon_pamin_skickad_handelse_typ_check;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pamin_kontroll
  ON fordon_pamin_skickad(kontroll_id, datum, dagar_fore);
