// Avläggen på en trakt: Vidas punkter + egna avläggsmarkeringar, deras nummer och "vilket avlägg lossade han på".
import { avstand } from './geo';
import type { Avlagg, LatLng } from './typer';

export const AVLAGG = {
  /** Zonen runt ett avlägg: en avläggshög ligger längs vägen (80–90 m lång i Mölleryd) och Vidas punkt ligger i mitten, så lossningarna ligger 3–45 m från punkten. Två avlägg 177 m isär (01-1/01-2) överlappar inte. */
  RADIE_M: 50,
  /** Ligger två avlägg så här nära varandra går lossningen inte att avgöra själv — föraren väljer. */
  TVETYDIGT_M: 50,
} as const;

export interface VidaPunkt { nummer: string; lat: number | null; lng: number | null }
export interface EgenMarkering { id: string; lat: number; lng: number; nummer?: number | string | null; viaLossaHar?: boolean }

/** "Avlägg 2" och "2" är samma sak: rubriken står redan som "Avlägg". */
export function visaNummer(nummer: string): string {
  return String(nummer).replace(/^avlägg\s*/i, '').trim();
}

/** Första heltalet i ett nummer ("01-2" → 1, "7" → 7). Ingen siffra → 0. */
function ledandeHeltal(nummer: string): number {
  const m = /\d+/.exec(nummer);
  return m ? parseInt(m[0], 10) : 0;
}

/**
 * Nummer till de egna avläggen: ett nummer som redan sparats på markeringen behålls; resten får löpnummer i skapandeordning
 * (markeringens id är en tidsstämpel) efter det högsta nummer som redan används — Vidas och egna.
 */
export function egnaNummer(vida: readonly VidaPunkt[], egna: readonly EgenMarkering[]): Map<string, string> {
  const ut = new Map<string, string>();
  let hogsta = 0;
  for (const v of vida) hogsta = Math.max(hogsta, ledandeHeltal(visaNummer(v.nummer)));
  const sparade = new Set<string>();
  for (const e of egna) {
    const n = e.nummer == null || e.nummer === '' ? null : String(e.nummer).trim();
    if (n) { ut.set(e.id, n); sparade.add(e.id); hogsta = Math.max(hogsta, ledandeHeltal(n)); }
  }
  const nya = egna.filter((e) => !sparade.has(e.id)).sort((a, b) => {
    const x = Number(a.id), y = Number(b.id);
    return Number.isFinite(x) && Number.isFinite(y) && x !== y ? x - y : String(a.id).localeCompare(String(b.id));
  });
  for (const e of nya) { hogsta += 1; ut.set(e.id, String(hogsta)); }
  return ut;
}

/** Nästa lediga löpnummer för ett nytt eget avlägg. */
export function nastaEgnaNummer(avlagg: readonly Avlagg[]): string {
  let hogsta = 0;
  for (const a of avlagg) hogsta = Math.max(hogsta, ledandeHeltal(visaNummer(a.nummer)));
  return String(hogsta + 1);
}

export function byggAvlagg(vida: readonly VidaPunkt[], egna: readonly EgenMarkering[]): Avlagg[] {
  const ut: Avlagg[] = [];
  for (const v of vida) {
    if (v.lat == null || v.lng == null) continue;
    ut.push({ id: `vida:${visaNummer(v.nummer)}`, nummer: visaNummer(v.nummer), kalla: 'vida', lat: v.lat, lng: v.lng });
  }
  const nr = egnaNummer(vida, egna);
  for (const e of egna) {
    if (!Number.isFinite(e.lat) || !Number.isFinite(e.lng)) continue;
    ut.push({ id: `egen:${e.id}`, nummer: nr.get(e.id) ?? '', kalla: 'egen', lat: e.lat, lng: e.lng, ...(e.viaLossaHar ? { viaLossaHar: true } : {}) });
  }
  return ut;
}

export interface AvlaggTraff {
  /** Närmaste avlägg inom radien; null = ingen lossning vid något avlägg. */
  narmaste: Avlagg | null;
  avstandM: number;
  /** De avlägg föraren ska välja mellan (närmaste + de som ligger inom TVETYDIGT_M från det), närmast först. Tom när inget träffades. */
  kandidater: Avlagg[];
  /** Fler än ett möjligt avlägg → kortet bekräftar sig inte självt. */
  tvetydigt: boolean;
}

export function traffaAvlagg(pos: LatLng, avlagg: readonly Avlagg[], radieM: number = AVLAGG.RADIE_M): AvlaggTraff {
  let narmaste: Avlagg | null = null;
  let min = Infinity;
  for (const a of avlagg) {
    const d = avstand(pos, a);
    if (d < min) { min = d; narmaste = a; }
  }
  if (!narmaste || min > radieM) return { narmaste: null, avstandM: Number.isFinite(min) ? min : Infinity, kandidater: [], tvetydigt: false };
  const n = narmaste;
  const kandidater = avlagg
    .filter((a) => a.id === n.id || avstand(n, a) <= AVLAGG.TVETYDIGT_M)
    .map((a) => ({ a, d: avstand(pos, a) }))
    .sort((x, y) => x.d - y.d)
    .map((x) => x.a);
  return { narmaste, avstandM: min, kandidater, tvetydigt: kandidater.length > 1 };
}

export const avlaggRubrik = (a: Pick<Avlagg, 'nummer'> | null | undefined): string => (a?.nummer ? `Avlägg ${a.nummer}` : 'Avlägg');
