-- Helikopter: egen skotning som EN egen rubrik (Martin 2026-10-25).
-- Markägaren skotar själv på objekt med dim_objekt.egen_skotning = true: där kommer aldrig något lass, så skördat i månaden
-- är det enda ärliga talet. Räknas ALDRIG mot beställningen, i takten eller i prognosen — bara visas.
-- En rad per objekt med skördat > 0 i månaden; typ och bolag ur dim_objekt (samma källa som helikopter_ny_dag).
create or replace function public.helikopter_ny_egen_skotning(p_ar integer, p_manad integer)
returns table(objekt_id text, namn text, vo_nummer text, typ text, bolag text, skordat numeric, senast_datum date)
language sql stable
as $$
  with man as (select make_date(p_ar, p_manad, 1) as fran, (make_date(p_ar, p_manad, 1) + interval '1 month')::date as till_excl),
  egna as (
    select d.objekt_id, d.object_name, nullif(btrim(d.vo_nummer), '') as vo,
           nullif(lower(btrim(d.huvudtyp)), '') as typ, nullif(btrim(d.bolag), '') as bolag
    from dim_objekt d
    where d.egen_skotning = true and coalesce(d.exkludera, false) = false)
  select e.objekt_id, e.object_name, e.vo, e.typ, e.bolag,
         round(sum(p.volym_m3sub)::numeric, 1) as skordat,
         max(p.datum) as senast_datum
  from egna e
  join fakt_produktion p on p.objekt_id = e.objekt_id
  cross join man
  where p.datum >= man.fran and p.datum < man.till_excl
  group by e.objekt_id, e.object_name, e.vo, e.typ, e.bolag
  having sum(p.volym_m3sub) > 0
  order by sum(p.volym_m3sub) desc;
$$;
grant execute on function public.helikopter_ny_egen_skotning(integer, integer) to authenticated;
