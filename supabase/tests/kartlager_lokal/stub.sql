do $$ begin create role authenticated; exception when duplicate_object then null; end $$; do $$ begin create role anon; exception when duplicate_object then null; end $$;
create schema auth;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table medarbetare (id uuid primary key default gen_random_uuid(), user_id uuid, namn text, aktiv boolean default true);
insert into medarbetare (user_id, namn) values ('11111111-1111-1111-1111-111111111111', 'A'), ('22222222-2222-2222-2222-222222222222', 'B');
