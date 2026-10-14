// Omimport av en trakt (app/api/import-trakt): finns objektet redan? Två uppslag, i den ordningen:
//   1. objekt.vo_nummer == leveransens VO-nummer                         (som förut — oförändrat)
//   2. objekt_alt_nummer.nummer == leveransens VO-nummer                  (NYTT)
// (2) täcker både vanliga extra nummer och det GAMLA numret efter att importen bytt objektets vo_nummer (byte_till satt): Vida kan
// leverera trakten med ett nummer objektet inte längre har som vo_nummer, och då ska det befintliga objektet uppdateras — aldrig en ny
// rad (en dubblett av objektet, med egen planering och egna hyttspår).
//
// Läsfel är aldrig "ingen träff": ett fel som annars skulle leda till INSERT stoppar importen i stället (den går att köra om).
// Saknas tabellen (migrationen ej körd) finns inga extra nummer → som förut.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface BefintligtObjekt {
  id: string;
  larmkoordinat_kalla: string | null;
  /** objektets nummer NU (kan skilja sig från leveransens när träffen kom via extra nummer) */
  vo_nummer: string | null;
  via: 'vo_nummer' | 'extra_nummer';
}

export type BefintligtSvar =
  | { typ: 'traff'; objekt: BefintligtObjekt }
  | { typ: 'ingen' }
  | { typ: 'fel'; fel: string };

const tabellSaknas = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === 'PGRST205' || e.code === '42P01' || /does not exist|schema cache/i.test(String(e.message ?? '')));

export async function hittaBefintligtObjekt(supabase: SupabaseClient, voNummer: string | null | undefined): Promise<BefintligtSvar> {
  const vo = String(voNummer ?? '').trim();
  if (!vo) return { typ: 'ingen' };

  const { data: rader, error } = await supabase.from('objekt').select('id, larmkoordinat_kalla, vo_nummer').eq('vo_nummer', vo).limit(1);
  if (error) return { typ: 'fel', fel: `Kunde inte slå upp objektet på vo_nummer: ${error.message}` };
  if (rader && rader[0]) return { typ: 'traff', objekt: { ...(rader[0] as any), via: 'vo_nummer' } };

  // Extra nummer gäller kontraktsnummer (siffror); ett P-VO eller annat icke-numeriskt nummer kan inte vara ett.
  if (!/^\d+$/.test(vo)) return { typ: 'ingen' };
  const { data: alias, error: aliasFel } = await supabase.from('objekt_alt_nummer').select('objekt_id').eq('nummer', vo).is('maskin_id', null).limit(1);
  if (aliasFel) {
    if (tabellSaknas(aliasFel)) return { typ: 'ingen' };
    return { typ: 'fel', fel: `Kunde inte slå upp extra nummer: ${aliasFel.message}` };
  }
  const objektId = (alias?.[0] as { objekt_id?: string } | undefined)?.objekt_id;
  if (!objektId) return { typ: 'ingen' };
  const { data: obj, error: objFel } = await supabase.from('objekt').select('id, larmkoordinat_kalla, vo_nummer').eq('id', objektId).limit(1);
  if (objFel) return { typ: 'fel', fel: `Kunde inte läsa objektet för extra nummer ${vo}: ${objFel.message}` };
  if (!obj || !obj[0]) return { typ: 'ingen' };
  return { typ: 'traff', objekt: { ...(obj[0] as any), via: 'extra_nummer' } };
}

/**
 * Det som skrivs vid omimport av ett befintligt objekt (flyttad ordagrant ur routen): skyddade kolumner, 'egen' larmkoordinat, nollor och
 * tomma strängar skrivs aldrig. NYTT: träffade vi via ett extra nummer (`behallVoNummer`) skrivs INTE leveransens vo_nummer — då skulle
 * ett byte av nummer ogöras i samma stund Vida levererar om.
 */
export function byggOmimportPatch(
  data: Record<string, any>,
  opt: { skyddade: readonly string[]; bevaraLarm: boolean; behallVoNummer: boolean },
): Record<string, any> {
  const patch: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (opt.skyddade.includes(k)) continue;                                  // aldrig vid omimport
    if (k === 'vo_nummer' && opt.behallVoNummer) continue;                   // objektets nummer lämnas orört (träff via extra nummer)
    if (k.startsWith('larmkoordinat_') && opt.bevaraLarm) continue;          // 'egen' -> orört
    if (v === null || v === undefined) continue;                             // nollar aldrig befintligt värde
    if (typeof v === 'string' && v.trim() === '') continue;
    patch[k] = v;
  }
  return patch;
}
