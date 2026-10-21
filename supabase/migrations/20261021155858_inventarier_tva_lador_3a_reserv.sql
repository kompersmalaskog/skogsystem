-- Inventarier, två lådor (3a/4): skanna reservlådan och ångra.
--
-- inventarie_reserv_oppnad: idempotent. Är reservlådan redan anmäld händer ingenting (två skanningar = en notis)
-- och svaret säger när och av vem. Returnerar jsonb { tid, redan, av_namn }.
create or replace function public.inventarie_reserv_oppnad(p_rad_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rad inventarie_rad; v_redan boolean := false; v_namn text;
begin
  if auth.uid() is null then raise exception 'Logga in först'; end if;
  select * into v_rad from inventarie_rad where id = p_rad_id for update;
  if not found then raise exception 'Etiketten pekar inte på någon artikel längre'; end if;
  if not v_rad.tva_lador then raise exception 'Den här räknas – den har ingen reservlåda'; end if;
  if v_rad.reserv_oppnad_tid is not null then
    v_redan := true;
  else
    update inventarie_rad set reserv_oppnad_tid = now(), reserv_oppnad_av = korvy_min_medarbetare(), uppdaterad = now()
     where id = p_rad_id returning * into v_rad;
    insert into inventarie_logg (rad_id, artikel_id, plats_id, handelse, medarbetare_id)
    values (v_rad.id, v_rad.artikel_id, v_rad.plats_id, 'reserv_oppnad', korvy_min_medarbetare());
  end if;
  select namn into v_namn from medarbetare where id = v_rad.reserv_oppnad_av;
  return jsonb_build_object('tid', v_rad.reserv_oppnad_tid, 'redan', v_redan, 'av_namn', v_namn);
end $$;

-- Ångra (direkt efter skanningen): bara om anmälan fortfarande är exakt den som gjordes (p_tid), och inte beställd.
create or replace function public.inventarie_reserv_angra(p_rad_id uuid, p_tid timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_rad inventarie_rad;
begin
  if auth.uid() is null then raise exception 'Logga in först'; end if;
  update inventarie_rad set reserv_oppnad_tid = null, reserv_oppnad_av = null, uppdaterad = now()
   where id = p_rad_id and reserv_oppnad_tid = p_tid and bestalld_tid is null
   returning * into v_rad;
  if not found then return false; end if;
  insert into inventarie_logg (rad_id, artikel_id, plats_id, handelse, medarbetare_id)
  values (v_rad.id, v_rad.artikel_id, v_rad.plats_id, 'reserv_angrad', korvy_min_medarbetare());
  return true;
end $$;

revoke all on function public.inventarie_reserv_oppnad(uuid), public.inventarie_reserv_angra(uuid,timestamptz) from public, anon;
grant execute on function public.inventarie_reserv_oppnad(uuid), public.inventarie_reserv_angra(uuid,timestamptz) to authenticated;
