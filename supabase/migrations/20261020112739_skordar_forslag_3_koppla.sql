-- Ett tryck: koppla skördarens maskinobjekt (och övriga maskinobjekt med samma VO, t.ex. skotarens Opti-objekt) till jobbet som extra nummer.
-- Skördarens objekt blir också objekt.dim_objekt_id om det saknas. Bara ett förslag som foresla_skordarobjekt just nu ger går att koppla.
create or replace function koppla_skordarobjekt(p_objekt uuid, p_stam_objekt_id text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  r record;
  k record;
  antal integer := 0;
  rader integer;
begin
  if auth.uid() is null then raise exception 'Inte inloggad'; end if;
  if not exists (select 1 from foresla_skordarobjekt(p_objekt) f where f.stam_objekt_id = p_stam_objekt_id) then
    raise exception 'Förslaget gäller inte längre';
  end if;
  for r in
    select p_stam_objekt_id as sid
    union
    select d.objekt_id from dim_objekt d join objekt o on o.id = p_objekt
     where o.vo_nummer is not null and d.vo_nummer = o.vo_nummer and coalesce(d.exkludera, false) = false
  loop
    select * into k from skordar_alias_nyckel(r.sid);
    if k.nummer is null then continue; end if;
    insert into objekt_alt_nummer (objekt_id, nummer, maskin_id, kalla, skapad_av)
    values (p_objekt, k.nummer, k.maskin_id, 'manuell', auth.uid())
    on conflict do nothing;
    get diagnostics rader = row_count;
    antal := antal + rader;
  end loop;
  update objekt set dim_objekt_id = p_stam_objekt_id
   where id = p_objekt and dim_objekt_id is null
     and exists (select 1 from dim_objekt d where d.objekt_id = p_stam_objekt_id);
  return jsonb_build_object('alias', antal);
end;
$$;
revoke all on function koppla_skordarobjekt(uuid, text) from public, anon;
grant execute on function koppla_skordarobjekt(uuid, text) to authenticated;
