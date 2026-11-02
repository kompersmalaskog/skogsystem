-- Skyddsrond (arbetsmiljö, 2026-11-02). Arbetsgivaren och skyddsombudet undersöker arbetsmiljön regelbundet (AFS 2023:1), här en gång
-- om året: brandskydd per maskin, första hjälpen, ensamarbete, personalutrymme, kemikalier, arbetstid och hur vi mår, utbildning,
-- lastbilen och verkstaden. Punkterna står i koden (lib/arbetsmiljo/skyddsrond.ts) och sparas på ronden när den startar (punkter jsonb),
-- så en gammal rond visar det den frågade då.
--
-- 1. am_skyddsrond: en rond. startad/startad_av och klar sätts av databasen. Klar kräver att varje punkt i ronden är besvarad och att
--    det står vilka som gick den. Efter klar är ronden och dess svar låsta.
-- 2. am_skyddsrond_svar: ett svar per punkt: ok | brist | galler_inte. Brist kräver en text och blir en åtgärd (am_atgard, kalla
--    'skyddsrond', 30 dagar) — i databasen, aldrig i klienten. Ändras en brist till ok tas den öppna åtgärden bort.
-- Admin och skyddsombud (ar_am_lasare) läser och skriver; förare ser inget. Additivt utom am_atgard (en kolumn, kalla får 'skyddsrond').

create table if not exists public.am_skyddsrond (
  id          uuid primary key default gen_random_uuid(),
  punkter     jsonb not null check (jsonb_typeof(punkter) = 'array' and jsonb_array_length(punkter) > 0),
  deltagare   text,
  startad     timestamptz not null default now(),
  startad_av  uuid references public.medarbetare(id),
  klar        timestamptz
);
create index if not exists am_skyddsrond_startad on public.am_skyddsrond (startad desc);

create table if not exists public.am_skyddsrond_svar (
  id           uuid primary key default gen_random_uuid(),
  rond_id      uuid not null references public.am_skyddsrond(id) on delete cascade,
  punkt        text not null,
  punkt_text   text not null check (length(trim(punkt_text)) > 0),
  maskin_id    text references public.dim_maskin(maskin_id),
  svar         text not null check (svar in ('ok', 'brist', 'galler_inte')),
  beskrivning  text,
  besvarad     timestamptz not null default now(),
  besvarad_av  uuid references public.medarbetare(id),
  unique (rond_id, punkt),
  check (svar <> 'brist' or length(trim(coalesce(beskrivning, ''))) > 0)
);

alter table public.am_atgard add column if not exists skyddsrond_svar_id uuid unique references public.am_skyddsrond_svar(id) on delete set null;
alter table public.am_atgard drop constraint if exists am_atgard_kalla_check;
alter table public.am_atgard add constraint am_atgard_kalla_check check (kalla in ('svar', 'manuell', 'forare', 'tillbud', 'skyddsrond'));

-- Ronden: databasen sätter vem och när. Klar kräver alla svar + deltagare; efter klar är den låst.
create or replace function public.am_skyddsrond_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_saknas integer;
begin
  if tg_op = 'INSERT' then
    new.startad := now();
    new.startad_av := public.aktuell_medarbetare_id();
    new.klar := null;
    return new;
  end if;
  if old.klar is not null then
    raise exception 'Skyddsronden är klar och kan inte ändras' using errcode = '42501';
  end if;
  new.startad := old.startad;
  new.startad_av := old.startad_av;
  new.punkter := old.punkter;
  if new.klar is not null then
    if length(trim(coalesce(new.deltagare, ''))) = 0 then
      raise exception 'Skriv vilka som gick ronden' using errcode = '23514';
    end if;
    select count(*) into v_saknas
      from jsonb_array_elements(old.punkter) p
     where not exists (select 1 from am_skyddsrond_svar s where s.rond_id = old.id and s.punkt = p->>'id');
    if v_saknas > 0 then
      raise exception 'Svara på alla punkter först (% kvar)', v_saknas using errcode = '23514';
    end if;
    new.klar := now();
  end if;
  return new;
end $$;
revoke execute on function public.am_skyddsrond_vakt() from public, anon, authenticated;

create or replace trigger a_am_skyddsrond_vakt before insert or update on public.am_skyddsrond
  for each row execute function public.am_skyddsrond_vakt();

-- Svar: bara medan ronden pågår, bara punkter som finns i ronden. Vem och när från databasen.
create or replace function public.am_skyddsrond_svar_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_rond am_skyddsrond%rowtype;
begin
  select * into v_rond from am_skyddsrond where id = coalesce(new.rond_id, old.rond_id);
  if v_rond.klar is not null then
    raise exception 'Skyddsronden är klar' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if not exists (select 1 from jsonb_array_elements(v_rond.punkter) p where p->>'id' = new.punkt) then
    raise exception 'Punkten finns inte i ronden' using errcode = '23514';
  end if;
  new.besvarad := now();
  new.besvarad_av := public.aktuell_medarbetare_id();
  return new;
end $$;
revoke execute on function public.am_skyddsrond_svar_vakt() from public, anon, authenticated;

create or replace trigger a_am_skyddsrond_svar_vakt before insert or update or delete on public.am_skyddsrond_svar
  for each row execute function public.am_skyddsrond_svar_vakt();

-- Brist → åtgärd (30 dagar). Inte längre brist → den öppna åtgärden tas bort.
create or replace function public.am_skyddsrond_till_atgard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.svar = 'brist' then
    insert into am_atgard (kalla, skyddsrond_svar_id, maskin_id, beskrivning, deadline, rapporterad_av, stopp)
    values ('skyddsrond', new.id, new.maskin_id, new.punkt_text || ' — ' || trim(new.beskrivning),
            (now() at time zone 'Europe/Stockholm')::date + 30, new.besvarad_av, false)
    on conflict (skyddsrond_svar_id) do update set beskrivning = excluded.beskrivning;
  else
    delete from am_atgard where skyddsrond_svar_id = new.id and status = 'oppen';
  end if;
  return new;
end $$;
revoke execute on function public.am_skyddsrond_till_atgard() from public, anon, authenticated;

create or replace trigger am_skyddsrond_atgard after insert or update of svar, beskrivning on public.am_skyddsrond_svar
  for each row execute function public.am_skyddsrond_till_atgard();

alter table public.am_skyddsrond enable row level security;
alter table public.am_skyddsrond_svar enable row level security;

create policy am_skyddsrond_las on public.am_skyddsrond for select to authenticated using (public.ar_am_lasare());
create policy am_skyddsrond_skapa on public.am_skyddsrond for insert to authenticated with check (public.ar_am_lasare());
create policy am_skyddsrond_andra on public.am_skyddsrond for update to authenticated using (public.ar_am_lasare()) with check (public.ar_am_lasare());
create policy am_skyddsrond_svar_las on public.am_skyddsrond_svar for select to authenticated using (public.ar_am_lasare());
create policy am_skyddsrond_svar_skapa on public.am_skyddsrond_svar for insert to authenticated with check (public.ar_am_lasare());
create policy am_skyddsrond_svar_andra on public.am_skyddsrond_svar for update to authenticated using (public.ar_am_lasare()) with check (public.ar_am_lasare());

revoke all on public.am_skyddsrond, public.am_skyddsrond_svar from anon;
revoke delete, truncate, trigger, references on public.am_skyddsrond, public.am_skyddsrond_svar from authenticated;
grant select, insert, update on public.am_skyddsrond, public.am_skyddsrond_svar to authenticated;
