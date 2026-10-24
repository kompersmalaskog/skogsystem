-- Starta jobb: egen skotning redan när jobbet föds (Martin 2026-10-24).
--
-- dim_objekt.egen_skotning finns sedan tidigare, men dim_objekt-raden finns först när maskindata kommit in. Ett jobb från
-- Starta jobb föds som en objekt-rad UTAN dim_objekt, så valet "Egen skotning" måste kunna sparas där. Additiv kolumn,
-- null/false = vi skotar (som förut). Appen skriver den när jobbet skapas (lib/startaJobb byggObjektRad) och när admin
-- ändrar skotningen på jobbet (lib/startaJobbSkotning — som då också skriver alla maskinobjekt med numret).
--
-- Följer med till maskinobjektet: när ett maskinobjekt får ett VO (ny rad från importen, eller VO satt i efterhand) och ett jobb
-- med samma VO har egen skotning, får maskinobjektet egen_skotning = true. Då slutar Översikten och skotningKvar (som läser
-- dim_objekt) vänta på en skotare. Triggern sätter bara TRUE, aldrig false — den skriver aldrig bort ett val någon gjort.
-- Importen skickar inte egen_skotning (läser bara), så en senare uppdatering av raden skriver inte över värdet.
-- Kopplingar via objekt.dim_objekt_id eller extra nummer täcks inte (de sker utan att VO ändras) — där sparar appen valet när
-- admin ändrar skotningen i Starta jobb.

alter table public.objekt add column if not exists egen_skotning boolean;

comment on column public.objekt.egen_skotning is
  'Säljaren/markägaren skotar själv — inga skotarfiler väntas. Sätts i Starta jobb för slutavverkning/gallring. Speglar dim_objekt.egen_skotning för jobb utan maskindata.';

create or replace function public.dim_objekt_egen_skotning_fran_jobb()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.egen_skotning is not true and coalesce(new.vo_nummer, '') <> '' then
    if exists (select 1 from public.objekt o where o.vo_nummer = new.vo_nummer and o.egen_skotning is true) then
      new.egen_skotning := true;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.dim_objekt_egen_skotning_fran_jobb() from public, anon, authenticated;

create or replace trigger dim_objekt_egen_skotning_fran_jobb
  before insert or update of vo_nummer on public.dim_objekt
  for each row execute function public.dim_objekt_egen_skotning_fran_jobb();
