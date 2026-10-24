-- Minimal databas för att köra migrationen 20261023175500_redigering_skriv_auto.sql lokalt.
-- Rensa-triggern är prod-versionen (läst 2026-10-23) så att migrationens ersättning provas mot det som står där.
do $$ begin
  create role anon; exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role; exception when duplicate_object then null; end $$;

create table public.dim_objekt (
  objekt_id text primary key, object_name text, vo_nummer text,
  huvudtyp text, avtalsform text, bolag text, skogsagare text, inkopare text, avverkningsform text,
  grot_anpassad boolean default false, risskotning boolean default false,
  auto_ifyllt jsonb not null default '{}'::jsonb
);
create table public.objekt (id uuid primary key default gen_random_uuid(), vo_nummer text, dim_objekt_id text, avtalsform text);

create or replace function public.dim_objekt_rensa_auto_ifyllt() returns trigger language plpgsql as $$
begin
  if current_setting('app.autofyll', true) = '1' then return new; end if;
  if new.skogsagare      is distinct from old.skogsagare      then new.auto_ifyllt := new.auto_ifyllt - 'skogsagare';      end if;
  if new.inkopare        is distinct from old.inkopare        then new.auto_ifyllt := new.auto_ifyllt - 'inkopare';        end if;
  if new.avverkningsform is distinct from old.avverkningsform then new.auto_ifyllt := new.auto_ifyllt - 'avverkningsform'; end if;
  if new.bolag           is distinct from old.bolag           then new.auto_ifyllt := new.auto_ifyllt - 'bolag';           end if;
  if new.grot_anpassad   is distinct from old.grot_anpassad   then new.auto_ifyllt := new.auto_ifyllt || '{"grot_anpassad":"manuell"}'::jsonb; end if;
  return new;
end; $$;
create trigger dim_objekt_rensa_auto_ifyllt before update of skogsagare, inkopare, avverkningsform, bolag, grot_anpassad
  on public.dim_objekt for each row execute function public.dim_objekt_rensa_auto_ifyllt();

insert into public.dim_objekt (objekt_id, object_name, vo_nummer, huvudtyp, avtalsform, bolag) values
  ('11166477', 'Mölleryd RP J-Hus -25', '11166477', null, null, null),
  ('11166477b', 'Mölleryd RP J-Hus -25', '11166477', null, '', null),
  ('11271860', 'Skälviken RP J-Hus -25', '11271860', 'Gallring', 'Au', 'Vida');
insert into public.objekt (vo_nummer, dim_objekt_id, avtalsform) values ('11166477', null, null), ('11271860', '11271860', 'Au');
