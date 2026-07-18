-- Flyttdag: dagnivå ovanför maskin_flytt. Förarens dag = hemifrån → n flyttar
-- (med tomkörning emellan) → hem. Dagen äger tillkörning och hemresa; flytten
-- äger flytt_km (fakturerbar-styrande, OFÖRÄNDRAT flytt_km >= 30) och
-- mellankorning_km (tomkörning från förra flyttens slutpunkt — ALDRIG fakturerbar).
--
-- total_km (dag) = tillkorning + Σ flytt_km + Σ mellankorning_km + hem_km.
-- total_tid_min (dag) är MÄTT starttid → "Kör hem"-trycket och EXKLUDERAR
-- hemresan; hemresans tid är alltid ORS-BERÄKNAD i tid_hem_min och får aldrig
-- summeras in i den mätta siffran.

CREATE TABLE IF NOT EXISTS flyttdag (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  forare         text,
  medarbetare_id uuid REFERENCES medarbetare(id) ON DELETE SET NULL,
  starttid       timestamptz NOT NULL DEFAULT now(),  -- lämnar hemma / första maskinvalet
  sluttid        timestamptz,                         -- NULL = dagen pågår
  start_lat      double precision,
  start_lng      double precision,
  start_kalla    text,            -- 'hembas' | 'gps'
  slut_lat       double precision,
  slut_lng       double precision,
  tillkorning_km numeric,         -- hem → dagens första maskin (ägs av dagen nu)
  hem_km         numeric,         -- sista objektet → hem
  tid_hem_min    numeric,         -- BERÄKNAD (ORS) — aldrig i mätt total
  total_km       numeric,         -- tillkorning + Σflytt + Σmellankörning + hem
  total_tid_min  numeric,         -- MÄTT starttid→"Kör hem"; skräpskydd 16h i klienten
  status         text NOT NULL DEFAULT 'pagaende'     -- 'pagaende'|'avslutad'|'auto_avslutad'
);
CREATE INDEX IF NOT EXISTS flyttdag_pagaende_idx ON flyttdag (medarbetare_id) WHERE sluttid IS NULL;

-- Öppna policies (USING true) för inloggade — samma medvetna val som maskin_flytt.
ALTER TABLE flyttdag ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS flyttdag_select ON flyttdag;
CREATE POLICY flyttdag_select ON flyttdag FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS flyttdag_insert ON flyttdag;
CREATE POLICY flyttdag_insert ON flyttdag FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS flyttdag_update ON flyttdag;
CREATE POLICY flyttdag_update ON flyttdag FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS flyttdag_admin_delete ON flyttdag;
CREATE POLICY flyttdag_admin_delete ON flyttdag FOR DELETE TO authenticated USING (ar_admin());

-- maskin_flytt: dagkoppling + tomkörning + var maskinen stod.
-- Efter detta har maskin_flytt 30 kolumner (27 + dessa 3).
ALTER TABLE maskin_flytt ADD COLUMN IF NOT EXISTS flyttdag_id uuid REFERENCES flyttdag(id) ON DELETE SET NULL;
ALTER TABLE maskin_flytt ADD COLUMN IF NOT EXISTS mellankorning_km numeric;  -- förra B → denna A; NULL = dagens första
ALTER TABLE maskin_flytt ADD COLUMN IF NOT EXISTS fran_objekt_id uuid REFERENCES objekt(id) ON DELETE SET NULL;  -- objektet maskinen stod på (valfritt)
CREATE INDEX IF NOT EXISTS maskin_flytt_flyttdag_idx ON maskin_flytt (flyttdag_id);

-- OBS: maskin_flytt.tillkorning_km / hem_km / tid_hem_min / total_km behålls
-- oförändrade för befintliga rader men skrivs INTE längre av appen — flyttdag
-- äger de benen nu.
