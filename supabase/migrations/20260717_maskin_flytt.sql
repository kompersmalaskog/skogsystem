-- Maskinflytt: lastbilen flyttar maskiner mellan trakter.
-- En rad per flytt. sluttid IS NULL = flytten pågår (banner i vyn).
-- Sträckan sparas per ben så totalen alltid går att härleda och
-- hemresan kan vara ärligt tom när förarens hembas saknar koordinat.

CREATE TABLE IF NOT EXISTS maskin_flytt (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maskin_id       text NOT NULL REFERENCES dim_maskin(maskin_id),
  start_lat       double precision,          -- lastbilens position när flödet startade
  start_lng       double precision,
  fran_lat        double precision NOT NULL, -- A: där maskinen hämtades
  fran_lng        double precision NOT NULL,
  till_objekt_id  uuid REFERENCES objekt(id) ON DELETE SET NULL,
  till_lat        double precision,          -- B: sätts vid "Ja, lämnad här"
  till_lng        double precision,
  koord_kalla     text,                      -- 'larmkoordinat'|'objekt'|'dim_objekt'|'karta'|'gps'
  tillkorning_km  numeric,                   -- start→A
  flytt_km        numeric,                   -- A→B (styr fakturerbar)
  hem_km          numeric,                   -- B→hem; NULL om hembas saknas
  total_km        numeric,                   -- summan av benen som finns
  fakturerbar     boolean,                   -- flytt_km >= 30
  starttid        timestamptz NOT NULL DEFAULT now(),
  sluttid         timestamptz,               -- NULL = flytt pågår
  avbruten        boolean NOT NULL DEFAULT false,
  forare          text,
  medarbetare_id  uuid REFERENCES medarbetare(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS maskin_flytt_pagaende_idx ON maskin_flytt (maskin_id) WHERE sluttid IS NULL;

-- OBS: öppna policies (USING true) för alla inloggade — medvetet val 2026-07-17,
-- flyttar registreras av lastbilsföraren och läses av alla. Delete är admin-only.
ALTER TABLE maskin_flytt ENABLE ROW LEVEL SECURITY;
CREATE POLICY maskin_flytt_select ON maskin_flytt FOR SELECT TO authenticated USING (true);
CREATE POLICY maskin_flytt_insert ON maskin_flytt FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY maskin_flytt_update ON maskin_flytt FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY maskin_flytt_admin_delete ON maskin_flytt FOR DELETE TO authenticated USING (ar_admin());

-- maskin_position har idag bara admin-write (20260524153632) → förarens
-- positionsskrivning vid "Ja, lämnad här" skulle bli ett tyst 0-raders-sparande.
CREATE POLICY maskin_position_insert_authenticated ON maskin_position
  FOR INSERT TO authenticated WITH CHECK (true);
