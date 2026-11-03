-- Ritad: dikena i en ruta snabbt (Martin 2026-11-03). Tabellen `dike` har 1,7 miljoner rader (Kronoberg, Kalmar, Blekinge) och
-- ett filter på fyra kolumner kan inget vanligt index ta: hämtningen för en trakt läste hela tabellen (9,5 s, över tidsgränsen).
-- GiST-index på dikets ruta som `box` + en funktion som frågar med && (överlappar). Bara servern (service_role) anropar den.
create index if not exists dike_box on public.dike using gist (box(point(min_lng, min_lat), point(max_lng, max_lat)));

create or replace function public.dike_i_ruta(
  p_min_lng double precision, p_min_lat double precision, p_max_lng double precision, p_max_lat double precision,
  p_efter bigint default 0, p_antal integer default 1000
) returns table (id bigint, typ text, coords jsonb)
language sql stable
set search_path = public
as $$
  select d.id, d.typ, d.coords
  from public.dike d
  where box(point(d.min_lng, d.min_lat), point(d.max_lng, d.max_lat)) && box(point(p_min_lng, p_min_lat), point(p_max_lng, p_max_lat))
    and d.id > p_efter
  order by d.id
  limit least(greatest(p_antal, 1), 1000);
$$;

revoke all on function public.dike_i_ruta(double precision, double precision, double precision, double precision, bigint, integer) from public, anon, authenticated;
grant execute on function public.dike_i_ruta(double precision, double precision, double precision, double precision, bigint, integer) to service_role;
