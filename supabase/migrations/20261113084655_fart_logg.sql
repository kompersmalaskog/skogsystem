-- Tyst fartmätning (lib/fart/fartLogg.ts): vad som tar tid när appen används. Per enhet och maskin, aldrig per person.
create table public.fart_logg (
  id bigint generated always as identity primary key,
  skapad timestamptz not null default now(),
  enhet text not null,
  maskin_id text,
  vy text not null,
  slag text not null check (slag in ('sida','byte','anrop','karta')),
  namn text not null check (char_length(namn) <= 200),
  ms integer not null check (ms >= 0 and ms <= 600000),
  nat text,
  detalj jsonb
);
create index fart_logg_skapad_idx on public.fart_logg (skapad);
alter table public.fart_logg enable row level security;

-- Tiden sätts av servern, aldrig av enheten.
create function public.fart_logg_tid() returns trigger language plpgsql as $$
begin new.skapad := now(); return new; end $$;
create trigger fart_logg_tid before insert on public.fart_logg for each row execute function public.fart_logg_tid();

-- Alla inloggade medarbetare får lägga till; bara admin läser. Ingen ändrar eller tar bort.
create policy fart_logg_lagg_till on public.fart_logg for insert to authenticated with check (public.aktuell_medarbetare_id() is not null);
create policy fart_logg_las_admin on public.fart_logg for select to authenticated using (public.ar_admin());
revoke all on public.fart_logg from anon;
revoke update, delete on public.fart_logg from authenticated;
