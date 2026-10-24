// Vilka maskiner som "hör till" ett besök: de som ska ha sett det. Samma regel för besökssidans rad per maskin och för pushen till planeraren när ingen sett besöket (lib/besok/ejsett):
//   • tilldelad objektet (objekt.skordare_maskin_id / skotare_maskin_id), eller
//   • har loggat hyttspår på objektet de senaste BESOK_MASKIN_PA_TRAKTEN_H timmarna (arbetar där nu).
// En maskin utan känd roll (dim_maskin.maskin_typ) räknas inte — vi vet inte vad den är. Läsfel kastar: en tyst tom lista skulle se ut som "ingen maskin behöver se det".

import type { SupabaseClient } from '@supabase/supabase-js';
import { rollAvMaskintyp } from '@/lib/maskindatorStart';
import { idagStockholm } from '@/lib/grotvy/format';
import { BESOK_MASKIN_PA_TRAKTEN_H } from './konstanter';
import { ROLL_ORD, type MaskinRoll } from './sakerhet';

export type BesokMaskin = { maskinId: string; roll: MaskinRoll; namn: string | null };

/** "Skördaren Scorpion" – rollen först, maskinens eget namn efter när det finns. Ingen förare, inget maskin-id. */
export const maskinEtikett = (m: { roll: MaskinRoll; namn: string | null }): string => (m.namn ? `${ROLL_ORD[m.roll]} ${m.namn}` : ROLL_ORD[m.roll]);

const fel = (var_: string, m: string) => new Error(`${var_}: ${m}`);

export async function maskinerPaObjekt(sb: SupabaseClient, objektIds: readonly string[], nu: Date = new Date()): Promise<Map<string, BesokMaskin[]>> {
  const ut = new Map<string, BesokMaskin[]>();
  const ids = Array.from(new Set(objektIds));
  if (ids.length === 0) return ut;

  const [o, s] = await Promise.all([
    sb.from('objekt').select('id, skordare_maskin_id, skotare_maskin_id').in('id', ids),
    sb.from('hyttspar').select('objekt_id, maskin_id, datum, uppdaterad_at').in('objekt_id', ids).gte('datum', idagStockholm(new Date(nu.getTime() - 2 * 86400000))),
  ]);
  if (o.error) throw fel('objekt', o.error.message);
  if (s.error) throw fel('hyttspar', s.error.message);

  const gräns = nu.getTime() - BESOK_MASKIN_PA_TRAKTEN_H * 3600000;
  const perObjekt = new Map<string, Set<string>>();
  const lagg = (objekt: string, maskin: string | null | undefined) => { if (maskin) { if (!perObjekt.has(objekt)) perObjekt.set(objekt, new Set()); perObjekt.get(objekt)!.add(maskin); } };
  for (const r of (o.data ?? []) as { id: string; skordare_maskin_id: string | null; skotare_maskin_id: string | null }[]) { lagg(r.id, r.skordare_maskin_id); lagg(r.id, r.skotare_maskin_id); }
  for (const r of (s.data ?? []) as { objekt_id: string | null; maskin_id: string | null; datum: string; uppdaterad_at: string | null }[]) {
    if (!r.objekt_id) continue;
    const t = r.uppdaterad_at ? Date.parse(r.uppdaterad_at) : Date.parse(`${r.datum}T23:59:59Z`);
    if (Number.isFinite(t) && t >= gräns) lagg(r.objekt_id, r.maskin_id);
  }

  const maskinIds = Array.from(new Set(Array.from(perObjekt.values()).flatMap((x) => Array.from(x))));
  if (maskinIds.length === 0) return ut;
  const d = await sb.from('dim_maskin').select('maskin_id, visningsnamn, maskin_typ').in('maskin_id', maskinIds);
  if (d.error) throw fel('dim_maskin', d.error.message);
  const reg = new Map<string, BesokMaskin>();
  for (const r of (d.data ?? []) as { maskin_id: string; visningsnamn: string | null; maskin_typ: string | null }[]) {
    const roll = rollAvMaskintyp(r.maskin_typ);
    if (roll) reg.set(r.maskin_id, { maskinId: r.maskin_id, roll, namn: r.visningsnamn?.trim() || null });
  }
  for (const [objekt, set] of perObjekt) {
    const lista = Array.from(set).flatMap((id) => (reg.has(id) ? [reg.get(id)!] : []));
    lista.sort((a, b) => (a.roll === b.roll ? a.maskinId.localeCompare(b.maskinId) : a.roll < b.roll ? -1 : 1));
    if (lista.length) ut.set(objekt, lista);
  }
  return ut;
}
