-- Per-yta-anteckningar: planerarens noteringar på trakt-ytor + egna områden.
-- yta_nyckel är en STABIL nyckel som överlever omimport (inte geometri-id):
--   hansyn:<LOPNR> | traktdel:<TRDEL_ID> | nb:<Beteckn> | raa:<lamningsnu> | omrade:<marker_id>
-- En anteckning per (objekt, yta). Alla inloggade läser (förare ser planerarens text);
-- bara admin (planerare) skriver. Se lib/traktGeometri.ts (ytaNyckel) för nyckelbyggaren.

create table if not exists public.objekt_yta_anteckning (
  id            uuid primary key default gen_random_uuid(),
  objekt_id     uuid not null references public.objekt(id) on delete cascade,
  yta_nyckel    text not null,
  text          text not null default '',
  skapad_av     uuid references public.medarbetare(id) on delete set null,
  skapad_at     timestamptz not null default now(),
  uppdaterad_at timestamptz not null default now(),
  unique (objekt_id, yta_nyckel)
);

create index if not exists objekt_yta_anteckning_objekt_idx
  on public.objekt_yta_anteckning (objekt_id);

alter table public.objekt_yta_anteckning enable row level security;

-- Alla inloggade läser (förare ska se planerarens noteringar).
drop policy if exists objekt_yta_anteckning_select on public.objekt_yta_anteckning;
create policy objekt_yta_anteckning_select on public.objekt_yta_anteckning
  for select to authenticated using (true);

-- Bara admin (planerare) skriver.
drop policy if exists objekt_yta_anteckning_insert on public.objekt_yta_anteckning;
create policy objekt_yta_anteckning_insert on public.objekt_yta_anteckning
  for insert to authenticated with check (ar_admin());

drop policy if exists objekt_yta_anteckning_update on public.objekt_yta_anteckning;
create policy objekt_yta_anteckning_update on public.objekt_yta_anteckning
  for update to authenticated using (ar_admin()) with check (ar_admin());

drop policy if exists objekt_yta_anteckning_delete on public.objekt_yta_anteckning;
create policy objekt_yta_anteckning_delete on public.objekt_yta_anteckning
  for delete to authenticated using (ar_admin());
