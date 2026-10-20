// Månader och förslaget "samma beställning för kommande månader". Systemet föreslår, användaren godkänner (skillen, grundprincip 2):
// förslaget skriver aldrig något förrän någon tryckt, och det skriver aldrig över en månad som redan har en beställning.

import type { ObjektTyp } from './tackning';

export const MANADER = ['Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni', 'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December'] as const;

/** `manad` är 1–12 (som i tabellerna), inte 0-indexerad. */
export interface Manad { ar: number; manad: number }

export const manadNyckel = (m: Manad): string => `${m.ar}-${m.manad}`;
export const manadEtikett = (m: Manad): string => `${MANADER[m.manad - 1]} ${m.ar}`;
/** "nov 2026" — kort form för rader där hela månadsnamnet tar för stor plats. */
export const manadKort = (m: Manad): string => `${MANADER[m.manad - 1].slice(0, 3).toLowerCase()} ${m.ar}`;

export function stegaManad(m: Manad, dir: number): Manad {
  const idx = m.ar * 12 + (m.manad - 1) + dir;
  return { ar: Math.floor(idx / 12), manad: (idx % 12 + 12) % 12 + 1 };
}

/** Månaderna efter `fran` till och med december NÄSTA år (oktober 2026 → november 2026 … december 2027: fjorton). */
export function kommandeManader(fran: Manad): Manad[] {
  const slut: Manad = { ar: fran.ar + 1, manad: 12 };
  const ut: Manad[] = [];
  for (let m = stegaManad(fran, 1); m.ar < slut.ar || (m.ar === slut.ar && m.manad <= slut.manad); m = stegaManad(m, 1)) ut.push(m);
  return ut;
}

export type Volymer = Partial<Record<ObjektTyp, number>>;

export interface ForslagRad {
  manad: Manad;
  /** Det som redan är inlagt för månaden (då rörs den inte). null = månaden har ingen beställning. */
  redan: Volymer | null;
  /** Förvald i förslaget: månader utan beställning. */
  vald: boolean;
}

/**
 * Förslaget: varje kommande månad som saknar beställning föreslås få `volymer` (förvalda), varje månad som redan har en visas dämpad
 * med det som står där och rörs inte.
 */
export function byggForslag(fran: Manad, befintliga: ReadonlyMap<string, Volymer>): ForslagRad[] {
  return kommandeManader(fran).map(manad => {
    const redan = befintliga.get(manadNyckel(manad)) ?? null;
    return { manad, redan, vald: redan == null };
  });
}

/** Månaden ur adressen (?ar=&manad=, manad 1–12, t.ex. från helikopterns guide). Saknas den: innevarande månad. */
export function lasManadUrl(search: string): Manad {
  const sp = new URLSearchParams(search);
  const ar = parseInt(sp.get('ar') || '');
  const manad = parseInt(sp.get('manad') || '');
  const nu = new Date();
  return {
    ar: Number.isFinite(ar) ? ar : nu.getFullYear(),
    manad: Number.isFinite(manad) && manad >= 1 && manad <= 12 ? manad : nu.getMonth() + 1,
  };
}
