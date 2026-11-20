// Läser årets flyttar per maskin ur maskin_flytt. Direkt ur maskin_flytt, inte via rundorna: en automatisk flytt kan sakna
// runda, och då skulle den tyst saknas här. Ett läsfel är ett fel för HELA läsningen (aldrig en halv lista med summor som ser rätta ut).

import { supabase } from '@/lib/supabase';
import { medAbortRetry } from '@/lib/supabaseRetry';
import { hamtaAlla } from '@/lib/supabaseAlla';
import { lasMaskinNamn, lasPlatsNamn, unika } from './lasNamn';
import { periodTidsintervall } from './period';
import { byggFlyttar, type Flytt, type FlyttRad } from './maskiner';

export type MaskinerSvar = { ok: true; flyttar: Flytt[] } | { ok: false };

const FALT = 'id, maskin_id, extern_maskin, starttid, hamtad_tid, sluttid, flytt_km, tid_flytt_min, fran_objekt_id, fran_plats_id, till_objekt_id, till_plats_id';

/** Avslutade, icke-avbrutna flyttar som lossats under året (svenska dagar). */
export async function lasMaskiner(ar: number): Promise<MaskinerSvar> {
  try {
    const { fran, till } = periodTidsintervall({ typ: 'ar', ar });
    const r = await medAbortRetry(() => hamtaAlla<FlyttRad>(
      () => supabase.from('maskin_flytt').select(FALT).not('sluttid', 'is', null).eq('avbruten', false).gte('sluttid', fran).lt('sluttid', till) as any, 'id'));
    if (r.error) throw r.error;
    const maskinNamn = await lasMaskinNamn();
    const objekt = await lasPlatsNamn('objekt', unika(r.data.flatMap(x => [x.fran_objekt_id, x.till_objekt_id])));
    const platser = await lasPlatsNamn('flyttplats', unika(r.data.flatMap(x => [x.fran_plats_id, x.till_plats_id])));
    return { ok: true, flyttar: byggFlyttar(r.data, maskinNamn, objekt, platser) };
  } catch (e) {
    console.error('[lastbil] maskiner: läsfel', e);
    return { ok: false };
  }
}
