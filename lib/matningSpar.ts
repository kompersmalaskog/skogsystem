// "Resultat sparas eller kastas" — körvyns mätning. SPARA = måttet står kvar på kartan och finns kvar efter omladdning;
// KASTA = borta.
//
// AVGRÄNSNING (medvetet): sparas ENHETSLOKALT, en mätning per objekt (nästa Spara ersätter den). Mätningen delas inte med
// planeraren och skrivs inte till planering_markeringar — det skulle kräva en ny markeringstyp som egenkontrollen, kartstilen
// och översikterna måste lära sig. Vill ni att mätningar syns för planeraren är det en egen sak (ny typ + migration).

import type { LngLat } from './geoMat';
import type { Lagring } from './genvagar';

export type MatTyp = 'strackan' | 'yta' | 'kor';

export interface SparadMatning {
  typ: MatTyp;
  /** true = ytmätning (ringen sluts på kartan), false = sträcka */
  yta: boolean;
  punkter: LngLat[];
  /** resultat vid spartillfället (för visning utan omräkning) */
  meter: number;
  areaM2: number | null;
  tid: number;
}

export const matningLagringsnyckel = (objektId: string | number): string => `korvy_matning_v1:${objektId}`;

const MAX_PUNKTER = 2000;

function lagringNu(): Lagring | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

export function tolkaMatning(raw: string | null | undefined): SparadMatning | null {
  if (!raw) return null;
  try {
    const m = JSON.parse(raw);
    if (!m || typeof m !== 'object') return null;
    if (m.typ !== 'strackan' && m.typ !== 'yta' && m.typ !== 'kor') return null;
    if (!Array.isArray(m.punkter) || m.punkter.length < 2 || m.punkter.length > MAX_PUNKTER) return null;
    const punkter: LngLat[] = [];
    for (const p of m.punkter) {
      if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
      punkter.push([p[0], p[1]]);
    }
    const yta = !!m.yta;
    if (yta && punkter.length < 3) return null;
    return {
      typ: m.typ, yta, punkter,
      meter: Number.isFinite(m.meter) ? m.meter : 0,
      areaM2: Number.isFinite(m.areaM2) ? m.areaM2 : null,
      tid: Number.isFinite(m.tid) ? m.tid : 0,
    };
  } catch {
    return null;
  }
}

export function hamtaMatning(objektId: string | number | null | undefined, lagring: Lagring | null = lagringNu()): SparadMatning | null {
  if (objektId == null || objektId === '') return null;
  try { return tolkaMatning(lagring?.getItem(matningLagringsnyckel(objektId))); } catch { return null; }
}

/** Spara. false = lagringen gick inte att skriva (visas aldrig som ett lyckat spar). */
export function sparaMatning(objektId: string | number | null | undefined, m: SparadMatning, lagring: Lagring | null = lagringNu()): boolean {
  if (objektId == null || objektId === '') return false;
  try {
    if (!lagring) return false;
    lagring.setItem(matningLagringsnyckel(objektId), JSON.stringify(m));
    return true;
  } catch {
    return false;
  }
}

export function kastaMatning(objektId: string | number | null | undefined, lagring: (Lagring & { removeItem?: (k: string) => void }) | null = lagringNu()): void {
  if (objektId == null || objektId === '') return;
  try {
    const nyckel = matningLagringsnyckel(objektId);
    if (lagring?.removeItem) lagring.removeItem(nyckel); else lagring?.setItem(nyckel, '');
  } catch { /* ingenting att kasta */ }
}
