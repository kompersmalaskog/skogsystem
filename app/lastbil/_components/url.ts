// Flik och period i adressen: /lastbil?flik=fakturering&per=2026-10. Hem, notiser och gamla länkar
// (t.ex. Flyttloggen) kan då peka på rätt flik och månad. Okänt eller ogiltigt värde = som om det inte
// stod där — aldrig ett fel.

import { periodFranText, periodTillText, type Period } from './period';

export type Flik = 'korningar' | 'fakturering' | 'nu';

const FLIKAR: readonly Flik[] = ['korningar', 'fakturering', 'nu'];

export function lasUrl(search: string, nu: Date = new Date()): { flik: Flik | null; period: Period | null } {
  const p = new URLSearchParams(search);
  const f = p.get('flik');
  return {
    flik: FLIKAR.includes(f as Flik) ? (f as Flik) : null,
    period: periodFranText(p.get('per'), nu),
  };
}

export function skrivUrl(flik: Flik, period: Period): string {
  return `?flik=${flik}&per=${periodTillText(period)}`;
}
