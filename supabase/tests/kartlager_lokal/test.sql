\set ON_ERROR_STOP on
select set_config('test.uid','11111111-1111-1111-1111-111111111111',false);
select 'före: alla null' as steg, count(*) filter (where kartlager is null) as nulla, count(*) as totalt from medarbetare;
select satt_kartlager('lantmateriet') as ok_egen_rad;
select namn, kartlager from medarbetare order by namn;
-- okänt värde avvisas
do $$ begin begin perform satt_kartlager('hybrid'); raise exception 'FEL: hybrid accepterades'; exception when others then if sqlerrm like 'FEL:%' then raise; end if; raise notice 'hybrid avvisades: %', sqlerrm; end; end $$;
-- utan inloggning avvisas
select set_config('test.uid','',false);
do $$ begin begin perform satt_kartlager('osm'); raise exception 'FEL: utan inloggning accepterades'; exception when others then if sqlerrm like 'FEL:%' then raise; end if; raise notice 'utan inloggning avvisades: %', sqlerrm; end; end $$;
-- användare utan medarbetarrad: false, ingenting ändras
select set_config('test.uid','33333333-3333-3333-3333-333333333333',false);
select satt_kartlager('osm') as ok_utan_rad;
select namn, kartlager from medarbetare order by namn;
-- CHECK på kolumnen
do $$ begin begin update medarbetare set kartlager = 'hybrid'; raise exception 'FEL: CHECK släppte igenom'; exception when check_violation then raise notice 'CHECK avvisade hybrid'; end; end $$;
-- rättigheter
select has_function_privilege('anon', 'satt_kartlager(text)', 'execute') as anon_kan, has_function_privilege('authenticated', 'satt_kartlager(text)', 'execute') as auth_kan;
