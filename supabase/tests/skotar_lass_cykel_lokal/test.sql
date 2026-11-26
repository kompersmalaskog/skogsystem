-- LASSCYKELN UR HYTTSPÅRET, provad mot riktig Postgres.
--
-- Felen som provas är de som faktiskt inträffade under bygget 2026-11-18:
--   · least(1, NULL) = 1 i Postgres → π × jordradien (20 015 114 m) per lass,
--     och `where d is not null` fångade det inte
--   · vändpunkten som självjoin → 24 s för EN trakt
--   · ett lass utan cykel som läses som 0 meter i stället för "ingen mätning"
--
-- GEOMETRIN ÄR VALD SÅ TALEN GÅR ATT RÄKNA FÖR HAND. 0,001° latitud är
-- 111,19 m på den här breddgraden; avlägget ligger på 56,0000.
\set ON_ERROR_STOP on
set client_min_messages = notice;

-- ── Underlag ───────────────────────────────────────────────────────────
insert into skotar_lass (id, vo_nummer, objekt_id, maskin_id, datum, status, bekraftad_av) values
  ('11111111-1111-1111-1111-111111111111', 'VO1', 'aaaaaaaa-0000-0000-0000-000000000001', 'M1', '2026-11-02', 'bekraftat', 'forare'),
  ('22222222-2222-2222-2222-222222222222', 'VO1', 'aaaaaaaa-0000-0000-0000-000000000001', 'M1', '2026-11-02', 'bekraftat', 'forare'),
  ('33333333-3333-3333-3333-333333333333', 'VO1', 'aaaaaaaa-0000-0000-0000-000000000001', 'M1', '2026-11-02', 'bekraftat', 'forare'),
  -- Räknas ALDRIG: obesvarat och självbekräftat.
  ('44444444-4444-4444-4444-444444444444', 'VO1', 'aaaaaaaa-0000-0000-0000-000000000001', 'M1', '2026-11-02', 'vantar_forare', 'forare'),
  ('55555555-5555-5555-5555-555555555555', 'VO1', 'aaaaaaaa-0000-0000-0000-000000000001', 'M1', '2026-11-02', 'bekraftat', 'auto'),
  -- Utan lossningstid: saknar_lossning.
  ('66666666-6666-6666-6666-666666666666', 'VO1', 'aaaaaaaa-0000-0000-0000-000000000001', 'M1', '2026-11-02', 'bekraftat', 'forare');

insert into skotar_lass_del (lass_id, lossad_tid, lat, lng) values
  ('11111111-1111-1111-1111-111111111111', '2026-11-02 09:00:00+01', 56.0000, 15.0),
  ('22222222-2222-2222-2222-222222222222', '2026-11-02 10:00:00+01', 56.0000, 15.0),
  -- Fem timmar efter lass 2 → fönstret är för långt.
  ('33333333-3333-3333-3333-333333333333', '2026-11-02 15:00:00+01', 56.0000, 15.0),
  ('44444444-4444-4444-4444-444444444444', '2026-11-02 11:00:00+01', 56.0000, 15.0),
  ('55555555-5555-5555-5555-555555555555', '2026-11-02 12:00:00+01', 56.0000, 15.0);
-- lass 6 får medvetet INGEN del-rad.

insert into skotar_lass_sortiment (lass_id, m3_forare)
select id, 10 from skotar_lass;

-- Spåret för lass 2: två korta rörelser VID avlägget, sedan ut till 56,0030
-- och hem. Nio punkter, åtta segment.
--   fran_loss: 0 · 33,4 · 0 · 111,2 · 222,4 · 333,6 · 222,4 · 111,2 · 0
--   cykel      = 2 × 33,36 + 6 × 111,21 = 733,98 m
--   vid avl.   = 66,72 m  (de två segmenten där BÅDA ändar ligger inom 60 m)
--   hem        = 3 × 111,21 = 333,63 m  (efter vändpunkten, utanför zonen)
--   ytterst    = 333,63 m
insert into hyttspar (objekt_id, maskin_id, roll, datum, points) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'M1', 'skotare', '2026-11-02', jsonb_build_array(
    jsonb_build_object('lat', 56.0000, 'lng', 15.0, 'tid', '2026-11-02T08:10:00Z'),
    jsonb_build_object('lat', 56.0003, 'lng', 15.0, 'tid', '2026-11-02T08:11:00Z'),
    jsonb_build_object('lat', 56.0000, 'lng', 15.0, 'tid', '2026-11-02T08:12:00Z'),
    jsonb_build_object('lat', 56.0010, 'lng', 15.0, 'tid', '2026-11-02T08:20:00Z'),
    jsonb_build_object('lat', 56.0020, 'lng', 15.0, 'tid', '2026-11-02T08:30:00Z'),
    jsonb_build_object('lat', 56.0030, 'lng', 15.0, 'tid', '2026-11-02T08:40:00Z'),
    jsonb_build_object('lat', 56.0020, 'lng', 15.0, 'tid', '2026-11-02T08:45:00Z'),
    jsonb_build_object('lat', 56.0010, 'lng', 15.0, 'tid', '2026-11-02T08:50:00Z'),
    jsonb_build_object('lat', 56.0000, 'lng', 15.0, 'tid', '2026-11-02T08:59:00Z')
  )),
  -- En skördares spår på samma objekt och dag: ska ALDRIG räknas.
  ('aaaaaaaa-0000-0000-0000-000000000001', 'M1', 'skordare', '2026-11-02', jsonb_build_array(
    jsonb_build_object('lat', 57.0000, 'lng', 15.0, 'tid', '2026-11-02T08:30:00Z'),
    jsonb_build_object('lat', 57.0100, 'lng', 15.0, 'tid', '2026-11-02T08:40:00Z')
  ));

-- ── Kontroller ─────────────────────────────────────────────────────────
do $$
declare
  r record;
  n integer;
begin
  -- 1. Alla sex bekräftade lass kommer tillbaka; de två som inte räknas inte.
  select count(*) into n from skotar_lass_cykel(array['VO1']);
  if n <> 4 then
    raise exception 'FEL 1: väntade 4 lass (bekräftade, ej auto), fick %', n;
  end if;

  -- 2. Lass 2: cykeln och delarna, räknade för hand ovan.
  select * into r from skotar_lass_cykel(array['VO1'])
   where lass_id = '22222222-2222-2222-2222-222222222222';
  if r.skal <> 'ok' then
    raise exception 'FEL 2a: lass 2 skulle vara ok, är %', r.skal;
  end if;
  if abs(r.cykel_m - 733.98) > 1 then
    raise exception 'FEL 2b: cykeln skulle vara 733,98 m, är % m', round(r.cykel_m::numeric, 2);
  end if;
  if r.punkter <> 9 then
    raise exception 'FEL 2c: 9 punkter väntades, fick %', r.punkter;
  end if;
  if abs(r.vid_avlagget_m - 66.72) > 1 then
    raise exception 'FEL 2d: vid avlägget skulle vara 66,72 m, är % m', round(r.vid_avlagget_m::numeric, 2);
  end if;
  if abs(r.hem_med_lass_m - 333.63) > 1 then
    raise exception 'FEL 2e: hemresan skulle vara 333,63 m, är % m', round(r.hem_med_lass_m::numeric, 2);
  end if;
  if abs(r.ytterst_m - 333.63) > 1 then
    raise exception 'FEL 2f: ytterst skulle vara 333,63 m, är % m', round(r.ytterst_m::numeric, 2);
  end if;
  -- Delarna får aldrig överstiga cykeln.
  if r.vid_avlagget_m + r.hem_med_lass_m > r.cykel_m + 0.01 then
    raise exception 'FEL 2g: delarna (% + %) är större än cykeln %',
      r.vid_avlagget_m, r.hem_med_lass_m, r.cykel_m;
  end if;

  -- 3. HALVT JORDOMLOPP: inget lass får ha ett sådant tal. Det var felet som
  --    least(1, NULL) gav, och det måste vara omöjligt nu.
  select count(*) into n from skotar_lass_cykel(array['VO1']) where cykel_m > 100000;
  if n <> 0 then
    raise exception 'FEL 3: % lass har en cykel över 100 km — least(1, NULL)?', n;
  end if;

  -- 4. Varje lass utan cykel säger VARFÖR, och har null — aldrig 0 meter.
  for r in select * from skotar_lass_cykel(array['VO1']) where skal <> 'ok' loop
    if r.cykel_m is not null then
      raise exception 'FEL 4a: lass med skäl % har cykel % — ska vara null', r.skal, r.cykel_m;
    end if;
  end loop;

  select skal into r from skotar_lass_cykel(array['VO1'])
   where lass_id = '11111111-1111-1111-1111-111111111111';
  if r.skal <> 'forsta_lasset' then
    raise exception 'FEL 4b: lass 1 skulle vara forsta_lasset, är %', r.skal;
  end if;

  select skal into r from skotar_lass_cykel(array['VO1'])
   where lass_id = '33333333-3333-3333-3333-333333333333';
  if r.skal <> 'fonster_for_langt' then
    raise exception 'FEL 4c: lass 3 (5 h efter) skulle vara fonster_for_langt, är %', r.skal;
  end if;

  select skal into r from skotar_lass_cykel(array['VO1'])
   where lass_id = '66666666-6666-6666-6666-666666666666';
  if r.skal <> 'saknar_lossning' then
    raise exception 'FEL 4d: lass 6 (ingen del) skulle vara saknar_lossning, är %', r.skal;
  end if;

  -- 5. Skördarens spår räknas inte. Hade det gjort det hade cykeln blivit
  --    kilometer, eftersom det ligger en breddgrad norrut.
  select count(*) into n from skotar_lass_cykel(array['VO1']) where cykel_m > 2000;
  if n <> 0 then
    raise exception 'FEL 5: skördarens spår läcker in i cykeln';
  end if;

  -- 6. Volymen följer med per lass.
  select * into r from skotar_lass_cykel(array['VO1'])
   where lass_id = '22222222-2222-2222-2222-222222222222';
  if r.volym <> 10 then
    raise exception 'FEL 6: volymen skulle vara 10 m³, är %', r.volym;
  end if;

  -- 7. Ett okänt VO ger inga rader, inte ett fel.
  select count(*) into n from skotar_lass_cykel(array['FINNS_EJ']);
  if n <> 0 then
    raise exception 'FEL 7: okänt VO gav % rader', n;
  end if;

  raise notice 'ALLA KONTROLLER OK';
end $$;

-- ── Mutationskontroll: utan STRICT kommer felet tillbaka ───────────────
-- Beviset att strict är det som håller. En icke-strict kopia av haversinen
-- ska ge π × jordradien för en NULL-koordinat.
create or replace function hav_utan_strict(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision language sql immutable as $$
  select 2 * 6371008.8 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )));
$$;

do $$
declare
  utan double precision;
  med  double precision;
begin
  utan := hav_utan_strict(null, 15.0, 56.0, 15.0);
  med  := skotar_hav_m(null, 15.0, 56.0, 15.0);
  if utan is null then
    raise exception 'MUTANT LEVDE: least(1, NULL) gav null — testet bevisar inget';
  end if;
  if abs(utan - 20015114) > 10 then
    raise exception 'MUTANT: väntade π × jordradien (20 015 114), fick %', round(utan::numeric);
  end if;
  if med is not null then
    raise exception 'FEL: skotar_hav_m är inte strict — gav % för NULL in', med;
  end if;
  raise notice 'MUTATIONSKONTROLL OK: utan strict % m, med strict null', round(utan::numeric);
end $$;
