-- "Avverkas – larma inte" på Vidas hänsynsyta (Martin 2026-10-29). Vidas hänsynsytor larmar alltid vid inkörning; när det avverkas inne i ytan (Skälviken, Hänsyn 6)
-- markerar planeraren ytan här och då larmar den inte. Vidas data ändras aldrig: raden pekar ut ytan med samma stabila nyckel som kommentarer och foton
-- (`hansyn:<LOPNR>` ur lib/vidaNycklar) och överlever en ny import från Vida.
--  - En rad per (objekt, yta). Raden finns = ytan avverkas, larma inte. Ta bort raden = larmar igen.
--  - Bara hänsynsytor (`hansyn:`) — nyckelbiotop och fornlämning går aldrig att tysta (CHECK).
--  - Alla inloggade läser. Bara admin får markera och ta bort. Vem och när sätts av servern.

create table if not exists public.objekt_yta_avverkas (
  objekt_id   uuid not null references public.objekt(id) on delete cascade,
  nyckel      text not null check (nyckel ~ '^hansyn:.+'),
  andrad_av   uuid references public.medarbetare(id) on delete set null,
  andrad_at   timestamptz not null default now(),
  primary key (objekt_id, nyckel)
);

create or replace function public.objekt_yta_avverkas_satt_tid()
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

create or replace trigger objekt_yta_avverkas_tid
  before insert or update on public.objekt_yta_avverkas
  for each row execute function public.objekt_yta_avverkas_satt_tid();

alter table public.objekt_yta_avverkas enable row level security;
create policy objekt_yta_avverkas_select on public.objekt_yta_avverkas for select to authenticated using (true);
create policy objekt_yta_avverkas_insert on public.objekt_yta_avverkas for insert to authenticated with check ((select public.ar_admin()));
create policy objekt_yta_avverkas_update on public.objekt_yta_avverkas for update to authenticated
  using ((select public.ar_admin())) with check ((select public.ar_admin()));
create policy objekt_yta_avverkas_delete on public.objekt_yta_avverkas for delete to authenticated using ((select public.ar_admin()));

comment on table public.objekt_yta_avverkas is 'Vidas hänsynsytor som planeraren markerat "Avverkas – larma inte" (per objekt och yta). Vidas egen data ändras aldrig.';
