/**
 * Ledighetens prick — styrd av "kräver din handling", inte "något har hänt".
 *
 *  godkännare: väntande ansökningar (att godkänna) + egna nya beslut
 *  anställd:   egna beslut (godkänd/nekad) som personen inte sett
 *
 * Allt räknas på servern (RPC ledighet_prick, ur auth.uid()); den här modulen läser bara svaret och
 * KVITTERAR (ledighet_markera_sett) det som faktiskt visades. Ett läsfel eller ett ogiltigt svar är `null`
 * — aldrig 0. Ett märke som gissar är värre än inget märke (se Raknarmarke i app/HomeClient.tsx).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type LedighetPrick = {
  attGodkanna: number;
  nyaBeslut: number;
  nyaBeslutIds: string[];
  /** Tidpunkten för det senaste av de nya besluten — det man kvitterar t.o.m. */
  nyaBeslutTill: string | null;
  /** Siffran på märket: ärenden som väntar på just den här personen. */
  antal: number;
};

const arAntal = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Tolkar RPC-svaret strikt. Fel form → null, så en trasig/saknad funktion aldrig blir en påhittad siffra. */
export function tolkaPrick(data: unknown): LedighetPrick | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (!arAntal(d.att_godkanna) || !arAntal(d.nya_beslut)) return null;
  const ids = Array.isArray(d.nya_beslut_ids) ? d.nya_beslut_ids.filter((x): x is string => typeof x === 'string') : [];
  return {
    attGodkanna: d.att_godkanna,
    nyaBeslut: d.nya_beslut,
    nyaBeslutIds: ids,
    nyaBeslutTill: typeof d.nya_beslut_till === 'string' ? d.nya_beslut_till : null,
    antal: d.att_godkanna + d.nya_beslut,
  };
}

export async function hamtaLedighetPrick(sb: Pick<SupabaseClient, 'rpc'>): Promise<LedighetPrick | null> {
  try {
    const { data, error } = await sb.rpc('ledighet_prick');
    if (error) return null;
    return tolkaPrick(data);
  } catch {
    return null;
  }
}

/** Kvittera nya beslut t.o.m. `till`. Returnerar false om det inte gick — då ligger pricken kvar (rätt). */
export async function markeraLedighetSett(sb: Pick<SupabaseClient, 'rpc'>, till: string): Promise<boolean> {
  try {
    const { error } = await sb.rpc('ledighet_markera_sett', { p_till: till });
    return !error;
  } catch {
    return false;
  }
}
