-- Minimal dim_objekt för att köra migrationen 20261021150000_dim_objekt_special.sql lokalt.
create table public.dim_objekt (
  objekt_id text primary key,
  object_name text,
  vo_nummer text,
  exkludera boolean default false
);
insert into public.dim_objekt (objekt_id, object_name, vo_nummer) values
  ('11177558', 'Hushållningssällskapet', '11177558'),
  ('A110148_1', 'Vanligt objekt', '5555');
