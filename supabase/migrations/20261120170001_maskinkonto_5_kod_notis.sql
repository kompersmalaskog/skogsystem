-- Maskinen som maskin — "Välj koden från maskinen" (PR #1217, tillägg).
--
-- Står någon utan kod i "Vem är du?" på maskinen skickar servern en push till personens telefon: "Välj din kod för <maskin>". Den här
-- migrationen ger två saker:
--  1. maskin_upplasning_logg tar tre nya utfall, så varje begäran loggas: 'kod_notis' (notisen köades), 'kod_notis_vantar' (nekad av
--     tvåminutersgränsen) och 'kod_notis_ingen_push' (personen har ingen push i telefonen — reservtexten visades).
--  2. maskin_kod_notis_begar(person, maskin): EN notis per person och två minuter, avgjort i databasen under ett lås per person, så två
--     tryck i samma ögonblick aldrig ger två notiser. Funktionen loggar själv ('kod_notis' eller 'kod_notis_vantar').
-- Additiv och ofarlig: ingen befintlig rad ändras, ingen befintlig funktion rörs, bara servern (service_role) får anropa funktionen.

alter table public.maskin_upplasning_logg drop constraint if exists maskin_upplasning_logg_utfall_check;
alter table public.maskin_upplasning_logg add constraint maskin_upplasning_logg_utfall_check
  check (utfall = any (array['upplast', 'fel_kod', 'last', 'ingen_kod', 'vantar', 'avslagen', 'las', 'spard_timme',
                             'kod_notis', 'kod_notis_vantar', 'kod_notis_ingen_push']));

create or replace function public.maskin_kod_notis_begar(p_med uuid, p_maskin text)
returns table (tillat boolean, vantar_till timestamptz, tid timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  senast timestamptz;
begin
  -- Ett lås per person: parallella tryck köas här och ser varandras rad.
  perform pg_advisory_xact_lock(hashtextextended('maskin_kod_notis:' || p_med::text, 0));
  select max(l.tid) into senast from maskin_upplasning_logg l where l.medarbetare_id = p_med and l.utfall = 'kod_notis';
  if senast is not null and senast > clock_timestamp() - interval '2 minutes' then
    insert into maskin_upplasning_logg (maskin_id, medarbetare_id, utfall) values (p_maskin, p_med, 'kod_notis_vantar');
    return query select false, senast + interval '2 minutes', senast;
    return;
  end if;
  insert into maskin_upplasning_logg (tid, maskin_id, medarbetare_id, utfall) values (clock_timestamp(), p_maskin, p_med, 'kod_notis')
    returning maskin_upplasning_logg.tid into senast;
  return query select true, senast + interval '2 minutes', senast;
end;
$$;
revoke all on function public.maskin_kod_notis_begar(uuid, text) from public, anon, authenticated;
grant execute on function public.maskin_kod_notis_begar(uuid, text) to service_role;
