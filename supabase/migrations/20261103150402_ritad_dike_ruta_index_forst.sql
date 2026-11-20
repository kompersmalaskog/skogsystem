-- Ritad: dike_i_ruta väljer alltid rutans index (Martin 2026-11-03). Som vanlig SQL-funktion med parametrar valde planeraren att gå
-- längs id-ordningen genom hela tabellen (2,4 s); direkt mot indexet tar samma fråga 3 ms. Rutan hämtas först (MATERIALIZED), sedan sorteras.
create or replace function public.dike_i_ruta(
  p_min_lng double precision, p_min_lat double precision, p_max_lng double precision, p_max_lat double precision,
  p_efter bigint default 0, p_antal integer default 1000
) returns table (id bigint, typ text, coords jsonb)
language sql stable
set search_path = public
as $$
  with i_rutan as materialized (
    select d.id, d.typ, d.coords
    from public.dike d
    where box(point(d.min_lng, d.min_lat), point(d.max_lng, d.max_lat)) && box(point(p_min_lng, p_min_lat), point(p_max_lng, p_max_lat))
  )
  select r.id, r.typ, r.coords from i_rutan r
  where r.id > p_efter
  order by r.id
  limit least(greatest(p_antal, 1), 1000);
$$;
