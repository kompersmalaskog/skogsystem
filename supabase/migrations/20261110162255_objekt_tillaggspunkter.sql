-- Vidas tilläggspunkter (larmkoordinater och avlägg) för alla objekt som inte är avslutade — utan resten av geometrin.
--
-- Varför (2026-11-10): Vida lägger en larmkoordinat vid varje avlägg, så en utspridd trakt har flera (Gallring Santhe 2026: fem).
-- Nödsidan "Om något händer" sparar larmplatserna på enheten för att fungera utan täckning. Att läsa hela objekt_geometri för
-- de aktiva objekten är ~3,4 MB per läsning; det här är några kB. Appen väljer bland punkterna (lib/larmpunkter.ts).
--
-- Bara läsning, security invoker: objekt_geometri och objekt läses med anroparens RLS (alla inloggade får läsa båda).
create or replace function public.objekt_tillaggspunkter()
returns table (objekt_id uuid, punkt jsonb)
language sql
stable
security invoker
set search_path = public
as $$
  select g.objekt_id, f
  from objekt o
  join objekt_geometri g on g.objekt_id = o.id
  cross join lateral jsonb_array_elements(coalesce(g.geometri -> 'features', '[]'::jsonb)) as f
  where coalesce(o.status, '') <> 'avslutat'
    and f -> 'properties' ->> '_lager' ilike 'L_TILLAGGSPUNKTER'
    and f -> 'geometry' ->> 'type' = 'Point'
    and (f -> 'properties' ->> 'FLBESKR' ilike '%larmkoordinat%' or f -> 'properties' ->> 'FLBESKR' ilike '%avl_gg%')
$$;

revoke all on function public.objekt_tillaggspunkter() from public, anon;
grant execute on function public.objekt_tillaggspunkter() to authenticated;
