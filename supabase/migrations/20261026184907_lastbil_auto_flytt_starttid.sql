-- Automatisk flytt: starttiden är när bilen STARTADES före lastningen (Martin 2026-10-26: "hela den flytten måste tagit mera
-- än 49 min").
--
-- Står maskinen vid basen lastas den innan bilen lämnar, och rundan (som börjar när bilen lämnar) fick inte med lastningen:
-- Wisent 26 okt — bilen startad 11:54 efter att ha stått avstängd sedan torsdag, lastad 12:08, rundan 12:09–13:40.
-- Traillertiden (lib/flytt/traillertid.ts) börjar nu vid den första flyttens starttid när den ligger före rundan, så
-- starttiden måste säga när arbetet började: den senaste "uppvakningen" (en loggpunkt utan någon punkt de 30 minuterna före)
-- inom en timme före lastningen. Finns ingen gäller regeln från 20261026183350 (sista tomma punkten inom en timme, annars
-- lastningen). Rundkopplingen är oförändrad.
--
-- Test: supabase/tests/lastbil_lass_runda.sql (fallet "vaken").

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
  v_vaken  timestamptz;
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

  -- Starttid: när bilen STARTADES före lastningen — den senaste loggpunkten inom en timme före lastningen som inte har
  -- någon punkt de 30 minuterna före sig (en avstängd bil sänder ingenting; en parkerad med tändningen på var 10:e min).
  -- Finns ingen sådan: sista tomma punkten om den ligger inom en timme, annars lastningen.
  select max(p.tidpunkt) into v_vaken from lastbil_logg p
   where p.vin = l.vin and p.tidpunkt >= l.lassning_tid - interval '1 hour' and p.tidpunkt <= l.lassning_tid
     and not exists (select 1 from lastbil_logg q
                      where q.vin = l.vin and q.tidpunkt < p.tidpunkt and q.tidpunkt >= p.tidpunkt - interval '30 minutes');
  v_start := coalesce(v_vaken,
               case when l.lassning_fran is not null and l.lassning_fran >= l.lassning_tid - interval '1 hour'
                    then l.lassning_fran else l.lassning_tid end);

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
