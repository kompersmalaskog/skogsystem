-- Riskbedömning per trakt (arbetsmiljö): planeraren bedömer riskerna i "Klar med trakten?", föraren läser och kvitterar.
--
-- 1. objekt.riskbedomning (jsonb): { bort: [nyckel], egna: [{id, risk, atgard}], godkand: {av, at, underlag} | null }.
--    Skrivs som de andra Klar med trakten-fälten (lib/klarFalt). Appens förslag (kraftledning, brant …) räknas fram i appen ur kartan och
--    lagras inte — bara planerarens beslut om dem.
-- 2. trakt_risk_last: föraren har läst riskbedömningen. En rad per objekt + förare + fingeravtryck (underlag): ändras listan gäller inte ett
--    gammalt kvitto. Bara som sig själv; tiden sätts av databasen (default + trigger), aldrig av klienten. Ingen ändrar eller tar bort ett kvitto.
--    Admin läser alla (planerarens "Läst av …"), en förare bara sina egna.
-- Additivt.

alter table public.objekt add column if not exists riskbedomning jsonb;

create table if not exists public.trakt_risk_last (
  id              uuid primary key default gen_random_uuid(),
  objekt_id       uuid not null references public.objekt(id) on delete cascade,
  medarbetare_id  uuid not null references public.medarbetare(id),
  underlag        text not null check (length(underlag) > 0),
  maskin_id       text,
  last_at         timestamptz not null default now(),
  unique (objekt_id, medarbetare_id, underlag)
);
create index if not exists trakt_risk_last_objekt on public.trakt_risk_last (objekt_id);

create or replace function public.trakt_risk_last_tid() returns trigger
language plpgsql set search_path = public as $$
begin
  new.last_at := now();
  return new;
end $$;
revoke execute on function public.trakt_risk_last_tid() from public, anon, authenticated;

create or replace trigger a_trakt_risk_last_tid before insert on public.trakt_risk_last
  for each row execute function public.trakt_risk_last_tid();

alter table public.trakt_risk_last enable row level security;

create policy trakt_risk_last_las on public.trakt_risk_last for select to authenticated
  using (public.ar_admin() or medarbetare_id = public.aktuell_medarbetare_id());

create policy trakt_risk_last_skapa on public.trakt_risk_last for insert to authenticated
  with check (medarbetare_id = public.aktuell_medarbetare_id());

revoke update, delete, truncate, trigger, references on public.trakt_risk_last from anon, authenticated;
grant select, insert on public.trakt_risk_last to authenticated;
