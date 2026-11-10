-- Vidas egenkontroll: förarnas svar (lib/vidaEgenkontroll.ts). En rad per (objekt, nyckel).
--
-- nyckel = förarfrågans nyckel ('grans', 'korskador', 'kantzon' …, 'v:<sektion>|<fråga>' för en fråga appen inte känner igen)
-- eller 'kommentar:skordare' / 'kommentar:skotare' (fritt till Vida). varde = 'ok' | 'av' | 'ej' eller Vidas eget alternativ.
-- Egen tabell, aldrig objekt.checklist_items: planeringens autospar skriver den kolumnen och skulle skriva över förarnas svar.
-- Ingenting skickas till Vida härifrån. Servern sätter vem, vilken roll och när.

create table if not exists public.egenkontroll_vida_svar (
  objekt_id uuid not null references public.objekt(id) on delete cascade,
  nyckel text not null check (length(nyckel) between 1 and 300),
  varde text not null check (length(varde) between 0 and 200),
  kommentar text check (kommentar is null or length(kommentar) <= 2000),
  roll text check (roll in ('skordare', 'skotare')),
  maskin_id text,
  av uuid references public.medarbetare(id) on delete set null,
  andrad_at timestamptz not null default now(),
  primary key (objekt_id, nyckel)
);

create or replace function public.egenkontroll_vida_svar_stampla() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.andrad_at := now();
  new.av := public.korvy_min_medarbetare();
  return new;
end $$;

create or replace trigger egenkontroll_vida_svar_stampla
  before insert or update on public.egenkontroll_vida_svar
  for each row execute function public.egenkontroll_vida_svar_stampla();

alter table public.egenkontroll_vida_svar enable row level security;

create policy egenkontroll_vida_svar_las on public.egenkontroll_vida_svar for select to authenticated using (true);
create policy egenkontroll_vida_svar_skapa on public.egenkontroll_vida_svar for insert to authenticated
  with check (public.korvy_min_medarbetare() is not null);
create policy egenkontroll_vida_svar_andra on public.egenkontroll_vida_svar for update to authenticated
  using (public.korvy_min_medarbetare() is not null) with check (public.korvy_min_medarbetare() is not null);
create policy egenkontroll_vida_svar_radera on public.egenkontroll_vida_svar for delete to authenticated
  using (public.korvy_min_medarbetare() is not null);
