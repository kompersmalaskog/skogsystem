// Reglagen i + › Lager: bakgrundens "Dämpad ↔ Skarp" och varje påslaget lagers "Kartan syns ↔ Bara lagret" (Kartan tydligare, Martin 2026-10-27).
// Mönstret kommer från skogsbruksplanen (src/app.js LAGER_OP / lagerOp): ett reglage 15–100 steg 5 under varje påslaget lager, sparat per enhet i localStorage,
// gäller direkt när man drar. Här: ren logik (klamning, läsa/skriva lagring) — hooken är lib/hooks/useKartReglage, kartpåverkan i lib/lagerOpacitet.
import { KARTLAGER, type Kartlager } from './kartlager';
import { KARTBAS_STANDARD_STYRKA } from './kartBas';

export const STYRKA_NYCKEL = 'kartlager_styrka_v1';
export const LAGER_OP_NYCKEL = 'lager_opacitet_v1';

export const STYRKA_MIN = 0;
export const STYRKA_MAX = 100;
export const LAGER_OP_MIN = 15;
export const LAGER_OP_MAX = 100;
export const REGLAGE_STEG = 5;

type Las = Pick<Storage, 'getItem'> | null | undefined;
type Skriv = Pick<Storage, 'setItem'> | null | undefined;

const tillSteg = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, Math.round(v / REGLAGE_STEG) * REGLAGE_STEG));

/** Bakgrundens styrka: 0–100 i steg om 5. Skräp ger standarden. */
export const klamStyrka = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? tillSteg(v, STYRKA_MIN, STYRKA_MAX) : KARTBAS_STANDARD_STYRKA);
/** Ett överläggs opacitet i procent: 15–100 i steg om 5. */
export const klamLagerOp = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? tillSteg(v, LAGER_OP_MIN, LAGER_OP_MAX) : LAGER_OP_MAX);

/** Lagrets nuvarande opacitet (0–1) som reglagets startvärde i procent. */
export const opacitetTillProcent = (opacitet: number): number => klamLagerOp(opacitet * 100);

export type Styrkor = Partial<Record<Kartlager, number>>;
export type LagerOpacitet = Record<string, number>;

function lasJson(lager: Las, nyckel: string): Record<string, unknown> {
  try {
    const raw = lager?.getItem(nyckel);
    if (!raw) return {};
    const j = JSON.parse(raw);
    return j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : {};
  } catch { return {}; }
}

/** Sparad styrka per bakgrund. Okända bakgrunder och skräpvärden tas bort. */
export function lasStyrkor(lager: Las): Styrkor {
  const j = lasJson(lager, STYRKA_NYCKEL);
  const ut: Styrkor = {};
  for (const l of KARTLAGER) if (typeof j[l] === 'number') ut[l] = klamStyrka(j[l]);
  return ut;
}
export function skrivStyrkor(lager: Skriv, s: Styrkor): void {
  try { lager?.setItem(STYRKA_NYCKEL, JSON.stringify(s)); } catch { /* privat läge / full lagring: valet gäller i minnet i den här sessionen */ }
}
/** Styrkan för en bakgrund: eget val, annars standarden. */
export const styrkaFor = (s: Styrkor, lager: Kartlager): number => s[lager] ?? KARTBAS_STANDARD_STYRKA;

/** Sparad opacitet (procent) per överlägg. */
export function lasLagerOp(lager: Las): LagerOpacitet {
  const j = lasJson(lager, LAGER_OP_NYCKEL);
  const ut: LagerOpacitet = {};
  for (const [k, v] of Object.entries(j)) if (typeof v === 'number') ut[k] = klamLagerOp(v);
  return ut;
}
export function skrivLagerOp(lager: Skriv, o: LagerOpacitet): void {
  try { lager?.setItem(LAGER_OP_NYCKEL, JSON.stringify(o)); } catch { /* som ovan */ }
}
