-- Farligt avfall (2026-11-03): anteckningen när vi lämnar farligt avfall (gamla hydraulslangar, oljiga trasor och absorbent, tomma
-- oljedunkar). Avfallsförordningen kräver att den som yrkesmässigt producerar farligt avfall antecknar vad, hur mycket, när och till vem,
-- och sparar det i minst tre år. Servicen gör maskinhandlarna (serviceavtal) — det som blir vårt är det vi byter själva.
--
-- Mottagaren kvitterar på förarens telefon: namn + underskrift med fingret, sparad i bucketen am-foton under förarens egen mapp
-- (<medarbetare>/avfall/…). En lämning sparas först när den är kvitterad och går aldrig att ändra eller radera (en liggare).
-- Vem som lämnade och när sätts av databasen. Mottagarna (LBC Ryd, Hydroscand …) läggs till av admin och skyddsombud.
-- Additivt: två nya tabeller, ingenting befintligt ändras.

create table if not exists public.am_avfall_mottagare (
  id            uuid primary key default gen_random_uuid(),
  namn          text not null check (length(btrim(namn)) between 1 and 80),
  aktiv         boolean not null default true,
  ordning       int not null default 100,
  skapad_tid    timestamptz not null default now(),
  skapad_av     uuid references public.medarbetare(id)
);

create table if not exists public.am_avfall_lamning (
  id                  uuid primary key,
  mottagare_id        uuid references public.am_avfall_mottagare(id),
  mottagare_namn      text not null check (length(btrim(mottagare_namn)) between 1 and 80),
  poster              jsonb not null check (jsonb_typeof(poster) = 'array' and jsonb_array_length(poster) between 1 and 10),
  kg                  numeric(6,1) not null check (kg > 0 and kg <= 2000),
  foljesedel_sokvag   text check (foljesedel_sokvag is null or length(foljesedel_sokvag) <= 300),
  kvitterad_namn      text not null check (length(btrim(kvitterad_namn)) between 1 and 80),
  underskrift_sokvag  text not null check (length(underskrift_sokvag) between 1 and 300),
  lamnad_tid          timestamptz not null default now(),
  lamnad_av           uuid references public.medarbetare(id),
  lamnad_av_namn      text
);

create index if not exists am_avfall_lamning_tid on public.am_avfall_lamning (lamnad_tid desc);

create or replace function public.am_avfall_mottagare_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.skapad_tid := now();
    new.skapad_av := public.aktuell_medarbetare_id();
  else
    new.skapad_tid := old.skapad_tid;
    new.skapad_av := old.skapad_av;
  end if;
  return new;
end $$;

create or replace trigger a_am_avfall_mottagare_vakt before insert or update on public.am_avfall_mottagare
  for each row execute function public.am_avfall_mottagare_vakt();

-- Vem och när: alltid databasen. Namnet sparas på raden (förare får inte läsa medarbetare).
create or replace function public.am_avfall_lamning_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.lamnad_tid := now();
  new.lamnad_av := public.aktuell_medarbetare_id();
  new.lamnad_av_namn := (select m.namn from public.medarbetare m where m.id = new.lamnad_av);
  return new;
end $$;

create or replace trigger a_am_avfall_lamning_vakt before insert on public.am_avfall_lamning
  for each row execute function public.am_avfall_lamning_vakt();

alter table public.am_avfall_mottagare enable row level security;
alter table public.am_avfall_lamning enable row level security;

create policy am_avfall_mottagare_las on public.am_avfall_mottagare for select to authenticated
  using (public.aktuell_medarbetare_id() is not null);
create policy am_avfall_mottagare_skapa on public.am_avfall_mottagare for insert to authenticated
  with check (public.ar_am_lasare());
create policy am_avfall_mottagare_andra on public.am_avfall_mottagare for update to authenticated
  using (public.ar_am_lasare()) with check (public.ar_am_lasare());

create policy am_avfall_lamning_las on public.am_avfall_lamning for select to authenticated
  using (public.aktuell_medarbetare_id() is not null);
create policy am_avfall_lamning_skapa on public.am_avfall_lamning for insert to authenticated
  with check (public.aktuell_medarbetare_id() is not null);

revoke all on public.am_avfall_mottagare from anon;
revoke all on public.am_avfall_lamning from anon;
revoke delete, truncate, trigger, references on public.am_avfall_mottagare from authenticated;
revoke update, delete, truncate, trigger, references on public.am_avfall_lamning from authenticated;
grant select, insert, update on public.am_avfall_mottagare to authenticated;
grant select, insert on public.am_avfall_lamning to authenticated;

-- Där vi lämnar idag (Martin 2026-11-03): LBC i Ryd, ibland Hydroscand.
insert into public.am_avfall_mottagare (namn, ordning)
select v.namn, v.ordning from (values ('LBC Ryd', 1), ('Hydroscand', 2)) as v(namn, ordning)
where not exists (select 1 from public.am_avfall_mottagare m where m.namn = v.namn);
