-- Maskinen som maskin, del 4: Produktion-kalenderns "Semester"/"Ledig" (maskinvyn ?ny=1) läste ledighet_ansokningar direkt.
-- Den tabellen är spärrad för maskinkontot (del 2) — då hade kalendern tyst blivit "Ej aktiv" på alla förklarade dagar.
-- I stället för att öppna tabellen lämnar den här funktionen ut EXAKT det kalendern behöver:
--   maskin, period och ett av två ord — 'semester' eller 'ledig'. Aldrig typen (sjuk/VAB/ATK …), aldrig personen, aldrig klockslag.
-- Samma urval som helikopter_ny_ledig: aktiv förare knuten till maskinen, heldags godkänd/registrerad ledighet.
-- Ofarlig för alla som inte är maskinkonton: nytt namn, rör ingen tabell, ingen rad ändras.
create or replace function public.maskin_ledighet(p_maskiner text[], p_start date, p_slut date)
returns table (maskin_id text, typ text, startdatum date, slutdatum date)
language sql stable security definer set search_path = public as $$
  select m.maskin_id::text,
         case when l.typ = 'semester' then 'semester' else 'ledig' end,
         l.startdatum, l.slutdatum
  from ledighet_ansokningar l
  join medarbetare m on m.id = l.medarbetare_id
  where m.maskin_id = any (p_maskiner)
    and m.aktiv is not false
    and l.status in ('godkänd', 'registrerad')
    and l.fran_tid is null and l.till_tid is null
    and l.startdatum <= p_slut and l.slutdatum >= p_start
$$;
revoke all on function public.maskin_ledighet(text[], date, date) from public, anon;
grant execute on function public.maskin_ledighet(text[], date, date) to authenticated, service_role;
