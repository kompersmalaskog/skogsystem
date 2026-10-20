// Läser årets körning delad på lastad / tom / okänd ur SQL-funktionen lastbil_vikt_manad (bilens bruttovikt i lastbil_logg).
// Ett läsfel är ett fel för hela läsningen — aldrig en tom lista som ser ut som "ingen körning med lass".

import { supabase } from '@/lib/supabase';
import { medAbortRetry } from '@/lib/supabaseRetry';
import type { ViktRad } from './vikt';

export type ViktSvar = { ok: true; rader: ViktRad[] } | { ok: false };

export async function lasViktManad(ar: number): Promise<ViktSvar> {
  try {
    const { data, error } = await medAbortRetry(() => supabase.rpc('lastbil_vikt_manad', { p_ar: ar }) as any);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('lastbil_vikt_manad: svaret är ingen lista');
    return { ok: true, rader: data as ViktRad[] };
  } catch (e) {
    console.error('[lastbil] vikt: läsfel', e);
    return { ok: false };
  }
}
