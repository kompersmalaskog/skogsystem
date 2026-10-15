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

/** Teckenförklaringens ruta för Basväg: tre heldragna fält i röd, gul och blå (färgerna man kan välja). */
export const basvagYta = (): string =>
  `linear-gradient(90deg, ${BASVAG_FARGER[0].hex} 0 33.3%, ${BASVAG_FARGER[1].hex} 33.3% 66.6%, ${BASVAG_FARGER[2].hex} 66.6% 100%)`;

/** Senast valda basvägsfärg (per enhet): förvald nästa gång man ritar eller spårar en basväg. Röd första gången ("kör här" är vanligast). Kastar aldrig (privat läge, blockerad lagring). */
export const BASVAG_SENASTE_FARG_NYCKEL = 'basvag_senaste_farg_v1';
export function lasSenasteBasvagFarg(): BasvagFarg {
  try {
    const v = typeof localStorage === 'undefined' ? null : localStorage.getItem(BASVAG_SENASTE_FARG_NYCKEL);
    return arBasvagFarg(v) ? v : 'red';
  } catch { return 'red'; }
}
export function sparaSenasteBasvagFarg(farg: BasvagFarg): void {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(BASVAG_SENASTE_FARG_NYCKEL, farg); } catch { /* ingen lagring: nästa gång blir det röd igen */ }
}
