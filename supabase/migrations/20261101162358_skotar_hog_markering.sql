-- Skotarläget och planeringsvyn: föraren rättar vad som är skotat på kartan (Martin 2026-11-01). Appen räknar bort det de registrerade lassen tog
-- (lib/skotarHogarKvar), men regeln träffar inte allt — här sparas det föraren själv markerat.
--  - En markering är en GEOMETRI, inte en hög: ett tryck = en punkt (Point), ett drag = en linje (LineString) med bredd. Högarna räknas om ur
--    stammarna och kan flytta några meter när nya filer kommer; en punkt/linje på marken gäller ändå samma högar.
--  - typ 'tagen' = högarna under markeringen är skotade; 'kvar' = de ligger kvar (går före appens regel och före en äldre 'tagen').
--  - grupp = sortimentgruppen som markerades (timmer/kubb/massa/energi), null = allt. Föraren som valt "Bara timmer" under + markerar bara timret.
--  - Alla inloggade med en medarbetarrad läser och lägger till (skapad_av = jag). Ta bort (Ångra) sin egen, admin alla. Ingen ändring: en rättning är en ny rad.
--  - skapad_at sätts av servern. id skapas i klienten.
create table if not exists public.skotar_hog_markering (
  id          uuid primary key default gen_random_uuid(),
  objekt_id   uuid not null references public.objekt(id) on delete cascade,
  typ         text not null check (typ in ('tagen', 'kvar')),
  geometri    jsonb not null check (geometri->>'type' in ('Point', 'LineString')),
  bredd_m     numeric not null default 8 check (bredd_m > 0 and bredd_m <= 50),
  grupp       text check (grupp in ('timmer', 'kubb', 'massa', 'energi')),
  maskin_id   text,
  skapad_av   uuid references public.medarbetare(id) on delete set null,
  skapad_at   timestamptz not null default now()
);
create index if not exists skotar_hog_markering_objekt_idx on public.skotar_hog_markering (objekt_id, skapad_at);

create or replace function public.skotar_hog_markering_tid()
returns trigger
language plpgsql
as $$
begin
  new.skapad_at := now();
  return new;
end
$$;

create or replace trigger skotar_hog_markering_tid
  before insert on public.skotar_hog_markering
  for each row execute function public.skotar_hog_markering_tid();

alter table public.skotar_hog_markering enable row level security;
create policy skotar_hog_markering_select on public.skotar_hog_markering for select to authenticated
  using (public.korvy_min_medarbetare() is not null);
create policy skotar_hog_markering_insert on public.skotar_hog_markering for insert to authenticated
  with check (skapad_av = public.korvy_min_medarbetare());
create policy skotar_hog_markering_delete on public.skotar_hog_markering for delete to authenticated
  using (skapad_av = public.korvy_min_medarbetare() or public.ar_admin());

comment on table public.skotar_hog_markering is 'Förarens rättning av vad som är skotat: punkt (tryck) eller linje med bredd (drag) över produktionshögarna. Gäller före appens beräkning.';
