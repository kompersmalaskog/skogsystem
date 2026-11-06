-- Del 4: "Inte klar – fortsätt" (planeraren, i objektets Mer). Tar bort appens klar på skotningen (och skördningen om appen satte
-- den), sätter "inte klar" och status pagaende. När en maskin kört här igen släpper objekt_status_ur_maskindata spärren.
create or replace function public.objekt_fortsatt(p_objekt uuid) returns text
language plpgsql security definer set search_path to 'public' as $f$
declare v_ids text[];
begin
  if not ar_admin() then raise exception 'Bara planeraren kan fortsätta ett objekt' using errcode = '42501'; end if;
  select b.ids into v_ids from avslut_ur_maskindata_berakna() b where b.gkey = p_objekt::text;
  if v_ids is null then
    select array_agg(x.objekt_id) into v_ids from dim_objekt x join objekt o on o.id = p_objekt
     where x.objekt_id = o.dim_objekt_id or (coalesce(o.vo_nummer, '') <> '' and x.vo_nummer = o.vo_nummer);
  end if;
  update dim_objekt x set skordning_avslutad = null, skordning_avslutad_auto = false, skordning_auto_skal = null, skordning_ej_klar = true
   where x.objekt_id = any (coalesce(v_ids, '{}')) and x.skordning_auto_skal is not null;
  update dim_objekt x set skotning_avslutad = null, skotning_avslutad_auto = false, skotning_auto_skal = null, skotning_ej_klar = true
   where x.objekt_id = any (coalesce(v_ids, '{}'));
  update objekt set status = 'pagaende', avslutad_timestamp = null, fortsatt_at = current_date where id = p_objekt;
  if not found then raise exception 'Objektet finns inte' using errcode = 'P0002'; end if;
  return 'ok';
end
$f$;
revoke all on function public.objekt_fortsatt(uuid) from public, anon;
grant execute on function public.objekt_fortsatt(uuid) to authenticated;
