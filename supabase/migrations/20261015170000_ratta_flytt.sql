-- Rätta en flytt (alla flyttar), stryk en flytt, och DB-LÅS på godkända/fakturerade flyttar.
-- Martin kör i Supabase SQL editor EFTER 20261015150000 och 20261015160000. Idempotent.
--
-- ─────────────────────────────────────────────────────────────────────────
-- VARFÖR EN FUNKTION OCH ETT LÅS
-- RLS på maskin_flytt är ÖPPEN för alla inloggade (UPDATE USING true, medvetet 2026-07-17: förarna
-- avslutar sina flyttar där). Admin-kontroll, lås och kedjeeffekt kan därför inte bo i appen eller i
-- RLS. Rättningen är EN transaktion i EN funktion (ratta_flytt / stryk_flytt): flytten, underlaget,
-- spåret och maskinpositionen ändras tillsammans eller inte alls. Låset ligger i en trigger, så det
-- gäller även den som skriver tabellen direkt.
--
-- VAD SOM GÅR ATT RÄTTA — bara det människan angav: maskin, från, till, flytt_typ, kund.
-- ALDRIG mätvärden (km, tider, odometer, diesel, väder, koordinater). Är mätningen fel ska flytten
-- STRYKAS (stryk_flytt), inte skrivas om.
--
-- FAKTURERBAR räknas om HÄR, i SQL, vid varje rättning (fakturerbar_for) — en klient som skickar fel
-- flagga får aldrig kunna lämna datan i fel läge. Appen har SAMMA regel i lib/flytt/fakturerbar.ts;
-- de två hålls ihop av en gemensam testtabell (lib/flytt/__fixtures__/fakturerbar_tabell.json), och
-- kvittot längst ner kör samma tabell mot den här funktionen — ska ge 0 rader.
--
-- KEDJAN mot fakturaunderlag_flytt (provad i Postgres):
--   inte fakturerbar → inte fakturerbar        inget underlag, bara spår
--   inte fakturerbar → fakturerbar             ogodkänt underlag SKAPAS (befintliga triggern)
--   fakturerbar → inte fakturerbar (ogodkänt)  underlaget STRYKS märkt med anledningen
--   ...och tillbaka                            SAMMA rad återställs — bara om den HÄR rättningen
--                                              strök den; en människas strykning vägras
--   fakturerbar → fakturerbar                  underlagets kopior följer; kund via triggern i
--                                              20261015160000 (original bevaras, märks "ändrad från")
--   godkänd eller fakturerad                   LÅST: "lämna tillbaka den till Att godkänna först"
--
-- STRYK (stryk_flytt): återanvänder avbruten = true (alla läsare filtrerar redan bort avbrutna), med
-- spår + anledning. Ogodkänt underlag stryks. Positionsraden som skrevs vid "Lämnat" raderas bara vid
-- EXAKT matchning (maskin, tid = sluttid, koordinat = till_lat/till_lng, precis en rad) — en struken
-- flytt hände aldrig, dess position är falsk data. Osäker matchning: raden lämnas och arket säger det.
-- Raden som raderas sparas i spåret.
--
-- LÅSET (trigger trg_maskin_flytt_las): en flytt vars underlag är godkänt eller fakturerat kan inte
-- ändras eller raderas — ingen kolumn. Undantag:
--   * slaIhopJobb (service-roll): får byta fran_objekt_id/till_objekt_id och INGET annat
--     (Vida-sammanslagningen flyttar jobbets rader till Vidas objekt; den var tillåten före låset).
--   * medvetet underhåll i SQL-editorn:  select set_config('app.flytt_tillat_andring','on',true);
--     i samma transaktion (samma mönster som fakt_skift_bara_utoka).
-- Förarens egna skrivningar rörs inte: de sker på PÅGÅENDE flyttar, som aldrig har ett godkänt underlag.
-- ─────────────────────────────────────────────────────────────────────────

alter table maskin_flytt add column if not exists redigerad_tid timestamptz;
alter table maskin_flytt add column if not exists redigerad_av  text;
comment on column maskin_flytt.redigerad_tid is
  'Satt = någon har rättat vad människan angav (maskin, från/till, typ, kund) eller struket flytten. '
  'Originalet ligger i maskin_flytt_rattning (fore på äldsta raden).';

-- Append-only spår: en rad per rättning/strykning. Ingen UPDATE/DELETE-policy, ingen INSERT-policy
-- (funktionerna skriver som definer).
create table if not exists maskin_flytt_rattning (
  id              uuid primary key default gen_random_uuid(),
  flytt_id        uuid not null references maskin_flytt(id) on delete cascade,
  tid             timestamptz not null default now(),
  av              text not null,
  anledning       text not null check (btrim(anledning) <> ''),
  slag            text not null default 'rattning' check (slag in ('rattning','stryk')),
  fore            jsonb not null,
  efter           jsonb not null,
  underlag_atgard text not null check (underlag_atgard in ('ingen','skapat','uppdaterat','struket','aterstallt')),
  position_atgard text not null default 'ingen'
                  check (position_atgard in ('ingen','flyttad','raderad','osaker','hittades_inte','ej_hanterad')),
  position_rad    jsonb
);
create index if not exists ix_maskin_flytt_rattning_flytt on maskin_flytt_rattning (flytt_id, tid);
alter table maskin_flytt_rattning enable row level security;
drop policy if exists maskin_flytt_rattning_admin_las on maskin_flytt_rattning;
create policy maskin_flytt_rattning_admin_las on maskin_flytt_rattning
  for select to authenticated using (ar_admin());

-- EN regel för fakturerbar (samma som beraknaFakturerbar i lib/flytt/fakturerbar.ts):
--   produktion = km-gräns 30, kunduppdrag = alltid, service/annat/okänt = aldrig.
create or replace function fakturerbar_for(p_typ text, p_km numeric)
returns boolean
language sql
immutable
as $$
  select case p_typ
           when 'produktion' then coalesce(p_km, 0) >= 30
           when 'kunduppdrag' then true
           else false
         end
$$;

-- Är flyttens underlag godkänt eller fakturerat? DEFINER: fakturaunderlag_flytt har admin-only RLS, och
-- ett lås som en förares anrop inte kan se vore inget lås.
create or replace function flytt_ar_last(p_flytt uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from fakturaunderlag_flytt u
                  where u.flytt_id = p_flytt and (u.godkand_tid is not null or u.fakturerad_tid is not null))
$$;
revoke all on function flytt_ar_last(uuid) from public;
grant execute on function flytt_ar_last(uuid) to authenticated, service_role;

-- ── LÅSET ───────────────────────────────────────────────────────────────
create or replace function maskin_flytt_las()
returns trigger
language plpgsql
as $$
declare
  spar constant text[] := array['redigerad_tid','redigerad_av'];
begin
  if current_setting('app.flytt_tillat_andring', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if not flytt_ar_last(old.id) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Flytten är godkänd eller fakturerad och kan inte raderas'
      using errcode = 'check_violation',
            hint = 'Underhåll: select set_config(''app.flytt_tillat_andring'',''on'',true) i samma transaktion.';
  end if;

  if (to_jsonb(new) - spar) is not distinct from (to_jsonb(old) - spar) then
    return new;                                          -- ingenting ändras (utom spårflaggorna)
  end if;

  -- slaIhopJobb: service-rollen får byta objekt-id på från/till — och inget annat.
  if current_user = 'service_role'
     and (to_jsonb(new) - spar - 'fran_objekt_id' - 'till_objekt_id')
         is not distinct from (to_jsonb(old) - spar - 'fran_objekt_id' - 'till_objekt_id') then
    return new;
  end if;

  raise exception 'Flytten är godkänd eller fakturerad och kan inte ändras'
    using errcode = 'check_violation',
          hint = 'Lämna tillbaka den till Att godkänna först (Lastbilen › Fakturering), eller för underhåll: '
                 'select set_config(''app.flytt_tillat_andring'',''on'',true) i samma transaktion.';
end
$$;

create or replace trigger trg_maskin_flytt_las
  before update or delete on maskin_flytt
  for each row
  execute function maskin_flytt_las();

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
                                    'till_objekt_id','till_plats_id','flytt_typ','kund'];
  fel_falt text;
  n_maskin text; n_extern text; n_fran_o uuid; n_fran_p uuid; n_till_o uuid; n_till_p uuid; n_typ text; n_kund text;
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

  fore_j := jsonb_build_object('maskin_id', f.maskin_id, 'extern_maskin', f.extern_maskin,
    'fran_objekt_id', f.fran_objekt_id, 'fran_plats_id', f.fran_plats_id, 'till_objekt_id', f.till_objekt_id,
    'till_plats_id', f.till_plats_id, 'flytt_typ', f.flytt_typ, 'kund', f.kund, 'fakturerbar', f.fakturerbar);

  -- flytt_km är MÄTT/rutt och rörs inte; bara typen kan ändra domen.
  ny_fakt := fakturerbar_for(n_typ, f.flytt_km);

  -- Tabellens egna CHECK:ar (en maskin, en källa per ände, typ giltig, kunduppdrag kräver kund) vaktar resten.
  update maskin_flytt set
    maskin_id = n_maskin, extern_maskin = n_extern,
    fran_objekt_id = n_fran_o, fran_plats_id = n_fran_p, till_objekt_id = n_till_o, till_plats_id = n_till_p,
    flytt_typ = n_typ, kund = n_kund,
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
               struken_anledning = 'Flytten rättades till ' || n_typ || ' och är inte längre fakturerbar: ' || btrim(p_anledning)
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
    'till_plats_id', n_till_p, 'flytt_typ', n_typ, 'kund', n_kund, 'fakturerbar', ny_fakt);
  insert into maskin_flytt_rattning (flytt_id, av, anledning, slag, fore, efter, underlag_atgard, position_atgard)
  values (p_flytt, p_av, btrim(p_anledning), 'rattning', fore_j, efter_j, atgard, pos_atgard);

  return jsonb_build_object('fakturerbar_fore', f.fakturerbar, 'fakturerbar_efter', ny_fakt,
                            'underlag', atgard, 'position', pos_atgard);
end
$$;
revoke all on function ratta_flytt(uuid, jsonb, text, text) from public;
grant execute on function ratta_flytt(uuid, jsonb, text, text) to authenticated;

-- ── STRYK ───────────────────────────────────────────────────────────────
create or replace function stryk_flytt(p_flytt uuid, p_anledning text, p_av text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  f        maskin_flytt%rowtype;
  u        fakturaunderlag_flytt%rowtype;
  atgard   text := 'ingen';
  pos_atgard text := 'ingen';
  pos_rad  jsonb;
  pos_antal int;
  u_fanns  boolean;
begin
  if not ar_admin() then raise exception 'Bara admin kan stryka en flytt' using errcode = '42501'; end if;
  if p_anledning is null or btrim(p_anledning) = '' then raise exception 'Skriv varför flytten stryks' using errcode = 'not_null_violation'; end if;
  if p_av is null or btrim(p_av) = '' then raise exception 'Skriv vem som stryker (p_av)' using errcode = 'not_null_violation'; end if;

  select * into f from maskin_flytt where id = p_flytt for update;
  if not found then raise exception 'Flytten finns inte' using errcode = 'no_data_found'; end if;
  if f.avbruten then raise exception 'Flytten är redan avbruten eller struken' using errcode = 'check_violation'; end if;
  if f.sluttid is null then raise exception 'Flytten pågår — avbryt den i förarflödet' using errcode = 'check_violation'; end if;

  select * into u from fakturaunderlag_flytt where flytt_id = p_flytt for update;
  u_fanns := found;
  if found and u.fakturerad_tid is not null then raise exception 'Flytten är fakturerad och går inte att stryka' using errcode = 'check_violation'; end if;
  if found and u.godkand_tid is not null then raise exception 'Flytten är godkänd för fakturering — lämna tillbaka den till Att godkänna först' using errcode = 'check_violation'; end if;

  update maskin_flytt set avbruten = true, redigerad_tid = now(), redigerad_av = p_av where id = p_flytt;

  if u_fanns and u.status = 'aktiv' then
    update fakturaunderlag_flytt set status = 'struken', struken_tid = now(), struken_av = p_av,
           struken_anledning = 'Flytten struken: ' || btrim(p_anledning)
     where id = u.id;
    atgard := 'struket';
  end if;

  -- Positionsraden som skrevs vid "Lämnat": falsk data för en flytt som aldrig hände. Raderas bara vid EXAKT matchning.
  if f.maskin_id is not null and f.till_lat is not null and f.till_lng is not null then
    select count(*) into pos_antal from maskin_position
     where maskin_id = f.maskin_id and tidpunkt = f.sluttid and lat = f.till_lat and lng = f.till_lng;
    if pos_antal = 1 then
      select to_jsonb(p) into pos_rad from maskin_position p
       where maskin_id = f.maskin_id and tidpunkt = f.sluttid and lat = f.till_lat and lng = f.till_lng;
      delete from maskin_position
       where maskin_id = f.maskin_id and tidpunkt = f.sluttid and lat = f.till_lat and lng = f.till_lng;
      pos_atgard := 'raderad';
    elsif pos_antal = 0 then pos_atgard := 'hittades_inte';
    else pos_atgard := 'osaker';
    end if;
  end if;

  insert into maskin_flytt_rattning (flytt_id, av, anledning, slag, fore, efter, underlag_atgard, position_atgard, position_rad)
  values (p_flytt, p_av, btrim(p_anledning), 'stryk',
          jsonb_build_object('avbruten', false, 'flytt_typ', f.flytt_typ, 'fakturerbar', f.fakturerbar),
          jsonb_build_object('avbruten', true), atgard, pos_atgard, pos_rad);

  return jsonb_build_object('underlag', atgard, 'position', pos_atgard);
end
$$;
revoke all on function stryk_flytt(uuid, text, text) from public;
grant execute on function stryk_flytt(uuid, text, text) to authenticated;

-- ── Kvitto ──────────────────────────────────────────────────────────────
-- 1. Fakturerbar-regeln i SQL mot appens testtabell (lib/flytt/__fixtures__/fakturerbar_tabell.json).
--    Förväntat: 0 rader (ingen avvikelse).
select * from (values
  ('produktion',  null::numeric, false),
  ('produktion',  0::numeric,    false),
  ('produktion',  29.9::numeric, false),
  ('produktion',  30::numeric,   true),
  ('produktion',  53::numeric,   true),
  ('service',     100::numeric,  false),
  ('annat',       100::numeric,  false),
  ('kunduppdrag', null::numeric, true),
  ('kunduppdrag', 0::numeric,    true),
  ('kunduppdrag', 20::numeric,   true),
  ('okand',       100::numeric,  false)
) as t(typ, km, forvantat)
where fakturerbar_for(typ, km) is distinct from forvantat;

-- 2. Låset och funktionerna finns. Förväntat: trg_maskin_flytt_las = true, tre funktioner.
select (select count(*) = 1 from pg_trigger where tgname = 'trg_maskin_flytt_las' and not tgisinternal) as las_finns,
       (select count(*) from pg_proc where proname in ('ratta_flytt','stryk_flytt','fakturerbar_for','flytt_ar_last')) as funktioner;

-- 3. Inga rättningar än. Förväntat: 0.
select count(*) as rattningar from maskin_flytt_rattning;
