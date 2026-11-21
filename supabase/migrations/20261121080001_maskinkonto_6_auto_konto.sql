-- Maskinen som maskin — del 6: kontot skapas av sig självt, och andras namn når maskinen (PR #1217, tillägg).
--
-- 1. maskin_upplasning_logg tar tre nya utfall, så att varje automatiskt maskinbyte syns i loggen:
--      'auto_konto'    maskinens konto skapades (första starten på en maskindator med brytaren på)
--      'auto_inloggad' en enhet byttes från en förares/admins session till maskinkontot
--      'auto_nekad'    servern avvisade ett byte (brytaren av, okänd maskin)
-- 2. medarbetare_visning(ids): namnet på de personer man ber om, till kommentarer, larmplatsens "vem svarade" och fotografen på en avvikelse.
--    medarbetare-tabellen lämnas stängd (en förare, och därmed ett maskinkonto, ser bara sin egen rad). Funktionen ger NAMN och inget mer:
--    förnamnet för en person (aktiv eller inte — en kommentar från någon som slutat ska ändå ha ett namn), maskinens namn för ett maskinkonto.
--    Kan bara anropas av en inloggad med en medarbetarrad (förare, admin, maskinkonto), högst 200 id:n åt gången.
-- Additiv: ingen befintlig rad ändras, ingen befintlig funktion rörs.

alter table public.maskin_upplasning_logg drop constraint if exists maskin_upplasning_logg_utfall_check;
alter table public.maskin_upplasning_logg add constraint maskin_upplasning_logg_utfall_check
  check (utfall = any (array['upplast', 'fel_kod', 'last', 'ingen_kod', 'vantar', 'avslagen', 'las', 'spard_timme',
                             'kod_notis', 'kod_notis_vantar', 'kod_notis_ingen_push',
                             'auto_konto', 'auto_inloggad', 'auto_nekad']));

create or replace function public.medarbetare_visning(p_ids uuid[])
returns table (id uuid, namn text)
language sql stable security definer set search_path = public as $$
  select m.id,
         case when m.roll = 'maskin' then trim(m.namn) else split_part(trim(m.namn), ' ', 1) end
    from medarbetare m
   where public.aktuell_medarbetare_id() is not null
     and coalesce(array_length(p_ids, 1), 0) between 1 and 200
     and m.id = any (p_ids)
     and coalesce(trim(m.namn), '') <> '';
$$;
revoke all on function public.medarbetare_visning(uuid[]) from public, anon;
grant execute on function public.medarbetare_visning(uuid[]) to authenticated;
