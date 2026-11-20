-- Egenkontrollens månadsstickprov, del 2 av 4: fågelvägen. Samma haversine som fagelKm i lib/objektVal.ts (R = 6371 km).
create or replace function egenkontroll_fagelvag_km(
  a_lat double precision, a_lng double precision, b_lat double precision, b_lng double precision
) returns double precision language sql immutable parallel safe as $$
  select 2 * 6371.0 * asin(sqrt(least(1.0,
    power(sin(radians(b_lat - a_lat) / 2), 2)
    + cos(radians(a_lat)) * cos(radians(b_lat)) * power(sin(radians(b_lng - a_lng) / 2), 2))))
$$;
