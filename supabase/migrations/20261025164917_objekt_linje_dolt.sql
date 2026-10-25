-- Redigera linjer (Martin 2026-10-25): Vidas linjer går att sudda i appen, men Vidas data ändras ALDRIG. Det som suddas sparas här som "dolt" per objekt och
-- linje och läggs över Vidas geometri när kartan ritas. Det överlever en ny import från Vida (objekt_geometri skrivs över, den här tabellen rörs inte) eftersom
-- linjen pekas ut med samma stabila nyckel som kommentarer och foton (`linje:<hash>` ur lib/vidaNycklar) och sträckan anges i METER längs Vidas linje.
--  - En rad per (objekt, linje). `intervall` = jsonb-lista av [från, till] i meter från linjens början, sorterade och utan överlapp. Ingen rad = inget dolt.
--  - Att ta tillbaka det dolda = att ta bort raden (eller korta ner listan). Inget raderas ur Vidas data.
--  - Alla inloggade läser. Bara admin får dölja och ta tillbaka (insert/update/delete, Martin 2026-10-25). Vem och när sätts av servern.
--  - Traktgränsen och Vidas kraftledning går aldrig att dölja — det vaktas i appen (lib/vidaDolt.ts), inte här.

create table if not exists public.objekt_linje_dolt (
  objekt_id   uuid not null references public.objekt(id) on delete cascade,
  nyckel      text not null check (length(btrim(nyckel)) > 0),
  intervall   jsonb not null default '[]'::jsonb check (jsonb_typeof(intervall) = 'array'),
  andrad_av   uuid references public.medarbetare(id) on delete set null,
  andrad_at   timestamptz not null default now(),
  primary key (objekt_id, nyckel)
);

create or replace function public.objekt_linje_dolt_satt_tid()
returns trigger
language plpgsql
as $$
begin
  new.andrad_at := now();
  new.andrad_av := public.korvy_min_medarbetare();
  if tg_op = 'UPDATE' then
    new.objekt_id := old.objekt_id;
    new.nyckel    := old.nyckel;
  end if;
  return new;
end
$$;

create or replace trigger objekt_linje_dolt_tid
  before insert or update on public.objekt_linje_dolt
  for each row execute function public.objekt_linje_dolt_satt_tid();

alter table public.objekt_linje_dolt enable row level security;
create policy objekt_linje_dolt_select on public.objekt_linje_dolt for select to authenticated using (true);
create policy objekt_linje_dolt_insert on public.objekt_linje_dolt for insert to authenticated with check ((select public.ar_admin()));
create policy objekt_linje_dolt_update on public.objekt_linje_dolt for update to authenticated
  using ((select public.ar_admin())) with check ((select public.ar_admin()));
create policy objekt_linje_dolt_delete on public.objekt_linje_dolt for delete to authenticated using ((select public.ar_admin()));

comment on table public.objekt_linje_dolt is 'Delar av Vidas linjer som dolts i appen (per objekt och linje, meter längs Vidas linje). Vidas egen geometri ändras aldrig.';
