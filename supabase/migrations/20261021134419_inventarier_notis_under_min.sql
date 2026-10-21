-- Inventarier: push till admin när en rad går UNDER minnivån.
--
-- Hakar på den befintliga kanalen: rad i notis_kö -> /api/notis/flush (cron var 5:e minut) -> web-push.
-- Texten byggs färskt vid utskick (lib/inventarier/notis.ts); här köas bara VEM och VILKEN rad.
--
-- EN notis per KORSNING, inte per uttag: antalet ska ha sjunkit, legat på eller över min FÖRE och under min EFTER,
-- och raden får inte redan vara beställd. Ligger raden redan under min kommer ingen ny notis; nästa kommer först
-- när raden varit över min igen (Kommit in) och korsar på nytt. Gäller varje skrivväg (Tog 1, rättning, QR senare),
-- eftersom triggern sitter på tabellen och inte i appen.
--
-- Mottagare: alla aktiva admin (Martin och Joacim 2026-10-21, Martins beslut).
--
-- skickas_at = 'infinity' (MEDVETET, som ledighet och lass): den gamla flush-koden på production skickar okända typer
-- som en generisk push ("Notis" + rå JSON). Den nya flushen tar typen oavsett skickas_at (flushUrval).
--
-- dedup_nyckel = rad-id + tidpunkt: en ny korsning är en ny notis, men samma korsning köas aldrig två gånger.
-- Ett notisfel får ALDRIG välta själva uttaget (eget BEGIN … EXCEPTION).

create or replace function public."kö_inventarie_notis"() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.antal is not null and old.antal is not null and new.min_antal is not null
       and new.antal < old.antal
       and old.antal >= new.min_antal
       and new.antal < new.min_antal
       and new.bestalld_tid is null then
      insert into notis_kö (mottagare_id, typ, payload, skickas_at, dedup_nyckel)
      select m.id, 'inventarie_under_min',
             jsonb_build_object('rad_id', new.id::text),
             'infinity'::timestamptz,
             new.id::text || '|' || to_char(clock_timestamp() at time zone 'UTC', 'YYYYMMDDHH24MISSUS')
      from medarbetare m
      where m.roll = 'admin' and coalesce(m.aktiv, true)
      on conflict (typ, mottagare_id, dedup_nyckel) do nothing;
    end if;
  exception when others then
    raise warning 'kö_inventarie_notis: %', sqlerrm;
  end;
  return new;
end $$;

create or replace trigger "trg_kö_inventarie_notis" after update of antal on public.inventarie_rad
  for each row execute function public."kö_inventarie_notis"();
