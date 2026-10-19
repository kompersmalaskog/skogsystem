create or replace function skotar_avslut_berakna(p_objekt uuid) returns jsonb
language sql stable
set search_path = public
as $$ select skotar_avslut_berakna(p_objekt, '{}'::jsonb) $$;