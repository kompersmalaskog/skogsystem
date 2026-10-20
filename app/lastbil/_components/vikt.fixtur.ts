// Bilens körning per månad ur vikten, som SQL-funktionen lastbil_vikt_manad svarade — Martins FÖRSTA körning i prod 2026-10-20
// (migration 20261020111258, mätpunkt ~8 min, från 3 aug): lastad ≥ 34 t, tom under, okänd = olika vikt i ändpunkterna eller ingen vikt.
//   aug  lastad 482 km 5,10 l/mil · tom 845 km 3,66 · okänd 114      sep  504 km 5,47 · 755 km 3,83 · okänd 97
//   okt  lastad 242 km 5,30 · tom 535 km 3,76 · okänd 53
// Liter är räknade bakåt ur l/mil (liter = km × l/mil / 10) och alla lastade/tomma km antas ha bränsleuppgift (km_diesel = km),
// eftersom körningen bara gav km och l/mil. Okänd har ingen l/mil i underlaget: liter 0 och km_diesel 0 (visas inte i något diagram).
// Juli saknas (ingen vikt): månaden har ingen rad.

import type { ViktRad } from './vikt';

const rad = (man: number, kmL: number, lmL: number, kmT: number, lmT: number, kmO: number): ViktRad => ({
  man,
  km_lastad: kmL, liter_lastad: (kmL * lmL) / 10, km_diesel_lastad: kmL,
  km_tom: kmT, liter_tom: (kmT * lmT) / 10, km_diesel_tom: kmT,
  km_okand: kmO, liter_okand: 0, km_diesel_okand: 0,
});

export const PROD_VIKT_RADER: ViktRad[] = [
  rad(8, 482, 5.10, 845, 3.66, 114),
  rad(9, 504, 5.47, 755, 3.83, 97),
  rad(10, 242, 5.30, 535, 3.76, 53),
];
