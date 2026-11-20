-- Stabil kompositnyckel per HPR-objekt för snapshot-dedup, OBEROENDE av objekt-tabellen.
-- Format: "<maskin_id>:<numeriskt vo_nummer>"  eller  "<maskin_id>:k<ObjectKey>".
-- Syfte: import_hpr.py ersätter per objekt_nyckel (delete+insert) så snapshots inte
-- ackumuleras ens för objekt som saknar rad i objekt-tabellen (objekt_id NULL).
-- Kör i Supabase SQL Editor eller via supabase db push.

ALTER TABLE hpr_filer
  ADD COLUMN IF NOT EXISTS objekt_nyckel text;

COMMENT ON COLUMN hpr_filer.objekt_nyckel IS 'Stabil per-objekt-nyckel (maskin_id:vo_nummer | maskin_id:k<ObjectKey>) för snapshot-dedup, frikopplad från objekt_id-FK';

CREATE INDEX IF NOT EXISTS idx_hpr_filer_objekt_nyckel ON hpr_filer (objekt_nyckel);
