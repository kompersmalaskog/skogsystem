-- Introduktion för ny förare (arbetsmiljö, 2026-11-02). En rad per förare och steg föraren läst ("Jag har läst").
-- Stegen och texterna står i koden (lib/arbetsmiljo/introduktion.ts); här bara kvittot. Tiden sätts av databasen.
create table if not exists public.am_introduktion (
  id uuid primary key default gen_random_uuid(),
  medarbetare_id uuid not null references public.medarbetare(id) on delete cascade,
  steg text not null check (steg in ('nod', 'skyddsombud', 'maskinkoll', 'risker')),
  tid timestamptz not null default now(),
  unique (medarbetare_id, steg)
);

create or replace function public.am_introduktion_tid() returns trigger language plpgsql as $$
begin
  new.tid := now();
  return new;
end $$;

create or replace trigger a_am_introduktion_tid before insert on public.am_introduktion
  for each row execute function public.am_introduktion_tid();

alter table public.am_introduktion enable row level security;

create policy am_introduktion_las on public.am_introduktion for select to authenticated
  using (medarbetare_id = public.aktuell_medarbetare_id() or public.ar_admin());
create policy am_introduktion_skriv on public.am_introduktion for insert to authenticated
  with check (medarbetare_id = public.aktuell_medarbetare_id());

revoke all on public.am_introduktion from anon;
revoke update, delete, truncate, trigger, references on public.am_introduktion from authenticated;
grant select, insert on public.am_introduktion to authenticated;
