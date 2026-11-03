-- Årshjulet i arbetsmiljön (2026-11-03, efter Skogsentreprenörernas arbetsmiljöhjul): det som ska göras en gång om året.
-- Riskbedömningen och skyddsronden läses ur sina egna tabeller; det appen inte har någon vy för (arbetsplatsträffar,
-- psykosocial skyddsrond, kemikalierna, årlig uppföljning) bockas av här. En rad = gjort det året.
-- Admin och skyddsombud (ar_am_lasare) läser och bockar av; förare ser inget. Vem och när sätts av databasen.
-- Additivt: ny tabell, ingenting befintligt ändras.

create table if not exists public.am_arshjul_gjort (
  id          uuid primary key default gen_random_uuid(),
  ar          integer not null check (ar between 2026 and 2100),
  punkt       text not null check (punkt in ('apt_var', 'osa', 'kemikalier', 'apt_host', 'uppfoljning')),
  anteckning  text check (anteckning is null or length(anteckning) <= 500),
  gjord_tid   timestamptz not null default now(),
  gjord_av    uuid references public.medarbetare(id),
  unique (ar, punkt)
);

create or replace function public.am_arshjul_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.gjord_tid := now();
  new.gjord_av := public.aktuell_medarbetare_id();
  return new;
end $$;

create or replace trigger a_am_arshjul_vakt before insert or update on public.am_arshjul_gjort
  for each row execute function public.am_arshjul_vakt();

alter table public.am_arshjul_gjort enable row level security;

create policy am_arshjul_las on public.am_arshjul_gjort for select to authenticated using (public.ar_am_lasare());
create policy am_arshjul_skapa on public.am_arshjul_gjort for insert to authenticated with check (public.ar_am_lasare());
create policy am_arshjul_ta_bort on public.am_arshjul_gjort for delete to authenticated using (public.ar_am_lasare());

revoke all on public.am_arshjul_gjort from anon;
revoke update, truncate, trigger, references on public.am_arshjul_gjort from authenticated;
grant select, insert, delete on public.am_arshjul_gjort to authenticated;
