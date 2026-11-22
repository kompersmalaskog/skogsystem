-- Skogsdata per trakt: Skogsstyrelsens laserdata (volym, grundyta, grovlek, höjd), lutning och markfuktighet inom Vidas traktgräns.
-- Fylls av cron /api/cron/skogsdata (service_role). Underlaget för den automatiska prognosen.
-- Egen tabell (inte en kolumn på objekt): rutnätet är stort och objekt läses med select * på många ställen.

create table if not exists public.objekt_skogsdata (
  objekt_id uuid primary key references public.objekt(id) on delete cascade,
  grans text not null,
  version integer not null,
  hamtad_at timestamptz not null default now(),
  sammanfattning jsonb not null,
  rutnat jsonb not null,
  fel text[] not null default '{}'
);

alter table public.objekt_skogsdata enable row level security;

create policy objekt_skogsdata_las on public.objekt_skogsdata
  for select to authenticated using (true);

revoke all on public.objekt_skogsdata from anon, authenticated;
grant select on public.objekt_skogsdata to authenticated;
