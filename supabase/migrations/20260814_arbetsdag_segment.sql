-- REDAN APPLICERAD I PROD 2026-08-14 — KÖR INTE OM.
-- Speglar det som faktiskt kördes (Postgres saknar inbyggd timerange → den
-- skapas först; min ursprungliga tsrange-variant ersattes av timerange).
-- RLS-POLICYERNA ligger i en EGEN fil (20260814_arbetsdag_segment_rls.sql) som
-- kördes separat — de var inte med i denna körning.
--
-- Tid MÄRKT INOM en inloggad dag (brandvakt, markägarbesök) — redan betald, ska
-- bara annoteras för fakturering. SKILD från extra_tid (som LÄGGS TILL av lönen).
-- Garantin: lönen läser ALDRIG denna tabell → kan per konstruktion inte
-- dubbelbetala. Se lib/lonesystem/loneberakning.ts (adderar bara extra_tid).

-- 0. Postgres saknar inbyggd timerange-typ — skapa den (idempotent).
DO $$ BEGIN
  CREATE TYPE timerange AS RANGE (subtype = time);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. EN taxonomi för aktivitetstyp — delas av extra_tid OCH arbetsdag_segment,
--    så vi aldrig får två CHECK-listor att hålla i synk (reparation-läxan).
DO $$ BEGIN
  CREATE DOMAIN aktivitet_typ_t AS text
    CHECK (VALUE IN ('rotben','reservdelar','markagare','service','mote',
                     'flytt','annat','utbildning','brandkontroll','reparation'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. extra_tid pekar på domänen i stället för sin egna CHECK-lista.
--    (Förkontroll kördes: 0 rader utanför de tio värdena.)
ALTER TABLE extra_tid DROP CONSTRAINT IF EXISTS extra_tid_aktivitet_typ_check;
ALTER TABLE extra_tid ALTER COLUMN aktivitet_typ TYPE aktivitet_typ_t
  USING aktivitet_typ::aktivitet_typ_t;

-- 3. Ny tabell. Nycklad på (medarbetare_id, datum) — INGEN CASCADE-FK till
--    arbetsdag, så MOM-synkens delete+insert av arbetsdag aldrig rör den.
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- krävs för uuid/date-likhet i EXCLUDE

CREATE TABLE IF NOT EXISTS arbetsdag_segment (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medarbetare_id uuid NOT NULL REFERENCES medarbetare(id) ON DELETE CASCADE,
  datum          date NOT NULL,
  start_tid      time NOT NULL,
  slut_tid       time NOT NULL,
  aktivitet_typ  aktivitet_typ_t NOT NULL,
  debiterbar     boolean NOT NULL DEFAULT false,
  kommentar      text,
  kalla          text NOT NULL DEFAULT 'forare' CHECK (kalla IN ('forare','synk')),
  skapad         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arbetsdag_segment_tid_ordning CHECK (slut_tid > start_tid),
  -- Icke-överlapp per förare OCH dag (verifierat i prod: olika dagar/samma tid
  -- OK, samma dag/överlapp avvisas). "ryms inom dagens start/slut" enforce:as i
  -- insert-koden (kan ej uttryckas här — ligger i arbetsdag-tabellen).
  CONSTRAINT arbetsdag_segment_ingen_overlapp
    EXCLUDE USING gist (
      medarbetare_id WITH =,
      datum WITH =,
      timerange(start_tid, slut_tid) WITH &&
    )
);
CREATE INDEX IF NOT EXISTS ix_arbetsdag_segment_med_datum
  ON arbetsdag_segment (medarbetare_id, datum);

ALTER TABLE arbetsdag_segment ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE arbetsdag_segment IS
  'Tid MÄRKT inom en inloggad dag (redan betald) — annotering för fakturering. '
  'Lönen läser den ALDRIG (till skillnad från extra_tid som adderas).';
