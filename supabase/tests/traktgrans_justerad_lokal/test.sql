\set ON_ERROR_STOP on
-- Den GAMLA vyn (migration 20261105111153) som facit för "ingen justerad rad = som förut".
create view public.objekt_traktgrans_gammal with (security_invoker = true) as
select g.objekt_id, jsonb_build_object('type','FeatureCollection','features', coalesce((
  select jsonb_agg(jsonb_build_object('type','Feature','geometry', f -> 'geometry','properties', jsonb_build_object('_lager', f -> 'properties' -> '_lager')))
  from jsonb_array_elements(g.geometri -> 'features') f where f -> 'properties' ->> '_lager' = 'L_TRAKTDEL'), '[]'::jsonb)) as geometri
from public.objekt_geometri g;
grant select on public.objekt_traktgrans_gammal to authenticated;

create or replace function pg_temp.ok(vad text, villkor boolean) returns void language plpgsql as $$ begin if villkor is not true then raise exception 'FEL: %', vad; end if; raise notice 'ok  %', vad; end $$;
create or replace function pg_temp.fel(vad text, sqlstate_vantat text, q text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then
    if sqlstate = sqlstate_vantat then raise notice 'ok  % (%)', vad, sqlstate; return; end if;
    raise exception 'FEL: % — fick % (%), väntade %', vad, sqlstate, sqlerrm, sqlstate_vantat;
  end;
  raise exception 'FEL: % — gick igenom', vad;
end $$;

select pg_temp.ok('vyn är security_invoker (objekt_geometris RLS gäller som förut: utgången session = tomma rader)', (select 'security_invoker=true' = any(reloptions) from pg_class where relname = 'objekt_traktgrans'));

-- 1. Ingen rad: BYTE FÖR BYTE som förut, för båda objekten.
select pg_temp.ok('utan justerad rad är vyn identisk med den gamla', not exists (
  select 1 from public.objekt_traktgrans n full join public.objekt_traktgrans_gammal o using (objekt_id) where n.geometri is distinct from o.geometri));
select pg_temp.ok('4 L_TRAKTDEL-features ur Vida (andra lager ska inte med)', (select jsonb_array_length(geometri -> 'features') from public.objekt_traktgrans where objekt_id = '00000000-0000-0000-0000-0000000000a1') = 4);

-- 2. RPC: förare nekas, admin går, orimligt/för litet nekas.
set role authenticated;
set test.jag = '00000000-0000-0000-0000-00000000000d';
select pg_temp.fel('förare får inte sätta justerad gräns', '42501', $q$ select public.satt_justerad_traktgrans('00000000-0000-0000-0000-0000000000a1', '[{"partKey":"100:0","ring":[[14.47,56.3],[14.472,56.3],[14.472,56.302]]}]') $q$);
select pg_temp.ok('authenticated har bara select på tabellen (ingen insert/update/delete-rättighet alls)', has_table_privilege('authenticated', 'public.objekt_traktgrans_justerad', 'select') and not has_table_privilege('authenticated', 'public.objekt_traktgrans_justerad', 'insert') and not has_table_privilege('authenticated', 'public.objekt_traktgrans_justerad', 'update') and not has_table_privilege('authenticated', 'public.objekt_traktgrans_justerad', 'delete'));
select pg_temp.fel('förare kan inte skriva direkt i tabellen', '42501', $q$ insert into public.objekt_traktgrans_justerad (objekt_id, delar) values ('00000000-0000-0000-0000-0000000000a1', '[{"partKey":"x","ring":[]}]') $q$);
set test.jag = '00000000-0000-0000-0000-00000000000e';
select pg_temp.fel('två hörn nekas', '22023', $q$ select public.satt_justerad_traktgrans('00000000-0000-0000-0000-0000000000a1', '[{"partKey":"100:0","ring":[[14.47,56.3],[14.472,56.3]]}]') $q$);
select pg_temp.fel('hörn utanför Sverige nekas', '22023', $q$ select public.satt_justerad_traktgrans('00000000-0000-0000-0000-0000000000a1', '[{"partKey":"100:0","ring":[[140.47,56.3],[14.472,56.3],[14.472,56.302]]}]') $q$);
select pg_temp.fel('del utan partKey nekas', '22023', $q$ select public.satt_justerad_traktgrans('00000000-0000-0000-0000-0000000000a1', '[{"ring":[[14.47,56.3],[14.472,56.3],[14.472,56.302]]}]') $q$);
select pg_temp.fel('anon får inte köra funktionen', '42501', $q$ set role anon; select public.satt_justerad_traktgrans('00000000-0000-0000-0000-0000000000a1', '[]') $q$);
reset role; set role authenticated; set test.jag = '00000000-0000-0000-0000-00000000000e';

-- 3. Admin sätter en justerad kopia av 100:0 (flyttat hörn) och 200:0 → de byts ut, 100:1 och delen utan nyckel och " 0777 " står kvar.
select public.satt_justerad_traktgrans('00000000-0000-0000-0000-0000000000a1',
  '[{"partKey":"100:0","ring":[[14.4701,56.3],[14.472,56.3],[14.4725,56.3021],[14.470,56.302]]},{"partKey":"200:0","ring":[[14.480,56.300],[14.482,56.300],[14.482,56.302]]}]'::jsonb);
select pg_temp.ok('rad skapad med admin som uppdaterad_av', (select uppdaterad_av from public.objekt_traktgrans_justerad) = '00000000-0000-0000-0000-00000000000e');
create temp table nu as select jsonb_array_elements(geometri -> 'features') f from public.objekt_traktgrans where objekt_id = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.ok('fortfarande 5 polygoner (3 Vida kvar + 2 justerade)', (select count(*) from nu) = 5);
select pg_temp.ok('alla är Polygon med bara _lager i properties', (select bool_and(f -> 'geometry' ->> 'type' = 'Polygon' and f -> 'properties' = '{"_lager":"L_TRAKTDEL"}'::jsonb) from nu));
select pg_temp.ok('Vidas 100:0 (14.470–14.472) är utbytt: ingen oförändrad kopia kvar', not exists (select 1 from nu where f -> 'geometry' -> 'coordinates' -> 0 -> 2 = '[14.472,56.302]'::jsonb and f -> 'geometry' -> 'coordinates' -> 0 -> 0 = '[14.470,56.300]'::jsonb));
select pg_temp.ok('Vidas 100:1 står kvar orörd', exists (select 1 from nu where f -> 'geometry' -> 'coordinates' -> 0 -> 0 = '[14.474,56.300]'::jsonb and jsonb_array_length(f -> 'geometry' -> 'coordinates' -> 0) = 5));
select pg_temp.ok('delen med " 0777 " (TRDEL_NR_K, trimmad) står kvar', exists (select 1 from nu where f -> 'geometry' -> 'coordinates' -> 0 -> 0 = '[14.490,56.300]'::jsonb));
select pg_temp.ok('delen utan nyckel står kvar', exists (select 1 from nu where f -> 'geometry' -> 'coordinates' -> 0 -> 0 = '[14.500,56.300]'::jsonb));
select pg_temp.ok('justerad 100:0 finns, sluten ring (första = sista, 5 punkter)', exists (select 1 from nu where f -> 'geometry' -> 'coordinates' -> 0 -> 0 = '[14.4701,56.3]'::jsonb and f -> 'geometry' -> 'coordinates' -> 0 -> 4 = '[14.4701,56.3]'::jsonb and jsonb_array_length(f -> 'geometry' -> 'coordinates' -> 0) = 5));
select pg_temp.ok('justerad 200:0 finns, sluten ring (4 punkter)', exists (select 1 from nu where f -> 'geometry' -> 'coordinates' -> 0 -> 0 = '[14.48,56.3]'::jsonb and jsonb_array_length(f -> 'geometry' -> 'coordinates' -> 0) = 4));
select pg_temp.ok('objekt a2 (utan rad) är orört', (select geometri from public.objekt_traktgrans where objekt_id = '00000000-0000-0000-0000-0000000000a2') = '{"type":"FeatureCollection","features":[]}'::jsonb);

-- 3b. Delen som bara har TRDEL_NR_K (" 0777 ", trimmad → 0777:0) byts ut när en kopia med den nyckeln finns; delen utan nyckel står alltid kvar.
select public.satt_justerad_traktgrans('00000000-0000-0000-0000-0000000000a1', '[{"partKey":"0777:0","ring":[[14.4905,56.3],[14.492,56.3],[14.492,56.302]]}]'::jsonb);
select pg_temp.ok('TRDEL_NR_K-delen (0777:0) är utbytt', not exists (select 1 from jsonb_array_elements((select geometri from public.objekt_traktgrans where objekt_id = '00000000-0000-0000-0000-0000000000a1') -> 'features') f where f -> 'geometry' -> 'coordinates' -> 0 -> 0 = '[14.490,56.300]'::jsonb) and exists (select 1 from jsonb_array_elements((select geometri from public.objekt_traktgrans where objekt_id = '00000000-0000-0000-0000-0000000000a1') -> 'features') f where f -> 'geometry' -> 'coordinates' -> 0 -> 0 = '[14.4905,56.3]'::jsonb));
select pg_temp.ok('alla andra delar (100:0, 100:1, 200:0, utan nyckel) står kvar orörda', (select count(*) from jsonb_array_elements((select geometri from public.objekt_traktgrans where objekt_id = '00000000-0000-0000-0000-0000000000a1') -> 'features')) = 5);

-- 4. Ny anrop ersätter (upsert) och en tom lista tar bort raden → Vidas gräns gäller igen (identiskt med gamla vyn).
select public.satt_justerad_traktgrans('00000000-0000-0000-0000-0000000000a1', '[{"partKey":"100:0","ring":[[14.47,56.3],[14.472,56.3],[14.472,56.302]]}]'::jsonb);
select pg_temp.ok('upsert: en rad, en justerad del', (select count(*) from public.objekt_traktgrans_justerad) = 1 and (select jsonb_array_length(delar) from public.objekt_traktgrans_justerad) = 1);
select public.satt_justerad_traktgrans('00000000-0000-0000-0000-0000000000a1', '[]'::jsonb);
select pg_temp.ok('tom lista tar bort raden', (select count(*) from public.objekt_traktgrans_justerad) = 0);
select pg_temp.ok('efter radera: vyn är identisk med den gamla igen', not exists (
  select 1 from public.objekt_traktgrans n full join public.objekt_traktgrans_gammal o using (objekt_id) where n.geometri is distinct from o.geometri));

-- 5. Anon ser inget; inloggad läser vyn.
reset role; set role anon;
select pg_temp.fel('anon kan inte läsa vyn', '42501', $q$ select * from public.objekt_traktgrans $q$);
reset role;
select 'ALLA KONTROLLER OK';
