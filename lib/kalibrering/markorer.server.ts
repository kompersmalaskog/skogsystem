import type { SupabaseClient } from '@supabase/supabase-js';
import type { Markor } from './atgarder';
import { arOmkalibrering } from './historik';

/**
 * Markörerna för en maskin: reparationer av mätsystemet (fakt_kalibrering_historik, orsak "Repair of measurement system", `arOmkalibrering`) och förarens åtgärder (kalibrering_atgard),
 * äldst först. EN källa för /api/kalibrering/diagnos (linjerna i diagrammen) och /api/kalibrering/bedomning (före/efter i Åtgärder) — de kan
 * inte glida isär om vad som är en markör. Ett läsfel ger färre markörer, inte ett fel (som diagnos alltid gjort).
 */
export async function hamtaMarkorer(supabase: SupabaseClient, maskinId: string): Promise<Markor[]> {
  const markorer: Markor[] = [];
  const { data: hist } = await supabase
    .from('fakt_kalibrering_historik').select('datum,orsak')
    .eq('maskin_id', maskinId).order('datum', { ascending: true }); // hela historiken — markörer spänner allt
  for (const h of hist ?? []) {
    if (arOmkalibrering({ orsak: h.orsak })) markorer.push({ datum: String(h.datum).slice(0, 10), kalla: 'reparation', text: 'Reparation av mätsystem' });
  }
  const { data: atg } = await supabase
    .from('kalibrering_atgard').select('datum,text')
    .eq('maskin_id', maskinId).order('datum', { ascending: true });
  for (const a of atg ?? []) markorer.push({ datum: String(a.datum).slice(0, 10), kalla: 'atgard', text: String(a.text ?? '') });
  markorer.sort((a, b) => a.datum.localeCompare(b.datum));
  return markorer;
}
