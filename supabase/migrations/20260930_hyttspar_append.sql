-- Hyttspår-sparning som APPEND. Förr skrev klienten HELA punktlistan (`points`) var 20:e sekund →
-- O(N²) upload över ett skift (~13 MB) och sista skrivning vann (två klienter på samma rad tappade
-- den enes punkter). Nu appendar klienten bara NYA punkter server-side via denna funktion.
--
-- points är en jsonb-array [{lat,lng,tid}]. `hyttspar_append` konkatenerar server-side (`points || nya`)
-- och räknar om antal_punkter — atomärt per anrop, så samtidiga appends från två klienter till SAMMA
-- rad läggs BÅDA till (ingen overwrite). antal_punkter hålls i synk med arrayen.
--
-- SECURITY INVOKER (default): körs som den inloggade användaren → hyttspar-RLS (authenticated
-- using(true) för update) gäller precis som vid den gamla direktskrivningen. Ingen
-- privilegie-eskalering. Bara authenticated får köra.

create or replace function public.hyttspar_append(p_id uuid, p_punkter jsonb)
returns void
language sql
as $$
  update public.hyttspar
     set points        = coalesce(points, '[]'::jsonb) || coalesce(p_punkter, '[]'::jsonb),
         antal_punkter = jsonb_array_length(coalesce(points, '[]'::jsonb) || coalesce(p_punkter, '[]'::jsonb)),
         uppdaterad_at = now()
   where id = p_id;
$$;

revoke all on function public.hyttspar_append(uuid, jsonb) from public, anon;
grant execute on function public.hyttspar_append(uuid, jsonb) to authenticated;
