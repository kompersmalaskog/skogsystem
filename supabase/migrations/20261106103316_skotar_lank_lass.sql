-- Skotarlänken: avlägg och lass från en EXTERN skotare (2026-11-06). Additiv: två nya tabeller. Inget befintligt ändras.
--
--   skotar_lank_avlagg  avlägg som den externa skotaren satt ut via länken (nummer, plats). Syns bara på hans länk.
--   skotar_lank_lass    lass han rapporterat mot ett avlägg (hans eget, planerarens eller Vidas): m³ per sortiment.
--
-- MEDVETET EGNA TABELLER, inte skotar_lass: markägarens egen skotning får aldrig räknas som vår skotning (helikoptern mot beställningen, Kvar,
-- Färdigskotad). Bara servern skriver och läser (service-klienten via /api/skotare/<token>/*): ingen åtkomst för anon eller inloggade, inga policies.
-- Tiden sätts av databasen.

create table if not exists public.skotar_lank_avlagg (
  id          uuid primary key,
  objekt_id   uuid not null references public.objekt(id) on delete cascade,
  nummer      integer not null check (nummer > 0),
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  borttagen   boolean not null default false,
  skapad_at   timestamptz not null default now()
);
create index if not exists skotar_lank_avlagg_objekt_idx on public.skotar_lank_avlagg (objekt_id);

create table if not exists public.skotar_lank_lass (
  id          uuid primary key,
  objekt_id   uuid not null references public.objekt(id) on delete cascade,
  avlagg      text not null check (avlagg ~ '^(egen|plan|vida):.{1,80}$'),
  sortiment   jsonb not null check (jsonb_typeof(sortiment) = 'object'),
  struken     boolean not null default false,
  skapad_at   timestamptz not null default now()
);
create index if not exists skotar_lank_lass_objekt_idx on public.skotar_lank_lass (objekt_id, skapad_at);

create or replace function public.skotar_lank_tid()
returns trigger language plpgsql as $$
begin
  new.skapad_at := now();
  return new;
end $$;

create or replace trigger skotar_lank_avlagg_tid before insert on public.skotar_lank_avlagg for each row execute function public.skotar_lank_tid();
create or replace trigger skotar_lank_lass_tid before insert on public.skotar_lank_lass for each row execute function public.skotar_lank_tid();

alter table public.skotar_lank_avlagg enable row level security;
alter table public.skotar_lank_lass enable row level security;
revoke all on public.skotar_lank_avlagg from anon, authenticated;
revoke all on public.skotar_lank_lass from anon, authenticated;
