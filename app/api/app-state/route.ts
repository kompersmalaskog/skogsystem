import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Enkel debug-nyckel. INTE för produktionsanvändning — bypass:ar appens
// vanliga auth. Byt / roadmappa bort när extern diagnostik inte behövs längre.
const DEBUG_KEY = 'skogsystem-debug';

function idag() {
  return new Date().toISOString().split('T')[0];
}

function datumFörDagarSedan(dagar: number) {
  const d = new Date();
  d.setDate(d.getDate() - dagar);
  return d.toISOString().split('T')[0];
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const key = url.searchParams.get('key');
  if (key !== DEBUG_KEY) {
    return NextResponse.json({ ok: false, error: 'Ogiltig nyckel' }, { status: 401 });
  }

  const id = url.searchParams.get('id');
  const namn = url.searchParams.get('namn');
  if (!id && !namn) {
    return NextResponse.json(
      { ok: false, error: 'Ange ?id=<uuid> eller ?namn=<del av namn>' },
      { status: 400 },
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Hämta medarbetaren — UUID eller namnmatchning
  const medQuery = supabase.from('medarbetare').select('id, namn, maskin_id');
  const medRes = id
    ? await medQuery.eq('id', id).maybeSingle()
    : await medQuery.ilike('namn', `%${namn}%`).limit(1).maybeSingle();

  if (medRes.error) {
    return NextResponse.json(
      { ok: false, error: medRes.error.message },
      { status: 500 },
    );
  }
  const med = medRes.data;
  if (!med) {
    return NextResponse.json(
      { ok: false, error: 'Ingen medarbetare hittades' },
      { status: 404 },
    );
  }

  const idagKey = idag();
  const sjuDagarKey = datumFörDagarSedan(7);
  const trettioDagarKey = datumFörDagarSedan(30);
  const nu = new Date();
  const månadStart = `${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, '0')}-01`;
  const månadSlut = (() => {
    const sista = new Date(nu.getFullYear(), nu.getMonth() + 1, 0);
    return `${sista.getFullYear()}-${String(sista.getMonth() + 1).padStart(2, '0')}-${String(sista.getDate()).padStart(2, '0')}`;
  })();

  const [arbRes, extraRes, månadRes, avtalRes, lonesystemRes] = await Promise.all([
    supabase
      .from('arbetsdag')
      .select('*')
      .eq('medarbetare_id', med.id)
      .gte('datum', trettioDagarKey)
      .order('datum', { ascending: false }),
    supabase
      .from('extra_tid')
      .select('*')
      .eq('medarbetare_id', med.id)
      .gte('datum', sjuDagarKey)
      .order('datum', { ascending: false })
      .order('start_tid', { ascending: true }),
    supabase
      .from('arbetsdag')
      .select('datum, arbetad_min, km_totalt, dagtyp, bekraftad')
      .eq('medarbetare_id', med.id)
      .gte('datum', månadStart)
      .lte('datum', månadSlut),
    supabase
      .from('gs_avtal')
      .select('*')
      .lte('giltigt_fran', idagKey)
      .or(`giltigt_till.is.null,giltigt_till.gte.${idagKey}`)
      .order('giltigt_fran', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('medarbetare_lonesystem')
      .select('anstallningsnummer')
      .eq('medarbetare_id', med.id)
      .maybeSingle(),
  ]);

  if (arbRes.error) {
    return NextResponse.json({ ok: false, error: arbRes.error.message }, { status: 500 });
  }
  if (extraRes.error) {
    return NextResponse.json({ ok: false, error: extraRes.error.message }, { status: 500 });
  }

  const arbDagar = arbRes.data || [];
  const extra = extraRes.data || [];
  const månadDagar = månadRes.data || [];
  const avtal = avtalRes.data || null;
  const anstNr = lonesystemRes.data?.anstallningsnummer || null;

  const idagArb = arbDagar.find(d => d.datum === idagKey) || null;
  const idagExtra = extra.filter(e => e.datum === idagKey);
  const aktivTimer = extra.find(e => e.datum === idagKey && e.start_tid && !e.slut_tid) || null;

  const sjuDagarArb = arbDagar.filter(d => d.datum >= sjuDagarKey);
  const senaste7 = sjuDagarArb.map(d => ({
    datum: d.datum,
    dagtyp: d.dagtyp,
    arbetad_min: d.arbetad_min,
    km_totalt: d.km_totalt,
    bekraftad: d.bekraftad,
    extra_tid: extra
      .filter(e => e.datum === d.datum)
      .map(e => ({
        typ: e.aktivitet_typ,
        start_tid: e.start_tid,
        slut_tid: e.slut_tid,
        minuter: e.minuter,
        debiterbar: e.debiterbar,
      })),
  }));

  // Kalender: senaste 30 dagar, kompakt format för översikt
  const kalender = arbDagar.map(d => ({
    datum: d.datum,
    dagtyp: d.dagtyp,
    bekraftad: !!d.bekraftad,
    timmar: d.arbetad_min != null ? Math.round((d.arbetad_min / 60) * 10) / 10 : 0,
  }));

  // Löneunderlag: aktuell månad — jobbat, mål, körning, ersättning
  const jobbatMin = månadDagar.reduce((s, d) => s + (d.arbetad_min || 0), 0);
  const korningKm = månadDagar.reduce((s, d) => s + (d.km_totalt || 0), 0);
  // Arbetsdagar (mån-fre) hittills denna månad
  let arbetsdagarTillsIdag = 0;
  for (let day = 1; day <= nu.getDate(); day++) {
    const dow = new Date(nu.getFullYear(), nu.getMonth(), day).getDay();
    if (dow !== 0 && dow !== 6) arbetsdagarTillsIdag++;
  }
  const ordinarieVeckaH = Number(avtal?.ordinarie_vecka_h) || 40;
  const målH = Math.round((ordinarieVeckaH / 5) * arbetsdagarTillsIdag * 10) / 10;
  const frikm = Number(avtal?.km_fri_pendling) || 0;
  const kmPerMil = Number(avtal?.fardtid_kr_per_mil) || 0;
  const ersKm = Math.max(0, korningKm - frikm);
  const ersMil = ersKm > 0 ? Math.ceil(ersKm / 10) : 0;
  const kmErsattningKr = Math.round(ersMil * kmPerMil * 100) / 100;

  // Fortnox — försök live-anrop om employee-details är tillgängligt (ingen
  // persistent cache finns ännu). Tolererar fel så endpointen fortfarande
  // svarar om Fortnox är nere.
  let fortnox: any = null;
  if (anstNr) {
    try {
      const base = url.origin;
      const fnRes = await fetch(
        `${base}/api/fortnox/employee-details?medarbetare_id=${encodeURIComponent(med.id)}`,
        { cache: 'no-store' },
      );
      if (fnRes.ok) {
        const fnData = await fnRes.json();
        if (fnData?.ok) {
          fortnox = {
            anstallningsnummer: fnData.anstallningsnummer,
            semester: fnData.semester,
            atk: fnData.atk,
            lon: fnData.lon,
            hämtad: 'live',
          };
        } else {
          fortnox = { hämtad: 'ej_tillgänglig', meddelande: fnData?.meddelande || null };
        }
      } else {
        fortnox = { hämtad: 'http_fel', status: fnRes.status };
      }
    } catch (e: any) {
      fortnox = { hämtad: 'exception', meddelande: e.message || String(e) };
    }
  } else {
    fortnox = { hämtad: 'ingen_mappning' };
  }

  return NextResponse.json({
    ok: true,
    forare: med.namn,
    id: med.id,
    maskin_id: med.maskin_id,
    idag: idagArb
      ? {
          datum: idagArb.datum,
          dagtyp: idagArb.dagtyp,
          start_tid: idagArb.start_tid,
          slut_tid: idagArb.slut_tid,
          rast_min: idagArb.rast_min,
          arbetad_min: idagArb.arbetad_min,
          korning_km: idagArb.km_totalt,
          km_morgon: idagArb.km_morgon,
          km_kvall: idagArb.km_kvall,
          traktamente: idagArb.traktamente,
          bekraftad: idagArb.bekraftad,
          bekraftad_tid: idagArb.bekraftad_tid,
          objekt_id: idagArb.objekt_id,
          maskin_id: idagArb.maskin_id,
          extra_tid: idagExtra.map(e => ({
            id: e.id,
            typ: e.aktivitet_typ,
            start_tid: e.start_tid,
            slut_tid: e.slut_tid,
            minuter: e.minuter,
            debiterbar: e.debiterbar,
            kommentar: e.kommentar,
            objekt_id: e.objekt_id,
          })),
        }
      : {
          datum: idagKey,
          dagtyp: null,
          start_tid: null,
          slut_tid: null,
          rast_min: null,
          bekraftad: false,
          extra_tid: idagExtra.map(e => ({
            id: e.id,
            typ: e.aktivitet_typ,
            start_tid: e.start_tid,
            slut_tid: e.slut_tid,
            minuter: e.minuter,
          })),
          korning_km: 0,
          traktamente: null,
        },
    aktiv_timer: aktivTimer
      ? {
          id: aktivTimer.id,
          typ: aktivTimer.aktivitet_typ,
          start_tid: aktivTimer.start_tid,
          datum: aktivTimer.datum,
          kommentar: aktivTimer.kommentar,
        }
      : null,
    senaste_7_dagar: senaste7,
    kalender,
    loneunderlag: {
      period: { från: månadStart, till: månadSlut },
      jobbat_h: Math.round((jobbatMin / 60) * 10) / 10,
      mal_h: målH,
      korning_km: korningKm,
      km_ersattning_kr: kmErsattningKr,
      km_over_grans: ersKm,
      frikm,
      kr_per_mil: kmPerMil,
      arbetsdagar_tills_idag: arbetsdagarTillsIdag,
    },
    gs_avtal: avtal
      ? {
          id: avtal.id,
          namn: avtal.namn,
          giltigt_fran: avtal.giltigt_fran,
          giltigt_till: avtal.giltigt_till,
          ordinarie_vecka_h: avtal.ordinarie_vecka_h,
          overtid_vardag_pct: avtal.overtid_vardag_pct,
          overtid_helg_pct: avtal.overtid_helg_pct,
          overtid_vardag_kr: avtal.overtid_vardag_kr,
          overtid_helg_kr: avtal.overtid_helg_kr,
          ob_kvall_kr: avtal.ob_kvall_kr,
          ob_natt_kr: avtal.ob_natt_kr,
          ob_helg_kr: avtal.ob_helg_kr,
          ob_sondag_kr: avtal.ob_sondag_kr,
          km_fri_pendling: avtal.km_fri_pendling,
          km_ersattning_kr: avtal.km_ersattning_kr,
          fardtid_kr_per_mil: avtal.fardtid_kr_per_mil,
          traktamente_hel_kr: avtal.traktamente_hel_kr,
          traktamente_halv_kr: avtal.traktamente_halv_kr,
          atk_procent: avtal.atk_procent,
          semester_dagar_ar: avtal.semester_dagar_ar,
          sjuklon_pct: avtal.sjuklon_pct,
          semester_ersattning_pct: avtal.semester_ersattning_pct,
        }
      : null,
    fortnox,
  });
}
