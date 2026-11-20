-- Skotarlänken: telefonen som GPS (2026-11-11). Additiv: en ny tabell. Inget befintligt ändras.
--
--   skotar_lank_position  den externa skotarens SENASTE position per trakt (en rad per objekt, skrivs över). Telefonen skickar den
--                         via länken, maskindatorn hämtar den via samma länk och ritar pricken. Ingen historik sparas.
--
-- Bara servern skriver och läser (service-klienten via /api/skotare/<token>/position): ingen åtkomst för anon eller inloggade, inga policies.
-- Tiden sätts av databasen.

create table if not exists public.skotar_lank_position (
  objekt_id      uuid primary key references public.objekt(id) on delete cascade,
  lat            double precision not null check (lat between -90 and 90),
  lng            double precision not null check (lng between -180 and 180),
  noggrannhet_m  real check (noggrannhet_m is null or (noggrannhet_m >= 0 and noggrannhet_m <= 5000)),
  kurs           real check (kurs is null or (kurs >= 0 and kurs < 360)),
  uppdaterad_at  timestamptz not null default now()
);

create or replace function public.skotar_lank_position_tid()
returns trigger language plpgsql as $$
begin
  new.uppdaterad_at := now();
  return new;
end $$;

create or replace trigger skotar_lank_position_tid before insert or update on public.skotar_lank_position
  for each row execute function public.skotar_lank_position_tid();

alter table public.skotar_lank_position enable row level security;
revoke all on public.skotar_lank_position from anon, authenticated;
