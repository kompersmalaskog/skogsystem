// Adressen: /lastbil?per=2026-10 (huvudsidan) och /lastbil?flik=fakturering&per=2026-10 (fakturasidan, bara admin).
// Hem, notiser och gamla länkar kan peka på rätt månad. Okänt eller ogiltigt värde = som om det inte stod där — aldrig ett fel.
//
// Lastbilen är EN sida utan flikar. Gamla länkar: ?flik=fakturering öppnar fakturasidan (en förare får huvudsidan);
// ?flik=korningar och ?flik=nu betyder huvudsidan, som ingen parameter alls.

import { periodFranText, periodTillText, type Period } from './period';

/** Vilken sida: huvudsidan eller fakturasidan (en egen sida med tillbaka-pil, bara admin). */
export type Sida = 'huvud' | 'fakturering';

export function lasUrl(search: string, nu: Date = new Date()): { sida: Sida; period: Period | null } {
  const p = new URLSearchParams(search);
  return {
    sida: p.get('flik') === 'fakturering' ? 'fakturering' : 'huvud',
    period: periodFranText(p.get('per'), nu),
  };
}

/** /lastbil?lass=<id> — länken i notisen "Vilken maskin?". Ett tomt eller uppenbart ogiltigt id är som om det inte stod där. */
export function lasLassId(search: string): string | null {
  const id = new URLSearchParams(search).get('lass');
  return id && /^[0-9a-f-]{8,40}$/i.test(id) ? id : null;
}

export function skrivUrl(sida: Sida, period: Period): string {
  return sida === 'fakturering' ? `?flik=fakturering&per=${periodTillText(period)}` : `?per=${periodTillText(period)}`;
}
