-- Arbetsmiljö, steg 4: tillbud och olyckor (och nödkontakterna till "Om något händer").
--
-- 1. am_tillbud: föraren rapporterar vad som hände — "Det var nära" (tillbud) eller "Någon skadades" (olycka).
--    Bara som sig själv. Ingen ändrar rapporten efteråt utom att admin markerar att den är anmäld till Arbetsmiljöverket
--    (tid och vem sätts av databasen).
-- 2. Varje rapport blir en åtgärd (am_atgard, kalla = 'tillbud') så den hamnar i åtgärdslistan: "Vad gjordes så det inte
--    händer igen?". Skapas av triggern, aldrig av klienten.
-- 3. Push till aktiva admin och skyddsombud (utom den som rapporterade), typ am_tillbud, samma kanal och samma regler som
--    am_stopp: skickas_at = 'infinity', dedup = åtgärdens id, ett notisfel välter aldrig rapporten.
-- 4. am_nodkontakter(): förnamn och telefon för aktiva admin, till knappen "Ring Martin" i Om något händer. Förare får
--    inte läsa medarbetare själva.
-- Additivt: inget befintligt ändras utom am_atgard (en kolumn, kalla får värdet 'tillbud').

create table if not exists public.am_tillbud (
  id               uuid primary key default gen_random_uuid(),
  typ              text not null check (typ in ('tillbud', 'olycka')),
  -- Rutinkortet rapporten kom ifrån ('skadad', 'brand' …), annars null.
  situation        text,
  beskrivning      text not null check (length(trim(beskrivning)) > 0),
  foto_url         text,
  maskin_id        text references public.dim_maskin(maskin_id),
  lat              double precision,
  lng              double precision,
  rapporterad_av   uuid not null references public.medarbetare(id),
  skapad           timestamptz not null default now(),
  anmald_tid       timestamptz,
  anmald_av        uuid references public.medarbetare(id)
);
create index if not exists am_tillbud_skapad on public.am_tillbud (skapad desc);

alter table public.am_atgard add column if not exists tillbud_id uuid unique references public.am_tillbud(id);
alter table public.am_atgard drop constraint if exists am_atgard_kalla_check;
alter table public.am_atgard add constraint am_atgard_kalla_check check (kalla in ('svar', 'manuell', 'forare', 'tillbud'));

-- Rapporten → åtgärd. Sju dagar som en vanlig åtgärd; aldrig stopp (det är "Något är fel" som stoppar en maskin).
create or replace function public.am_tillbud_till_atgard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into am_atgard (kalla, tillbud_id, maskin_id, beskrivning, foto_url, deadline, rapporterad_av, stopp)
  values ('tillbud', new.id, new.maskin_id, new.beskrivning, new.foto_url,
          (now() at time zone 'Europe/Stockholm')::date + 7, new.rapporterad_av, false)
  on conflict (tillbud_id) do nothing;
  return new;
end $$;
revoke execute on function public.am_tillbud_till_atgard() from public, anon, authenticated;

create or replace trigger am_tillbud_atgard after insert on public.am_tillbud
  for each row execute function public.am_tillbud_till_atgard();

-- Anmäld till Arbetsmiljöverket: databasen sätter när och vem. Allt annat i rapporten står som det skrevs.
create or replace function public.am_tillbud_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.typ is distinct from old.typ or new.situation is distinct from old.situation
     or new.beskrivning is distinct from old.beskrivning or new.foto_url is distinct from old.foto_url
     or new.maskin_id is distinct from old.maskin_id or new.lat is distinct from old.lat or new.lng is distinct from old.lng
     or new.rapporterad_av is distinct from old.rapporterad_av or new.skapad is distinct from old.skapad then
    raise exception 'Rapporten kan inte ändras' using errcode = '42501';
  end if;
  if old.anmald_tid is not null and new.anmald_tid is not null then
    new.anmald_tid := old.anmald_tid;
    new.anmald_av := old.anmald_av;
  elsif new.anmald_tid is not null then
    new.anmald_tid := now();
    new.anmald_av := coalesce(public.aktuell_medarbetare_id(), new.anmald_av);
  else
    new.anmald_av := null;
  end if;
  return new;
end $$;
revoke execute on function public.am_tillbud_vakt() from public, anon, authenticated;

create or replace trigger a_am_tillbud_vakt before update on public.am_tillbud
  for each row execute function public.am_tillbud_vakt();

-- Push. Köas när åtgärden skapas (den bär id:t länken pekar på).
create or replace function public."kö_am_tillbud"() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.kalla = 'tillbud' then
      insert into notis_kö (mottagare_id, typ, payload, skickas_at, dedup_nyckel)
      select m.id, 'am_tillbud', jsonb_build_object('atgard_id', new.id::text), 'infinity'::timestamptz, new.id::text
        from medarbetare m
       where coalesce(m.aktiv, true)
         and (m.roll = 'admin' or m.skyddsombud)
         and m.id is distinct from new.rapporterad_av
      on conflict (typ, mottagare_id, dedup_nyckel) do nothing;
    end if;
  exception when others then
    raise warning 'kö_am_tillbud: %', sqlerrm;
  end;
  return new;
end $$;
revoke execute on function public."kö_am_tillbud"() from public, anon, authenticated;

create or replace trigger "trg_kö_am_tillbud" after insert on public.am_atgard
  for each row execute function public."kö_am_tillbud"();

alter table public.am_tillbud enable row level security;

-- Föraren rapporterar som sig själv, aldrig redan anmäld.
create policy am_tillbud_insert on public.am_tillbud for insert to authenticated
  with check (rapporterad_av = public.aktuell_medarbetare_id() and anmald_tid is null and anmald_av is null);
-- Föraren ser sina egna; admin och skyddsombud alla.
create policy am_tillbud_select on public.am_tillbud for select to authenticated
  using (rapporterad_av = public.aktuell_medarbetare_id() or public.ar_am_lasare());
-- Bara admin ändrar (och då bara anmäld — triggern spärrar resten). Ingen raderar.
create policy am_tillbud_update on public.am_tillbud for update to authenticated
  using (public.ar_admin()) with check (public.ar_admin());

-- Nödkontakter: förnamn + telefon för aktiva admin med telefon. Alla inloggade med en medarbetarrad.
create or replace function public.am_nodkontakter()
returns table (namn text, telefon text)
language sql stable security definer set search_path = public as $$
  select split_part(trim(m.namn), ' ', 1), trim(m.telefon)
    from medarbetare m
   where public.aktuell_medarbetare_id() is not null
     and coalesce(m.aktiv, true) and m.roll = 'admin'
     and coalesce(trim(m.telefon), '') <> ''
   order by m.namn;
$$;
revoke execute on function public.am_nodkontakter() from public, anon;
grant execute on function public.am_nodkontakter() to authenticated;
