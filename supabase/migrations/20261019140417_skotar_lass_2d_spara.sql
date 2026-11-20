create or replace function skotar_lass_spara(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  l jsonb := p -> 'lass';
  d jsonb;
  v_id uuid := (l ->> 'id')::uuid;
  v_andrad timestamptz := coalesce((l ->> 'andrad')::timestamptz, now());
  v_nu timestamptz;
begin
  if v_id is null then raise exception 'lass.id saknas'; end if;
  select andrad into v_nu from skotar_lass where id = v_id;
  if v_nu is not null and v_nu > v_andrad then
    return jsonb_build_object('sparad', false, 'skal', 'nyare_finns');
  end if;
  perform skotar_lass_rad_spara(v_id, l);
  perform skotar_lass_rensa_delar(v_id);
  for d in select * from jsonb_array_elements(coalesce(p -> 'delar', '[]'::jsonb)) loop
    perform skotar_lass_del_spara(v_id, d);
  end loop;
  return jsonb_build_object('sparad', true);
end;
$$;
