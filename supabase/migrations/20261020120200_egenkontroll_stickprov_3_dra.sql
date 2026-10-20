-- Egenkontrollens månadsstickprov, del 3 av 4: dragningen. Intern: anropas bara av del 4 (ingen får köra den direkt).
--
-- Regler (Martin 2026-10-20):
--   * Kandidater = föregående månads avslutade objekt (svensk månad; avslutad_timestamp, annars faktisk_slut), typ gallring eller
--     slutavverkning. GROT och energiklippning står utanför tills det finns avslutade objekt OCH en utförandekatalog.
--   * Ankaret slumpas ur kandidaterna (fro, se del 1). Grannar = de närmaste kandidaterna inom troskel_km från ankaret, högst max_antal - 1.
--     Närheten slår antalet: hellre ett ensamt objekt än ett tredje en timme bort. Aldrig "fyll upp till tre".
--   * Ankare utan koordinat: bara ankaret dras (det finns ingen närhet att räkna på).
--   * Redan dragen månad: returnerar den sparade raden oförändrad ("ny": false).
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
                            order by o.id::text), '[]'::jsonb)
    into v_kand
    from (select x.*, coalesce(x.avslutad_timestamp, (x.faktisk_slut::timestamp at time zone 'Europe/Stockholm')) as av from objekt x) o
   where o.status = 'avslutat'
     and lower(coalesce(o.typ, '')) in ('gallring', 'slutavverkning')
     and coalesce(o.avverkningsform, '') not ilike 'biobr%'
     and o.av >= (v_kalla::timestamp at time zone 'Europe/Stockholm')
     and o.av <  (p_manad::timestamp at time zone 'Europe/Stockholm');

  v_n := jsonb_array_length(v_kand);

  if v_n = 0 then
    insert into egenkontroll_stickprov (manad, kalla_manad, fro, kandidater, forklaring)
    values (p_manad, v_kalla, v_fro, v_kand, 'inga_objekt')
    returning * into v_rad;
    return to_jsonb(v_rad) || jsonb_build_object('ny', true);
  end if;

  v_idx := (('x' || substr(md5(v_fro), 1, 15))::bit(60)::bigint % v_n)::int;
  v_a_id   := (v_kand -> v_idx ->> 'id')::uuid;
  v_a_namn :=  v_kand -> v_idx ->> 'namn';
  v_a_lat  := (v_kand -> v_idx ->> 'lat')::double precision;
  v_a_lng  := (v_kand -> v_idx ->> 'lng')::double precision;

  if v_a_lat is not null and v_a_lng is not null and not (v_a_lat = 0 and v_a_lng = 0) then
    select coalesce(jsonb_agg(jsonb_build_object('objekt_id', g.id, 'namn', g.namn, 'ordning', g.rn + 1, 'km_fran_ankare', round(g.km::numeric, 2))
                              order by g.rn), '[]'::jsonb)
      into v_grann
      from (select h.*, row_number() over (order by h.km, h.id::text) as rn
              from (select k.id, k.namn, egenkontroll_fagelvag_km(v_a_lat, v_a_lng, k.lat, k.lng) as km
                      from jsonb_to_recordset(v_kand) as k(id uuid, namn text, lat double precision, lng double precision)
                     where k.id <> v_a_id and k.lat is not null and k.lng is not null and not (k.lat = 0 and k.lng = 0)) h
             where h.km <= c_troskel
             order by h.km, h.id::text
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

  insert into egenkontroll_stickprov (manad, kalla_manad, fro, kandidater, ankare_index, ankare_objekt_id, valda, spridning_km, forklaring, troskel_km, max_antal)
  values (p_manad, v_kalla, v_fro, v_kand, v_idx, v_a_id, v_valda, v_spr, v_forkl, c_troskel, c_max)
  returning * into v_rad;

  return to_jsonb(v_rad) || jsonb_build_object('ny', true);
end $$;

revoke all on function egenkontroll_stickprov_dra(date) from public, anon, authenticated;
