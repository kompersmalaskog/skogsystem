-- Inventarier: var finns saker, och vad behöver beställas.
-- Gamla lager_artiklar/lager_transaktioner lämnas orörda.

create table public.inventarie_plats (
  id uuid primary key default gen_random_uuid(),
  namn text not null,
  typ text not null check (typ in ('hall','verkstad','bil','skap')),
  maskin_id text references public.dim_maskin(maskin_id),
  ansvarig_medarbetare_id uuid references public.medarbetare(id),
  senast_kollad timestamptz,
  senast_kollad_av uuid references public.medarbetare(id),
  ordning int not null default 0,
  aktiv boolean not null default true,
  skapad timestamptz not null default now()
);
comment on table public.inventarie_plats is 'Där saker ligger: maskinhallen, verkstad (LBC Ryd), bilar, depåskåp. maskin_id = skotaren skåpet följer. ansvarig = den som kör bilen och håller listan. senast_kollad sätts när någon tryckt Stämmer – visas så att gamla listor syns som gamla.';

create table public.inventarie_artikel (
  id uuid primary key default gen_random_uuid(),
  namn text not null,
  typ text not null check (typ in ('forbrukning','utrustning')),
  enhet text not null default 'st',
  leverantor text,
  artikelnr text,
  anteckning text,
  aktiv boolean not null default true,
  skapad timestamptz not null default now()
);
comment on table public.inventarie_artikel is 'forbrukning = räknas, har minnivå, kan ta slut (sågkedjor, olja). utrustning = bara var den finns, inget antal (mutterknackare).';

create table public.inventarie_rad (
  id uuid primary key default gen_random_uuid(),
  artikel_id uuid not null references public.inventarie_artikel(id) on delete cascade,
  plats_id uuid not null references public.inventarie_plats(id) on delete cascade,
  hylla text,
  antal int check (antal is null or antal >= 0),
  min_antal int check (min_antal is null or min_antal >= 0),
  bestalld_tid timestamptz,
  uppdaterad timestamptz not null default now(),
  unique (artikel_id, plats_id)
);
comment on table public.inventarie_rad is 'En artikel på en plats. id är det som står i QR-koden (/i/<id>) – ta aldrig bort och återskapa en rad som har etikett. antal NULL = utrustning (finns här). Under minnivå = att beställa, tills bestalld_tid sätts.';

create table public.inventarie_logg (
  id bigint generated always as identity primary key,
  rad_id uuid references public.inventarie_rad(id) on delete set null,
  artikel_id uuid references public.inventarie_artikel(id) on delete set null,
  plats_id uuid references public.inventarie_plats(id) on delete set null,
  handelse text not null check (handelse in ('uttag','pafyllning','justering','flytt','bestalld','kommit_in','skapad','borttagen','kollad')),
  andring int,
  antal_efter int,
  till_plats_id uuid references public.inventarie_plats(id) on delete set null,
  medarbetare_id uuid references public.medarbetare(id),
  tid timestamptz not null default now()
);
comment on table public.inventarie_logg is 'Varje ändring, vem och när. Skrivs av RPC:erna, aldrig direkt av skärmen. Grund för förbrukningstakt och föreslagen minnivå senare.';

create index on public.inventarie_rad (plats_id);
create index on public.inventarie_logg (rad_id, tid desc);
create index on public.inventarie_logg (artikel_id, tid desc);

-- RLS: alla inloggade läser och skriver (litet lag, samma som egenkontroll). Ta bort platser/artiklar = admin.
alter table public.inventarie_plats enable row level security;
alter table public.inventarie_artikel enable row level security;
alter table public.inventarie_rad enable row level security;
alter table public.inventarie_logg enable row level security;

create policy inventarie_plats_las on public.inventarie_plats for select to authenticated using (true);
create policy inventarie_plats_skriv on public.inventarie_plats for insert to authenticated with check (true);
create policy inventarie_plats_andra on public.inventarie_plats for update to authenticated using (true) with check (true);
create policy inventarie_plats_ta_bort on public.inventarie_plats for delete to authenticated using (ar_admin());

create policy inventarie_artikel_las on public.inventarie_artikel for select to authenticated using (true);
create policy inventarie_artikel_skriv on public.inventarie_artikel for insert to authenticated with check (true);
create policy inventarie_artikel_andra on public.inventarie_artikel for update to authenticated using (true) with check (true);
create policy inventarie_artikel_ta_bort on public.inventarie_artikel for delete to authenticated using (ar_admin());

create policy inventarie_rad_all on public.inventarie_rad for all to authenticated using (true) with check (true);
create policy inventarie_logg_las on public.inventarie_logg for select to authenticated using (true);
-- ingen insert-policy på loggen: bara RPC:erna (security definer) skriver.

-- Att beställa: förbrukning i hallen/verkstad under minnivå.
create view public.vy_inventarie_att_bestalla with (security_invoker = true) as
select r.id as rad_id, a.id as artikel_id, a.namn, a.enhet, a.leverantor, a.artikelnr,
       p.id as plats_id, p.namn as plats, r.hylla, r.antal, r.min_antal, r.bestalld_tid,
       (r.bestalld_tid is not null) as ar_bestalld
from public.inventarie_rad r
join public.inventarie_artikel a on a.id = r.artikel_id and a.aktiv
join public.inventarie_plats p on p.id = r.plats_id and p.aktiv
where a.typ = 'forbrukning'
  and r.antal is not null and r.min_antal is not null
  and r.antal < r.min_antal;

-- Ta ut (QR: "Tog 1"). Går aldrig under 0. Returnerar antal kvar.
create function public.inventarie_ta_ut(p_rad_id uuid, p_antal int default 1)
returns int language plpgsql security definer set search_path = public as $$
declare v_efter int; v_rad inventarie_rad;
begin
  if auth.uid() is null then raise exception 'Logga in för att ta ut'; end if;
  if p_antal < 1 then raise exception 'Antal måste vara minst 1'; end if;
  update inventarie_rad set antal = greatest(coalesce(antal,0) - p_antal, 0), uppdaterad = now()
   where id = p_rad_id returning * into v_rad;
  if not found then raise exception 'Etiketten pekar inte på någon artikel längre'; end if;
  v_efter := v_rad.antal;
  insert into inventarie_logg (rad_id, artikel_id, plats_id, handelse, andring, antal_efter, medarbetare_id)
  values (v_rad.id, v_rad.artikel_id, v_rad.plats_id, 'uttag', -p_antal, v_efter, korvy_min_medarbetare());
  return v_efter;
end $$;

-- Kommit in / fyll på: lägger till och nollar beställd.
create function public.inventarie_kommit_in(p_rad_id uuid, p_antal int)
returns int language plpgsql security definer set search_path = public as $$
declare v_rad inventarie_rad;
begin
  if auth.uid() is null then raise exception 'Logga in först'; end if;
  if p_antal < 1 then raise exception 'Antal måste vara minst 1'; end if;
  update inventarie_rad set antal = coalesce(antal,0) + p_antal, bestalld_tid = null, uppdaterad = now()
   where id = p_rad_id returning * into v_rad;
  if not found then raise exception 'Raden finns inte'; end if;
  insert into inventarie_logg (rad_id, artikel_id, plats_id, handelse, andring, antal_efter, medarbetare_id)
  values (v_rad.id, v_rad.artikel_id, v_rad.plats_id, 'kommit_in', p_antal, v_rad.antal, korvy_min_medarbetare());
  return v_rad.antal;
end $$;

-- Rätta antal efter räkning.
create function public.inventarie_justera(p_rad_id uuid, p_nytt_antal int)
returns int language plpgsql security definer set search_path = public as $$
declare v_fore int; v_rad inventarie_rad;
begin
  if auth.uid() is null then raise exception 'Logga in först'; end if;
  if p_nytt_antal < 0 then raise exception 'Antal kan inte vara negativt'; end if;
  select antal into v_fore from inventarie_rad where id = p_rad_id;
  update inventarie_rad set antal = p_nytt_antal, uppdaterad = now() where id = p_rad_id returning * into v_rad;
  if not found then raise exception 'Raden finns inte'; end if;
  insert into inventarie_logg (rad_id, artikel_id, plats_id, handelse, andring, antal_efter, medarbetare_id)
  values (v_rad.id, v_rad.artikel_id, v_rad.plats_id, 'justering', p_nytt_antal - coalesce(v_fore,0), p_nytt_antal, korvy_min_medarbetare());
  return p_nytt_antal;
end $$;

-- Markera beställd (eller ångra med p_bestalld = false).
create function public.inventarie_markera_bestalld(p_rad_id uuid, p_bestalld boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare v_rad inventarie_rad;
begin
  if auth.uid() is null then raise exception 'Logga in först'; end if;
  update inventarie_rad set bestalld_tid = case when p_bestalld then now() else null end, uppdaterad = now()
   where id = p_rad_id returning * into v_rad;
  if not found then raise exception 'Raden finns inte'; end if;
  if p_bestalld then
    insert into inventarie_logg (rad_id, artikel_id, plats_id, handelse, antal_efter, medarbetare_id)
    values (v_rad.id, v_rad.artikel_id, v_rad.plats_id, 'bestalld', v_rad.antal, korvy_min_medarbetare());
  end if;
end $$;

-- Flytta (utrustning mellan bil/skåp/hall). Finns artikeln redan på målplatsen slås raderna ihop.
create function public.inventarie_flytta(p_rad_id uuid, p_till_plats_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_rad inventarie_rad; v_mal uuid;
begin
  if auth.uid() is null then raise exception 'Logga in först'; end if;
  select * into v_rad from inventarie_rad where id = p_rad_id for update;
  if not found then raise exception 'Raden finns inte'; end if;
  if v_rad.plats_id = p_till_plats_id then return v_rad.id; end if;
  select id into v_mal from inventarie_rad where artikel_id = v_rad.artikel_id and plats_id = p_till_plats_id;
  if v_mal is null then
    update inventarie_rad set plats_id = p_till_plats_id, hylla = null, uppdaterad = now() where id = p_rad_id;
    v_mal := p_rad_id;
  else
    update inventarie_rad set antal = case when antal is null and v_rad.antal is null then null
                                          else coalesce(antal,0) + coalesce(v_rad.antal,0) end,
                              uppdaterad = now() where id = v_mal;
    delete from inventarie_rad where id = p_rad_id;
  end if;
  insert into inventarie_logg (rad_id, artikel_id, plats_id, handelse, andring, till_plats_id, medarbetare_id)
  values (v_mal, v_rad.artikel_id, v_rad.plats_id, 'flytt', v_rad.antal, p_till_plats_id, korvy_min_medarbetare());
  return v_mal;
end $$;

-- "Stämmer" på en plats.
create function public.inventarie_plats_kollad(p_plats_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Logga in först'; end if;
  update inventarie_plats set senast_kollad = now(), senast_kollad_av = korvy_min_medarbetare() where id = p_plats_id;
  if not found then raise exception 'Platsen finns inte'; end if;
  insert into inventarie_logg (plats_id, handelse, medarbetare_id) values (p_plats_id, 'kollad', korvy_min_medarbetare());
end $$;

revoke all on function public.inventarie_ta_ut(uuid,int), public.inventarie_kommit_in(uuid,int), public.inventarie_justera(uuid,int),
  public.inventarie_markera_bestalld(uuid,boolean), public.inventarie_flytta(uuid,uuid), public.inventarie_plats_kollad(uuid) from public, anon;
grant execute on function public.inventarie_ta_ut(uuid,int), public.inventarie_kommit_in(uuid,int), public.inventarie_justera(uuid,int),
  public.inventarie_markera_bestalld(uuid,boolean), public.inventarie_flytta(uuid,uuid), public.inventarie_plats_kollad(uuid) to authenticated;

insert into public.inventarie_plats (namn, typ, ordning) values
  ('Maskinhallen', 'hall', 1),
  ('LBC Ryd', 'verkstad', 2);
