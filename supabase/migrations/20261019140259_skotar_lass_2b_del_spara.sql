create or replace function skotar_lass_del_spara(p_lass uuid, d jsonb) returns void
language plpgsql
set search_path = public
as $$
declare
  r jsonb;
begin
  insert into skotar_lass_del (lass_id, del_nr, avlagg_id, avlagg_nummer, lossad_tid, lat, lng)
  values (p_lass, (d ->> 'del_nr')::int, nullif(d ->> 'avlagg_id', ''), nullif(d ->> 'avlagg_nummer', ''),
          (d ->> 'lossad_tid')::timestamptz, (d ->> 'lat')::double precision, (d ->> 'lng')::double precision);
  for r in select * from jsonb_array_elements(coalesce(d -> 'rader', '[]'::jsonb)) loop
    insert into skotar_lass_sortiment (lass_id, del_nr, sortiment_nyckel, sortiment_namn, m3_forare)
    values (p_lass, (d ->> 'del_nr')::int, r ->> 'nyckel', r ->> 'namn', (r ->> 'm3')::numeric)
    on conflict (lass_id, del_nr, sortiment_nyckel) do update set m3_forare = skotar_lass_sortiment.m3_forare + excluded.m3_forare;
  end loop;
end;
$$;
