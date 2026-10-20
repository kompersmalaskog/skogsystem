-- Kvittens för körvyns larm, PER FÖRARE med tid (bevis för egenkontrollen). Ersätter korvy_kvittens (en kvittens för alla förare)
-- i appen; den gamla tabellen lämnas orörd och läses inte längre (21 rader 2026-10-20, ingen förarkolumn, kan inte knytas till någon).
--
-- Regler (lib/larm):
--   * Kvittensen tystar BARA den förare som kvitterat. En annan förare får fullt larm.
--   * Grön, Brun, Blå: larmar tills kvitterat (hashen matchar). Röd: kvitteringen sparas men tystar aldrig.
--   * innehall_hash = hash av symbolens typ + kommentar (som förut): ändras innehållet återuppstår larmet.
--
-- Additiv: en ny tabell, inga ändringar i befintliga.

-- Den inloggades medarbetarrad. SECURITY DEFINER så policyn inte hänger på medarbetares egen RLS.
create or replace function public.korvy_min_medarbetare()
returns uuid
language sql stable security definer set search_path = public
as $$ select id from public.medarbetare where user_id = auth.uid() limit 1 $$;

create table if not exists public.korvy_kvittens_forare (
  id            uuid primary key default gen_random_uuid(),
  objekt_id     uuid not null references public.objekt(id) on delete cascade,
  marker_id     text not null,
  forare_id     uuid not null references public.medarbetare(id) on delete cascade,
  forare_namn   text,
  marker_type   text,
  marker_name   text,
  grupp         text,
  innehall_hash text,
  kvitterad_at  timestamptz not null default now(),
  unique (objekt_id, marker_id, forare_id)
);
create index if not exists korvy_kvittens_forare_objekt_idx on public.korvy_kvittens_forare (objekt_id, forare_id);

alter table public.korvy_kvittens_forare enable row level security;
-- Föraren läser och skriver bara sina egna rader; admin läser allt (egenkontrollens bevis).
create policy kkf_sel on public.korvy_kvittens_forare for select to authenticated
  using (forare_id = public.korvy_min_medarbetare() or public.ar_admin());
create policy kkf_ins on public.korvy_kvittens_forare for insert to authenticated
  with check (forare_id = public.korvy_min_medarbetare());
create policy kkf_upd on public.korvy_kvittens_forare for update to authenticated
  using (forare_id = public.korvy_min_medarbetare()) with check (forare_id = public.korvy_min_medarbetare());

comment on table public.korvy_kvittens_forare is
  'Körvyns larm-kvittens per förare och markering. Tystar bara den som kvitterat; Röd (fara) tystas aldrig men sparas som bevis.';
