// Sträckan i fakturan: tolkning av det man skriver, och 30-gränsen mellan fast belopp och timdebitering.

import { FLYTT_TIMDEBITERING_KM } from '@/lib/faktura/radbyggare';

/** "46,6" → 46.6; tomt eller skräp → null (ogiltigt). */
export function tolkaKm(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Vilken artikel km avgör — samma gräns som radbyggaren: till och med 30 km fast belopp, däröver per timme. */
const pris = (km: number): 'fast' | 'tid' => (km <= FLYTT_TIMDEBITERING_KM ? 'fast' : 'tid');

/** Ett justerat km som korsar 30-gränsen byter artikel på fakturan — det ska stå innan man sparar. */
export function gransText(fore: number | null, nu: number | null): string | null {
  if (fore == null || nu == null || pris(fore) === pris(nu)) return null;
  return nu > FLYTT_TIMDEBITERING_KM
    ? `Över ${FLYTT_TIMDEBITERING_KM} km faktureras flytten på tid (artikel 3). Timmarna skriver du in på trakten.`
    : `Upp till ${FLYTT_TIMDEBITERING_KM} km är flytten ett fast belopp per maskin (artikel 5).`;
}
