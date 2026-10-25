// Läser underlaget för "utfall per medelstam" — EN läsning för medelstamssidan och Räknas tabell, så de aldrig kan visa olika tal.
//
// Källa: utfall_objekt (förberäknad efter import, ett objekt = en rad) ⋈ dim_objekt (namn, huvudtyp, bara Vida).
// ALDRIG detalj_stock live — det gav 57014 statement timeout som authenticated innan tabellen kom.
// Objektens rötaandel (stamplings_objekt.rot20) läses om den går: utan läsrätt görs ingen rötajustering.

import { supabase } from '@/lib/supabase';
import { medAbortRetry, arAbortFel } from '@/lib/supabaseRetry';
import { MIN_STAMMAR, type Objekt, type Typ } from './berakna';

type Rad = Record<string, unknown>;
export type MedelstamUnderlag = { alla: Objekt[]; meta: Record<string, number | null>; uppdaterad: string | null; rotLasbar: boolean };
export type LasFel = { kod: string; text: string };

const num = (v: unknown): number => Number(v);
const numEllerNull = (v: unknown): number | null => (v == null ? null : Number(v));

/** Alla rader, sida för sida. Sorterat på en unik nyckel — utan .order() kan PostgREST skippa eller dubblera rader mellan sidorna. */
async function allaRader(tabell: string, select: string, nyckel: string, filter?: (q: any) => any): Promise<{ data: Rad[]; error: { code?: string; message?: string } | null }> {
  const ut: Rad[] = [];
  for (let fran = 0; ; fran += 1000) {
    const { data, error } = await medAbortRetry(() => {
      let q: any = supabase.from(tabell).select(select).order(nyckel, { ascending: true }).range(fran, fran + 999);
      if (filter) q = filter(q);
      return q;
    });
    if (error) return { data: ut, error };
    const sida = (data ?? []) as Rad[];
    ut.push(...sida);
    if (sida.length < 1000) return { data: ut, error: null };
  }
}

export async function lasMedelstamUnderlag(): Promise<{ ok: true; d: MedelstamUnderlag } | { ok: false; fel: LasFel }> {
  const [u, o, r, m] = await Promise.all([
    allaRader('utfall_objekt', 'objekt_id,forsta,stammar,volym,timmer_m3,kubb_m3,massa_m3,lov_m3,medelstam,kontrollerad', 'objekt_id'),
    // Medelstamskurvan räknas BARA på Vida-objekt (Martin 2026-10-06). Objekt utan Vida i dim_objekt faller bort nedan.
    allaRader('dim_objekt', 'objekt_id,object_name,huvudtyp', 'objekt_id', q => q.in('huvudtyp', ['Slutavverkning', 'Gallring']).eq('bolag', 'Vida')),
    // Rötan är ett tillägg: går den inte att läsa (ingen policy, tabellen saknas) är det ett eget läge, inte ett fel.
    allaRader('stamplings_objekt', 'objekt_id,stammar20,rot20', 'objekt_id'),
    medAbortRetry(() => supabase.from('stamplings_meta').select('nyckel,varde')),
  ]);
  const e = u.error ?? o.error;
  if (e) return { ok: false, fel: { kod: e.code ?? (arAbortFel(e) ? 'ABORT' : 'OKÄND'), text: e.message ?? String(e) } };

  const namn = new Map(o.data.map(x => [String(x.objekt_id), x]));
  const rot = new Map((r.error ? [] : r.data).map(x => [String(x.objekt_id), x]));
  let uppdaterad: string | null = null;
  const alla: Objekt[] = [];
  for (const x of u.data) {
    const dim = namn.get(String(x.objekt_id));
    if (!dim) continue;                                   // annan huvudtyp (grot m.m.) eller annat bolag — inte med
    const typ = dim.huvudtyp as Typ;
    const volym = num(x.volym), stammar = num(x.stammar), medelstam = numEllerNull(x.medelstam);
    const k = x.kontrollerad ? String(x.kontrollerad) : null;
    if (k && (!uppdaterad || k > uppdaterad)) uppdaterad = k;
    if (stammar < MIN_STAMMAR || !(volym > 0) || medelstam == null) continue;
    const rr = typ === 'Slutavverkning' ? rot.get(String(x.objekt_id)) : undefined;
    alla.push({
      id: String(x.objekt_id), namn: (dim.object_name as string | null) ?? null, typ, forsta: x.forsta ? String(x.forsta) : null,
      stammar, volym, timmer: num(x.timmer_m3), kubb: num(x.kubb_m3), massa: num(x.massa_m3), medelstam,
      rot20: rr ? numEllerNull(rr.rot20) : null, stammar20: rr ? numEllerNull(rr.stammar20) : null,
      lov: numEllerNull(x.lov_m3),
    });
  }
  const meta: Record<string, number | null> = {};
  for (const x of ((m.data ?? []) as { nyckel: string; varde: string | number | null }[])) meta[x.nyckel] = x.varde == null ? null : Number(x.varde);
  return { ok: true, d: { alla, meta, uppdaterad, rotLasbar: alla.some(a => a.rot20 != null) } };
}
