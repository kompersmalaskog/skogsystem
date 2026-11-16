-- Så gör vi (arbetsmiljö, 2026-11-04). AFS 2023:1: skriftliga instruktioner för arbetsuppgifter med allvarliga risker.
-- Samma modell som riskbedömningen per maskin (20261102161330_am_riskbedomning_maskin.sql):
-- 1. am_sa_gor_vi: en rad per instruktion. Texten står i koden (lib/arbetsmiljo/saGorVi.ts); här admins ändrade steg (null = appens)
--    och godkännandet = fingeravtrycket av stegen admin tryckte Stämmer på. Vem och när sätts av databasen. Alla läser, admin skriver.
-- 2. am_sa_gor_vi_last: föraren har läst exakt de stegen. Bara som sig själv, tiden från databasen, ingen ändrar eller tar bort.
-- Additivt.

create table if not exists public.am_sa_gor_vi (
  id                text primary key check (id in ('hydraulslang', 'trailer', 'kraftledning', 'motorsag', 'heta_arbeten', 'ensam')),
  steg              jsonb check (steg is null or (jsonb_typeof(steg) = 'array' and jsonb_array_length(steg) between 3 and 5)),
  godkand_underlag  text,
  godkand_tid       timestamptz,
  godkand_av        uuid references public.medarbetare(id),
  andrad            timestamptz not null default now(),
  andrad_av         uuid references public.medarbetare(id)
);

create or replace function public.am_sa_gor_vi_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.andrad := now();
  new.andrad_av := public.aktuell_medarbetare_id();
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
revoke execute on function public.am_sa_gor_vi_vakt() from public, anon, authenticated;

create or replace trigger a_am_sa_gor_vi_vakt before insert or update on public.am_sa_gor_vi
  for each row execute function public.am_sa_gor_vi_vakt();

alter table public.am_sa_gor_vi enable row level security;
create policy am_sa_gor_vi_las on public.am_sa_gor_vi for select to authenticated using (public.aktuell_medarbetare_id() is not null);
create policy am_sa_gor_vi_skapa on public.am_sa_gor_vi for insert to authenticated with check (public.ar_admin());
create policy am_sa_gor_vi_andra on public.am_sa_gor_vi for update to authenticated using (public.ar_admin()) with check (public.ar_admin());
revoke all on public.am_sa_gor_vi from anon;
revoke delete, truncate, trigger, references on public.am_sa_gor_vi from authenticated;
grant select, insert, update on public.am_sa_gor_vi to authenticated;

create table if not exists public.am_sa_gor_vi_last (
  id              uuid primary key default gen_random_uuid(),
  medarbetare_id  uuid not null references public.medarbetare(id) on delete cascade,
  instruktion     text not null check (instruktion in ('hydraulslang', 'trailer', 'kraftledning', 'motorsag', 'heta_arbeten', 'ensam')),
  underlag        text not null check (length(underlag) > 0),
  tid             timestamptz not null default now(),
  unique (medarbetare_id, instruktion, underlag)
);

create or replace function public.am_sa_gor_vi_last_tid() returns trigger
language plpgsql set search_path = public as $$
begin
  new.tid := now();
  return new;
end $$;
revoke execute on function public.am_sa_gor_vi_last_tid() from public, anon, authenticated;

create or replace trigger a_am_sa_gor_vi_last_tid before insert on public.am_sa_gor_vi_last
  for each row execute function public.am_sa_gor_vi_last_tid();

alter table public.am_sa_gor_vi_last enable row level security;
create policy am_sa_gor_vi_last_las on public.am_sa_gor_vi_last for select to authenticated
  using (medarbetare_id = public.aktuell_medarbetare_id() or public.ar_am_lasare());
create policy am_sa_gor_vi_last_skapa on public.am_sa_gor_vi_last for insert to authenticated
  with check (medarbetare_id = public.aktuell_medarbetare_id());
revoke all on public.am_sa_gor_vi_last from anon;
revoke update, delete, truncate, trigger, references on public.am_sa_gor_vi_last from authenticated;
grant select, insert on public.am_sa_gor_vi_last to authenticated;
