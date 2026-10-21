-- Inventarier, två lådor (4/4): push när reservlådan påbörjas, och vyn räknar med den.
--
-- Samma typ och samma kanal som "under min" (inventarie_under_min, skickas_at = 'infinity', texten byggs färskt):
-- byggaren i lib/inventarier/notis.ts ser att raden har två lådor och skriver "reservlådan påbörjad".
-- EN notis per anmälan: bara när reserv_oppnad_tid går från NULL till satt, och raden inte är beställd.
-- Ångras anmälan innan flushen hinner skickas ingenting (raden är inte längre anmäld när texten byggs).
create or replace function public."kö_inventarie_reserv_notis"() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if old.reserv_oppnad_tid is null and new.reserv_oppnad_tid is not null and new.bestalld_tid is null then
      insert into notis_kö (mottagare_id, typ, payload, skickas_at, dedup_nyckel)
      select m.id, 'inventarie_under_min',
             jsonb_build_object('rad_id', new.id::text),
             'infinity'::timestamptz,
             new.id::text || '|reserv|' || to_char(new.reserv_oppnad_tid at time zone 'UTC', 'YYYYMMDDHH24MISSUS')
      from medarbetare m
      where m.roll = 'admin' and coalesce(m.aktiv, true)
      on conflict (typ, mottagare_id, dedup_nyckel) do nothing;
    end if;
  exception when others then
    raise warning 'kö_inventarie_reserv_notis: %', sqlerrm;
  end;
  return new;
end $$;

create or replace trigger "trg_kö_inventarie_reserv_notis" after update of reserv_oppnad_tid on public.inventarie_rad
  for each row execute function public."kö_inventarie_reserv_notis"();

create or replace view public.vy_inventarie_att_bestalla with (security_invoker = true) as
select r.id as rad_id, a.id as artikel_id, a.namn, a.enhet, a.leverantor, a.artikelnr,
       p.id as plats_id, p.namn as plats, r.hylla, r.antal, r.min_antal, r.bestalld_tid,
       (r.bestalld_tid is not null) as ar_bestalld,
       r.tva_lador, r.reserv_oppnad_tid
from public.inventarie_rad r
join public.inventarie_artikel a on a.id = r.artikel_id and a.aktiv
join public.inventarie_plats p on p.id = r.plats_id and p.aktiv
where a.typ = 'forbrukning'
  and ((r.antal is not null and r.min_antal is not null and r.antal < r.min_antal)
       or (r.tva_lador and r.reserv_oppnad_tid is not null));
