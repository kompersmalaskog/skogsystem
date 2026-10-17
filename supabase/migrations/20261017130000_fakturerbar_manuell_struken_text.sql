-- Tydligare text när ett manuellt ja tas bort och underlaget stryks. Martin kör i Supabase SQL editor EFTER
-- 20261017100000_fakturerbar_manuell.sql (som inte rörs). Idempotent (create or replace).
--
-- Före: "Flytten rättades till produktion och är inte längre fakturerbar: <anledning>" — missvisande när det
-- är det manuella valet som tas bort och typen är densamma.
-- Nu, när n_manuell är null och flytten förut hade manuellt ja (och underlaget stryks):
--   "Manuell fakturering borttagen — följer regeln igen (<skäl>): <anledning>"
-- där <skäl> är samma ord som sheeten visar ("under 30 km", "service faktureras inte" …). Skälet räknas av
-- fakturerbar_skal(typ, km), som speglar automatisktSkal i lib/flytt/fakturerbar.ts; de två hålls ihop av
-- lib/flytt/__fixtures__/fakturerbar_skal_tabell.json (TS-testet kör tabellen, kvittot längst ner kör samma
-- tabell mot SQL-funktionen — ska ge 0 rader).
--
-- Allt annat i ratta_flytt är oförändrat jämfört med 20261017100000: bara textraden för struken_anledning.

create or replace function fakturerbar_skal(p_typ text, p_km numeric)
returns text
language sql
immutable
as $$
  select case p_typ
           when 'produktion' then case when p_km is null then 'sträckan saknas'
                                       when p_km >= 30 then '30 km eller mer'
                                       else 'under 30 km' end
           when 'kunduppdrag' then 'kunduppdrag'
           when 'service' then 'service faktureras inte'
           when 'annat' then 'annat faktureras inte'
           else 'typen faktureras inte'
         end
$$;

-- ── RÄTTA ───────────────────────────────────────────────────────────────
create or replace function ratta_flytt(p_flytt uuid, p_andringar jsonb, p_anledning text, p_av text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  f        maskin_flytt%rowtype;
  u        fakturaunderlag_flytt%rowtype;
  ok_falt  constant text[] := array['maskin_id','extern_maskin','fran_objekt_id','fran_plats_id',
                                    'till_objekt_id','till_plats_id','flytt_typ','kund','fakturerbar_manuell'];
  fel_falt text;
  n_maskin text; n_extern text; n_fran_o uuid; n_fran_p uuid; n_till_o uuid; n_till_p uuid; n_typ text; n_kund text;
  n_manuell boolean;
  ny_fakt  boolean;
  fore_j   jsonb; efter_j jsonb;
  atgard   text := 'ingen';
  pos_atgard text := 'ingen';
  pos_antal int;
  u_fanns_fore boolean;
  u_fanns boolean;
begin
  if not ar_admin() then raise exception 'Bara admin kan rätta en flytt' using errcode = '42501'; end if;
  if p_anledning is null or btrim(p_anledning) = '' then raise exception 'Skriv varför flytten rättas' using errcode = 'not_null_violation'; end if;
  if p_av is null or btrim(p_av) = '' then raise exception 'Skriv vem som rättar (p_av)' using errcode = 'not_null_violation'; end if;

  -- Bara det människan angav. Mätvärden finns inte på listan.
  select k into fel_falt from jsonb_object_keys(p_andringar) k where k <> all (ok_falt) limit 1;
  if fel_falt is not null then
    raise exception 'Fältet % går inte att rätta — är mätningen fel ska flytten strykas', fel_falt using errcode = 'check_violation';
  end if;

  -- fakturerbar_manuell är true, false eller null (= följ regeln) — aldrig text eller tal.
  if p_andringar ? 'fakturerbar_manuell' and jsonb_typeof(p_andringar->'fakturerbar_manuell') not in ('boolean','null') then
    raise exception 'fakturerbar_manuell måste vara ja, nej eller tomt (följ regeln)' using errcode = 'check_violation';
  end if;

  select * into f from maskin_flytt where id = p_flytt for update;
  if not found then raise exception 'Flytten finns inte' using errcode = 'no_data_found'; end if;
  if f.avbruten then raise exception 'Flytten är avbruten eller struken' using errcode = 'check_violation'; end if;
  if f.sluttid is null then raise exception 'Flytten pågår — rätta den när föraren avslutat den' using errcode = 'check_violation'; end if;

  -- LÅS (samma villkor som triggern, med begripligt fel i stället för triggerns).
  select * into u from fakturaunderlag_flytt where flytt_id = p_flytt for update;
  u_fanns_fore := found;
  if found and u.fakturerad_tid is not null then raise exception 'Flytten är fakturerad och går inte att rätta' using errcode = 'check_violation'; end if;
  if found and u.godkand_tid is not null then raise exception 'Flytten är godkänd för fakturering — lämna tillbaka den till Att godkänna först' using errcode = 'check_violation'; end if;

  n_maskin := case when p_andringar ? 'maskin_id'      then nullif(p_andringar->>'maskin_id','')      else f.maskin_id      end;
  n_extern := case when p_andringar ? 'extern_maskin'  then nullif(btrim(p_andringar->>'extern_maskin'),'') else f.extern_maskin end;
  n_fran_o := case when p_andringar ? 'fran_objekt_id' then nullif(p_andringar->>'fran_objekt_id','')::uuid else f.fran_objekt_id end;
  n_fran_p := case when p_andringar ? 'fran_plats_id'  then nullif(p_andringar->>'fran_plats_id','')::uuid  else f.fran_plats_id  end;
  n_till_o := case when p_andringar ? 'till_objekt_id' then nullif(p_andringar->>'till_objekt_id','')::uuid else f.till_objekt_id end;
  n_till_p := case when p_andringar ? 'till_plats_id'  then nullif(p_andringar->>'till_plats_id','')::uuid  else f.till_plats_id  end;
  n_typ    := case when p_andringar ? 'flytt_typ'      then p_andringar->>'flytt_typ'                    else f.flytt_typ      end;
  n_kund   := case when p_andringar ? 'kund'           then nullif(btrim(p_andringar->>'kund'),'')       else f.kund           end;
  n_manuell := case when p_andringar ? 'fakturerbar_manuell' then (p_andringar->>'fakturerbar_manuell')::boolean else f.fakturerbar_manuell end;

  fore_j := jsonb_build_object('maskin_id', f.maskin_id, 'extern_maskin', f.extern_maskin,
    'fran_objekt_id', f.fran_objekt_id, 'fran_plats_id', f.fran_plats_id, 'till_objekt_id', f.till_objekt_id,
    'till_plats_id', f.till_plats_id, 'flytt_typ', f.flytt_typ, 'kund', f.kund, 'fakturerbar_manuell', f.fakturerbar_manuell, 'fakturerbar', f.fakturerbar);

  -- flytt_km är MÄTT/rutt och rörs inte; typen och det manuella valet kan ändra domen (manuellt val går före regeln).
  ny_fakt := fakturerbar_effektiv(n_typ, f.flytt_km, n_manuell);

  -- Tabellens egna CHECK:ar (en maskin, en källa per ände, typ giltig, kunduppdrag kräver kund) vaktar resten.
  update maskin_flytt set
    maskin_id = n_maskin, extern_maskin = n_extern,
    fran_objekt_id = n_fran_o, fran_plats_id = n_fran_p, till_objekt_id = n_till_o, till_plats_id = n_till_p,
    flytt_typ = n_typ, kund = n_kund, fakturerbar_manuell = n_manuell,
    fakturerbar = ny_fakt,                               -- i SET-listan: triggern trg_fakturaunderlag_flytt kan skapa underlaget
    redigerad_tid = now(), redigerad_av = p_av
  where id = p_flytt;

  -- ── KEDJAN mot fakturaunderlag_flytt ──
  select * into u from fakturaunderlag_flytt where flytt_id = p_flytt for update;
  u_fanns := found;
  if u_fanns then
    if not ny_fakt then
      if u.status = 'aktiv' then                         -- (ogodkänd, ofakturerad: annars hade vi stoppats ovan)
        update fakturaunderlag_flytt set status = 'struken', struken_tid = now(), struken_av = p_av,
               struken_anledning = case
                 -- Det manuella ja:et togs bort och regeln säger nej: texten nämner regelns skäl, samma som sheeten visar.
                 when n_manuell is null and f.fakturerbar_manuell is true
                   then 'Manuell fakturering borttagen — följer regeln igen (' || fakturerbar_skal(n_typ, f.flytt_km) || '): '
                 when n_manuell is false and f.fakturerbar_manuell is distinct from false
                   then 'Flytten valdes bort från fakturering: '
                 else 'Flytten rättades till ' || n_typ || ' och är inte längre fakturerbar: ' end
                 || btrim(p_anledning)
         where id = u.id;
        atgard := 'struket';
      end if;
    else
      if u.status = 'struken' then
        -- Bara en strykning som en rättning av DEN HÄR flytten gjorde (samma transaktionstid) får ångras.
        if exists (select 1 from maskin_flytt_rattning r where r.flytt_id = p_flytt and r.underlag_atgard = 'struket' and r.tid = u.struken_tid) then
          update fakturaunderlag_flytt set status = 'aktiv', struken_tid = null, struken_av = null, struken_anledning = null where id = u.id;
          atgard := 'aterstallt';
        else
          raise exception 'Flytten är struken i faktureringen (%) — den går inte att göra fakturerbar igen härifrån', coalesce(u.struken_anledning, 'ingen anledning') using errcode = 'check_violation';
        end if;
      end if;
      -- Kopiorna i underlaget följer flytten. Kund via triggern i 20261015160000 (originalet bevaras, märks "ändrad från").
      update fakturaunderlag_flytt set
        maskin = coalesce(n_extern, n_maskin),
        fran_objekt_id = n_fran_o::text, fran_plats_id = n_fran_p, till_objekt_id = n_till_o::text, till_plats_id = n_till_p,
        kund = case when n_kund is distinct from f.kund then n_kund else kund end,
        redigerad_av = case when n_kund is distinct from f.kund then p_av else redigerad_av end
       where id = u.id
         and (maskin is distinct from coalesce(n_extern, n_maskin) or fran_objekt_id is distinct from n_fran_o::text
              or fran_plats_id is distinct from n_fran_p or till_objekt_id is distinct from n_till_o::text
              or till_plats_id is distinct from n_till_p or (n_kund is distinct from f.kund));
      if atgard = 'ingen' and not u_fanns_fore then atgard := 'skapat';
      elsif atgard = 'ingen' and (u.maskin is distinct from coalesce(n_extern, n_maskin) or u.fran_objekt_id is distinct from n_fran_o::text
            or u.fran_plats_id is distinct from n_fran_p or u.till_objekt_id is distinct from n_till_o::text
            or u.till_plats_id is distinct from n_till_p or n_kund is distinct from f.kund) then atgard := 'uppdaterat'; end if;
    end if;
  elsif ny_fakt then
    -- Triggern skulle ha skapat raden. Hellre ett högljutt fel än en fakturerbar flytt som inte syns i faktureringen.
    raise exception 'Underlaget skapades inte — rättningen avbröts' using errcode = 'data_exception';
  end if;

  -- Maskinen rättades: positionen som skrevs vid "Lämnat" tillhörde fel maskin. Egen → egen flyttas, och
  -- bara om EXAKT en rad matchar (maskin, tid = sluttid, koordinat = till_lat/till_lng).
  if n_maskin is distinct from f.maskin_id and f.maskin_id is not null then
    if n_maskin is null then
      pos_atgard := 'ej_hanterad';                       -- till annan maskin: ingen position att flytta till
    else
      select count(*) into pos_antal from maskin_position
       where maskin_id = f.maskin_id and tidpunkt = f.sluttid and lat = f.till_lat and lng = f.till_lng;
      if pos_antal = 1 then
        update maskin_position set maskin_id = n_maskin
         where maskin_id = f.maskin_id and tidpunkt = f.sluttid and lat = f.till_lat and lng = f.till_lng;
        pos_atgard := 'flyttad';
      elsif pos_antal = 0 then pos_atgard := 'hittades_inte';
      else pos_atgard := 'osaker';
      end if;
    end if;
  end if;

  efter_j := jsonb_build_object('maskin_id', n_maskin, 'extern_maskin', n_extern,
    'fran_objekt_id', n_fran_o, 'fran_plats_id', n_fran_p, 'till_objekt_id', n_till_o,
    'till_plats_id', n_till_p, 'flytt_typ', n_typ, 'kund', n_kund, 'fakturerbar_manuell', n_manuell, 'fakturerbar', ny_fakt);
  insert into maskin_flytt_rattning (flytt_id, av, anledning, slag, fore, efter, underlag_atgard, position_atgard)
  values (p_flytt, p_av, btrim(p_anledning), 'rattning', fore_j, efter_j, atgard, pos_atgard);

  return jsonb_build_object('fakturerbar_fore', f.fakturerbar, 'fakturerbar_efter', ny_fakt,
                            'underlag', atgard, 'position', pos_atgard);
end
$$;
revoke all on function ratta_flytt(uuid, jsonb, text, text) from public;
grant execute on function ratta_flytt(uuid, jsonb, text, text) to authenticated;

-- ── Kvitto ──────────────────────────────────────────────────────────────
-- 1. Skälen i SQL mot appens testtabell (lib/flytt/__fixtures__/fakturerbar_skal_tabell.json). Förväntat: 0 rader.
select * from (values
  ('produktion', null::numeric, 'sträckan saknas'),
  ('produktion', 0::numeric, 'under 30 km'),
  ('produktion', 15::numeric, 'under 30 km'),
  ('produktion', 29.9::numeric, 'under 30 km'),
  ('produktion', 30::numeric, '30 km eller mer'),
  ('produktion', 53::numeric, '30 km eller mer'),
  ('kunduppdrag', null::numeric, 'kunduppdrag'),
  ('kunduppdrag', 20::numeric, 'kunduppdrag'),
  ('service', 100::numeric, 'service faktureras inte'),
  ('annat', 100::numeric, 'annat faktureras inte'),
  ('okand', 100::numeric, 'typen faktureras inte')
) as t(typ, km, forvantat)
where fakturerbar_skal(typ, km) is distinct from forvantat;

-- 2. ratta_flytt har den nya texten och skälfunktionen finns. Förväntat: nya_texten = t, skal_finns = t.
select (select position('Manuell fakturering borttagen' in pg_get_functiondef('ratta_flytt(uuid, jsonb, text, text)'::regprocedure)) > 0) as nya_texten,
       (select count(*) = 1 from pg_proc where proname = 'fakturerbar_skal') as skal_finns;
