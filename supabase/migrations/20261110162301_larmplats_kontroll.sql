-- "Kommer en ambulans hit?" — den som står vid en larmplats bekräftar den (Martin 2026-11-10, lib/larmKontroll.ts).
--
-- Vida lägger en larmplats vid varje avlägg (lib/larmpunkter.ts), så en trakt kan ha flera. Den gamla rutan
-- objekt.larmkoordinat_bekraftad gäller bara objektets EGNA punkt; den här tabellen gäller varje punkt för sig.
-- En rad = ett svar. Punkten är koordinaten (en rad inom 50 m gäller punkten); senaste svaret gäller. Inget skrivs över.
--
-- Vem och när sätts av databasen: medarbetare_id måste vara den inloggade, skapad_at sätts av triggern.
-- Ingen ändring eller borttagning utom av admin (ett svar är ett spår).
create table if not exists public.larmplats_kontroll (
  id uuid primary key default gen_random_uuid(),
  objekt_id uuid not null references public.objekt(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  svar text not null check (svar in ('ja', 'nej')),
  kommentar text check (kommentar is null or char_length(kommentar) <= 280),
  medarbetare_id uuid not null references public.medarbetare(id),
  maskin_id text,
  skapad_at timestamptz not null default now()
);

create index if not exists larmplats_kontroll_objekt on public.larmplats_kontroll (objekt_id, skapad_at desc);

create or replace function public.larmplats_kontroll_tid()
returns trigger language plpgsql set search_path = public as $$
begin
  new.skapad_at := now();
  return new;
end $$;

create or replace trigger larmplats_kontroll_tid
  before insert on public.larmplats_kontroll
  for each row execute function public.larmplats_kontroll_tid();

alter table public.larmplats_kontroll enable row level security;

create policy larmplats_kontroll_las on public.larmplats_kontroll
  for select to authenticated using (true);
create policy larmplats_kontroll_svara on public.larmplats_kontroll
  for insert to authenticated with check (medarbetare_id = public.aktuell_medarbetare_id());
create policy larmplats_kontroll_radera_admin on public.larmplats_kontroll
  for delete to authenticated using (public.ar_admin());

revoke all on public.larmplats_kontroll from anon;
