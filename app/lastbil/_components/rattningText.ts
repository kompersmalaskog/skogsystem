// Historiken längst ner i sheeten: en rad per rättning, ur spåret (maskin_flytt_rattning). Bara läsning.
//   "Rättad av Martin tor 15 okt — maskin Giant → Elefant 26: fel maskin vald"
//   "Struken av Martin tor 15 okt: flyttades aldrig"

import { FLYTT_TYP_ORD } from '@/lib/flytt/fakturerbar';
import { fmtDatum } from './nu';
import type { Rattning } from './useFlyttDetalj';
import type { PlatsData } from './usePlatsData';

type Falt = Record<string, any> | null | undefined;

const typOrd = (t: unknown) => (typeof t === 'string' ? (FLYTT_TYP_ORD as Record<string, string>)[t] ?? t : '–');

/** Det manuella valet i ord: true/false/null (följ regeln). */
const manuellOrd = (v: unknown) => (v === true ? 'manuellt ja' : v === false ? 'manuellt nej' : 'automatiskt');

function maskinNamn(j: Falt, data: PlatsData | null): string {
  if (!j) return '–';
  if (j.extern_maskin) return String(j.extern_maskin);
  if (!j.maskin_id) return '–';
  return data?.maskiner.find(m => m.maskin_id === j.maskin_id)?.namn ?? 'okänd maskin';
}

function platsNamn(j: Falt, nyckel: 'fran' | 'till', data: PlatsData | null): string {
  if (!j) return '–';
  const o = j[`${nyckel}_objekt_id`], p = j[`${nyckel}_plats_id`];
  if (!o && !p) return 'okänd plats';
  return data?.platser.find(x => (x.slag === 'objekt' ? x.id === o : x.id === p))?.namn ?? 'okänd plats';
}

/** Vad som ändrades mellan före och efter, med namn. Tom lista om inget av de fem fälten skiljer. */
export function skillnader(fore: Falt, efter: Falt, data: PlatsData | null): string[] {
  if (!fore || !efter || Object.keys(efter).length === 0) return [];
  const ut: string[] = [];
  const k = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  if (fore.maskin_id !== efter.maskin_id || k(fore.extern_maskin) !== k(efter.extern_maskin)) ut.push(`maskin ${maskinNamn(fore, data)} → ${maskinNamn(efter, data)}`);
  if (fore.fran_objekt_id !== efter.fran_objekt_id || fore.fran_plats_id !== efter.fran_plats_id) ut.push(`från ${platsNamn(fore, 'fran', data)} → ${platsNamn(efter, 'fran', data)}`);
  if (fore.till_objekt_id !== efter.till_objekt_id || fore.till_plats_id !== efter.till_plats_id) ut.push(`till ${platsNamn(fore, 'till', data)} → ${platsNamn(efter, 'till', data)}`);
  if (fore.flytt_typ !== efter.flytt_typ) ut.push(`typ ${typOrd(fore.flytt_typ)} → ${typOrd(efter.flytt_typ)}`);
  if (k(fore.kund) !== k(efter.kund)) ut.push(`kund ${k(fore.kund) ?? '–'} → ${k(efter.kund) ?? '–'}`);
  if ((fore.fakturerbar_manuell ?? null) !== (efter.fakturerbar_manuell ?? null)) ut.push(`fakturering ${manuellOrd(fore.fakturerbar_manuell)} → ${manuellOrd(efter.fakturerbar_manuell)}`);
  return ut;
}

export function beskrivRattning(r: Rattning, data: PlatsData | null): string {
  const datum = fmtDatum(r.tid);
  if (r.slag === 'stryk') return `Struken av ${r.av} ${datum}: ${r.anledning}`;
  const delar = skillnader(r.fore, r.efter, data);
  return `Rättad av ${r.av} ${datum}${delar.length ? ` — ${delar.join(', ')}` : ''}: ${r.anledning}`;
}
