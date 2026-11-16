\set ON_ERROR_STOP 1
grant select, insert, delete on public.larmplats_kontroll to authenticated;
set role authenticated;
select set_config('test.jag', '00000000-0000-0000-0000-00000000000d', false);
-- 1. Föraren svarar som sig själv; tiden sätts av databasen även om klienten skickar en annan.
insert into larmplats_kontroll (objekt_id, lat, lng, svar, medarbetare_id, skapad_at)
values ('00000000-0000-0000-0000-0000000000a1', 56.5, 14.7, 'ja', '00000000-0000-0000-0000-00000000000d', '2000-01-01');
do $$ begin
  if (select skapad_at from larmplats_kontroll limit 1) < now() - interval '1 minute' then raise exception 'FEL: klientens tid användes'; end if;
end $$;
-- 2. Som någon annan: nekas.
do $$ begin
  insert into larmplats_kontroll (objekt_id, lat, lng, svar, medarbetare_id) values ('00000000-0000-0000-0000-0000000000a1', 56.5, 14.7, 'ja', '00000000-0000-0000-0000-00000000000e');
  raise exception 'FEL: fick svara som någon annan';
exception when insufficient_privilege then null; end $$;
-- 3. Bara ja/nej.
do $$ begin
  insert into larmplats_kontroll (objekt_id, lat, lng, svar, medarbetare_id) values ('00000000-0000-0000-0000-0000000000a1', 56.5, 14.7, 'kanske', '00000000-0000-0000-0000-00000000000d');
  raise exception 'FEL: ogiltigt svar gick in';
exception when check_violation then null; end $$;
-- 4. Föraren kan inte ta bort (raden ligger kvar), admin kan.
delete from larmplats_kontroll;
do $$ begin if (select count(*) from larmplats_kontroll) <> 1 then raise exception 'FEL: föraren raderade'; end if; end $$;
select set_config('test.jag', '00000000-0000-0000-0000-00000000000e', false);
delete from larmplats_kontroll;
do $$ begin if (select count(*) from larmplats_kontroll) <> 0 then raise exception 'FEL: admin kunde inte radera'; end if; end $$;
reset role;
