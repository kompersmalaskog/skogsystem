import type { SupabaseClient } from '@supabase/supabase-js';
import type { Markor } from './atgarder';
import { HISTORIK_MARKOR_KOLUMNER, kalibreringsSlag, type HistorikMarkorRad } from './historik';
import { tolkaMarkor } from './forslagMarkorer';
import { tradslagLabel } from '@/lib/tradslag';

/** Så långt bakåt visas kalibreringar ur historiken som markörer i Åtgärder — äldre ligger kvar i databasen men skulle bara fylla listan. */
export const KALIBRERING_MARKOR_DAGAR = 90;

/**
 * Markörerna för en maskin: reparationer av mätsystemet (fakt_kalibrering_historik, orsak "Repair of measurement system", `arOmkalibrering`) och förarens åtgärder (kalibrering_atgard),
 * äldst först. EN källa för /api/kalibrering/diagnos (linjerna i diagrammen) och /api/kalibrering/bedomning (före/efter i Åtgärder) — de kan
 * inte glida isär om vad som är en markör. Ett läsfel ger färre markörer, inte ett fel (som diagnos alltid gjort).
 *
 * `kalibreringar: true` lägger till kalibreringarna ur historiken som automatiska markörer (kalla 'kalibrering'): datum, trädslag och om det var
 * längd eller diameter — inget mm-värde (diameterns enda justeringspunkt säger inget om kurvan, och R64428:s omkalibrering "56" är ingen justering).
 * Bara bedomning (Åtgärder) ber om dem; diagrammens linjer är oförändrade.
 *
 * Förarens svar "Klart, allt såg bra ut" på ett Kolla-steg sparas också i kalibrering_atgard men är ingen åtgärd: det blir ingen markör (tolkaMarkor).
 */
export async function hamtaMarkorer(supabase: SupabaseClient, maskinId: string, val: { kalibreringar?: boolean; idag?: string } = {}): Promise<Markor[]> {
  const markorer: Markor[] = [];
  const { data: hist } = await supabase
    .from('fakt_kalibrering_historik').select(HISTORIK_MARKOR_KOLUMNER)
    .eq('maskin_id', maskinId).order('datum', { ascending: true }); // hela historiken — markörer spänner allt
  const fran = val.kalibreringar ? new Date(new Date(`${val.idag ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`).getTime() - KALIBRERING_MARKOR_DAGAR * 86400000).toISOString().slice(0, 10) : null;
  for (const h of (hist ?? []) as unknown as HistorikMarkorRad[]) {
    const datum = String(h.datum).slice(0, 10);
    const slag = kalibreringsSlag(h);
    if (slag === 'omkalibrering') { markorer.push({ datum, kalla: 'reparation', text: 'Reparation av mätsystem' }); continue; }
    if (!fran || datum < fran) continue;
    if (slag === 'diameter') markorer.push({ datum, kalla: 'kalibrering', text: `Diameterkalibrering ${tradslagLabel(h.tradslag).toLowerCase()}` });
    else if (slag === 'langd') markorer.push({ datum, kalla: 'kalibrering', text: `Längdkalibrering ${tradslagLabel(h.tradslag).toLowerCase()}` });
  }
  const { data: atg } = await supabase
    .from('kalibrering_atgard').select('datum,text')
    .eq('maskin_id', maskinId).order('datum', { ascending: true });
  for (const a of atg ?? []) {
    const text = String(a.text ?? '');
    if (tolkaMarkor(text).slag === 'kontroll') continue;
    markorer.push({ datum: String(a.datum).slice(0, 10), kalla: 'atgard', text });
  }
  markorer.sort((a, b) => a.datum.localeCompare(b.datum));
  return markorer;
}
