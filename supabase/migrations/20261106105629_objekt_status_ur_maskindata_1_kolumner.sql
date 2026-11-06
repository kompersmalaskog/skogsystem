-- Objektets status följer maskinerna (Martin 2026-11-06). Del 1: kolumner och vakt.
-- status_auto_skal: satt = appen satte statusen (och får ändra den igen). En människa som ändrar status nollar den (triggern),
-- så ett avslut för hand öppnas aldrig av appen. fortsatt_at: dagen planeraren tryckte "Inte klar – fortsätt"; när en maskin
-- har kört på trakten efter den dagen släpper appen sitt "inte klar" och avgör själv igen.
alter table public.objekt add column if not exists status_auto_skal text;
alter table public.objekt add column if not exists fortsatt_at date;

create or replace function public.objekt_status_auto_vakt() returns trigger
language plpgsql as $f$
begin
  if new.status is distinct from old.status and coalesce(current_setting('app.status_auto', true), '') <> 'on' then
    new.status_auto_skal := null;
  end if;
  return new;
end
$f$;

create or replace trigger objekt_status_auto_vakt before update of status on public.objekt
  for each row execute function public.objekt_status_auto_vakt();
