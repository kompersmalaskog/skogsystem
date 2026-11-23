-- När appen i hytten började skicka GPS, per maskin och dag (Martin 2026-11-23).
--
-- Lön → Dagar visar "GPS i hytten från 06:47" bredvid förarens starttid, så admin
-- ser när en starttid ligger långt före första GPS-punkten (en inloggning som
-- flyttats bakåt i Opti). Bara visning — lönen läser aldrig funktionen.
--
-- En "start" = första punkten för dagen, och varje punkt efter ett uppehåll på
-- mer än 30 minuter (maskinen kan köras av två förare samma dag, eller stå i
-- lunch med datorn av). Appen väljer den start som hör till förarens pass.
--
-- security invoker: hyttspar läses med anroparens egna rättigheter (RLS).

create or replace function public.hyttspar_starter(p_fran date, p_till date)
returns table (maskin_id text, datum date, starter timestamptz[])
language sql
stable
security invoker
set search_path = public
as $$
  select y.maskin_id, y.datum, array_agg(y.t order by y.t)
  from (
    select x.maskin_id, x.datum, x.t,
           lag(x.t) over (partition by x.maskin_id, x.datum order by x.t) as foreg
    from (
      select h.maskin_id, h.datum, (p->>'tid')::timestamptz as t
      from hyttspar h
      cross join lateral jsonb_array_elements(h.points) p
      where h.datum between p_fran and p_till
        and h.maskin_id is not null
        and p ? 'tid'
    ) x
  ) y
  where y.foreg is null or y.t - y.foreg > interval '30 minutes'
  group by y.maskin_id, y.datum;
$$;

revoke all on function public.hyttspar_starter(date, date) from public, anon;
grant execute on function public.hyttspar_starter(date, date) to authenticated;
