-- Personal › Mat (2026-11-01, Martin: "om någon är laktos, så man kommer ihåg det när man beställer mat på en utbildning").
--
-- Vad den anställde vill att vi tänker på när vi beställer mat ("laktosfri", "vegetarian"). Fri text, valfri, och
-- FYLLS I AV PERSONEN SJÄLV: det kan vara en hälsouppgift, och då är det personens eget frivilliga val att lämna den,
-- inte ett register som admin för. Aldrig en "saknas"-rad — det kan inte saknas något här.
--
-- Egen tabell, inte en kolumn på medarbetare: medarbetare läses av alla inloggade (namn, maskin), och en kolumn där
-- hade gått att läsa för varje kollega via REST. Här ser BARA personen själv och admin raden (RLS).
--   • Personen själv: läser, skriver och tar bort sin egen rad.
--   • Admin: läser alla (sammanställningen "Mat att tänka på"), skriver alla.
--   • Vem och när sätts av databasen.
-- Appen skriver via /api/personal/[id] med service-nyckeln efter samma kontroll (egen rad eller admin); RLS är spärren
-- om någon går förbi appen.

create table if not exists public.medarbetare_mat (
  medarbetare_id uuid primary key references public.medarbetare(id) on delete cascade,
  mat text not null check (length(btrim(mat)) between 1 and 200),
  andrad_at timestamptz not null default now(),
  andrad_av uuid
);

alter table public.medarbetare_mat enable row level security;

drop policy if exists medarbetare_mat_las on public.medarbetare_mat;
create policy medarbetare_mat_las on public.medarbetare_mat
  for select to authenticated
  using (medarbetare_id = public.aktuell_medarbetare_id() or public.ar_admin());

drop policy if exists medarbetare_mat_skapa on public.medarbetare_mat;
create policy medarbetare_mat_skapa on public.medarbetare_mat
  for insert to authenticated
  with check (medarbetare_id = public.aktuell_medarbetare_id() or public.ar_admin());

drop policy if exists medarbetare_mat_andra on public.medarbetare_mat;
create policy medarbetare_mat_andra on public.medarbetare_mat
  for update to authenticated
  using (medarbetare_id = public.aktuell_medarbetare_id() or public.ar_admin())
  with check (medarbetare_id = public.aktuell_medarbetare_id() or public.ar_admin());

drop policy if exists medarbetare_mat_radera on public.medarbetare_mat;
create policy medarbetare_mat_radera on public.medarbetare_mat
  for delete to authenticated
  using (medarbetare_id = public.aktuell_medarbetare_id() or public.ar_admin());

revoke all on public.medarbetare_mat from anon;
revoke truncate, trigger, references on public.medarbetare_mat from authenticated;

create or replace function public.medarbetare_mat_stampla()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.andrad_at := now();
  -- Från webbläsaren avgör sessionen vem; servern (service-nyckeln, efter sin egen behörighetskontroll) anger själv.
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    new.andrad_av := public.aktuell_medarbetare_id();
  end if;
  return new;
end;
$$;

create or replace trigger medarbetare_mat_stampla
  before insert or update on public.medarbetare_mat
  for each row execute function public.medarbetare_mat_stampla();
