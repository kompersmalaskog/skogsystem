\set ON_ERROR_STOP on
-- Återkallade rättigheter: efter 20261024100816_revoke_truncate_trigger_references.sql.
create function test.har(roll text, tabell text, rattighet text) returns boolean language sql as $$ select has_table_privilege(roll, tabell, rattighet) $$;

select test.forvanta(r || ' har inte ' || p || ' på ' || t, not test.har(r, 'public.' || t, p))
from unnest(array['anon', 'authenticated']) r, unnest(array['TRUNCATE', 'TRIGGER', 'REFERENCES']) p, unnest(array['grants_a', 'grants_b', 'grants_vy', 'medarbetare']) t;

-- det vanliga rörs inte
select test.forvanta(r || ' behåller ' || p || ' på grants_a', test.har(r, 'public.grants_a', p))
from unnest(array['anon', 'authenticated']) r, unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p;
select test.forvanta('service_role behåller TRUNCATE/TRIGGER/REFERENCES', test.har('service_role', 'public.grants_a', 'TRUNCATE') and test.har('service_role', 'public.grants_a', 'TRIGGER') and test.har('service_role', 'public.grants_a', 'REFERENCES'));

-- NYA tabeller får dem inte heller (default privileges)
create table public.grants_ny (id int);
select test.forvanta('ny tabell: anon/authenticated får varken TRUNCATE, TRIGGER eller REFERENCES', not (test.har('anon', 'public.grants_ny', 'TRUNCATE') or test.har('anon', 'public.grants_ny', 'TRIGGER') or test.har('anon', 'public.grants_ny', 'REFERENCES') or test.har('authenticated', 'public.grants_ny', 'TRUNCATE') or test.har('authenticated', 'public.grants_ny', 'TRIGGER') or test.har('authenticated', 'public.grants_ny', 'REFERENCES')));
select test.forvanta('ny tabell: SELECT/INSERT/UPDATE/DELETE kvar för authenticated (RLS styr)', test.har('authenticated', 'public.grants_ny', 'SELECT') and test.har('authenticated', 'public.grants_ny', 'DELETE'));
-- en förare kan inte längre TRUNCATE:a
select test.forvanta('authenticated: TRUNCATE nekas', test.som('f1', 'truncate public.grants_a') = 'fel:42501');
select test.forvanta('anon: TRUNCATE nekas',          test.som('anon', 'truncate public.grants_a') = 'fel:42501');
select 'GRANTS: allt grönt' as resultat;
