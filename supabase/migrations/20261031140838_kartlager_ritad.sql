-- Kartlagret "Ritad" (det femte bakgrundslagret, ritat av appen ur laserdatan) — Martin 2026-10-31.
-- Bara vidgning: kolumnen och RPC:n tar emot 'ritad' utöver de fyra. Ingen rad ändras. Äldre appversioner läser ett okänt värde som
-- "aldrig valt" (Flygfoto), så migrationen kan köras före koden.

alter table medarbetare drop constraint if exists medarbetare_kartlager_check;
alter table medarbetare add constraint medarbetare_kartlager_check
  check (kartlager is null or kartlager in ('satellite', 'lantmateriet', 'terrain', 'osm', 'ritad'));

create or replace function public.satt_kartlager(p_lager text)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null then raise exception 'Inte inloggad'; end if;
  if p_lager is null or p_lager not in ('satellite', 'lantmateriet', 'terrain', 'osm', 'ritad') then
    raise exception 'Okänt kartlager: %', p_lager;
  end if;
  update medarbetare set kartlager = p_lager where user_id = auth.uid();
  return found;
end;
$function$;
