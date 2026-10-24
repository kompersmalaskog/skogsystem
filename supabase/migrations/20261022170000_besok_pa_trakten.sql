-- Besök på trakten — säkerhet (2026-10-22). Additiv: fyra nya tabeller, två funktioner. Inget befintligt ändras.
--
--   objekt_besok_lank      en länk (lång slumpad token) per objekt till besökssidan /besok/<token>. Kan stängas av. Gäller inte för ett avslutat objekt (kontrolleras av servern).
--   objekt_besok           en anmälan från markägaren: namn, telefon, tid. SKRIVS BARA av servern (service role, via besökssidans route) — ingen insert-policy finns.
--   objekt_besok_kvittens  "Uppfattat" från en maskin i hytten: vilken maskin, vilken förare, servertid. En rad per (besök, maskin).
--   objekt_besok_sms       när planeraren öppnade SMS:et till markägaren och vem — beviset för egenkontrollen, och skälet att inte påminna igen.
--
-- Ingen anon-åtkomst till någon tabell. Besökssidan når bara data via serverrouterna /api/besok/<token>/* som läser och skriver med exakt de fält sidan behöver.
-- RLS: inloggade (förare, planerare) läser besök, kvittenser och SMS-logg; de skriver bara sin egen kvittens och sin egen SMS-rad (korvy_min_medarbetare()).
-- Länken skapas/stängs via funktionerna nedan (bara admin = planerare); tabellen har inga policies för authenticated, så token läcker aldrig till förare.

create table if not exists public.objekt_besok_lank (
  objekt_id   uuid primary key references public.objekt(id) on delete cascade,
  token       text not null unique check (char_length(token) >= 32),
  aktiv       boolean not null default true,
  skapad_at   timestamptz not null default now(),
  skapad_av   uuid references public.medarbetare(id) on delete set null,
  avstangd_at timestamptz
);

create table if not exists public.objekt_besok (
  id         uuid primary key default gen_random_uuid(),
  objekt_id  uuid not null references public.objekt(id) on delete cascade,
  namn       text not null check (char_length(btrim(namn)) between 1 and 80),
  telefon    text not null check (char_length(btrim(telefon)) between 5 and 30),
  besokstid  timestamptz not null,
  skapad_at  timestamptz not null default now()
);
create index if not exists objekt_besok_objekt_idx on public.objekt_besok (objekt_id, besokstid desc);

create table if not exists public.objekt_besok_kvittens (
  id           uuid primary key default gen_random_uuid(),
  besok_id     uuid not null references public.objekt_besok(id) on delete cascade,
  maskin_id    text not null,
  roll         text check (roll in ('skordare', 'skotare')),
  forare_id    uuid references public.medarbetare(id) on delete set null,
  kvitterad_at timestamptz not null default now(),
  -- sant när en admin provat i testläget (/maskin?som=…): loggen visar det, beviset blandas inte ihop med riktiga kvittenser
  testlage     boolean not null default false,
  unique (besok_id, maskin_id)
);

create table if not exists public.objekt_besok_sms (
  id               uuid primary key default gen_random_uuid(),
  objekt_id        uuid not null references public.objekt(id) on delete cascade,
  oppnad_av        uuid references public.medarbetare(id) on delete set null,
  oppnad_at        timestamptz not null default now(),
  mottagare_namn   text,
  mottagare_nummer text
);
create index if not exists objekt_besok_sms_objekt_idx on public.objekt_besok_sms (objekt_id, oppnad_at desc);

alter table public.objekt_besok_lank enable row level security;
alter table public.objekt_besok enable row level security;
alter table public.objekt_besok_kvittens enable row level security;
alter table public.objekt_besok_sms enable row level security;

revoke all on public.objekt_besok_lank, public.objekt_besok, public.objekt_besok_kvittens, public.objekt_besok_sms from anon;
revoke all on public.objekt_besok_lank from authenticated;

drop policy if exists besok_sel on public.objekt_besok;
create policy besok_sel on public.objekt_besok for select to authenticated using (true);

drop policy if exists besok_kvittens_sel on public.objekt_besok_kvittens;
create policy besok_kvittens_sel on public.objekt_besok_kvittens for select to authenticated using (true);
drop policy if exists besok_kvittens_ins on public.objekt_besok_kvittens;
create policy besok_kvittens_ins on public.objekt_besok_kvittens for insert to authenticated with check (forare_id = public.korvy_min_medarbetare());

drop policy if exists besok_sms_sel on public.objekt_besok_sms;
create policy besok_sms_sel on public.objekt_besok_sms for select to authenticated using (true);
drop policy if exists besok_sms_ins on public.objekt_besok_sms;
create policy besok_sms_ins on public.objekt_besok_sms for insert to authenticated with check (oppnad_av = public.korvy_min_medarbetare());

-- Tiden sätts av SERVERN, aldrig av klienten (som korvy_kvittens_forare): en kvittens och en SMS-rad är bevis.
create or replace function public.besok_tid_fran_servern() returns trigger language plpgsql as $$
begin
  if tg_table_name = 'objekt_besok_kvittens' then new.kvitterad_at := now();
  elsif tg_table_name = 'objekt_besok_sms' then new.oppnad_at := now();
  end if;
  return new;
end $$;

drop trigger if exists besok_kvittens_tid on public.objekt_besok_kvittens;
create trigger besok_kvittens_tid before insert on public.objekt_besok_kvittens for each row execute function public.besok_tid_fran_servern();
drop trigger if exists besok_sms_tid on public.objekt_besok_sms;
create trigger besok_sms_tid before insert on public.objekt_besok_sms for each row execute function public.besok_tid_fran_servern();

-- Länken: bara admin (planeraren). Skapas första gången den hämtas; token = 64 tecken ur två slumpade uuid (≈244 bitar).
create or replace function public.besok_lank_hamta(p_objekt uuid)
returns table (token text, aktiv boolean)
language plpgsql security definer set search_path = public as $$
declare v_med uuid;
begin
  select m.id into v_med from public.medarbetare m where m.user_id = auth.uid() and m.roll = 'admin' limit 1;
  if v_med is null then raise exception 'Bara planerare kan hämta besökslänken' using errcode = '42501'; end if;
  insert into public.objekt_besok_lank (objekt_id, token, skapad_av)
  values (p_objekt, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), v_med)
  on conflict (objekt_id) do nothing;
  return query select l.token, l.aktiv from public.objekt_besok_lank l where l.objekt_id = p_objekt;
end $$;

create or replace function public.besok_lank_satt_aktiv(p_objekt uuid, p_aktiv boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.medarbetare m where m.user_id = auth.uid() and m.roll = 'admin') then
    raise exception 'Bara planerare kan stänga av besökslänken' using errcode = '42501';
  end if;
  update public.objekt_besok_lank set aktiv = p_aktiv, avstangd_at = case when p_aktiv then null else now() end where objekt_id = p_objekt;
end $$;

revoke all on function public.besok_lank_hamta(uuid), public.besok_lank_satt_aktiv(uuid, boolean) from public, anon;
grant execute on function public.besok_lank_hamta(uuid), public.besok_lank_satt_aktiv(uuid, boolean) to authenticated;

-- Framsteget på besökssidan ("62 % klart"): volymer per dag, summerade av databasen så att servern slipper läsa tusentals rader. Anropas BARA av servern (service role);
-- ingen inloggad användare och ingen anon kan köra den, och volymerna lämnar aldrig servern — besökssidan får procenten.
--   skordat = fakt_produktion (skördarens objekt_id: vo_nummer + extra nummer)
--   skotat  = Opti-lassen (fakt_lass) + appens egna lass (skotar_lass_sortiment_skalat, ej strukna)
create or replace function public.besok_volymer(p_objekt uuid, p_ids text[])
returns table (kalla text, datum date, m3 numeric)
language sql stable security definer set search_path = public as $$
  select 'skordat'::text, p.datum, sum(p.volym_m3sub)::numeric
    from public.fakt_produktion p where p.objekt_id = any(p_ids) group by p.datum
  union all
  select 'skotat'::text, l.datum, sum(l.volym_m3sub)::numeric
    from public.fakt_lass l where l.objekt_id = any(p_ids) group by l.datum
  union all
  select 'skotat'::text, s.datum, sum(coalesce(s.m3_skalat, s.m3_forare))::numeric
    from public.skotar_lass_sortiment_skalat s where s.objekt_id = p_objekt and s.status is distinct from 'struket' group by s.datum
$$;
revoke all on function public.besok_volymer(uuid, text[]) from public, anon, authenticated;
grant execute on function public.besok_volymer(uuid, text[]) to service_role;
