create or replace function skotar_lass_rensa_delar(p_lass uuid) returns void
language plpgsql
set search_path = public
as $$
begin
  delete from skotar_lass_del where lass_id = p_lass;
end;
$$;
