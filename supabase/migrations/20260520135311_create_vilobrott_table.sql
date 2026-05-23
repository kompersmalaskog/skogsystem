-- Vilobrott — lagrar detekterade brott mot dygnsvila (§13) och veckovila (§14).
-- En sanning för förarvy + adminvy. Räknas ut av analyseraVilobrott() i
-- lib/vilobrott.ts vid arbetsdag-mutation och vid Bekräfta dagen-flödet.
--
-- Tröskelvärden (11h, 36h, fönster mm) ligger i gs_avtal — inte hårdkodade här.
-- Se 20260520_gs_avtal_vila_troskelvarden.sql.
--
-- RLS följer befintligt mönster i kodbasen: FOR ALL USING (true).
-- Filtrering sker i applikationskoden (förare → bara sina, chef/admin → alla).
-- Skälet är konsekvens med övriga tabeller. Om det stramas åt senare bör
-- alla tabeller stramas åt samtidigt, inte bara den här.

CREATE TABLE IF NOT EXISTS vilobrott (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medarbetare_id              UUID NOT NULL REFERENCES medarbetare(id) ON DELETE RESTRICT,
  typ                         TEXT NOT NULL CHECK (typ IN ('dygnsvila', 'veckovila')),
  datum                       DATE NOT NULL,
  vila_h                      NUMERIC NOT NULL,
  krav_h                      NUMERIC NOT NULL,
  brist_h                     NUMERIC GENERATED ALWAYS AS (krav_h - vila_h) STORED,
  beskrivning                 TEXT,
  upptackt_tid                TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Förarens svar på "Varför bröts vilan?" (krävs innan arbetsdagen får bekräftas)
  besvarat_av_forare          BOOLEAN NOT NULL DEFAULT false,
  orsak                       TEXT CHECK (orsak IN ('oforutsedd', 'akut_jour', 'planerad_avtal', 'annat')),
  orsak_fritext               TEXT,
  besvarat_tid                TIMESTAMPTZ,

  -- Kompensation = krav_h - vila_h, deadline = upptackt_tid::date + gs_avtal.kompensation_deadline_dagar.
  -- OBS: enligt EU-domstolens tolkning (CCOO mål C-477/21) ska kompensationsvilan
  -- klistra fast direkt vid nästa dygnsvila, inte ligga utlagd som flexledighet.
  -- Vi automatiserar inte den utläggningen i den här migrationen — den kommer i
  -- separat uppgift. Just nu sparar vi bara timmar + deadline.
  kompensation_h              NUMERIC,
  kompensation_deadline       DATE,
  kompensation_uttagen        BOOLEAN NOT NULL DEFAULT false,
  kompensation_uttagen_tid    TIMESTAMPTZ,

  -- Chefs-kvittering (för Arbetsmiljöverket-spår). Fylls från admin-vyn,
  -- vilket kommer i senare uppgift. Kolumnen finns nu så schemat är stabilt.
  -- ON DELETE behåller default (NO ACTION) — om en chef tas bort behöver
  -- fältet nullas manuellt först. Acceptabelt eftersom chefer tas bort sällan.
  kvitterad_av_chef           UUID REFERENCES medarbetare(id),
  kvitterad_tid               TIMESTAMPTZ,

  skapad                      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Ett brott per (medarbetare, typ, datum). Vid re-analys efter arbetsdag-ändring
  -- UPSERT:ar vi på den här nyckeln så vi inte får dubletter.
  UNIQUE(medarbetare_id, typ, datum)
);

ALTER TABLE vilobrott ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vilobrott_all" ON vilobrott FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_vilobrott_medarbetare_datum
  ON vilobrott(medarbetare_id, datum DESC);

CREATE INDEX idx_vilobrott_obesvarade
  ON vilobrott(medarbetare_id)
  WHERE besvarat_av_forare = false;

CREATE INDEX idx_vilobrott_kompensation
  ON vilobrott(kompensation_deadline)
  WHERE kompensation_uttagen = false AND kompensation_deadline IS NOT NULL;

-- Konsistens-constraint: om besvarat_av_forare = true måste orsak vara satt.
-- Förhindrar att bekräfta-flödet glömmer skriva orsaken.
ALTER TABLE vilobrott ADD CONSTRAINT vilobrott_orsak_kravs_om_besvarat
  CHECK (besvarat_av_forare = false OR orsak IS NOT NULL);

COMMENT ON TABLE vilobrott IS
  'Detekterade brott mot dygnsvila (§13, 11h) och veckovila (§14, 36h). En sanning för förarvy + adminvy. Beräknas av lib/vilobrott.ts.';
