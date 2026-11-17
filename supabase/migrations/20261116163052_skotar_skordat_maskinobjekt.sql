-- skotar_skordat: skördat på ett jobb vars skördardata ligger under MASKINOBJEKTET.
--
-- Felet (Steglehylte P-1026, 2026-11-16): funktionen letade bara på objektets vo_nummer
-- (P-1026) och extra numren som de står (k54) — men skördarens rader i fakt_sortiment ligger
-- under maskinobjektet R64428_54. Skördat blev {} och Färdigskotad satte alla faktorer till 0:
-- Oscars 16 lass (93 m³) nollades i stället för att skalas upp till 113,7.
--
-- Nu samma regel som appens hogarObjektIds (lib/objektNummer.ts):
--   • objektets vo_nummer (siffror eller P-VO)
--   • objektets dim_objekt_id
--   • varje extra nummer: siffror som de är, k<nyckel> → <maskin_id>_<nyckel>
-- Vida-trakter (VO = kontraktsnumret) får exakt samma svar som förut.

create or replace function public.skotar_skordat(p_objekt uuid)
 returns table(nyckel text, namn text, m3 numeric)
 language sql
 stable
 set search_path to 'public'
as $function$
  with nr as (
    select o.vo_nummer as nummer from objekt o where o.id = p_objekt and o.vo_nummer is not null
    union
    select o.dim_objekt_id from objekt o where o.id = p_objekt and o.dim_objekt_id is not null
    union
    select case when a.nummer ~ '^\d+$' then a.nummer
                else coalesce(a.maskin_id, '') || '_' || regexp_replace(a.nummer, '^k', '')
           end
    from objekt_alt_nummer a where a.objekt_id = p_objekt
  )
  select case when s.namn ~* 'hemved' then 'ved_markagare'
              else lower(regexp_replace(btrim(s.namn), '\s+', ' ', 'g')) end as nyckel,
         min(case when s.namn ~* 'hemved' then 'Ved markägare' else s.namn end) as namn,
         sum(f.volym_m3sub) as m3
  from fakt_sortiment f
  join dim_sortiment s on s.sortiment_id = f.sortiment_id
  where f.objekt_id in (select nummer from nr)
  group by 1
  having sum(f.volym_m3sub) > 0;
$function$;
