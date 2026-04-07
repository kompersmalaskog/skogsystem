import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * POST /api/mom-import
 *
 * Skapar/uppdaterar arbetsdag-rader baserat på fakt_skift-data.
 * Manuellt redigerade rader (redigerad=true) skrivs aldrig över.
 * Övriga rader raderas och återskapas med färsk data.
 *
 * Body (optional): { datum?: string }
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

    // 2. Hämta fakt_skift-rader
    let query = supabase
      .from('fakt_skift')
      .select('datum, maskin_id, operator_id, inloggning_tid, utloggning_tid, langd_sek')
      .order('datum', { ascending: false });

    if (filterDatum) {
      query = query.eq('datum', filterDatum);
    } else {
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

    // 3. Hämta manuellt redigerade rader (dessa ska inte röras)
    const datumSet = [...new Set(skift.map(s => s.datum))];
    const medarbetareIds = [...new Set(
      skift.map(s => opMap[s.operator_id]).filter(Boolean)
    )];

    const { data: redigerade } = await supabase
      .from('arbetsdag')
      .select('medarbetare_id, datum')
      .in('datum', datumSet)
      .in('medarbetare_id', medarbetareIds)
      .eq('redigerad', true);

    const skyddade = new Set(
      (redigerade || []).map(r => `${r.medarbetare_id}_${r.datum}`)
    );

    // 4. Hämta rast_sek och objekt_id från fakt_tid per operator+datum
    const operatorIds = [...new Set(skift.map(s => s.operator_id).filter(Boolean))];
    let rastMap: Record<string, number> = {};
    let objektMap: Record<string, string> = {}; // key: medarbetare_id_datum → objekt_id

    if (operatorIds.length && datumSet.length) {
      const { data: rastData } = await supabase
        .from('fakt_tid')
        .select('operator_id, datum, rast_sek, objekt_id, engine_time_sek')
        .in('operator_id', operatorIds)
        .in('datum', datumSet);

      if (rastData) {
        // Aggregera rast_sek och hitta dominant objekt per medarbetare+datum
        const objektTid: Record<string, Record<string, number>> = {};
        for (const r of rastData) {
          const medId = opMap[r.operator_id];
          if (!medId) continue;
          const key = `${medId}_${r.datum}`;
          rastMap[key] = (rastMap[key] || 0) + (r.rast_sek || 0);
          if (r.objekt_id) {
            if (!objektTid[key]) objektTid[key] = {};
            objektTid[key][r.objekt_id] = (objektTid[key][r.objekt_id] || 0) + (r.engine_time_sek || 0);
          }
        }
        // Välj objekt med mest engine_time per dag
        for (const [key, objs] of Object.entries(objektTid)) {
          const best = Object.entries(objs).sort((a, b) => b[1] - a[1])[0];
          if (best) objektMap[key] = best[0];
        }
      }
    }

    // 5. Aggregera skift per (medarbetare_id, datum)
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
      if (!medId) continue;

      const key = `${medId}_${s.datum}`;
      if (skyddade.has(key)) continue;

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
    // DB lagrar lokal svensk tid märkt som UTC (parse_datetime strippar timezone)
    // Extrahera HH:MM direkt utan konvertering
    const hhmm = (iso: string) => {
      const m = iso.match(/(\d{2}):(\d{2})/);
      return m ? `${m[1]}:${m[2]}` : '00:00';
    };

    const rows = Object.values(dagMap).map(agg => {
      const rastKey = `${agg.medarbetare_id}_${agg.datum}`;
      const rastSek = rastMap[rastKey] || 0;
      const rastMin = Math.round(rastSek / 60);
      return {
        medarbetare_id: agg.medarbetare_id,
        datum: agg.datum,
        dagtyp: 'normal',
        start_tid: hhmm(agg.earliestStart),
        slut_tid: hhmm(agg.latestEnd),
        rast_min: rastMin,
        maskin_id: agg.maskin_id,
        objekt_id: objektMap[rastKey] || null,
        bekraftad: false,
      };
    });

    if (!rows.length) {
      return NextResponse.json({ created: 0, message: 'Inga dagar att uppdatera' });
    }

    // 6. Radera befintliga icke-redigerade rader för dessa datum
    for (const datum of datumSet) {
      const medIds = rows.filter(r => r.datum === datum).map(r => r.medarbetare_id);
      if (medIds.length) {
        await supabase
          .from('arbetsdag')
          .delete()
          .eq('datum', datum)
          .in('medarbetare_id', medIds)
          .or('redigerad.is.null,redigerad.eq.false');
      }
    }

    // 7. Insert nya rader
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

    // 8. Fallback: skapa arbetsdag från fakt_tid för datum som saknar rad
    //    (täcker fall där fakt_skift saknas men fakt_tid finns)
    const { data: tidData } = await supabase
      .from('fakt_tid')
      .select('datum, maskin_id, operator_id, processing_sek, terrain_sek, rast_sek, engine_time_sek, objekt_id')
      .in('datum', datumSet);

    if (tidData?.length) {
      // Aggregera per operator+datum
      const tidAgg: Record<string, {
        datum: string; maskin_id: string; medarbetare_id: string;
        g15sek: number; rastSek: number; engineSek: number; objekt_id: string | null;
      }> = {};

      for (const r of tidData) {
        const medId = opMap[r.operator_id];
        if (!medId) continue;
        const key = `${medId}_${r.datum}`;
        if (!tidAgg[key]) {
          tidAgg[key] = {
            datum: r.datum, maskin_id: r.maskin_id, medarbetare_id: medId,
            g15sek: 0, rastSek: 0, engineSek: 0, objekt_id: null,
          };
        }
        tidAgg[key].g15sek += (r.processing_sek || 0) + (r.terrain_sek || 0);
        tidAgg[key].rastSek += r.rast_sek || 0;
        tidAgg[key].engineSek += r.engine_time_sek || 0;
        if (r.objekt_id) tidAgg[key].objekt_id = r.objekt_id;
      }

      // Kolla vilka som redan har arbetsdag
      const fallbackKeys = Object.keys(tidAgg);
      const fallbackMedIds = [...new Set(fallbackKeys.map(k => k.split('_')[0]))];
      const { data: befintliga } = await supabase
        .from('arbetsdag')
        .select('medarbetare_id, datum')
        .in('datum', datumSet)
        .in('medarbetare_id', fallbackMedIds);

      const finnsRedanSet = new Set(
        (befintliga || []).map(r => `${r.medarbetare_id}_${r.datum}`)
      );

      const fallbackRows = Object.entries(tidAgg)
        .filter(([key]) => !finnsRedanSet.has(key) && !skyddade.has(key))
        .map(([, agg]) => {
          const arbetadMin = Math.round(agg.g15sek / 60);
          const rastMin = Math.round(agg.rastSek / 60);
          return {
            medarbetare_id: agg.medarbetare_id,
            datum: agg.datum,
            dagtyp: 'normal',
            maskin_id: agg.maskin_id,
            objekt_id: agg.objekt_id,
            arbetad_min: arbetadMin,
            rast_min: rastMin,
            bekraftad: false,
          };
        });

      let fallbackCreated = 0;
      if (fallbackRows.length) {
        const { data: fbInserted, error: fbErr } = await supabase
          .from('arbetsdag')
          .insert(fallbackRows)
          .select('id');
        if (fbErr) {
          console.error('Fallback arbetsdag insert error:', fbErr.message);
        }
        fallbackCreated = fbInserted?.length || 0;
      }

      return NextResponse.json({
        created: (inserted?.length || 0) + fallbackCreated,
        skipped: skyddade.size,
        fallback: fallbackCreated,
        message: `${(inserted?.length || 0) + fallbackCreated} arbetsdagar skapade/uppdaterade (varav ${fallbackCreated} från fakt_tid)`,
      });
    }

    return NextResponse.json({
      created: inserted?.length || 0,
      skipped: skyddade.size,
      message: `${inserted?.length || 0} arbetsdagar skapade/uppdaterade`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Okänt fel';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
