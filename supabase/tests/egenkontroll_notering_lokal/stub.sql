do $$ begin create role anon; exception when duplicate_object then null; end $$; do $$ begin create role authenticated; exception when duplicate_object then null; end $$; do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create table egenkontroll (id uuid primary key default gen_random_uuid(), status text not null default 'pagaende');
create table egenkontroll_foto (id uuid primary key default gen_random_uuid(), egenkontroll_id uuid not null references egenkontroll(id) on delete cascade);
