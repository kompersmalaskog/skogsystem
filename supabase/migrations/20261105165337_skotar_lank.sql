-- Länk för en EXTERN skotare (2026-11-05). Additiv: en ny tabell, två funktioner. Inget befintligt ändras.
--
--   objekt_skotar_lank  en länk (lång slumpad token) per objekt till skotarsidan /skotare/<token>: traktgränsen, skördarens körspår, produktionshögarna
--                       och planerarens markeringar — bara läsning, bara det objektet. Kan stängas av. Gäller inte för ett avslutat objekt (kontrolleras av servern).
--
-- Samma mönster som besökslänken (20261022170000_besok_pa_trakten): ingen anon-åtkomst, inga policies för authenticated (token når bara admin via funktionerna),
-- sidan läser via serverrutterna /api/skotare/<token>/* med service-klienten och lämnar ut exakt det sidan visar.

create table if not exists public.objekt_skotar_lank (
  objekt_id   uuid primary key references public.objekt(id) on delete cascade,
  token       text not null unique check (char_length(token) >= 32),
  aktiv       boolean not null default true,
  skapad_at   timestamptz not null default now(),
  skapad_av   uuid references public.medarbetare(id) on delete set null,
  avstangd_at timestamptz
);

alter table public.objekt_skotar_lank enable row level security;
revoke all on public.objekt_skotar_lank from anon, authenticated;

-- Hämta (och skapa första gången) länken. Bara admin. Token = 64 tecken ur två slumpade uuid (≈244 bitar).
create or replace function public.skotar_lank_hamta(p_objekt uuid)
returns table (token text, aktiv boolean)
language plpgsql security definer set search_path = public as $$
declare v_med uuid;
begin
  select m.id into v_med from public.medarbetare m where m.user_id = auth.uid() and m.roll = 'admin' limit 1;
  if v_med is null then raise exception 'Bara planerare kan hämta skotarlänken' using errcode = '42501'; end if;
  insert into public.objekt_skotar_lank (objekt_id, token, skapad_av)
  values (p_objekt, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), v_med)
  on conflict (objekt_id) do nothing;
  return query select l.token, l.aktiv from public.objekt_skotar_lank l where l.objekt_id = p_objekt;
end $$;

-- Slå på / stänga av länken. Bara admin.
create or replace function public.skotar_lank_satt_aktiv(p_objekt uuid, p_aktiv boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.medarbetare m where m.user_id = auth.uid() and m.roll = 'admin') then
    raise exception 'Bara planerare kan stänga av skotarlänken' using errcode = '42501';
  end if;
  update public.objekt_skotar_lank set aktiv = p_aktiv, avstangd_at = case when p_aktiv then null else now() end where objekt_id = p_objekt;
end $$;

revoke all on function public.skotar_lank_hamta(uuid), public.skotar_lank_satt_aktiv(uuid, boolean) from public, anon;
grant execute on function public.skotar_lank_hamta(uuid), public.skotar_lank_satt_aktiv(uuid, boolean) to authenticated;
