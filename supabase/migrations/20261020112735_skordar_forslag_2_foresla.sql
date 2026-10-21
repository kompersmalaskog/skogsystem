-- Förslag: vilket skördarobjekt har producerat på det här jobbet? Bara för jobb utan Vida-nummer (Starta jobb: ursprung satt eller P-VO)
-- som ännu saknar skördardata under sina nummer. Kandidater: skördarens maskinobjekt med samma VO, eller stammar inom 500 m senaste 60 dagarna.
create or replace function foresla_skordarobjekt(p_objekt uuid)
returns table (stam_objekt_id text, objekt_namn text, skal text, stammar bigint, forsta date, sista date, avstand_m integer)
language plpgsql stable security definer
set search_path = public
as $$
declare
  o record;
  ids text[];
begin
  if auth.uid() is null then return; end if;
  select * into o from objekt where id = p_objekt;
  if not found then return; end if;
  if o.ursprung is null and coalesce(o.vo_nummer, '') !~ '^P-' then return; end if;
  ids := array[coalesce(o.vo_nummer, '')] || coalesce((
    select array_agg(case when a.nummer ~ '^[0-9]+$' then a.nummer else a.maskin_id || '_' || substr(a.nummer, 2) end)
      from objekt_alt_nummer a where a.objekt_id = p_objekt), '{}'::text[]);
  if exists (select 1 from detalj_stam s where s.objekt_id = any(ids))
     or exists (select 1 from fakt_sortiment f where f.objekt_id = any(ids)) then
    return;
  end if;
  return query
  with kand as (
    select d.objekt_id as sid, 'samma VO'::text as sk, null::integer as avst
      from dim_objekt d join dim_maskin m on m.maskin_id = d.maskin_id
     where o.vo_nummer is not null and d.vo_nummer = o.vo_nummer
       and m.maskin_typ ilike 'harvester' and coalesce(d.exkludera, false) = false
    union all
    select s.objekt_id, 'inom 500 m'::text,
           min(round(111320 * sqrt(power(s.latitude - o.lat, 2) + power((s.longitude - o.lng) * cos(radians(o.lat)), 2))))::integer
      from detalj_stam s
     where o.lat is not null and o.lng is not null
       and s.tidpunkt >= now() - interval '60 days'
       and s.latitude between o.lat - 0.0045 and o.lat + 0.0045
       and s.longitude between o.lng - 0.009 and o.lng + 0.009
       and 111320 * sqrt(power(s.latitude - o.lat, 2) + power((s.longitude - o.lng) * cos(radians(o.lat)), 2)) <= 500
     group by s.objekt_id
  ),
  en as (
    select distinct on (k.sid) k.sid, k.sk, k.avst from kand k order by k.sid, (k.sk = 'samma VO') desc, k.avst
  )
  select e.sid, coalesce(dd.object_name, e.sid), e.sk, coalesce(st.n, 0), st.fd, st.sd, e.avst
    from en e
    left join dim_objekt dd on dd.objekt_id = e.sid
    left join lateral (select count(*) as n, min(x.tidpunkt)::date as fd, max(x.tidpunkt)::date as sd from detalj_stam x where x.objekt_id = e.sid) st on true
   where exists (select 1 from skordar_alias_nyckel(e.sid))
     and not exists (select 1 from skordar_alias_nyckel(e.sid) k2 join objekt_alt_nummer a on a.nummer = k2.nummer and coalesce(a.maskin_id, '') = coalesce(k2.maskin_id, ''))
   order by (e.sk = 'samma VO') desc, e.avst nulls last, st.n desc
   limit 3;
end;
$$;
revoke all on function foresla_skordarobjekt(uuid) from public, anon;
grant execute on function foresla_skordarobjekt(uuid) to authenticated;
