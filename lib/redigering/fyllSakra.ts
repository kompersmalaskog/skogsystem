// Vad appen fyller i själv: bara det `harled` kallar säkert (två oberoende källor, ingen emot), bara i fält som är
// tomma på HELA VO-gruppen, och bara fält som gäller objektet (`faltGaller`). Ren planering — skrivningen görs av
// databasfunktionen `redigering_skriv_auto` (migration 20261023180000), som själv vägrar skriva över ett ifyllt fält.

import { harled, type HarledRad, type HarlettFalt, type TraktUppgifter } from './harledning';
import { faltGaller } from './faltGaller';

export interface FyllRad extends HarledRad {
  exkludera?: boolean | null;
  risskotning?: boolean | null;
}

export interface Fyllning {
  ids: string[];
  vo: string | null;
  namn: string;
  falt: HarlettFalt;
  varde: string;
  kallor: string[];
}

const tomt = (v: unknown) => v == null || String(v).trim() === '';

/** Samma gruppering som Redigerings listor: samma icke-tomma VO, annars raden själv. */
export function grupperaVo(rader: FyllRad[]): FyllRad[][] {
  const m = new Map<string, FyllRad[]>();
  for (const r of rader) {
    const vo = r.vo_nummer && String(r.vo_nummer).trim() ? String(r.vo_nummer).trim() : `__rad__${r.objekt_id}`;
    m.set(vo, [...(m.get(vo) ?? []), r]);
  }
  return [...m.values()];
}

/**
 * Planera de säkra fyllningarna. Typen först, eftersom den avgör om avtalsform gäller: en säker typ räknas in innan
 * avtalsformen prövas. `trakt` = Vidas uppgifter per VO när trakten finns.
 */
export function planeraSakra(rader: FyllRad[], trakt: Map<string, TraktUppgifter> = new Map()): Fyllning[] {
  const aktiva = rader.filter(r => r.exkludera !== true);
  const ut: Fyllning[] = [];
  for (const grupp of grupperaVo(aktiva)) {
    const rep: FyllRad = { ...(grupp.find(r => !tomt(r.object_name)) ?? grupp[0]), special: grupp.some(r => r.special === true) };
    const vo = rep.vo_nummer ? String(rep.vo_nummer).trim() : null;
    const t = vo ? trakt.get(vo) : undefined;
    for (const falt of ['huvudtyp', 'avtalsform', 'bolag'] as HarlettFalt[]) {
      if (!grupp.every(r => tomt(r[falt]))) continue;
      if (falt === 'avtalsform' && !faltGaller('avtalsform', rep)) continue;
      const h = harled(falt, rep, aktiva, t);
      if (!h || !h.saker || h.varde == null) continue;
      ut.push({ ids: grupp.map(r => r.objekt_id), vo, namn: rep.object_name ?? vo ?? rep.objekt_id, falt, varde: h.varde, kallor: h.kallor });
      (rep as any)[falt] = h.varde; // typen räknas in före avtalsformen
    }
  }
  return ut;
}

/** objekt.typ ('slutavverkning', 'grot' …) i dim_objekts form ('Slutavverkning', 'Grot'). */
export function traktTyp(typ: string | null | undefined): string | null {
  const t = (typ ?? '').trim().toLowerCase();
  if (t === 'slutavverkning') return 'Slutavverkning';
  if (t === 'gallring') return 'Gallring';
  if (t === 'grot') return 'Grot';
  return null;
}
