-- Maskinen som maskin, del 1: grunden. Ofarlig för alla som inte är maskinkonton (ingen befintlig rad ändras).
--
-- * medarbetare.roll får ett tredje värde, 'maskin' (ett konto som sitter i en maskindator). Raden är aktiv = false, så den hamnar aldrig
--   i listor över förare, i schema_forare (som bara tittar på aktiva) eller i någon push till "aktiva medarbetare".
-- * maskin_konto: en rad per maskin. `aktiv` är brytaren (admin slår om i appen). Raden för H8 (R64428) läggs in PÅ — alla andra maskiner
--   saknar rad = av = exakt som i dag. Kontot (user_id / medarbetare_id) fylls i när admin lägger upp det i appen.
-- * ar_maskinkonto(): sant bara för en inloggad vars medarbetarrad har roll 'maskin'. Det är den som spärrarna i del 2 bygger på.
-- * maskin_konto_lage(): maskinkontots eget besked till appen (maskin och om brytaren är på). Alla andra får null.
-- * Koden: forare_maskinkod (hash + salt, aldrig läsbar), maskin_kod_las (felräknare / väntan per namn), maskin_upplasning_logg (vem
--   som låste upp vilken maskin när). INGEN av de tre går att nå från webbläsaren — bara servern (service_role) rör dem.

alter table public.medarbetare drop constraint if exists medarbetare_roll_check;
alter table public.medarbetare add constraint medarbetare_roll_check check (roll = any (array['forare'::text, 'admin'::text, 'maskin'::text]));

create or replace function public.ar_maskinkonto()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from medarbetare where user_id = auth.uid() and roll = 'maskin');
$$;
revoke all on function public.ar_maskinkonto() from public, anon;
grant execute on function public.ar_maskinkonto() to authenticated, service_role;

create table if not exists public.maskin_konto (
  maskin_id text primary key references public.dim_maskin(maskin_id),
  aktiv boolean not null default false,
  user_id uuid,
  medarbetare_id uuid references public.medarbetare(id) on delete set null,
  epost text,
  skapad timestamptz not null default now(),
  andrad timestamptz not null default now(),
  andrad_av uuid
);
alter table public.maskin_konto enable row level security;
grant select, insert, update, delete on public.maskin_konto to authenticated;
create policy maskin_konto_admin on public.maskin_konto for all to authenticated using (public.ar_admin()) with check (public.ar_admin());

-- H8 (Rottne R64428) är den enda maskinen som börjar PÅ. Finns inte maskinen i dim_maskin läggs ingenting in.
insert into public.maskin_konto (maskin_id, aktiv)
select maskin_id, true from public.dim_maskin where maskin_id = 'R64428'
on conflict (maskin_id) do nothing;

-- Maskinkontots eget besked. null för alla andra (förare, admin, ingen inloggad).
create or replace function public.maskin_konto_lage()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('maskin_id', m.maskin_id, 'aktiv', coalesce(k.aktiv, false))
  from medarbetare m
  left join maskin_konto k on k.maskin_id = m.maskin_id
  where m.user_id = auth.uid() and m.roll = 'maskin'
  limit 1;
$$;
revoke all on function public.maskin_konto_lage() from public, anon;
grant execute on function public.maskin_konto_lage() to authenticated, service_role;

-- Koden. Hash + salt (scrypt, peppar i servern) — koden i klartext finns aldrig i databasen.
create table if not exists public.forare_maskinkod (
  medarbetare_id uuid primary key references public.medarbetare(id) on delete cascade,
  kod_hash text not null,
  salt text not null,
  satt_at timestamptz not null default now(),
  satt_av uuid
);
alter table public.forare_maskinkod enable row level security;
revoke all on public.forare_maskinkod from anon, authenticated;

-- Fel kod i rad per namn (oberoende av maskin och enhet). Fem fel → en minuts väntan.
create table if not exists public.maskin_kod_las (
  medarbetare_id uuid primary key references public.medarbetare(id) on delete cascade,
  fel integer not null default 0,
  last_until timestamptz,
  senast timestamptz not null default now()
);
alter table public.maskin_kod_las enable row level security;
revoke all on public.maskin_kod_las from anon, authenticated;

create table if not exists public.maskin_upplasning_logg (
  id bigserial primary key,
  tid timestamptz not null default now(),
  maskin_id text,
  medarbetare_id uuid,
  utfall text not null check (utfall in ('upplast', 'fel_kod', 'last', 'ingen_kod', 'vantar', 'avslagen', 'las')),
  detalj text
);
alter table public.maskin_upplasning_logg enable row level security;
revoke all on public.maskin_upplasning_logg from anon, authenticated;
grant select on public.maskin_upplasning_logg to authenticated;
create policy maskin_upplasning_logg_admin on public.maskin_upplasning_logg for select to authenticated using (public.ar_admin());

-- Felräknaren. Anropas av servern FÖRE kontrollen av koden (räknar försöket direkt, så många parallella gissningar inte hinner före).
-- Returnerar (tillat, vantar_till). Det sjätte försöket i en period blockeras: fem fel → en minuts väntan.
create or replace function public.maskin_kod_forsok(p_med uuid)
returns table (tillat boolean, vantar_till timestamptz) language plpgsql security definer set search_path = public as $$
declare r maskin_kod_las;
begin
  insert into maskin_kod_las (medarbetare_id) values (p_med) on conflict (medarbetare_id) do nothing;
  select * into r from maskin_kod_las where medarbetare_id = p_med for update;
  if r.last_until is not null and r.last_until > now() then
    return query select false, r.last_until; return;
  end if;
  if r.last_until is not null then r.fel := 0; end if;           -- väntan är över: börja om
  if r.fel >= 5 then
    update maskin_kod_las set last_until = now() + interval '1 minute', fel = 0, senast = now() where medarbetare_id = p_med;
    return query select false, now() + interval '1 minute'; return;
  end if;
  update maskin_kod_las set fel = r.fel + 1, last_until = null, senast = now() where medarbetare_id = p_med;
  return query select true, null::timestamptz;
end $$;

-- Efter ett FEL svar: har det femte felet kommit sätts väntan direkt, så föraren ser den på samma svar.
create or replace function public.maskin_kod_fel(p_med uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare r maskin_kod_las;
begin
  select * into r from maskin_kod_las where medarbetare_id = p_med for update;
  if r.fel >= 5 then
    update maskin_kod_las set last_until = now() + interval '1 minute', fel = 0, senast = now() where medarbetare_id = p_med;
    return now() + interval '1 minute';
  end if;
  return null;
end $$;

create or replace function public.maskin_kod_ratt(p_med uuid)
returns void language sql security definer set search_path = public as $$
  update maskin_kod_las set fel = 0, last_until = null, senast = now() where medarbetare_id = p_med;
$$;

revoke all on function public.maskin_kod_forsok(uuid), public.maskin_kod_fel(uuid), public.maskin_kod_ratt(uuid) from public, anon, authenticated;
grant execute on function public.maskin_kod_forsok(uuid), public.maskin_kod_fel(uuid), public.maskin_kod_ratt(uuid) to service_role;
