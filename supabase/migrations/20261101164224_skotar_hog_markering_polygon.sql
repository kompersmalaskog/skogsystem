-- Högar i ett område (Martin 2026-11-01: "rita och se vad som ligger i ett visst område"): föraren trycker ut hörnen runt ett område och kan markera
-- allt i det som taget. Markeringen sparas som en yta (Polygon) bredvid tryck (Point) och streck (LineString). Bara CHECK:en ändras.
alter table public.skotar_hog_markering drop constraint if exists skotar_hog_markering_geometri_check;
alter table public.skotar_hog_markering add constraint skotar_hog_markering_geometri_check
  check (geometri->>'type' in ('Point', 'LineString', 'Polygon'));
