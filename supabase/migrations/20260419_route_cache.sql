-- Cache för OpenRouteService-anrop. Koordinater lagras avrundade till
-- 3 decimaler (~111 m precision) så cachen träffar på ungefär samma
-- hem/trakt även om GPS-avvikelser gör lat/lng lite olika mellan dagar.

CREATE TABLE IF NOT EXISTS route_cache (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_lat     numeric NOT NULL,
  from_lng     numeric NOT NULL,
  to_lat       numeric NOT NULL,
  to_lng       numeric NOT NULL,
  distance_km  integer NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_lat, from_lng, to_lat, to_lng)
);
