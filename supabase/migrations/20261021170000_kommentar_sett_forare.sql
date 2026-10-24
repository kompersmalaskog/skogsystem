-- INSTRUKTIONER TILL FÖRAREN: förarens "✓ Sett" per kommentar (maskinläget). Additiv: en ny tabell, inget befintligt rörs.
-- Samma mönster som korvy_kvittens_forare: egna rader via korvy_min_medarbetare(), admin läser, TIDEN sätts av servern.
--
-- En rad = en kommentar som en förare sett:
--   kommentar_ref  kartkommentar.id (våra kommentarer), 'vida:<nyckel>' (Vidas text, ATGARD) eller 'aldre:<nyckel>' (markeringens äldre kommentarfält)
--   yta_nyckel     områdets nyckel (hansyn:<LOPNR>, punkt:<nr>, marker:<id> …) — bara för läsbarhet/granskning
--   innehall_hash  hash av texten när den sågs: ändras texten är kommentaren osedd igen
-- KÖRS INTE AV PR:EN. Förarappen fungerar utan tabellen (sett sparas då bara på enheten) tills den körs.

create table if not exists public.kommentar_sett_forare (
  id             uuid primary key default gen_random_uuid(),
  objekt_id      uuid not null references public.objekt(id) on delete cascade,
  forare_id      uuid not null references public.medarbetare(id) on delete cascade,
  kommentar_ref  text not null,
  yta_nyckel     text,
  innehall_hash  text not null,
  sett_at        timestamptz not null default now(),
  unique (objekt_id, forare_id, kommentar_ref)
);
create index if not exists kommentar_sett_forare_objekt_idx on public.kommentar_sett_forare (objekt_id, forare_id);

alter table public.kommentar_sett_forare enable row level security;
create policy ksf_sel on public.kommentar_sett_forare for select to authenticated
  using (forare_id = public.korvy_min_medarbetare() or public.ar_admin());
create policy ksf_ins on public.kommentar_sett_forare for insert to authenticated
  with check (forare_id = public.korvy_min_medarbetare());
create policy ksf_upd on public.kommentar_sett_forare for update to authenticated
  using (forare_id = public.korvy_min_medarbetare()) with check (forare_id = public.korvy_min_medarbetare());

create or replace function public.kommentar_sett_forare_satt_tid()
returns trigger
language plpgsql
as $$
begin
  new.sett_at := now();
  return new;
end
$$;

create or replace trigger kommentar_sett_forare_tid
  before insert or update on public.kommentar_sett_forare
  for each row execute function public.kommentar_sett_forare_satt_tid();

comment on table public.kommentar_sett_forare is
  'Instruktioner till föraren: vilka kommentarer (kartkommentar, Vidas ATGARD, äldre kommentarfält) en förare kvitterat som sedda, med hash av texten. Tiden sätts av servern.';
