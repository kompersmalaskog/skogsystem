// Läser var en maskin JOBBAT under året, ur dess egna filer: skördarens fakt_produktion och skotarens fakt_lass (810E:s
// manuella lass ligger också där). En rad per dag och trakt kommer ut; logiken (resan) ligger i maskinResa.ts.
// Ett läsfel är ett fel för hela läsningen — aldrig en halv resa som ser rätt ut.

import { supabase } from '@/lib/supabase';
import { medAbortRetry } from '@/lib/supabaseRetry';
import { hamtaAlla } from '@/lib/supabaseAlla';
import { chunka, unika } from './lasNamn';
import type { FilDag } from './maskinResa';

export type ResaSvar = { ok: true; dagar: FilDag[] } | { ok: false };

type Rad = { id: number; datum: string; objekt_id: string | null; tid: string | null };

export async function lasResa(maskinId: string, ar: number): Promise<ResaSvar> {
  try {
    const fran = `${ar}-01-01`, till = `${ar}-12-31`;
    const [prod, lass] = await Promise.all([
      medAbortRetry(() => hamtaAlla<Rad>(() => supabase.from('fakt_produktion').select('id, datum, objekt_id, tid:monitoring_start')
        .eq('maskin_id', maskinId).gte('datum', fran).lte('datum', till) as any, 'id')),
      medAbortRetry(() => hamtaAlla<Rad>(() => supabase.from('fakt_lass').select('id, datum, objekt_id, tid:lossnings_tid')
        .eq('maskin_id', maskinId).gte('datum', fran).lte('datum', till) as any, 'id')),
    ]);
    if (prod.error) throw prod.error;
    if (lass.error) throw lass.error;
    const rader = [...prod.data, ...lass.data].filter(r => r.datum && r.objekt_id);

    const namn = new Map<string, string>();
    for (const grupp of chunka(unika(rader.map(r => r.objekt_id)))) {
      const r = await medAbortRetry(() => supabase.from('dim_objekt').select('objekt_id, object_name').in('objekt_id', grupp) as any);
      if (r.error) throw r.error;
      for (const x of (r.data ?? []) as { objekt_id: string; object_name: string | null }[]) if (x.object_name) namn.set(x.objekt_id, x.object_name);
    }

    return { ok: true, dagar: rader.map(r => ({ datum: r.datum, namn: namn.get(r.objekt_id as string) ?? 'Okänt objekt', tid: r.tid })) };
  } catch (e) {
    console.error('[lastbil] resa: läsfel', e);
    return { ok: false };
  }
}
