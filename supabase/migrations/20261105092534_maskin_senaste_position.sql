-- MASKINERNA PÅ KARTAN (Martin 2026-11-05: "så man ser maskinerna på kartan direkt").
-- Varje maskins SENASTE punkt ur hyttspåret (appen i hytten skickar den), med trakten den står på.
-- Bara sista punkten lämnar databasen — ett dagspass i points är hundratals KB.
-- security invoker: samma RLS som hyttspar och objekt (inloggade läser).

create or replace function public.maskin_senaste_position()
returns table (maskin_id text, roll text, objekt_id uuid, objekt_namn text, datum date, lat double precision, lng double precision, tid text)
language sql
stable
security invoker
set search_path = public
as $$
  with senaste as (
    select distinct on (h.maskin_id) h.id
    from hyttspar h
    where h.maskin_id is not null
      and h.datum > current_date - 60
      and coalesce(h.antal_punkter, 0) > 0
    order by h.maskin_id, h.datum desc, h.uppdaterad_at desc nulls last
  )
  select h.maskin_id, h.roll, h.objekt_id, o.namn, h.datum,
         (h.points -> -1 ->> 'lat')::double precision,
         (h.points -> -1 ->> 'lng')::double precision,
         h.points -> -1 ->> 'tid'
  from hyttspar h
  join senaste s on s.id = h.id
  left join objekt o on o.id = h.objekt_id
  where jsonb_typeof(h.points) = 'array' and jsonb_array_length(h.points) > 0;
$$;

revoke all on function public.maskin_senaste_position() from public, anon;
grant execute on function public.maskin_senaste_position() to authenticated;
