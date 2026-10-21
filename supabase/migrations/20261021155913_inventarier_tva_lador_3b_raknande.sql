-- Inventarier, två lådor (3b/4): de räknande funktionerna vägrar en tvålådsrad, och Kommit in nollar reservlådan.

-- Ta ut: bara rader som räknas (förut satte den 0 på en rad utan antal).
create or replace function public.inventarie_ta_ut(p_rad_id uuid, p_antal int default 1)
returns int language plpgsql security definer set search_path = public as $$
declare v_efter int; v_rad inventarie_rad;
begin
  if auth.uid() is null then raise exception 'Logga in för att ta ut'; end if;
  if p_antal < 1 then raise exception 'Antal måste vara minst 1'; end if;
  select * into v_rad from inventarie_rad where id = p_rad_id for update;
  if not found then raise exception 'Etiketten pekar inte på någon artikel längre'; end if;
  if v_rad.tva_lador then raise exception 'Den här har två lådor – skanna reservlådan när du börjar på den'; end if;
  if v_rad.antal is null then raise exception 'Den här räknas inte'; end if;
  update inventarie_rad set antal = greatest(antal - p_antal, 0), uppdaterad = now()
   where id = p_rad_id returning * into v_rad;
  v_efter := v_rad.antal;
  insert into inventarie_logg (rad_id, artikel_id, plats_id, handelse, andring, antal_efter, medarbetare_id)
  values (v_rad.id, v_rad.artikel_id, v_rad.plats_id, 'uttag', -p_antal, v_efter, korvy_min_medarbetare());
  return v_efter;
end $$;

-- Kommit in: en tvålådsrad får inget antal — beställd och reservlådan nollas. Returnerar antal (NULL för två lådor).
create or replace function public.inventarie_kommit_in(p_rad_id uuid, p_antal int)
returns int language plpgsql security definer set search_path = public as $$
declare v_rad inventarie_rad;
begin
  if auth.uid() is null then raise exception 'Logga in först'; end if;
  select * into v_rad from inventarie_rad where id = p_rad_id for update;
  if not found then raise exception 'Raden finns inte'; end if;
  if not v_rad.tva_lador and p_antal < 1 then raise exception 'Antal måste vara minst 1'; end if;
  update inventarie_rad set
      antal = case when tva_lador then null else coalesce(antal,0) + p_antal end,
      bestalld_tid = null, reserv_oppnad_tid = null, reserv_oppnad_av = null, uppdaterad = now()
   where id = p_rad_id returning * into v_rad;
  insert into inventarie_logg (rad_id, artikel_id, plats_id, handelse, andring, antal_efter, medarbetare_id)
  values (v_rad.id, v_rad.artikel_id, v_rad.plats_id, 'kommit_in', case when v_rad.tva_lador then null else p_antal end, v_rad.antal, korvy_min_medarbetare());
  return v_rad.antal;
end $$;

-- Rätta antal: inte på en tvålådsrad.
create or replace function public.inventarie_justera(p_rad_id uuid, p_nytt_antal int)
returns int language plpgsql security definer set search_path = public as $$
declare v_fore int; v_rad inventarie_rad;
begin
  if auth.uid() is null then raise exception 'Logga in först'; end if;
  if p_nytt_antal < 0 then raise exception 'Antal kan inte vara negativt'; end if;
  select * into v_rad from inventarie_rad where id = p_rad_id for update;
  if not found then raise exception 'Raden finns inte'; end if;
  if v_rad.tva_lador then raise exception 'Den här har två lådor och räknas inte'; end if;
  v_fore := v_rad.antal;
  update inventarie_rad set antal = p_nytt_antal, uppdaterad = now() where id = p_rad_id returning * into v_rad;
  insert into inventarie_logg (rad_id, artikel_id, plats_id, handelse, andring, antal_efter, medarbetare_id)
  values (v_rad.id, v_rad.artikel_id, v_rad.plats_id, 'justering', p_nytt_antal - coalesce(v_fore,0), p_nytt_antal, korvy_min_medarbetare());
  return p_nytt_antal;
end $$;
