-- Klave och måttband — när kontrollerades de mot mallen? (Kalibrering › Läget, 2026-11-18)
--
-- Skogforsk: klaven ska kontrolleras mot en klavmall och måttbandet mot ett stålmåttband, annars jämförs maskinen mot
-- ett mätdon som själv mäter fel. En rad = "klave och måttband stämde" för en maskin, en viss dag.
--
-- Tid och vem sätts ALLTID av databasen (det klienten skickar ignoreras). Ingen ändring; en rad kan tas bort av den som
-- skrev den (Ångra) eller av admin. Alla med en medarbetarrad läser och skriver (förarna gör kontrollen i hytten).

create table if not exists public.kalibrering_matdon (
  id uuid primary key default gen_random_uuid(),
  maskin_id text not null,
  kontrollerad_at timestamptz not null default now(),
  kontrollerad_av uuid references public.medarbetare(id) on delete set null
);

create index if not exists kalibrering_matdon_maskin_tid on public.kalibrering_matdon (maskin_id, kontrollerad_at desc);

create or replace function public.kalibrering_matdon_fore_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.kontrollerad_at := now();
  new.kontrollerad_av := aktuell_medarbetare_id();
  return new;
end;
$$;

create or replace trigger a_kalibrering_matdon_fore_insert
  before insert on public.kalibrering_matdon
  for each row execute function public.kalibrering_matdon_fore_insert();

alter table public.kalibrering_matdon enable row level security;

create policy kalibrering_matdon_las on public.kalibrering_matdon
  for select to authenticated using (aktuell_medarbetare_id() is not null);

create policy kalibrering_matdon_skriv on public.kalibrering_matdon
  for insert to authenticated with check (aktuell_medarbetare_id() is not null);

create policy kalibrering_matdon_ta_bort on public.kalibrering_matdon
  for delete to authenticated using (kontrollerad_av = aktuell_medarbetare_id() or ar_admin());

revoke all on public.kalibrering_matdon from anon;
grant select, insert, delete on public.kalibrering_matdon to authenticated;
