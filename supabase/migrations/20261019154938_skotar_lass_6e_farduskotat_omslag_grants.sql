create or replace function skotar_farduskotat(p_objekt uuid) returns jsonb
language sql
set search_path = public
as $$ select skotar_farduskotat(p_objekt, '{}'::jsonb) $$;

revoke execute on function skotar_avslut_berakna(uuid, jsonb) from public, anon, authenticated;
revoke execute on function skotar_farduskotat(uuid, jsonb) from public, anon;
grant execute on function skotar_farduskotat(uuid, jsonb) to authenticated;