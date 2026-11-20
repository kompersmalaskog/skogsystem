-- Arbetsmiljö: push "Maskinen ska stå" till admin och skyddsombud när en åtgärd med stopp skapas.
--
-- Hakar på den befintliga kanalen: rad i notis_kö -> /api/notis/flush (cron var 5:e minut) -> web-push.
-- Texten byggs färskt vid utskick (lib/arbetsmiljo/stoppNotis.ts); här köas bara VEM och VILKEN åtgärd.
--
-- När: en åtgärd skapas med stopp, eller en öppen åtgärd blir stopp. EN notis per åtgärd och mottagare (dedup = åtgärdens id).
-- Mottagare: aktiva admin och aktiva skyddsombud — UTOM den som rapporterade (den vet redan).
--
-- skickas_at = 'infinity' (MEDVETET, som ledighet, lass och inventarier): den gamla flush-koden på production skickar okända typer
-- som en generisk push ("Notis" + rå JSON). Den nya flushen tar typen oavsett skickas_at (flushUrval).
-- Ett notisfel får ALDRIG välta själva åtgärden (eget BEGIN … EXCEPTION) — föraren som svarar Nej får aldrig ett fel för det.

create or replace function public."kö_am_stopp"() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_rapportor uuid;
begin
  begin
    if new.stopp and new.status = 'oppen' and (tg_op = 'INSERT' or not coalesce(old.stopp, false)) then
      v_rapportor := new.rapporterad_av;
      if v_rapportor is null and new.svar_id is not null then
        select k.medarbetare_id into v_rapportor
          from am_svar s join am_maskinkoll k on k.id = s.maskinkoll_id
         where s.id = new.svar_id;
      end if;
      insert into notis_kö (mottagare_id, typ, payload, skickas_at, dedup_nyckel)
      select m.id, 'am_stopp', jsonb_build_object('atgard_id', new.id::text), 'infinity'::timestamptz, new.id::text
        from medarbetare m
       where coalesce(m.aktiv, true)
         and (m.roll = 'admin' or m.skyddsombud)
         and m.id is distinct from v_rapportor
      on conflict (typ, mottagare_id, dedup_nyckel) do nothing;
    end if;
  exception when others then
    raise warning 'kö_am_stopp: %', sqlerrm;
  end;
  return new;
end $$;
revoke execute on function public."kö_am_stopp"() from public, anon, authenticated;

create or replace trigger "trg_kö_am_stopp" after insert or update of stopp on public.am_atgard
  for each row execute function public."kö_am_stopp"();
