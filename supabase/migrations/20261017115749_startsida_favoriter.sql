-- Startsidans egna favoriter (Dina vyer) — per INLOGGAD ANVÄNDARE, så de följer med mellan telefon och dator.
--
-- En rad per användare: `vyer` = id:n ur lib/vyer.ts i vald ordning (max 8). Ingen rad = rollens förinställda
-- favoriter (STANDARD_FAVORITER). Bara användaren själv kan läsa och skriva sin rad (RLS på auth.uid()); ingen
-- admin-läsning — favoriterna är ingenting någon annan behöver se.
--
-- ADDITIV och idempotent (CREATE TABLE IF NOT EXISTS, policyer i DO-block, inget DROP). Ingen befintlig tabell rörs.

create table if not exists public.startsida_favoriter (
  user_id      uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  vyer         text[] not null default '{}',
  uppdaterad_at timestamptz not null default now(),
  constraint startsida_favoriter_max_atta check (cardinality(vyer) <= 8)
);

comment on table public.startsida_favoriter is
  'Startsidans favoriter per användare (id ur lib/vyer.ts, max 8). Ingen rad = rollens förinställda.';

alter table public.startsida_favoriter enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'startsida_favoriter' and policyname = 'startsida_favoriter_las_egen') then
    create policy startsida_favoriter_las_egen on public.startsida_favoriter
      for select to authenticated using (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'startsida_favoriter' and policyname = 'startsida_favoriter_skapa_egen') then
    create policy startsida_favoriter_skapa_egen on public.startsida_favoriter
      for insert to authenticated with check (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'startsida_favoriter' and policyname = 'startsida_favoriter_andra_egen') then
    create policy startsida_favoriter_andra_egen on public.startsida_favoriter
      for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  end if;
end $$;

grant select, insert, update on public.startsida_favoriter to authenticated;
