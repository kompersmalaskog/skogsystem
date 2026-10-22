-- Gallringens "gallrade yta": svar på appens frågor om bitar utanför och innanför Vidas traktgräns.
--
-- Appen räknar själv ut var maskinen gallrat (lib/gallradYta.ts) och klassar bitar utanför gränsen som gallring,
-- väg in eller enstaka träd. En människa kan svara annorlunda; svaret går före appens bedömning. Vidas gräns
-- (objekt_geometri) ändras aldrig.
--
-- nyckel: utanför = 'u:<minsta detalj_stam.id i biten>', inte gallrat = 'e:<rundad position>' (stabila när filen växer).
-- En rad per (vo, nyckel); ett nytt svar skriver över det gamla. Alla inloggade med en medarbetarrad får svara.

create table if not exists public.gallring_yta_svar (
  id uuid primary key default gen_random_uuid(),
  vo text not null,
  nyckel text not null,
  svar text not null check (svar in ('gallring', 'vag', 'enstaka', 'inte_hit', 'grans_fel', 'lamnat', 'senare')),
  av uuid references public.medarbetare(id) on delete set null,
  andrad_at timestamptz not null default now(),
  unique (vo, nyckel),
  check ((nyckel like 'u:%' and svar in ('gallring', 'vag', 'enstaka', 'inte_hit'))
      or (nyckel like 'e:%' and svar in ('grans_fel', 'lamnat', 'senare')))
);

-- Servern sätter tiden och vem.
create or replace function public.gallring_yta_svar_stampla() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.andrad_at := now();
  new.av := public.korvy_min_medarbetare();
  return new;
end $$;

create or replace trigger gallring_yta_svar_stampla
  before insert or update on public.gallring_yta_svar
  for each row execute function public.gallring_yta_svar_stampla();

alter table public.gallring_yta_svar enable row level security;

create policy gallring_yta_svar_las on public.gallring_yta_svar for select to authenticated using (true);
create policy gallring_yta_svar_skapa on public.gallring_yta_svar for insert to authenticated
  with check (public.korvy_min_medarbetare() is not null);
create policy gallring_yta_svar_andra on public.gallring_yta_svar for update to authenticated
  using (public.korvy_min_medarbetare() is not null) with check (public.korvy_min_medarbetare() is not null);
create policy gallring_yta_svar_radera on public.gallring_yta_svar for delete to authenticated
  using (public.korvy_min_medarbetare() is not null);
