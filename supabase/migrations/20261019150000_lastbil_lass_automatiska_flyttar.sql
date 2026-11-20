-- Lastbilens lass → automatiska flyttar (steg 2 av 4, "Förarflödet: automatiska flyttar").
--
-- Bilen sänder sin bruttovikt (rFMS grossCombinationVehicleWeight) i lastbil_logg. En maskin på bilen syns som 34–60 t mot
-- cirka 22–32 t tom. Från 1 aug till 15 okt fanns 45 lass i vikten men bara 16 registrerade flyttar; resten finns bara i
-- loggen. Cron:en (/api/scania/cron) hittar nu varje lass, föreslår maskin och — när maskinens eget GPS-spår följer bilen —
-- skapar flytten själv. I övriga fall frågar appen "Vilken maskin?".
--
-- Den här migrationen lägger till (inget befintligt ändras, ingen befintlig rad rörs):
--   1. lastbil_lass        — ett lass per rad: lassning, lossning, lastvikt, km, föreslagen maskin, säkerhet, status, flytt_id.
--   2. lastbil_lass_state  — en rad per bil: när lassdetekteringen senast kördes och vad den rapporterade (cron-puls).
--   3. push_subscriptions.senast_oppnad — när appen senast öppnades på enheten ("var inne i appen under rundan").
--   4. lastbil_maskin_foljer / lastbil_maskin_narvaro — var maskinens eget GPS-spår (detalj_gps_spar) låg när bilen var lastad.
--   5. skapa_flytt_ur_lass — skapar flytten (maskin_flytt) ur ett lass. Befintliga trigger skapar fakturaunderlaget (ogodkänt).
--   6. besvara_lass / avvisa_lass — admin svarar på "Vilken maskin?" i appen. Första svaret vinner.
--   7. fyll_flytt_ur_lass  — förarens egen flytt matchas mot lasset; saknad odometer och Från fylls i. Skapar ingen dubblett.
--
-- Tider: lastbil_logg.tidpunkt är verkligt UTC. detalj_gps_spar.tidpunkt är det inte för äldre rader (tid_ar_utc = false:
-- svensk väggklocka lagrad som UTC) — opti_tid_utc() räknar om per rad, så proximitetsfrågorna är rätt i alla blandlägen.
--
-- Idempotent: kan köras om. Additiv: nya tabeller, nya funktioner, en ny nullbar kolumn.

-- ── 1. lastbil_lass ─────────────────────────────────────────────────────────────────────────────────
create table if not exists public.lastbil_lass (
  id                    uuid primary key default gen_random_uuid(),
  vin                   text not null,

  -- Identitet: första lastade loggpunkten. Samma lass får aldrig två rader (unik nyckel nedan).
  forsta_lastad_tid     timestamptz not null,
  sista_lastad_tid      timestamptz not null,

  -- Lassning. lassning_fran = sista tomma punkten före (tidigast möjliga lastning), lassning_tid = första lastade punkten.
  lassning_fran         timestamptz,
  lassning_tid          timestamptz not null,
  lassning_lat          double precision,
  lassning_lng          double precision,
  lassning_odometer_m   bigint,
  lassning_plats_saker  boolean not null default false,   -- bilen stod stilla där vikten ändrades

  -- Lossning. lossning_tid = BEDÖMD lossningstid (valdes en tom punkt är det den; stod bilen lastad vid lossningen: mitt emellan sista
  -- lastade och första tomma punkten), lossning_till = första tomma punkten efter.
  lossning_tid          timestamptz not null,
  lossning_till         timestamptz,
  lossning_lat          double precision,
  lossning_lng          double precision,
  lossning_odometer_m   bigint,
  lossning_plats_saker  boolean not null default false,

  tom_vikt_kg           integer,        -- bilens tomvikt före/efter (medel)
  lastad_vikt_kg        integer,        -- median bruttovikt medan den var lastad
  lastvikt_kg           integer,        -- lastad minus tom (±5 t: viktgivaren svajar)
  km                    numeric(6,1),   -- odometer vid lossning minus vid lassning

  -- Platserna: närmaste trakt/flyttplats (aldrig bara koordinater). Namnet sparas för notistext och listor.
  fran_objekt_id        uuid references public.objekt(id) on delete set null,
  fran_plats_id         uuid references public.flyttplats(id) on delete set null,
  fran_namn             text,
  fran_avstand_m        integer,
  till_objekt_id        uuid references public.objekt(id) on delete set null,
  till_plats_id         uuid references public.flyttplats(id) on delete set null,
  till_namn             text,
  till_avstand_m        integer,

  -- Maskinen. forslag_* = vad detekteringen tror; maskin_id/extern_maskin = det som blev flytten.
  forslag_maskin_id     text references public.dim_maskin(maskin_id),
  sakerhet              text not null check (sakerhet in ('hog','medel','lag','okand')),
  kandidater            jsonb not null default '[]'::jsonb,   -- rangordnade maskiner med poäng och skäl
  bevis                 jsonb not null default '{}'::jsonb,   -- GPS-spår, kedja, mätvärden: det som styrkte förslaget
  maskin_id             text references public.dim_maskin(maskin_id),
  extern_maskin         text,
  kund                  text,

  status                text not null check (status in ('auto_flytt','vantar_maskin','matchad_manuell','avvisad')),
  status_orsak          text,           -- varför lasset väntar/avvisades (t.ex. sakerhet, kund_saknas, plats_osaker, ingen_transport)
  flytt_id              uuid references public.maskin_flytt(id) on delete set null,

  besvarad_av           text,           -- 'auto' | 'matchad' | namn på den som svarade
  besvarad_tid          timestamptz,
  skapad_tid            timestamptz not null default now(),

  constraint lastbil_lass_unik unique (vin, forsta_lastad_tid),
  constraint lastbil_lass_tidsordning check (sista_lastad_tid >= forsta_lastad_tid),
  constraint lastbil_lass_en_maskin check (maskin_id is null or extern_maskin is null)
);

comment on table public.lastbil_lass is
  'Ett lass på lastbilen, funnet ur grossCombinationVehicleWeight i lastbil_logg (lastad ≥ 34 t, tom ≤ 32 t). status: auto_flytt = flytten skapad ur lasset, vantar_maskin = någon ska svara "Vilken maskin?", matchad_manuell = förarens egen flytt matchad, avvisad = inget flyttlass.';

create unique index if not exists lastbil_lass_flytt_unik
  on public.lastbil_lass (flytt_id) where flytt_id is not null;
create index if not exists lastbil_lass_vantar
  on public.lastbil_lass (skapad_tid) where status = 'vantar_maskin';
create index if not exists lastbil_lass_tid
  on public.lastbil_lass (vin, lassning_tid desc);

alter table public.lastbil_lass enable row level security;
drop policy if exists lastbil_lass_admin_las on public.lastbil_lass;
create policy lastbil_lass_admin_las on public.lastbil_lass for select to authenticated using (public.ar_admin());
-- Ingen skrivpolicy: klienten skriver aldrig direkt. cron:en (service_role) och funktionerna nedan skriver.
revoke insert, update, delete on public.lastbil_lass from anon, authenticated;

-- ── 2. lastbil_lass_state: cron-pulsen ───────────────────────────────────────────────────────────────
-- Svarar på "körs cron:en?": lastbil_logg blir tyst när bilen står parkerad (Scania sänder inget då), så en lucka i loggen
-- säger inget om cron:en. Den här raden uppdateras VARJE cykel, också när ingen ny loggpunkt kom.
create table if not exists public.lastbil_lass_state (
  vin               text primary key,
  senast_kord       timestamptz not null default now(),
  senaste_logg_tid  timestamptz,
  senaste_rapport   jsonb
);
alter table public.lastbil_lass_state enable row level security;
drop policy if exists lastbil_lass_state_admin_las on public.lastbil_lass_state;
create policy lastbil_lass_state_admin_las on public.lastbil_lass_state for select to authenticated using (public.ar_admin());
revoke insert, update, delete on public.lastbil_lass_state from anon, authenticated;

-- ── 3. Närvaro: när öppnades appen senast på enheten ─────────────────────────────────────────────────
-- Skrivs av /api/push/subscribe (anropas av PushRegister vid varje appstart). push_subscriptions.last_used duger inte:
-- /api/notify uppdaterar den vid varje utskick, så ett skickat meddelande såg ut som att personen var inne i appen.
alter table public.push_subscriptions add column if not exists senast_oppnad timestamptz;
comment on column public.push_subscriptions.senast_oppnad is
  'När appen senast öppnades på enheten (PushRegister → /api/push/subscribe). Används för att välja vem som får "Vilken maskin?".';

-- ── 4. Maskinens eget GPS-spår mot bilens lastade punkter ────────────────────────────────────────────
-- p_punkter = [{"t": "<UTC-tid>", "lat": .., "lng": ..}, ...] (bilens lastade loggpunkter). För varje punkt och maskin: avståndet
-- till maskinens närmaste GPS-punkt inom ±150 s (efter omräkning till verkligt UTC). Ingen rad = maskinen loggade inte då.
create or replace function public.lastbil_maskin_foljer(p_punkter jsonb, p_maskiner text[])
returns table (maskin_id text, idx integer, dist_m double precision)
language sql stable security definer set search_path = public as $$
  with p as (
    select (o.ord - 1)::integer as idx,
           (o.v->>'t')::timestamptz as t,
           (o.v->>'lat')::double precision as lat,
           (o.v->>'lng')::double precision as lng
    from jsonb_array_elements(p_punkter) with ordinality as o(v, ord)
  )
  select m.maskin_id, p.idx, g.dist
  from p
  cross join unnest(p_maskiner) as m(maskin_id)
  join lateral (
    select 6371000 * acos(least(1, sin(radians(s.latitude::double precision)) * sin(radians(p.lat))
                                 + cos(radians(s.latitude::double precision)) * cos(radians(p.lat))
                                   * cos(radians(s.longitude::double precision - p.lng)))) as dist
    from public.detalj_gps_spar s
    where s.maskin_id = m.maskin_id
      -- tre smala intervall så index (maskin_id, tidpunkt) används: verkligt UTC, och äldre rader (väggklocka som UTC: +1 h
      -- vintertid, +2 h sommartid). Exakt träff avgörs sedan på det omräknade verkliga UTC.
      and (   s.tidpunkt between p.t - interval '150 seconds' and p.t + interval '150 seconds'
           or s.tidpunkt between p.t + interval '1 hour' - interval '150 seconds' and p.t + interval '1 hour' + interval '150 seconds'
           or s.tidpunkt between p.t + interval '2 hours' - interval '150 seconds' and p.t + interval '2 hours' + interval '150 seconds')
      and abs(extract(epoch from (public.opti_tid_utc(s.tidpunkt, s.tid_ar_utc) - p.t))) <= 150
    order by abs(extract(epoch from (public.opti_tid_utc(s.tidpunkt, s.tid_ar_utc) - p.t)))
    limit 1
  ) g on true
$$;

-- Maskinens första (p_forsta) eller sista GPS-punkt i ett tidsfönster, med avstånd till en plats. Skördaren H8E har datorn
-- av under transport: den syns först när den startas vid lossningsplatsen och sist där den arbetade före lastningen.
create or replace function public.lastbil_maskin_narvaro(
  p_maskiner text[], p_lat double precision, p_lng double precision,
  p_fran timestamptz, p_till timestamptz, p_forsta boolean)
returns table (maskin_id text, tid timestamptz, dist_m double precision)
language sql stable security definer set search_path = public as $$
  select m.maskin_id, g.tid, g.dist
  from unnest(p_maskiner) as m(maskin_id)
  join lateral (
    select public.opti_tid_utc(s.tidpunkt, s.tid_ar_utc) as tid,
           6371000 * acos(least(1, sin(radians(s.latitude::double precision)) * sin(radians(p_lat))
                                 + cos(radians(s.latitude::double precision)) * cos(radians(p_lat))
                                   * cos(radians(s.longitude::double precision - p_lng)))) as dist
    from public.detalj_gps_spar s
    where s.maskin_id = m.maskin_id
      and s.tidpunkt between p_fran and p_till + interval '2 hours'
      and public.opti_tid_utc(s.tidpunkt, s.tid_ar_utc) between p_fran and p_till
    order by case when p_forsta then extract(epoch from public.opti_tid_utc(s.tidpunkt, s.tid_ar_utc))
                  else -extract(epoch from public.opti_tid_utc(s.tidpunkt, s.tid_ar_utc)) end
    limit 1
  ) g on true
$$;

revoke all on function public.lastbil_maskin_foljer(jsonb, text[]) from public, anon, authenticated;
revoke all on function public.lastbil_maskin_narvaro(text[], double precision, double precision, timestamptz, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.lastbil_maskin_foljer(jsonb, text[]) to service_role;
grant execute on function public.lastbil_maskin_narvaro(text[], double precision, double precision, timestamptz, timestamptz, boolean) to service_role;

-- ── 5. skapa_flytt_ur_lass ───────────────────────────────────────────────────────────────────────────
-- Skapar maskin_flytt ur ett lass som väntar. Anropas av cron:en (service_role, p_av = 'auto') när maskinens GPS-spår följt bilen,
-- och av besvara_lass när en admin svarat. En transaktion: flytten, maskinens nya position, lassets status.
-- Befintliga trigger trg_fakturaunderlag_flytt skapar det ogodkända fakturaunderlaget (flytten är fakturerbar och har sluttid).
--
-- fakturerbar följer EN regel: fakturerbar_effektiv(typ, km, null) — samma som förarflödet och rättningen.
-- Faktureras flytten måste en kund finnas ("Välj kund — flytten faktureras"), annars skapas ingenting.
create or replace function public.skapa_flytt_ur_lass(
  p_lass uuid, p_maskin_id text, p_extern_maskin text, p_kund text, p_av text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l        lastbil_lass%rowtype;
  v_typ    text := 'produktion';
  v_kund   text;
  v_fakt   boolean;
  v_dag    uuid;
  v_ny     uuid;
  v_slut   timestamptz;
  v_plats_typ text;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.ar_admin() then
    raise exception 'Bara admin eller cron kan skapa en flytt ur ett lass' using errcode = '42501';
  end if;

  select * into l from lastbil_lass where id = p_lass for update;
  if not found then raise exception 'Lasset finns inte' using errcode = 'no_data_found'; end if;
  if l.flytt_id is not null then
    return jsonb_build_object('skapad', false, 'orsak', 'finns_redan', 'flytt_id', l.flytt_id);
  end if;
  if l.status <> 'vantar_maskin' then
    return jsonb_build_object('skapad', false, 'orsak', 'redan_hanterat', 'status', l.status);
  end if;

  if (nullif(btrim(coalesce(p_maskin_id, '')), '') is null) = (nullif(btrim(coalesce(p_extern_maskin, '')), '') is null) then
    raise exception 'Välj en maskin, eller skriv namnet på maskinen som inte är vår' using errcode = 'check_violation';
  end if;
  if nullif(btrim(coalesce(p_maskin_id, '')), '') is not null
     and not exists (select 1 from dim_maskin where maskin_id = p_maskin_id) then
    raise exception 'Okänd maskin %', p_maskin_id using errcode = 'foreign_key_violation';
  end if;
  if l.km is null or l.lassning_lat is null or l.lassning_lng is null or l.lossning_lat is null or l.lossning_lng is null then
    raise exception 'Lasset saknar plats eller sträcka — rätta flytten för hand' using errcode = 'check_violation';
  end if;

  -- Typ: maskin som inte är vår = kunduppdrag (alltid fakturerbart, kund krävs); verkstad som mål = service (som förarflödet).
  if nullif(btrim(coalesce(p_extern_maskin, '')), '') is not null then
    v_typ := 'kunduppdrag';
  elsif l.till_plats_id is not null then
    select typ into v_plats_typ from flyttplats where id = l.till_plats_id;
    if v_plats_typ = 'verkstad' then v_typ := 'service'; end if;
  end if;

  v_fakt := fakturerbar_effektiv(v_typ, l.km, null);
  v_kund := coalesce(nullif(btrim(coalesce(p_kund, '')), ''), nullif(btrim(coalesce(l.kund, '')), ''));
  if v_fakt and v_kund is null then
    raise exception 'Välj kund — flytten faktureras' using errcode = 'check_violation';
  end if;
  if not v_fakt then v_kund := null; end if;   -- en kund på en flytt som inte faktureras är bara brus

  -- Rundan lasset hör till (bilen på väg ut och hem). Saknas den skapas flytten ändå, utan runda.
  select id into v_dag from flyttdag
   where (vin = l.vin or vin is null) and starttid <= l.lassning_tid and (sluttid is null or sluttid >= l.lassning_tid)
   order by starttid desc limit 1;

  v_slut := greatest(l.lossning_tid, l.lassning_tid);

  insert into maskin_flytt (
    maskin_id, extern_maskin, flyttdag_id,
    fran_objekt_id, fran_plats_id, fran_lat, fran_lng, fran_odometer_m,
    till_objekt_id, till_plats_id, till_lat, till_lng, till_odometer_m, koord_kalla,
    flytt_km, fakturerbar, flytt_typ, kund,
    starttid, hamtad_tid, sluttid, tid_flytt_min, avbruten)
  values (
    nullif(btrim(coalesce(p_maskin_id, '')), ''), nullif(btrim(coalesce(p_extern_maskin, '')), ''), v_dag,
    l.fran_objekt_id, l.fran_plats_id, l.lassning_lat, l.lassning_lng, l.lassning_odometer_m,
    l.till_objekt_id, l.till_plats_id, l.lossning_lat, l.lossning_lng, l.lossning_odometer_m, 'lastbil',
    l.km, v_fakt, v_typ, v_kund,
    coalesce(l.lassning_fran, l.lassning_tid), l.lassning_tid, v_slut,
    round(extract(epoch from (v_slut - l.lassning_tid)) / 60.0), false)
  returning id into v_ny;

  -- Maskinens nya position (bara egna maskiner, som förarflödet) — och bara när bilen stod stilla vid lossningen.
  if nullif(btrim(coalesce(p_maskin_id, '')), '') is not null and l.lossning_plats_saker then
    insert into maskin_position (maskin_id, lat, lng, tidpunkt) values (p_maskin_id, l.lossning_lat, l.lossning_lng, v_slut);
  end if;

  update lastbil_lass set
    status = 'auto_flytt', status_orsak = null, flytt_id = v_ny,
    maskin_id = nullif(btrim(coalesce(p_maskin_id, '')), ''),
    extern_maskin = nullif(btrim(coalesce(p_extern_maskin, '')), ''),
    kund = v_kund,
    besvarad_av = coalesce(nullif(btrim(coalesce(p_av, '')), ''), 'auto'), besvarad_tid = now()
  where id = l.id;

  return jsonb_build_object('skapad', true, 'flytt_id', v_ny, 'fakturerbar', v_fakt, 'km', l.km, 'flytt_typ', v_typ);
end
$$;

-- ── 6. besvara_lass / avvisa_lass: appens svar ───────────────────────────────────────────────────────
-- Första svaret vinner: raden låses, och ett andra svar får veta att det redan är besvarat (och av vem).
create or replace function public.besvara_lass(p_lass uuid, p_maskin_id text, p_extern_maskin text, p_kund text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l  lastbil_lass%rowtype;
  v_namn text;
  v_ut jsonb;
begin
  if not public.ar_admin() then raise exception 'Bara admin kan svara' using errcode = '42501'; end if;
  select coalesce(namn, 'admin') into v_namn from medarbetare where user_id = auth.uid() limit 1;

  select * into l from lastbil_lass where id = p_lass for update;
  if not found then raise exception 'Lasset finns inte' using errcode = 'no_data_found'; end if;
  if l.status <> 'vantar_maskin' then
    return jsonb_build_object('ok', false, 'redan', true, 'status', l.status, 'av', l.besvarad_av, 'tid', l.besvarad_tid, 'flytt_id', l.flytt_id);
  end if;

  v_ut := public.skapa_flytt_ur_lass(p_lass, p_maskin_id, p_extern_maskin, p_kund, coalesce(v_namn, 'admin'));
  return v_ut || jsonb_build_object('ok', coalesce((v_ut->>'skapad')::boolean, false));
end
$$;

create or replace function public.avvisa_lass(p_lass uuid, p_orsak text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l  lastbil_lass%rowtype;
  v_namn text;
begin
  if not public.ar_admin() then raise exception 'Bara admin kan avvisa ett lass' using errcode = '42501'; end if;
  select coalesce(namn, 'admin') into v_namn from medarbetare where user_id = auth.uid() limit 1;

  select * into l from lastbil_lass where id = p_lass for update;
  if not found then raise exception 'Lasset finns inte' using errcode = 'no_data_found'; end if;
  if l.status <> 'vantar_maskin' then
    return jsonb_build_object('ok', false, 'redan', true, 'status', l.status, 'av', l.besvarad_av, 'tid', l.besvarad_tid);
  end if;

  update lastbil_lass set status = 'avvisad', status_orsak = coalesce(nullif(btrim(coalesce(p_orsak, '')), ''), 'ingen_maskinflytt'),
    besvarad_av = coalesce(v_namn, 'admin'), besvarad_tid = now()
  where id = p_lass;
  return jsonb_build_object('ok', true);
end
$$;

-- ── 7. fyll_flytt_ur_lass: förarens egen flytt matchas mot lasset ────────────────────────────────────
-- Ingen dubblett skapas. Det lasset vet fylls i bara där flytten är TOM: odometer vid lassning och lossning, och Från
-- (objekt/plats) när flytten saknar det. Allt annat — maskin, Till, km, kund — är förarens och rörs inte. En flytt med
-- godkänt eller fakturerat underlag är låst (trg_maskin_flytt_las): då fylls inget i, men lasset kopplas ändå.
create or replace function public.fyll_flytt_ur_lass(p_lass uuid, p_flytt uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l  lastbil_lass%rowtype;
  f  maskin_flytt%rowtype;
  v_andrar boolean;
  v_last   boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.ar_admin() then
    raise exception 'Bara cron eller admin' using errcode = '42501';
  end if;
  select * into l from lastbil_lass where id = p_lass for update;
  if not found then raise exception 'Lasset finns inte' using errcode = 'no_data_found'; end if;
  select * into f from maskin_flytt where id = p_flytt;
  if not found then raise exception 'Flytten finns inte' using errcode = 'no_data_found'; end if;
  if l.flytt_id is not null and l.flytt_id <> p_flytt then
    return jsonb_build_object('ok', false, 'orsak', 'lasset_har_annan_flytt');
  end if;

  v_andrar := (f.fran_odometer_m is null and l.lassning_odometer_m is not null)
           or (f.till_odometer_m is null and l.lossning_odometer_m is not null)
           or (f.fran_objekt_id is null and f.fran_plats_id is null and (l.fran_objekt_id is not null or l.fran_plats_id is not null));
  if v_andrar then
    begin
      update maskin_flytt set
        fran_odometer_m = coalesce(fran_odometer_m, l.lassning_odometer_m),
        till_odometer_m = coalesce(till_odometer_m, l.lossning_odometer_m),
        fran_objekt_id  = case when fran_objekt_id is null and fran_plats_id is null then l.fran_objekt_id else fran_objekt_id end,
        fran_plats_id   = case when fran_objekt_id is null and fran_plats_id is null then l.fran_plats_id  else fran_plats_id  end
      where id = p_flytt;
    exception when others then
      v_last := true;   -- godkänt/fakturerat underlag → låst. Lasset kopplas ändå.
    end;
  end if;

  update lastbil_lass set status = 'matchad_manuell', status_orsak = null, flytt_id = p_flytt,
    maskin_id = f.maskin_id, extern_maskin = f.extern_maskin, besvarad_av = 'matchad', besvarad_tid = now()
  where id = p_lass;
  return jsonb_build_object('ok', true, 'fyllde', v_andrar and not v_last, 'last', v_last);
end
$$;

revoke all on function public.skapa_flytt_ur_lass(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.skapa_flytt_ur_lass(uuid, text, text, text, text) to service_role;
revoke all on function public.fyll_flytt_ur_lass(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fyll_flytt_ur_lass(uuid, uuid) to service_role;
revoke all on function public.besvara_lass(uuid, text, text, text) from public, anon;
grant execute on function public.besvara_lass(uuid, text, text, text) to authenticated;
revoke all on function public.avvisa_lass(uuid, text) from public, anon;
grant execute on function public.avvisa_lass(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- ── Kvittofrågor (kör efteråt) ───────────────────────────────────────────────────────────────────────
-- 1) Tabellerna finns, RLS på, en läspolicy var (ska ge 2 rader med relrowsecurity = true):
--    select c.relname, c.relrowsecurity from pg_class c where c.relname in ('lastbil_lass','lastbil_lass_state');
--    select tablename, policyname from pg_policies where tablename in ('lastbil_lass','lastbil_lass_state');
-- 2) Kolumnen finns (1 rad):
--    select column_name from information_schema.columns where table_name = 'push_subscriptions' and column_name = 'senast_oppnad';
-- 3) Rätt behörigheter. Förväntat: foljer/narvaro/skapa/fyll = bara service_role (authenticated = false);
--    besvara/avvisa = authenticated = true:
--    select p.proname,
--           has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
--           has_function_privilege('service_role',  p.oid, 'execute') as service_role,
--           has_function_privilege('anon',          p.oid, 'execute') as anon
--      from pg_proc p where p.pronamespace = 'public'::regnamespace
--       and p.proname in ('lastbil_maskin_foljer','lastbil_maskin_narvaro','skapa_flytt_ur_lass','fyll_flytt_ur_lass','besvara_lass','avvisa_lass');
-- 4) Ingen befintlig flytt är rörd (ska vara 0): select count(*) from maskin_flytt where koord_kalla = 'lastbil';
-- 5) Proximitetsfrågan svarar på en känd händelse. Giant följde bilen 2026-10-01 09:34 UTC+2 (Kroksjömåla Grot → Vällust);
--    efter migrationen ska detta ge dist_m under 100 för Giant:
--    select * from lastbil_maskin_foljer(
--      '[{"t":"2026-10-01T07:34:00Z","lat":56.2266,"lng":14.6992}]'::jsonb, array['PONS20SDJAA270231']);
--
-- ── Rollback ─────────────────────────────────────────────────────────────────────────────────────────
-- drop function if exists public.avvisa_lass(uuid, text);
-- drop function if exists public.besvara_lass(uuid, text, text, text);
-- drop function if exists public.fyll_flytt_ur_lass(uuid, uuid);
-- drop function if exists public.skapa_flytt_ur_lass(uuid, text, text, text, text);
-- drop function if exists public.lastbil_maskin_narvaro(text[], double precision, double precision, timestamptz, timestamptz, boolean);
-- drop function if exists public.lastbil_maskin_foljer(jsonb, text[]);
-- alter table public.push_subscriptions drop column if exists senast_oppnad;
-- drop table if exists public.lastbil_lass_state;
-- drop table if exists public.lastbil_lass;
-- (Flyttar som redan skapats ur lass ligger kvar i maskin_flytt; de har koord_kalla = 'lastbil'.)
