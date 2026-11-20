-- =============================================================
-- Steg 1.5 — UNIQUE-constraint på maskin_service.mom_event_id
--
-- Möjliggör deterministisk dedup vid MOM-omimport (uuid5 ger
-- samma mom_event_id för samma reparation över flera filer).
-- Parsern (steg 2) kan då skicka ON CONFLICT (mom_event_id) DO NOTHING
-- via PostgREST.
--
-- Vi byter det partial non-unique index från steg 1 mot ett
-- FULL unique index — samma namn. Två skäl:
--   1. PostgREST upsert kräver non-partial unique för att kunna
--      användas som conflict target (?on_conflict=mom_event_id).
--   2. Postgres tillåter multipla NULL i UNIQUE som default
--      (NULLS DISTINCT), så manuella rader (mom_event_id IS NULL)
--      påverkas inte — de fortsätter samexistera utan kollision.
--
-- fakt_avbrott.mom_event_id-indexet rörs INTE — det förblir partial
-- non-unique för join-uppslag. Dedup där sker via befintlig
-- (maskin_id, datum, klockslag, kategori_kod).
--
-- Idempotent: om indexet redan är unique är DROP + CREATE en
-- no-op-ekvivalent (tabellen är liten, ~4 rader idag).
-- =============================================================

DROP INDEX IF EXISTS idx_maskin_service_mom_event_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_maskin_service_mom_event_id
  ON maskin_service (mom_event_id);
