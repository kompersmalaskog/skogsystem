-- Extra aktiviteter (rotben, reservdelar, markägarbesök, service, möte, annat)
-- En post per aktivitet med start/slut-tid. slut_tid = NULL betyder pågående.
ALTER TABLE extra_tid ADD COLUMN IF NOT EXISTS start_tid time;
ALTER TABLE extra_tid ADD COLUMN IF NOT EXISTS slut_tid time;
ALTER TABLE extra_tid ADD COLUMN IF NOT EXISTS aktivitet_typ text;
ALTER TABLE extra_tid ADD COLUMN IF NOT EXISTS aktivitet_text text;
ALTER TABLE extra_tid ADD COLUMN IF NOT EXISTS kalla text;

-- Tillåtna värden för aktivitet_typ och kalla (constraints).
DO $$ BEGIN
  ALTER TABLE extra_tid ADD CONSTRAINT extra_tid_aktivitet_typ_check
    CHECK (aktivitet_typ IS NULL OR aktivitet_typ IN
      ('rotben','reservdelar','markagare','service','mote','flytt','annat'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE extra_tid ADD CONSTRAINT extra_tid_kalla_check
    CHECK (kalla IS NULL OR kalla IN ('morgon','kvall','under_dagen'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Index för snabba uppslag av pågående aktiviteter
CREATE INDEX IF NOT EXISTS idx_extra_tid_pagaende
  ON extra_tid (medarbetare_id, datum) WHERE slut_tid IS NULL;
