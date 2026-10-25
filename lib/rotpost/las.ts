// Läser trakterna — EN läsning för fliken Trakter och traktsidan, så de aldrig visar olika tal.
// Underlaget är medelstamssidans (lasMedelstamUnderlag: utfall_objekt ⋈ dim_objekt, Vida) plus vilka trakter som är rotposter
// (avtalsform Rp på objektet eller i dim_objekt, eller "RP" i namnet — lib/rotpost/kalla.ts).

import { supabase } from '@/lib/supabase';
import { medAbortRetry, arAbortFel } from '@/lib/supabaseRetry';
import { lasMedelstamUnderlag, type LasFel } from '@/lib/medelstam/las';
import { arRotpost } from './kalla';
import { skordningsLage, trakter, type Trakt } from './uppfoljning';

export type TrakterUnderlag = { trakter: Trakt[]; medianRota: number | null };

const felAv = (e: { code?: string; message?: string }): LasFel => ({ kod: e.code ?? (arAbortFel(e) ? 'ABORT' : 'OKÄND'), text: e.message ?? String(e) });

export async function lasTrakter(): Promise<{ ok: true; d: TrakterUnderlag } | { ok: false; fel: LasFel }> {
  const [u, a, o] = await Promise.all([
    lasMedelstamUnderlag(),
    medAbortRetry(() => supabase.from('dim_objekt').select('objekt_id,object_name,avtalsform,skordning_avslutad,skordning_ej_klar').eq('bolag', 'Vida')),
    medAbortRetry(() => supabase.from('objekt').select('vo_nummer,namn,avtalsform').not('vo_nummer', 'is', null)),
  ]);
  if (!u.ok) return u;
  if (a.error) return { ok: false, fel: felAv(a.error) };
  if (o.error) return { ok: false, fel: felAv(o.error) };
  const obj = new Map(((o.data ?? []) as { vo_nummer: string; namn: string | null; avtalsform: string | null }[]).map(x => [String(x.vo_nummer), x]));
  const rp = new Set<string>();
  type DimRad = { objekt_id: string; object_name: string | null; avtalsform: string | null; skordning_avslutad: string | null; skordning_ej_klar: boolean | null };
  const dim = new Map<string, DimRad>();
  for (const x of (a.data ?? []) as DimRad[]) {
    const id = String(x.objekt_id); const ob = obj.get(id);
    dim.set(id, x);
    if (arRotpost({ namn: ob?.namn ?? x.object_name, avtalsform: ob?.avtalsform, dimAvtalsform: x.avtalsform })) rp.add(id);
  }
  // Skördningens läge ur samma läsning: en trakt utan dim_objekt-rad är 'okand', aldrig "pågår".
  const lista = trakter(u.d.alla, rp).map(t => ({ ...t, skordning: skordningsLage(dim.get(t.id)) }));
  return { ok: true, d: { trakter: lista, medianRota: u.d.meta.rot20_median ?? null } };
}
