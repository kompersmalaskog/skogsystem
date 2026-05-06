-- =============================================================
-- MOM-reparationer: lägg till kolumner i fakt_avbrott + maskin_service
--
-- Steg 1 av 4 i utbyggnaden av MOM-importens hantering av
-- <Repair> + <SpareParts>. Endast schema — ingen parser- eller
-- UI-kod ändras här.
--
-- Båda tabellerna får en mom_event_id (uuid, nullable) så att en
-- enskild reparation från en MOM-fil kan landa på två ställen
-- samtidigt och länkas. Inget FK mellan tabellerna — det är en
-- logisk koppling, inte en RDBMS-relation.
--
-- fakt_avbrott finns inte i supabase/migrations/ — backfill av
-- tabelldefinitionen sker separat. Här bara ALTER TABLE.
-- =============================================================

-- -------------------------------------------------------------
-- fakt_avbrott
-- -------------------------------------------------------------
ALTER TABLE fakt_avbrott
  ADD COLUMN IF NOT EXISTS mom_event_id uuid,
  ADD COLUMN IF NOT EXISTS delsystem    text,
  ADD COLUMN IF NOT EXISTS underorsak   text,
  ADD COLUMN IF NOT EXISTS detalj       text;

CREATE INDEX IF NOT EXISTS idx_fakt_avbrott_mom_event_id
  ON fakt_avbrott (mom_event_id)
  WHERE mom_event_id IS NOT NULL;

-- -------------------------------------------------------------
-- maskin_service
-- -------------------------------------------------------------
ALTER TABLE maskin_service
  ADD COLUMN IF NOT EXISTS mom_event_id           uuid,
  ADD COLUMN IF NOT EXISTS kalla                  text NOT NULL DEFAULT 'manuell',
  ADD COLUMN IF NOT EXISTS delsystem              text,
  ADD COLUMN IF NOT EXISTS underorsak             text,
  ADD COLUMN IF NOT EXISTS detalj                 text,
  ADD COLUMN IF NOT EXISTS reservdel_namn         text,
  ADD COLUMN IF NOT EXISTS reservdel_beskrivning  text,
  ADD COLUMN IF NOT EXISTS reservdel_antal        integer,
  ADD COLUMN IF NOT EXISTS langd_sek              integer;

-- CHECK på kalla: idempotent via DO-block (CONSTRAINT stöder inte IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'maskin_service_kalla_check'
  ) THEN
    ALTER TABLE maskin_service
      ADD CONSTRAINT maskin_service_kalla_check
      CHECK (kalla IN ('manuell','mom'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_maskin_service_mom_event_id
  ON maskin_service (mom_event_id)
  WHERE mom_event_id IS NOT NULL;
