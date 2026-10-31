-- Arbetsmiljö, steg 1: maskinkoll (skyddsrond), åtgärder, skyddsombud.
-- Spec: "Arbetsmiljö i Skogsystem – spec". Bara tabellerna för steg 1–3; utrustning, risker,
-- tillbud, kurser och rutinkort kommer i egna migrationer när de byggs.
-- Additivt: inget befintligt ändras utom en ny kolumn på medarbetare.

-- ---------------------------------------------------------------------------
-- Skyddsombud: en förare med extra läsrätt. Skyddas av medarbetare_skydda_kolumner
-- (vitlista) — bara admin kan sätta den.
-- ---------------------------------------------------------------------------
alter table public.medarbetare add column if not exists skyddsombud boolean not null default false;

create or replace function public.ar_skyddsombud() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from medarbetare where user_id = auth.uid() and skyddsombud and aktiv);
$$;

-- Admin eller skyddsombud: ser allt i arbetsmiljön.
create or replace function public.ar_am_lasare() returns boolean
language sql stable security definer set search_path = public as $$
  select public.ar_admin() or public.ar_skyddsombud();
$$;

-- ---------------------------------------------------------------------------
-- Frågebanken. Raderas aldrig — stängs av (aktiv = false).
-- maskin_typ NULL = alla maskiner. Värden som i dim_maskin.maskin_typ.
-- ---------------------------------------------------------------------------
create table public.am_fraga (
  id          uuid primary key default gen_random_uuid(),
  kod         text not null unique,
  text        text not null check (length(trim(text)) > 0),
  hjalptext   text,
  maskin_typ  text check (maskin_typ in ('Harvester', 'Forwarder', 'Lastbil')),
  foto_url    text,
  aktiv       boolean not null default true,
  ordning     integer not null default 0,
  skapad      timestamptz not null default now(),
  uppdaterad  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Skriftlig fördelning av maskinkollen ("Jag gör maskinkollen på X").
-- ---------------------------------------------------------------------------
create table public.am_uppgift_godkannande (
  id              uuid primary key default gen_random_uuid(),
  medarbetare_id  uuid not null references public.medarbetare(id),
  maskin_id       text not null references public.dim_maskin(maskin_id),
  text_version    text not null,
  tid             timestamptz not null default now(),
  unique (medarbetare_id, maskin_id, text_version)
);

-- ---------------------------------------------------------------------------
-- En genomförd maskinkoll. klar sätts först när allt är besvarat + kontrollfoto finns.
-- ---------------------------------------------------------------------------
create table public.am_maskinkoll (
  id                uuid primary key default gen_random_uuid(),
  maskin_id         text not null references public.dim_maskin(maskin_id),
  medarbetare_id    uuid not null references public.medarbetare(id),
  typ               text not null default 'manad' check (typ in ('manad', 'arsrunda')),
  startad           timestamptz not null default now(),
  klar              timestamptz,
  kontrollfoto_vad  text,
  kontrollfoto_url  text
);
create index am_maskinkoll_maskin_klar on public.am_maskinkoll (maskin_id, klar desc);

-- ---------------------------------------------------------------------------
-- Ett svar. fraga_text = frågan som den löd NÄR den besvarades (ändras frågan senare
-- står gamla maskinkoller och årsuppföljningen kvar oförändrade).
-- ---------------------------------------------------------------------------
create table public.am_svar (
  id             uuid primary key default gen_random_uuid(),
  maskinkoll_id  uuid not null references public.am_maskinkoll(id) on delete cascade,
  fraga_id       uuid not null references public.am_fraga(id),
  fraga_text     text not null,
  ok             boolean not null,
  foto_url       text,
  kommentar      text,
  besvarad       timestamptz not null default now(),
  unique (maskinkoll_id, fraga_id),
  -- Nej kräver foto (skissen: "Knappen blir aktiv när bilden är tagen").
  check (ok or foto_url is not null)
);

-- ---------------------------------------------------------------------------
-- Åtgärd. Skapas automatiskt av triggern vid Nej; admin kan också skapa manuellt.
-- ---------------------------------------------------------------------------
create table public.am_atgard (
  id             uuid primary key default gen_random_uuid(),
  kalla          text not null check (kalla in ('svar', 'manuell')),
  svar_id        uuid unique references public.am_svar(id) on delete set null,
  maskin_id      text references public.dim_maskin(maskin_id),
  beskrivning    text not null,
  foto_url       text,
  ansvarig_id    uuid references public.medarbetare(id),
  deadline       date,
  status         text not null default 'oppen' check (status in ('oppen', 'klar')),
  vad_gjordes    text,
  stangd_av      uuid references public.medarbetare(id),
  stangd_tid     timestamptz,
  skapad         timestamptz not null default now(),
  check (status = 'oppen' or (vad_gjordes is not null and length(trim(vad_gjordes)) > 0 and stangd_tid is not null))
);
create index am_atgard_oppna on public.am_atgard (status, skapad desc);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Nej → åtgärd (i databasen, inte i klienten). Ändras ett Nej till Ja innan kollen är klar
-- tas den öppna åtgärden bort igen.
create or replace function public.am_svar_till_atgard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_maskin text;
begin
  select maskin_id into v_maskin from am_maskinkoll where id = new.maskinkoll_id;
  if not new.ok then
    insert into am_atgard (kalla, svar_id, maskin_id, beskrivning, foto_url, deadline)
    values ('svar', new.id, v_maskin,
            new.fraga_text || coalesce(' — ' || nullif(trim(new.kommentar), ''), ''),
            new.foto_url, (now() at time zone 'Europe/Stockholm')::date + 7)
    on conflict (svar_id) do update
      set beskrivning = excluded.beskrivning, foto_url = excluded.foto_url;
  else
    delete from am_atgard where svar_id = new.id and status = 'oppen';
  end if;
  return new;
end;
$$;

create trigger am_svar_atgard
  after insert or update of ok, foto_url, kommentar on public.am_svar
  for each row execute function public.am_svar_till_atgard();

-- En maskinkoll är klar först när alla aktiva frågor för maskintypen är besvarade och
-- kontrollfotot finns. Efter klar är den låst.
create or replace function public.am_maskinkoll_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_typ text;
  v_saknas integer;
begin
  if old.klar is not null then
    raise exception 'Maskinkollen är redan klar och kan inte ändras' using errcode = '42501';
  end if;
  if new.klar is not null then
    if new.kontrollfoto_url is null then
      raise exception 'Ta kontrollfotot innan maskinkollen avslutas' using errcode = '23514';
    end if;
    select maskin_typ into v_typ from dim_maskin where maskin_id = new.maskin_id;
    select count(*) into v_saknas
      from am_fraga f
     where f.aktiv and (f.maskin_typ is null or f.maskin_typ = v_typ)
       and not exists (select 1 from am_svar s where s.maskinkoll_id = new.id and s.fraga_id = f.id);
    if v_saknas > 0 then
      raise exception 'Svara på alla frågor först (% kvar)', v_saknas using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger am_maskinkoll_vakt
  before update on public.am_maskinkoll
  for each row execute function public.am_maskinkoll_vakt();

-- Svar får bara skrivas medan kollen pågår.
create or replace function public.am_svar_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from am_maskinkoll where id = coalesce(new.maskinkoll_id, old.maskinkoll_id) and klar is not null) then
    raise exception 'Maskinkollen är redan klar' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger am_svar_vakt
  before insert or update or delete on public.am_svar
  for each row execute function public.am_svar_vakt();

create or replace function public.am_fraga_uppdaterad() returns trigger
language plpgsql set search_path = public as $$
begin new.uppdaterad := now(); return new; end;
$$;
create trigger am_fraga_uppdaterad before update on public.am_fraga
  for each row execute function public.am_fraga_uppdaterad();

-- ---------------------------------------------------------------------------
-- RLS — på från första migrationen.
-- ---------------------------------------------------------------------------
alter table public.am_fraga               enable row level security;
alter table public.am_uppgift_godkannande enable row level security;
alter table public.am_maskinkoll          enable row level security;
alter table public.am_svar                enable row level security;
alter table public.am_atgard              enable row level security;

-- Frågor: alla inloggade läser; admin skriver; ingen raderar.
create policy am_fraga_select on public.am_fraga for select to authenticated using (true);
create policy am_fraga_insert on public.am_fraga for insert to authenticated with check (public.ar_admin());
create policy am_fraga_update on public.am_fraga for update to authenticated using (public.ar_admin()) with check (public.ar_admin());

-- Godkännande: föraren skriver sitt eget; föraren, admin och skyddsombud läser.
create policy am_godk_select on public.am_uppgift_godkannande for select to authenticated
  using (medarbetare_id = public.aktuell_medarbetare_id() or public.ar_am_lasare());
create policy am_godk_insert on public.am_uppgift_godkannande for insert to authenticated
  with check (medarbetare_id = public.aktuell_medarbetare_id());

-- Maskinkoll: föraren startar och avslutar sin egen; admin och skyddsombud läser alla.
create policy am_koll_select on public.am_maskinkoll for select to authenticated
  using (medarbetare_id = public.aktuell_medarbetare_id() or public.ar_am_lasare());
create policy am_koll_insert on public.am_maskinkoll for insert to authenticated
  with check (medarbetare_id = public.aktuell_medarbetare_id() and klar is null);
create policy am_koll_update on public.am_maskinkoll for update to authenticated
  using (medarbetare_id = public.aktuell_medarbetare_id())
  with check (medarbetare_id = public.aktuell_medarbetare_id());
create policy am_koll_delete on public.am_maskinkoll for delete to authenticated
  using (medarbetare_id = public.aktuell_medarbetare_id() and klar is null);

-- Svar: genom kollen.
create policy am_svar_select on public.am_svar for select to authenticated
  using (public.ar_am_lasare() or exists (select 1 from public.am_maskinkoll k
         where k.id = maskinkoll_id and k.medarbetare_id = public.aktuell_medarbetare_id()));
create policy am_svar_insert on public.am_svar for insert to authenticated
  with check (exists (select 1 from public.am_maskinkoll k
              where k.id = maskinkoll_id and k.medarbetare_id = public.aktuell_medarbetare_id()));
create policy am_svar_update on public.am_svar for update to authenticated
  using (exists (select 1 from public.am_maskinkoll k
         where k.id = maskinkoll_id and k.medarbetare_id = public.aktuell_medarbetare_id()))
  with check (exists (select 1 from public.am_maskinkoll k
              where k.id = maskinkoll_id and k.medarbetare_id = public.aktuell_medarbetare_id()));
create policy am_svar_delete on public.am_svar for delete to authenticated
  using (exists (select 1 from public.am_maskinkoll k
         where k.id = maskinkoll_id and k.medarbetare_id = public.aktuell_medarbetare_id()));

-- Åtgärder: admin och skyddsombud läser alla; föraren ser de som kom från hans egna svar
-- ("Föraren ser att det är åtgärdat"). Bara admin skapar manuellt och stänger.
create policy am_atgard_select on public.am_atgard for select to authenticated
  using (public.ar_am_lasare() or exists (
    select 1 from public.am_svar s join public.am_maskinkoll k on k.id = s.maskinkoll_id
     where s.id = svar_id and k.medarbetare_id = public.aktuell_medarbetare_id()));
create policy am_atgard_insert on public.am_atgard for insert to authenticated
  with check (public.ar_admin() and kalla = 'manuell');
create policy am_atgard_update on public.am_atgard for update to authenticated
  using (public.ar_admin()) with check (public.ar_admin());

-- ---------------------------------------------------------------------------
-- Foton: privat bucket. Sökväg <medarbetare_id>/<maskinkoll_id>/<fil>.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('am-foton', 'am-foton', false)
on conflict (id) do nothing;

create policy am_foton_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'am-foton' and (storage.foldername(name))[1] = public.aktuell_medarbetare_id()::text);
create policy am_foton_select on storage.objects for select to authenticated
  using (bucket_id = 'am-foton' and ((storage.foldername(name))[1] = public.aktuell_medarbetare_id()::text or public.ar_am_lasare()));

-- ---------------------------------------------------------------------------
-- Frågebanken, första versionen. Ja är alltid bra. Ändras i adminvyn.
-- ---------------------------------------------------------------------------
insert into public.am_fraga (kod, text, hjalptext, maskin_typ, ordning) values
  ('G1', 'Fungerar nödstoppen?',                          'Tryck in. Stannar kran och motor?',               null, 10),
  ('G2', 'Visar brandsläckarna grönt?',                   'Båda släckarna, visaren i grönt fält.',           null, 20),
  ('G3', 'Är motorrummet rent?',                          'Inget spån, barr eller olja.',                    null, 30),
  ('G4', 'Är slangarna torra?',                           'Titta längs kranen och vid aggregatet.',          null, 40),
  ('G5', 'Är alla rutor hela?',                           'Inga sprickor eller djupa repor.',                null, 50),
  ('G6', 'Sitter stegar och handtag fast?',               null,                                              null, 60),
  ('G7', 'Fungerar alla lampor?',                         null,                                              null, 70),
  ('G8', 'Finns förbandslådan och ögonflaskan på plats?', null,                                              null, 80),
  ('S1', 'Är kedjefångaren hel?',                         null,                                              'Harvester', 110),
  ('S2', 'Är svärd och kedja hela?',                      'Inga sprickor i svärdet, inga trasiga länkar.',   'Harvester', 120),
  ('S3', 'Stannar sågen när du släpper?',                 null,                                              'Harvester', 130),
  ('S4', 'Fungerar kranspärren?',                         null,                                              'Harvester', 140),
  ('K1', 'Är lastgrinden hel och fast?',                  null,                                              'Forwarder', 210),
  ('K2', 'Fungerar kranspärren?',                         null,                                              'Forwarder', 220),
  ('K3', 'Håller parkeringsbromsen i lutning?',           null,                                              'Forwarder', 230),
  ('K4', 'Är lastbankar och stöttor hela?',               null,                                              'Forwarder', 240);
