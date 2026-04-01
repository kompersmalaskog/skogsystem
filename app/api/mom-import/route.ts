import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * POST /api/mom-import
 *
 * Skapar arbetsdag-rader baserat på fakt_skift-data.
 * Triggas efter lyckad MOM-import.
 *
 * Body (optional): { datum?: string } — default: alla datum utan arbetsdag
 * Använder fakt_skift för start/slut-tider och operator_medarbetare för koppling.
 * ON CONFLICT (medarbetare_id, datum) DO NOTHING — skriver aldrig över bekräftade dagar.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const filterDatum: string | undefined = body.datum;

    // 1. Hämta operator → medarbetare mappning
    const { data: mappningar, error: mapErr } = await supabase
      .from('operator_medarbetare')
      .select('operator_id, medarbetare_id');

    if (mapErr || !mappningar?.length) {
      return NextResponse.json(
        { error: 'Ingen operator_medarbetare-data', details: mapErr?.message },
        { status: 500 }
      );
    }

    const opMap: Record<string, string> = {};
    for (const m of mappningar) {
      opMap[m.operator_id] = m.medarbetare_id;
    }

    // 2. Hämta fakt_skift-rader (med operator_id som har koppling)
    let query = supabase
      .from('fakt_skift')
      .select('datum, maskin_id, operator_id, inloggning_tid, utloggning_tid, langd_sek')
      .order('datum', { ascending: false });

    if (filterDatum) {
      query = query.eq('datum', filterDatum);
    } else {
      // Senaste 30 dagarna om inget datum anges
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      query = query.gte('datum', thirtyDaysAgo.toISOString().split('T')[0]);
    }

    const { data: skift, error: skiftErr } = await query;
    if (skiftErr) {
      return NextResponse.json(
        { error: 'Kunde inte hämta fakt_skift', details: skiftErr.message },
        { status: 500 }
      );
    }

    if (!skift?.length) {
      return NextResponse.json({ created: 0, message: 'Inga skift att bearbeta' });
    }

    // 3. Hämta befintliga arbetsdag-rader (för att skippa de som redan finns)
    const datumSet = [...new Set(skift.map(s => s.datum))];
    const medarbetareIds = [...new Set(
      skift.map(s => opMap[s.operator_id]).filter(Boolean)
    )];

    const { data: befintliga } = await supabase
      .from('arbetsdag')
      .select('medarbetare_id, datum')
      .in('datum', datumSet)
      .in('medarbetare_id', medarbetareIds);

    const finnsRedan = new Set(
      (befintliga || []).map(r => `${r.medarbetare_id}_${r.datum}`)
    );

    // 4. Aggregera skift per (medarbetare_id, datum)
    type DagAgg = {
      medarbetare_id: string;
      datum: string;
      maskin_id: string;
      earliestStart: string;
      latestEnd: string;
      totalSek: number;
    };

    const dagMap: Record<string, DagAgg> = {};

    for (const s of skift) {
      const medId = opMap[s.operator_id];
      if (!medId) continue; // Ingen koppling (t.ex. Service Service)

      const key = `${medId}_${s.datum}`;
      if (finnsRedan.has(key)) continue; // Redan bekräftad

      if (!dagMap[key]) {
        dagMap[key] = {
          medarbetare_id: medId,
          datum: s.datum,
          maskin_id: s.maskin_id,
          earliestStart: s.inloggning_tid,
          latestEnd: s.utloggning_tid,
          totalSek: 0,
        };
      }

      const agg = dagMap[key];
      if (s.inloggning_tid < agg.earliestStart) agg.earliestStart = s.inloggning_tid;
      if (s.utloggning_tid > agg.latestEnd) agg.latestEnd = s.utloggning_tid;
      agg.totalSek += s.langd_sek || 0;
    }

    // 5. Skapa arbetsdag-rader
    const svTid = (iso: string) => {
      const d = new Date(iso);
      const s = d.toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit', hour12: false });
      return s;
    };
    const rows = Object.values(dagMap).map(agg => {
      const startTid = svTid(agg.earliestStart);
      const slutTid = svTid(agg.latestEnd);
      const arbetadMin = Math.round(agg.totalSek / 60);

      return {
        medarbetare_id: agg.medarbetare_id,
        datum: agg.datum,
        dagtyp: 'normal',
        start_tid: startTid,
        slut_tid: slutTid,
        rast_min: 30,
        maskin_id: agg.maskin_id,
        bekraftad: false,
      };
    });

    if (!rows.length) {
      return NextResponse.json({ created: 0, message: 'Alla dagar finns redan' });
    }

    // 6. Insert — duplicat-filtrering sker redan ovan via finnsRedan
    const { data: inserted, error: insertErr } = await supabase
      .from('arbetsdag')
      .insert(rows)
      .select('id');

    if (insertErr) {
      return NextResponse.json(
        { error: 'Kunde inte skapa arbetsdagar', details: insertErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      created: inserted?.length || 0,
      skipped: rows.length - (inserted?.length || 0),
      message: `${inserted?.length || 0} arbetsdagar skapade`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Okänt fel';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
