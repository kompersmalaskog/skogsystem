-- Rutinkorten i "Om något händer" går att ändra i appen (arbetsmiljö, 2026-11-02). Korten och deras standardtext står i koden
-- (lib/arbetsmiljo/nod.ts RUTINKORT); en rad här ersätter ETT korts rubrik och tre steg. Ingen rad = appens text.
-- Bara admin ändrar; alla inloggade läser (korten sparas på enheten och fungerar utan täckning). Vem och när sätts av databasen.
create table if not exists public.am_rutinkort (
  id         text primary key check (id in ('skadad', 'brand', 'oga', 'lacka', 'valt', 'kraftledning', 'fast')),
  titel      text not null check (length(trim(titel)) between 1 and 60),
  steg1      text not null check (length(trim(steg1)) between 1 and 160),
  steg2      text not null check (length(trim(steg2)) between 1 and 160),
  steg3      text not null check (length(trim(steg3)) between 1 and 160),
  andrad_av  uuid references public.medarbetare(id),
  andrad_tid timestamptz not null default now()
);

create or replace function public.am_rutinkort_vem() returns trigger language plpgsql as $$
begin
  new.andrad_tid := now();
  new.andrad_av := public.aktuell_medarbetare_id();
  return new;
end $$;

create or replace trigger a_am_rutinkort_vem before insert or update on public.am_rutinkort
  for each row execute function public.am_rutinkort_vem();

alter table public.am_rutinkort enable row level security;

create policy am_rutinkort_las on public.am_rutinkort for select to authenticated using (true);
create policy am_rutinkort_ny on public.am_rutinkort for insert to authenticated with check (public.ar_admin());
create policy am_rutinkort_andra on public.am_rutinkort for update to authenticated using (public.ar_admin()) with check (public.ar_admin());
create policy am_rutinkort_ta_bort on public.am_rutinkort for delete to authenticated using (public.ar_admin());

revoke all on public.am_rutinkort from anon;
revoke truncate, trigger, references on public.am_rutinkort from authenticated;
grant select, insert, update, delete on public.am_rutinkort to authenticated;
