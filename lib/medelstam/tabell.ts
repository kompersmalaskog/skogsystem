// "Vad ger det?" — en rad per medelstam, vad varje sortiment blir. Räknas med SAMMA utfall() som medelstamssidan (fönster ±15 %,
// volymvägt, minst MIN_OBJEKT trakter, röta flyttad till vår median), så en rad i tabellen och sidan den öppnar visar samma tal.
//
// Bara slutavverkning: gallringens medelstammar ligger nästan alla kring 0,05 (17 gallringar 2026-10-23), det finns inget att
// läsa av en tabell från 0,20 och uppåt.

import {
  SORTIMENT, delaUrval, heltalTill100, rotaLutning, rotaMedian, utfall,
  type Andelar, type Objekt, type Sortiment,
} from './berakna';

/** Medelstammarna i tabellen, m³fub per stam. */
export const TABELL_STEG = [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.8] as const;
/** Färre trakter än så i fönstret: talet visas men märks "osäkert". Under MIN_OBJEKT (3) visas inget tal alls. */
export const SAKER_MIN_TRAKTER = 6;

export type TabellRad = {
  m: number;
  n: number;                                 // trakter i fönstret
  forFa: boolean;                            // under MIN_OBJEKT → inga tal
  osaker: boolean;                           // MIN_OBJEKT ≤ n < SAKER_MIN_TRAKTER
  procent: Andelar | null;                   // hela procent som summerar till 100
  m3: Record<Sortiment, number> | null;      // hela m³ som summerar till volymen (avrundad), bara när volym är given
};

/**
 * Fördelar en volym i hela m³ efter andelarna, största resten — raderna summerar alltid till den avrundade volymen.
 * Andelarna behöver inte summera exakt till 100.
 */
export function fordelaVolym(volym: number, andel: Andelar): Record<Sortiment, number> {
  const total = Math.round(volym);
  const sum = SORTIMENT.reduce((s, k) => s + andel[k], 0);
  if (!(sum > 0) || total <= 0) return Object.fromEntries(SORTIMENT.map(s => [s, 0])) as Record<Sortiment, number>;
  const exakt = SORTIMENT.map(s => (total * andel[s]) / sum);
  const ut = exakt.map(Math.floor);
  let kvar = total - ut.reduce((a, b) => a + b, 0);
  exakt.map((e, i) => [e - Math.floor(e), i] as const).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (kvar-- > 0) ut[i]++; });
  return Object.fromEntries(SORTIMENT.map((s, i) => [s, ut[i]])) as Record<Sortiment, number>;
}

/** Tabellen för slutavverkning. `volym` null = bara procent. */
export function medelstamTabell(
  alla: Objekt[], meta: Record<string, number | null>, rotLasbar: boolean, volym: number | null,
  steg: readonly number[] = TABELL_STEG,
): TabellRad[] {
  // Samma val som MedelstamVy: röta-lutningen och medianen räknas över hela urvalet (lövdominerade borta), fönstret på slutavverkningarna.
  const urval = delaUrval(alla).med;
  const med = urval.filter(o => o.typ === 'Slutavverkning');
  const lutning = rotaLutning(urval);
  const median = meta.rot20_median ?? rotaMedian(urval);
  const kanRota = rotLasbar && lutning != null && median != null;
  return steg.map(m => {
    const u = utfall(med, m, kanRota ? median : null, kanRota ? lutning : null);
    const procent = !u.forFa && u.andel ? heltalTill100(u.andel) : null;
    return {
      m, n: u.n, forFa: procent == null,
      osaker: procent != null && u.n < SAKER_MIN_TRAKTER,
      procent,
      m3: procent && u.andel && volym != null && volym > 0 ? fordelaVolym(volym, u.andel) : null,
    };
  });
}
