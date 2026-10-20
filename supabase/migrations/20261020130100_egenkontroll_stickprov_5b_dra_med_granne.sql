-- Egenkontrollens månadsstickprov, del 5b: dragningen kräver att ankaret har en granne. 2026-10-20 (Martin).
-- Ersätter egenkontroll_stickprov_dra(date) från del 3 (create or replace; samma signatur, samma rättigheter). Kör 5a först.
--
-- Ändringen: ankaret är inte kandidat nummer (md5(fro) mod n) utan den FÖRSTA kandidaten i fro-ordning som har minst en granne inom
-- troskel_km. Har ingen kandidat en granne dras den första i fro-ordningen ensam. Allt annat (kandidaturvalet, grannar, spridning,
-- förklaring, låset, advisory-låset) är som i del 3. Deterministiskt ur fro + den frusna kandidatlistan: fro-ordning = kandidaterna
-- sorterade på md5(fro || ':' || id::text) (collate "C"), id som tiebreak. kandidater sparas nu sorterade på id::text collate "C".
create or replace function egenkontroll_stickprov_dra(p_manad date)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  c_troskel constant numeric := 15;
  c_max     constant int := 3;
  v_kalla   date := (p_manad - interval '1 month')::date;
  v_fro     text := gen_random_uuid()::text;
  v_kand    jsonb;
  v_n       int;
  v_idx     int;
  v_forsok  int;
  v_a_id    uuid;
  v_a_namn  text;
  v_a_lat   double precision;
  v_a_lng   double precision;
  v_grann   jsonb := '[]'::jsonb;
  v_valda   jsonb := '[]'::jsonb;
  v_spr     numeric;
  v_forkl   text;
  v_rad     egenkontroll_stickprov;
begin
  if p_manad <> date_trunc('month', p_manad)::date then
    raise exception 'egenkontroll_stickprov_dra: % är inte första dagen i en månad', p_manad;
  end if;

  perform pg_advisory_xact_lock(hashtext('egenkontroll_stickprov'), (extract(year from p_manad) * 12 + extract(month from p_manad))::int);

  select * into v_rad from egenkontroll_stickprov where manad = p_manad;
  if found then
    return to_jsonb(v_rad) || jsonb_build_object('ny', false);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'namn', o.namn, 'typ', o.typ, 'lat', o.lat, 'lng', o.lng, 'avslutat', o.av)
                            order by o.id::text collate "C"), '[]'::jsonb)
    into v_kand
    from (select x.*, coalesce(x.avslutad_timestamp, (x.faktisk_slut::timestamp at time zone 'Europe/Stockholm')) as av from objekt x) o
   where o.status = 'avslutat'
     and lower(coalesce(o.typ, '')) in ('gallring', 'slutavverkning')
     and coalesce(o.avverkningsform, '') not ilike 'biobr%'
     and o.av >= (v_kalla::timestamp at time zone 'Europe/Stockholm')
     and o.av <  (p_manad::timestamp at time zone 'Europe/Stockholm');

  v_n := jsonb_array_length(v_kand);

  if v_n = 0 then
    insert into egenkontroll_stickprov (manad, kalla_manad, fro, kandidater, forklaring, algoritm_version)
    values (p_manad, v_kalla, v_fro, v_kand, 'inga_objekt', 2)
    returning * into v_rad;
    return to_jsonb(v_rad) || jsonb_build_object('ny', true);
  end if;

  -- Fro-ordningen: första kandidaten med minst en granne inom tröskeln. Inget kluster alls -> första i ordningen, ensam.
  with ordnad as (
    select k.id, k.namn, k.lat, k.lng,
           row_number() over (order by md5(v_fro || ':' || k.id::text) collate "C", k.id::text collate "C") as pos
      from jsonb_to_recordset(v_kand) as k(id uuid, namn text, lat double precision, lng double precision)
  ), med_granne as (
    select o.*, exists (
             select 1 from ordnad g
              where g.id <> o.id
                and o.lat is not null and o.lng is not null and not (o.lat = 0 and o.lng = 0)
                and g.lat is not null and g.lng is not null and not (g.lat = 0 and g.lng = 0)
                and egenkontroll_fagelvag_km(o.lat, o.lng, g.lat, g.lng) <= c_troskel) as har_granne
      from ordnad o
  )
  select m.id, m.namn, m.lat, m.lng, m.pos
    into v_a_id, v_a_namn, v_a_lat, v_a_lng, v_forsok
    from med_granne m
   where m.har_granne
   order by m.pos
   limit 1;

  if not found then
    select o.id, o.namn, o.lat, o.lng
      into v_a_id, v_a_namn, v_a_lat, v_a_lng
      from (select k.id, k.namn, k.lat, k.lng,
                   row_number() over (order by md5(v_fro || ':' || k.id::text) collate "C", k.id::text collate "C") as pos
              from jsonb_to_recordset(v_kand) as k(id uuid, namn text, lat double precision, lng double precision)) o
     order by o.pos
     limit 1;
    v_forsok := v_n;
  end if;

  select count(*)::int into v_idx
    from jsonb_to_recordset(v_kand) as k(id uuid)
   where k.id::text collate "C" < v_a_id::text collate "C";

  if v_a_lat is not null and v_a_lng is not null and not (v_a_lat = 0 and v_a_lng = 0) then
    select coalesce(jsonb_agg(jsonb_build_object('objekt_id', g.id, 'namn', g.namn, 'ordning', g.rn + 1, 'km_fran_ankare', round(g.km::numeric, 2))
                              order by g.rn), '[]'::jsonb)
      into v_grann
      from (select h.*, row_number() over (order by h.km, h.id::text collate "C") as rn
              from (select k.id, k.namn, egenkontroll_fagelvag_km(v_a_lat, v_a_lng, k.lat, k.lng) as km
                      from jsonb_to_recordset(v_kand) as k(id uuid, namn text, lat double precision, lng double precision)
                     where k.id <> v_a_id and k.lat is not null and k.lng is not null and not (k.lat = 0 and k.lng = 0)) h
             where h.km <= c_troskel
             order by h.km, h.id::text collate "C"
             limit c_max - 1) g;
  end if;

  v_valda := jsonb_build_array(jsonb_build_object('objekt_id', v_a_id, 'namn', v_a_namn, 'ordning', 1, 'km_fran_ankare', 0)) || v_grann;

  with v as (
    select k.id, k.lat, k.lng
      from jsonb_to_recordset(v_kand) as k(id uuid, lat double precision, lng double precision)
     where k.id in (select (e ->> 'objekt_id')::uuid from jsonb_array_elements(v_valda) e)
       and k.lat is not null and k.lng is not null)
  select round(max(egenkontroll_fagelvag_km(a.lat, a.lng, b.lat, b.lng))::numeric, 1)
    into v_spr from v a join v b on a.id < b.id;

  v_forkl := case
    when jsonb_array_length(v_valda) >= c_max then 'full'
    when v_a_lat is null or v_a_lng is null or (v_a_lat = 0 and v_a_lng = 0) then 'ankare_utan_plats'
    when jsonb_array_length(v_valda) < least(c_max, v_n) then 'for_langt'
    else 'tunn_manad'
  end;

  insert into egenkontroll_stickprov (manad, kalla_manad, fro, kandidater, ankare_index, ankare_objekt_id, valda, spridning_km, forklaring,
                                      troskel_km, max_antal, algoritm_version, ankare_forsok)
  values (p_manad, v_kalla, v_fro, v_kand, v_idx, v_a_id, v_valda, v_spr, v_forkl, c_troskel, c_max, 2, v_forsok)
  returning * into v_rad;

  return to_jsonb(v_rad) || jsonb_build_object('ny', true);
end $$;

revoke all on function egenkontroll_stickprov_dra(date) from public, anon, authenticated;
