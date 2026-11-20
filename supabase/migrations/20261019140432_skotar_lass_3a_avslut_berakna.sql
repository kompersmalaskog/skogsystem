create or replace function skotar_avslut_berakna(p_objekt uuid) returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
  v_skordat jsonb;
  v_rapp jsonb;
  v_fakt jsonb := '{}'::jsonb;
  v_till jsonb := '{}'::jsonb;
  v_skillnad numeric := 0;
  k text;
  s numeric;
  r numeric;
begin
  select coalesce(jsonb_object_agg(nyckel, m3), '{}'::jsonb) into v_skordat from skotar_skordat(p_objekt);
  select coalesce(jsonb_object_agg(sortiment_nyckel, m3), '{}'::jsonb) into v_rapp
  from (
    select rs.sortiment_nyckel, sum(rs.m3_forare) as m3
    from skotar_lass l
    join skotar_lass_sortiment rs on rs.lass_id = l.id
    where l.objekt_id = p_objekt and l.status <> 'struket'
    group by rs.sortiment_nyckel
  ) x;
  for k in select jsonb_object_keys(v_skordat) union select jsonb_object_keys(v_rapp) loop
    s := coalesce((v_skordat ->> k)::numeric, 0);
    r := coalesce((v_rapp ->> k)::numeric, 0);
    if r > 0 then v_fakt := v_fakt || jsonb_build_object(k, s / r);
    elsif s > 0 then v_till := v_till || jsonb_build_object(k, s);
    end if;
    v_skillnad := v_skillnad + greatest(s - r, 0);
  end loop;
  return jsonb_build_object('skordat', v_skordat, 'rapporterat', v_rapp, 'faktorer', v_fakt, 'tillagg', v_till, 'skillnad_m3', v_skillnad);
end;
$$;
