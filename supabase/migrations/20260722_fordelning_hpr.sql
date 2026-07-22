-- Fördelningsuppföljning — Supabase-schema
-- Designat för att hpr-filer är KUMULATIVA per objekt: nästa fil på samma
-- trakt innehåller samma stockar igen. Dedupe sker via unik nyckel på
-- (object_key, stem_key, log_key) med upsert — inte via filhash.

create table hpr_files (
  id uuid primary key default gen_random_uuid(),
  file_hash text not null unique,          -- stoppa exakt samma fil två gånger
  storage_path text not null,              -- rådatan i Supabase Storage, alltid sparad
  object_key text not null,
  object_name text,
  machine_key text,
  creation_date timestamptz,
  log_count int,
  validation jsonb not null,               -- errors/warnings från parsern
  imported_at timestamptz not null default now()
);

create table harvest_objects (
  object_key text primary key,
  object_name text,
  status text not null default 'active' check (status in ('active','completed')),
  completed_at timestamptz,
  last_file_at timestamptz                 -- för "inga filer på 5 dagar"-påminnelsen
);

create table products (
  id uuid primary key default gen_random_uuid(),
  object_key text not null references harvest_objects(object_key),
  product_key text not null,               -- nyckel INOM objektet, inte globalt
  name text,
  product_group text,                      -- Timmer/Massa/Kubb/Energi
  species_group_key text,
  dia_class_category text,                 -- 'Top' etc
  diameter_under_bark boolean not null default false,
  dia_limits int[] not null default '{}',  -- undre gränser mm, sorterade
  dia_max int,
  len_limits int[] not null default '{}',  -- undre gränser cm, sorterade
  len_max int,
  distribution_allowed boolean not null default false,
  distribution_category text,              -- 'Volume of logs' | 'Number of logs'
  max_deviation numeric,                   -- grönt-tröskeln, läst ur filen
  unique (object_key, product_key)
);

create table matrix_cells (
  product_id uuid not null references products(id) on delete cascade,
  dia_lower int not null,
  len_lower int not null,
  price numeric not null default 0,
  distribution numeric not null default 0, -- mål-% inom diameterraden
  limitation numeric not null default 0,
  bucking_criteria text,
  primary key (product_id, dia_lower, len_lower)
);

create table logs (
  object_key text not null references harvest_objects(object_key),
  stem_key text not null,
  log_key text not null,
  product_key text not null,
  harvest_date timestamptz,
  length_cm int not null,
  dia_top_ob_mm int,
  dia_top_ub_mm int,
  vol_price_m3 numeric,
  vol_sob_m3 numeric,
  vol_sub_m3 numeric,
  cutting_reason text not null default 'Unknown',
  source_file_id uuid references hpr_files(id),
  primary key (object_key, stem_key, log_key)  -- dedupe: upsert på denna
);

create index logs_object_product on logs (object_key, product_key);

-- Historik: spara slutresultatet så 87,7 % får ett sammanhang över tid
create table distribution_snapshots (
  id uuid primary key default gen_random_uuid(),
  object_key text not null references harvest_objects(object_key),
  product_key text not null,
  computed_at timestamptz not null default now(),
  is_final boolean not null default false, -- true när objektet markerats avslutat
  grade_total_pct numeric,
  grade_automatic_pct numeric,
  forced_cut_share_pct numeric,
  log_count int,
  total_volume_m3 numeric
);

-- === RLS (tillägg utöver ursprungliga schema.sql — flaggat i återrapporteringen) ===
-- Skrivningar sker enbart via service-role i /api/hpr-import (bypassar RLS).
-- Inloggade användare får läsa; anon får ingenting.
alter table hpr_files enable row level security;
alter table harvest_objects enable row level security;
alter table products enable row level security;
alter table matrix_cells enable row level security;
alter table logs enable row level security;
alter table distribution_snapshots enable row level security;

create policy "authenticated_read_hpr_files" on hpr_files for select to authenticated using (true);
create policy "authenticated_read_harvest_objects" on harvest_objects for select to authenticated using (true);
create policy "authenticated_read_products" on products for select to authenticated using (true);
create policy "authenticated_read_matrix_cells" on matrix_cells for select to authenticated using (true);
create policy "authenticated_read_logs" on logs for select to authenticated using (true);
create policy "authenticated_read_distribution_snapshots" on distribution_snapshots for select to authenticated using (true);
