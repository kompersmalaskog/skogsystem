create or replace function skotar_skordat(p_objekt uuid) returns table (nyckel text, namn text, m3 numeric)
language sql stable
set search_path = public
as $$
  with nr as (
    select o.vo_nummer as nummer from objekt o where o.id = p_objekt and o.vo_nummer is not null
    union
    select a.nummer from objekt_alt_nummer a where a.objekt_id = p_objekt
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
$$;

grant execute on function skotar_skordat(uuid) to authenticated;
