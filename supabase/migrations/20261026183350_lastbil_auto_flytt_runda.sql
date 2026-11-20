-- Automatisk flytt ur ett lass: koppla till bilens runda och ge rätt starttid (Martin 2026-10-26: "det var en flytt idag också
-- men då finns det ingen tid på den").
--
-- Två fel i skapa_flytt_ur_lass (migration 20261019150000), båda sedda på Wisent 26 okt (35,4 km, lastad 12:08, lossad 12:57):
--
--  1. RUNDAN. Funktionen sökte en runda som hade BÖRJAT när maskinen lastades (starttid <= lassning_tid). Rundan skapas när bilen
--     börjar rulla, alltså EFTER lastningen — 26 okt 88 sekunder efter. Flytten fick ingen runda (flyttdag_id NULL), så
--     traillertiden (regel A, rundans start → slut) gick inte att räkna, och rundan stängdes som "Övrig körning".
--     Nu: rundan på samma bil som pågick någon gång mellan lastning och lossning. Finns flera föredras den som pågick vid
--     lastningen, annars den som började först efter den. Är rundan redan stängd som 'ovrig_korning' blir den en flyttrunda
--     ('avslutad'), samma regel som när rundan stängs (lib/lastbilRunda.ts: en flytt i rundan = avslutad).
--
--  2. STARTTIDEN. starttid = lassning_fran = "sista tomma mätpunkten före lastningen". Bilen sände inget torsdag–måndag, så den
--     punkten var 22 okt 15:47 och flytten (och fakturaunderlagets datum, som är starttid::date) hamnade på torsdagen.
--     Nu: lassning_fran bara när den ligger högst en timme före lastningen, annars lastningen.
--
-- Resten av funktionen är oförändrad (pg_get_functiondef ur prod 2026-10-26). Test: supabase/tests/lastbil_lass_runda.sql.

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
  v_start  timestamptz;
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

  v_slut := greatest(l.lossning_tid, l.lassning_tid);

  -- Rundan: samma bil, pågick någon gång mellan lastning och lossning. Den som pågick vid lastningen först, annars den som
  -- började tidigast efter. Saknas den skapas flytten ändå, utan runda.
  select id into v_dag from flyttdag
   where (vin = l.vin or vin is null)
     and starttid <= v_slut
     and (sluttid is null or sluttid >= l.lassning_tid)
   order by (starttid <= l.lassning_tid) desc,
            case when starttid <= l.lassning_tid then starttid end desc nulls last,
            starttid asc
   limit 1;

  -- Starttid: sista tomma punkten bara när den ligger nära lastningen (bilen kan ha stått avstängd i dagar).
  v_start := case when l.lassning_fran is not null and l.lassning_fran >= l.lassning_tid - interval '1 hour'
                  then l.lassning_fran else l.lassning_tid end;

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
    v_start, l.lassning_tid, v_slut,
    round(extract(epoch from (v_slut - l.lassning_tid)) / 60.0), false)
  returning id into v_ny;

  -- Redan stängd som övrig körning → nu en flyttrunda.
  if v_dag is not null then
    update flyttdag set status = 'avslutad' where id = v_dag and status = 'ovrig_korning';
  end if;

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

revoke all on function public.skapa_flytt_ur_lass(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.skapa_flytt_ur_lass(uuid, text, text, text, text) to service_role;
