-- Riskbedömning per maskintyp (arbetsmiljö, 2026-11-02). AFS 2023:1: arbetsgivaren bedömer riskerna i arbetet, skriftligt,
-- och ser över bedömningen regelbundet. Trakternas riskbedömning (objekt.riskbedomning) täcker platsen; den här täcker själva maskinen.
--
-- 1. am_riskbedomning: en rad per maskintyp. Riskerna står i koden (lib/arbetsmiljo/maskinRisk.ts); här bara admins beslut om dem:
--    vilka förslag som inte gäller (bort), egna risker (egna) och godkännandet = fingeravtrycket av listan admin tryckte Stämmer på.
--    När och vem sätts av databasen, aldrig av klienten. Alla inloggade läser, bara admin skriver.
-- 2. am_riskbedomning_last: föraren har läst exakt den listan (maskintyp + fingeravtryck). Bara som sig själv, tiden från databasen,
--    ingen ändrar eller tar bort ett kvitto. Admin och skyddsombud läser alla, en förare sina egna.
-- Additivt.

create table if not exists public.am_riskbedomning (
  maskintyp         text primary key check (maskintyp in ('skordare', 'skotare', 'lastbil', 'motorsag')),
  bort              text[] not null default '{}',
  egna              jsonb not null default '[]'::jsonb check (jsonb_typeof(egna) = 'array'),
  godkand_underlag  text,
  godkand_tid       timestamptz,
  godkand_av        uuid references public.medarbetare(id),
  andrad            timestamptz not null default now()
);

create or replace function public.am_riskbedomning_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.andrad := now();
  if new.godkand_underlag is null then
    new.godkand_tid := null;
    new.godkand_av := null;
  elsif tg_op = 'INSERT' or new.godkand_underlag is distinct from old.godkand_underlag then
    new.godkand_tid := now();
    new.godkand_av := public.aktuell_medarbetare_id();
  else
    new.godkand_tid := old.godkand_tid;
    new.godkand_av := old.godkand_av;
  end if;
  return new;
end $$;
revoke execute on function public.am_riskbedomning_vakt() from public, anon, authenticated;

create or replace trigger a_am_riskbedomning_vakt before insert or update on public.am_riskbedomning
  for each row execute function public.am_riskbedomning_vakt();

alter table public.am_riskbedomning enable row level security;
create policy am_riskbedomning_las on public.am_riskbedomning for select to authenticated using (true);
create policy am_riskbedomning_skapa on public.am_riskbedomning for insert to authenticated with check (public.ar_admin());
create policy am_riskbedomning_andra on public.am_riskbedomning for update to authenticated using (public.ar_admin()) with check (public.ar_admin());
revoke all on public.am_riskbedomning from anon;
revoke delete, truncate, trigger, references on public.am_riskbedomning from authenticated;
grant select, insert, update on public.am_riskbedomning to authenticated;

create table if not exists public.am_riskbedomning_last (
  id              uuid primary key default gen_random_uuid(),
  medarbetare_id  uuid not null references public.medarbetare(id) on delete cascade,
  maskintyp       text not null check (maskintyp in ('skordare', 'skotare', 'lastbil', 'motorsag')),
  underlag        text not null check (length(underlag) > 0),
  tid             timestamptz not null default now(),
  unique (medarbetare_id, maskintyp, underlag)
);

create or replace function public.am_riskbedomning_last_tid() returns trigger
language plpgsql set search_path = public as $$
begin
  new.tid := now();
  return new;
end $$;
revoke execute on function public.am_riskbedomning_last_tid() from public, anon, authenticated;

create or replace trigger a_am_riskbedomning_last_tid before insert on public.am_riskbedomning_last
  for each row execute function public.am_riskbedomning_last_tid();

alter table public.am_riskbedomning_last enable row level security;
create policy am_riskbedomning_last_las on public.am_riskbedomning_last for select to authenticated
  using (medarbetare_id = public.aktuell_medarbetare_id() or public.ar_am_lasare());
create policy am_riskbedomning_last_skapa on public.am_riskbedomning_last for insert to authenticated
  with check (medarbetare_id = public.aktuell_medarbetare_id());
revoke all on public.am_riskbedomning_last from anon;
revoke update, delete, truncate, trigger, references on public.am_riskbedomning_last from authenticated;
grant select, insert on public.am_riskbedomning_last to authenticated;
