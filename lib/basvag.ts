// BASVÄGENS FÄRG: röd, gul eller blå. EN linjetyp (`lineType: 'mainRoad'`) med ett färgfält (`farg`) — inte tre nya typer bredvid.
//
//   Ritas HELT i färgen, heldragen (stickvägarna är streckade, traktgränsen är randig röd/gul), med den svarta kanten som basvägen alltid haft.
//   En basväg UTAN `farg` (allt som ritades före färgvalet) ritas som förut: blå med gula streck. Den får färg via menyn på linjen.
//   Samma färger i planeringen, körvyn (samma kartlager) och egenkontrollens karta (lib/kartstil).
//
// Rena funktioner — används av planeringsvyn, kartstilen och Om trakten.

import { BASVAG_FARG_UTTRYCK, BASVAG_UTAN_FARG, LEGEND } from './kartstil';
import { formatLength, pathMeters } from './geoMat';

export type BasvagFarg = 'red' | 'yellow' | 'blue';

export const BASVAG_FARGER: ReadonlyArray<{ id: BasvagFarg; namn: 'röd' | 'gul' | 'blå'; hex: string }> = [
  { id: 'red', namn: 'röd', hex: LEGEND.fara },
  { id: 'yellow', namn: 'gul', hex: LEGEND.gul },
  { id: 'blue', namn: 'blå', hex: LEGEND.vatten },
];

export const arBasvagFarg = (v: unknown): v is BasvagFarg => v === 'red' || v === 'yellow' || v === 'blue';

export const basvagFargNamn = (v: unknown): 'röd' | 'gul' | 'blå' | null => BASVAG_FARGER.find((f) => f.id === v)?.namn ?? null;
export const basvagFargHex = (v: unknown): string => BASVAG_FARGER.find((f) => f.id === v)?.hex ?? LEGEND.vatten;

/** MapLibre: basvägens färg ur egenskapen `farg` (ingen/okänd → blå, som förut), och filtret för basväg UTAN färg (de som fortfarande ritas med gula streck). Definierade i lib/kartstil. */
export { BASVAG_FARG_UTTRYCK, BASVAG_UTAN_FARG };

/** "Basväg", "Basväg röd" … */
export const basvagNamn = (farg?: unknown): string => (basvagFargNamn(farg) ? `Basväg ${basvagFargNamn(farg)}` : 'Basväg');

/** Längden av en linje (lat/lng-punkter) i meter. */
export function basvagLangdM(punkter: ReadonlyArray<{ lat: number; lng: number }>): number {
  return pathMeters(punkter.map((p) => [p.lng, p.lat] as [number, number]));
}

/** "Basväg röd · 640 m" (utan färg: "Basväg · 640 m"). */
export function basvagText(farg: unknown, langdM: number | null | undefined): string {
  const namn = basvagNamn(farg);
  return langdM != null && Number.isFinite(langdM) ? `${namn} · ${formatLength(langdM)}` : namn;
}

/** VALET man gör för en basväg: Blå/gul (dagens utseende — blå med gula streck, lagras som INGEN `farg`, exakt som alla basvägar före färgvalet) eller röd, gul, blå (heldragna). Blå/gul står först. */
export type BasvagVal = BasvagFarg | 'blagul';
export const BASVAG_BLAGUL: BasvagVal = 'blagul';
export const arBasvagVal = (v: unknown): v is BasvagVal => v === 'blagul' || arBasvagFarg(v);
/** Valen i ordning: Blå/gul, röd, gul, blå. `farg` = det som lagras på linjen (null = ingenting, som före färgvalet). */
export const BASVAG_VAL: ReadonlyArray<{ id: BasvagVal; namn: 'Blå/gul' | 'Röd' | 'Gul' | 'Blå'; farg: BasvagFarg | null }> = [
  { id: 'blagul', namn: 'Blå/gul', farg: null },
  ...BASVAG_FARGER.map((f) => ({ id: f.id, namn: (f.namn === 'röd' ? 'Röd' : f.namn === 'gul' ? 'Gul' : 'Blå') as 'Röd' | 'Gul' | 'Blå', farg: f.id })),
];
/** Valet → det som lagras (Blå/gul = ingen färg). */
export const valTillFarg = (v: BasvagVal): BasvagFarg | null => (v === 'blagul' ? null : v);
/** Det som lagras → valet (ingen/okänd färg = Blå/gul: så ritas den också). */
export const fargTillVal = (farg: unknown): BasvagVal => (arBasvagFarg(farg) ? farg : 'blagul');

/** Markeringsmenyn: en basväg får ett nytt val. Röd/gul/blå sätter `farg`; Blå/gul TAR BORT fältet — exakt som en basväg före färgvalet (så den ritas och lagras identiskt). Rör inget annat. */
export function medBasvagVal<T extends object>(m: T, val: BasvagVal): T {
  const farg = valTillFarg(val);
  if (farg) return { ...m, farg };
  const { farg: _bort, ...utan } = m as T & { farg?: unknown };
  return utan as unknown as T;
}

/** Dagens utseende som en liten ruta: blå med gula streck (samma blå och gula som kartlagret). */
const BLAGUL_STRECK = `repeating-linear-gradient(90deg, ${LEGEND.vatten} 0 6px, ${LEGEND.gul} 6px 12px)`;
/** Rutan för ETT val (färgvalets knapp): Blå/gul = blå med gula streck, övriga heldragna. */
export const basvagValYta = (v: BasvagVal): string => (v === 'blagul' ? BLAGUL_STRECK : basvagFargHex(v));

/** Teckenförklaringens ruta för Basväg: de fyra valen — Blå/gul (dagens utseende), röd, gul, blå. */
export const basvagYta = (): string =>
  `${BLAGUL_STRECK} 0 0 / 25% 100% no-repeat, linear-gradient(90deg, transparent 0 25%, ${BASVAG_FARGER[0].hex} 25% 50%, ${BASVAG_FARGER[1].hex} 50% 75%, ${BASVAG_FARGER[2].hex} 75% 100%)`;

/** Senast valda basvägsval (per enhet): förvalt nästa gång man ritar eller spårar en basväg. Blå/gul första gången (dagens utseende). Kastar aldrig (privat läge, blockerad lagring). */
export const BASVAG_SENASTE_FARG_NYCKEL = 'basvag_senaste_farg_v1';
export function lasSenasteBasvagFarg(): BasvagVal {
  try {
    const v = typeof localStorage === 'undefined' ? null : localStorage.getItem(BASVAG_SENASTE_FARG_NYCKEL);
    return arBasvagVal(v) ? v : 'blagul';
  } catch { return 'blagul'; }
}
export function sparaSenasteBasvagFarg(val: BasvagVal): void {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(BASVAG_SENASTE_FARG_NYCKEL, val); } catch { /* ingen lagring: nästa gång blir det Blå/gul igen */ }
}
