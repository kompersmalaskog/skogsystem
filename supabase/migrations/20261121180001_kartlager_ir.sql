-- Kartlagret "IR-flygfoto" (Lantmäteriets infraröda ortofoto, bredvid Flygfoto) — Martin 2026-11-21.
-- Bara vidgning: kolumnen och RPC:n tar emot 'ir' utöver de sex. Ingen rad ändras, och 'satellite' (Flygfoto) är fortfarande standard för den som aldrig valt.
-- Äldre appversioner läser ett okänt värde som "aldrig valt" (Flygfoto), så migrationen kan köras före koden. Körs INTE av appen — Martin säger till.
-- Utan migrationen sparas valet bara på enheten (appen faller tillbaka på den lokala kopian, som för 'mork').

alter table medarbetare drop constraint if exists medarbetare_kartlager_check;
alter table medarbetare add constraint medarbetare_kartlager_check
  check (kartlager is null or kartlager in ('satellite', 'ir', 'lantmateriet', 'terrain', 'osm', 'ritad', 'mork'));

create or replace function public.satt_kartlager(p_lager text)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null then raise exception 'Inte inloggad'; end if;
  if p_lager is null or p_lager not in ('satellite', 'ir', 'lantmateriet', 'terrain', 'osm', 'ritad', 'mork') then
    raise exception 'Okänt kartlager: %', p_lager;
  end if;
  update medarbetare set kartlager = p_lager where user_id = auth.uid();
  return found;
end;
$function$;
