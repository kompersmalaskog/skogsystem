-- Maskintimmar i serviceloggen (Martin 2026-10-21).
-- Timmätaren finns inte i någon fil: man läser av den ibland, och appen lägger till maskinens
-- motortid ur MOM-filerna (fakt_tid.engine_time_sek) dag för dag sedan avläsningen.
-- Serviceintervallet är per maskin: Ponsse och Rottne 900 h (serviceavtal), 810E 500 h.
-- Additivt: ingen befintlig rad ändras utom att intervallet fylls i på maskinerna.

alter table public.maskiner
  add column if not exists service_intervall_h integer
  check (service_intervall_h is null or service_intervall_h > 0);

create table if not exists public.maskin_timmatare (
  id uuid primary key default gen_random_uuid(),
  maskin_id uuid not null references public.maskiner(id) on delete cascade,
  datum date not null,
  timmar numeric(8,1) not null check (timmar > 0 and timmar < 200000),
  skapad_av uuid default auth.uid(),
  skapad_at timestamptz not null default now()
);

create index if not exists maskin_timmatare_maskin_datum on public.maskin_timmatare (maskin_id, datum desc);

alter table public.maskin_timmatare enable row level security;

-- Ingen DROP POLICY: sådana satser hänger i Supabase-MCP:n (CLAUDE.md, ledighet).
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'maskin_timmatare' and policyname = 'maskin_timmatare_las') then
    create policy maskin_timmatare_las on public.maskin_timmatare for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'maskin_timmatare' and policyname = 'maskin_timmatare_skriv') then
    create policy maskin_timmatare_skriv on public.maskin_timmatare for insert to authenticated with check (true);
  end if;
end $$;

update public.maskiner set service_intervall_h = 900
  where maskin_id in ('PONS20SDJAA270231', 'R64101', 'R64428', 'A030353', 'A130743', 'A110148')
    and service_intervall_h is null;
update public.maskiner set service_intervall_h = 500
  where maskin_id = 'JD810E' and service_intervall_h is null;
