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

  const [arbRes, extraRes] = await Promise.all([
    supabase
      .from('arbetsdag')
      .select('*')
      .eq('medarbetare_id', med.id)
      .gte('datum', sjuDagarKey)
      .order('datum', { ascending: false }),
    supabase
      .from('extra_tid')
      .select('*')
      .eq('medarbetare_id', med.id)
      .gte('datum', sjuDagarKey)
      .order('datum', { ascending: false })
      .order('start_tid', { ascending: true }),
  ]);

  if (arbRes.error) {
    return NextResponse.json({ ok: false, error: arbRes.error.message }, { status: 500 });
  }
  if (extraRes.error) {
    return NextResponse.json({ ok: false, error: extraRes.error.message }, { status: 500 });
  }

  const arbDagar = arbRes.data || [];
  const extra = extraRes.data || [];

  const idagArb = arbDagar.find(d => d.datum === idagKey) || null;
  const idagExtra = extra.filter(e => e.datum === idagKey);
  const aktivTimer = extra.find(e => e.datum === idagKey && e.start_tid && !e.slut_tid) || null;

  const senaste7 = arbDagar.map(d => ({
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
  });
}
