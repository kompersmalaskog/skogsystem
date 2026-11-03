-- Diken till Ritad (Martin 2026-11-03): Naturvårdsverkets nationella dikeskarta "Diken Sverige" (CC0), byggd ur Skogsstyrelsens
-- laserdata (1 m). Fylls av engångsimporten .github/workflows/diken-import.yml (bara service_role skriver); appen läser den per trakt
-- via app/api/ritad-karta/diken. En rad per dike, linjen i WGS84 som [[lng, lat], …] och dikets ruta för snabb uppslagning.
create table if not exists public.dike (
  id bigint primary key,            -- Naturvårdsverkets Dike_ID
  typ text,                         -- Naturvårdsverkets Typ (skogsdike, åkerdike, myrdike, vägdike, övrigt dike)
  langd_m real,
  min_lat double precision not null,
  max_lat double precision not null,
  min_lng double precision not null,
  max_lng double precision not null,
  coords jsonb not null
);
create index if not exists dike_ruta on public.dike (min_lat, max_lat, min_lng, max_lng);
alter table public.dike enable row level security;
create policy dike_las on public.dike for select to authenticated using (true);
revoke insert, update, delete, truncate on public.dike from anon, authenticated;
