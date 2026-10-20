// Bilens körning per månad ur vikten, som SQL-funktionen lastbil_vikt_manad skulle svara — Martins sammanräkning ur lastbil_logg
// i prod 2026-10-20 (mätpunkt ~8 min, från 3 aug): lastad ≥ 34 t, tom under.
//   aug  lastad 538 km 5,28 l/mil · tom 845 km 3,66      sep  601 km 5,58 · 755 km 3,83      okt  295 km 5,45 · 535 km 3,76
// Liter är räknade bakåt ur l/mil (liter = km × l/mil / 10) och alla km antas ha bränsleuppgift (km_diesel = km), eftersom
// sammanräkningen bara gav km och l/mil. Okänd är 0: den gavs inte. Juli saknas (ingen vikt): månaden har ingen rad.

import type { ViktRad } from './vikt';

const rad = (man: number, kmL: number, lmL: number, kmT: number, lmT: number, kmO = 0): ViktRad => ({
  man,
  km_lastad: kmL, liter_lastad: (kmL * lmL) / 10, km_diesel_lastad: kmL,
  km_tom: kmT, liter_tom: (kmT * lmT) / 10, km_diesel_tom: kmT,
  km_okand: kmO, liter_okand: 0, km_diesel_okand: 0,
});

export const PROD_VIKT_RADER: ViktRad[] = [
  rad(8, 538, 5.28, 845, 3.66),
  rad(9, 601, 5.58, 755, 3.83),
  rad(10, 295, 5.45, 535, 3.76),
];
