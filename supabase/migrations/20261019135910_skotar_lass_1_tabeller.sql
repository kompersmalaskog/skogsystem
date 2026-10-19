create table if not exists skotar_lass (
  id             uuid primary key,
  objekt_id      uuid not null references objekt(id) on delete cascade,
  vo_nummer      text,
  maskin_id      text not null,
  medarbetare_id uuid,
  lass_nummer    integer not null,
  datum          date not null,
  status         text not null default 'foreslaget'
                 check (status in ('foreslaget', 'vantar_forare', 'bekraftat', 'struket')),
  bekraftad_av   text check (bekraftad_av in ('auto', 'forare')),
  bekraftad_tid  timestamptz,
  spar           jsonb not null default '[]'::jsonb,
  vagar          jsonb not null default '[]'::jsonb,
  skapad         timestamptz not null default now(),
  andrad         timestamptz not null default now(),
  mottagen       timestamptz not null default now()
);
create index if not exists skotar_lass_objekt_idx on skotar_lass (objekt_id, maskin_id, lass_nummer);
create index if not exists skotar_lass_vo_idx on skotar_lass (vo_nummer, datum);

create table if not exists skotar_lass_del (
  lass_id       uuid not null references skotar_lass(id) on delete cascade,
  del_nr        integer not null,
  avlagg_id     text,
  avlagg_nummer text,
  lossad_tid    timestamptz not null,
  lat           double precision not null,
  lng           double precision not null,
  primary key (lass_id, del_nr)
);
create index if not exists skotar_lass_del_avlagg_idx on skotar_lass_del (avlagg_id);

create table if not exists skotar_lass_sortiment (
  lass_id        uuid not null,
  del_nr         integer not null,
  sortiment_nyckel text not null,
  sortiment_namn text not null,
  m3_forare      numeric not null check (m3_forare >= 0),
  primary key (lass_id, del_nr, sortiment_nyckel),
  foreign key (lass_id, del_nr) references skotar_lass_del(lass_id, del_nr) on delete cascade
);

create table if not exists skotar_trakt_avslut (
  objekt_id    uuid primary key references objekt(id) on delete cascade,
  vo_nummer    text,
  avslutad_tid timestamptz not null default now(),
  avslutad_av  uuid,
  skordat      jsonb not null,
  rapporterat  jsonb not null,
  faktorer     jsonb not null,
  tillagg      jsonb not null,
  skillnad_m3  numeric not null
);

alter table skotar_lass enable row level security;
alter table skotar_lass_del enable row level security;
alter table skotar_lass_sortiment enable row level security;
alter table skotar_trakt_avslut enable row level security;

create policy skotar_lass_sel on skotar_lass for select to authenticated using (true);
create policy skotar_lass_ins on skotar_lass for insert to authenticated with check (true);
create policy skotar_lass_upd on skotar_lass for update to authenticated using (true) with check (true);
create policy skotar_lass_del_admin on skotar_lass for delete to authenticated using (ar_admin());

create policy skotar_lass_del_sel on skotar_lass_del for select to authenticated using (true);
create policy skotar_lass_del_ins on skotar_lass_del for insert to authenticated with check (true);
create policy skotar_lass_del_upd on skotar_lass_del for update to authenticated using (true) with check (true);
create policy skotar_lass_del_del on skotar_lass_del for delete to authenticated using (true);

create policy skotar_lass_sortiment_sel on skotar_lass_sortiment for select to authenticated using (true);
create policy skotar_lass_sortiment_ins on skotar_lass_sortiment for insert to authenticated with check (true);
create policy skotar_lass_sortiment_upd on skotar_lass_sortiment for update to authenticated using (true) with check (true);
create policy skotar_lass_sortiment_del on skotar_lass_sortiment for delete to authenticated using (true);

create policy skotar_trakt_avslut_sel on skotar_trakt_avslut for select to authenticated using (true);
