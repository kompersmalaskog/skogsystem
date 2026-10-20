// Adressen: /lastbil?per=2026-10 (huvudsidan), /lastbil?flik=fakturering&per=2026-10 (fakturasidan, bara admin) och
// /lastbil?ar=2026&per=2026-10 (Uppföljning, årets sida; per= är månaden Körningar står på när man går tillbaka — saknas den gäller innevarande månad).
// Hem, notiser och gamla länkar kan peka på rätt månad. Okänt eller ogiltigt värde = som om det inte stod där — aldrig ett fel.
//
// Lastbilen är EN sida utan flikar. Gamla länkar: ?flik=fakturering öppnar fakturasidan (en förare får huvudsidan);
// ?flik=korningar och ?flik=nu betyder huvudsidan, som ingen parameter alls; ?per=2026 (ett år) öppnar Uppföljning.
// Perioden är alltid en MÅNAD utom i Uppföljning, som har sitt eget år.

import { periodFranText, periodTillText, type Manad } from './period';

/** Vilken sida: huvudsidan, fakturasidan (bara admin) eller Uppföljning (`'ar'`: egen sida, tillbaka-pil till Lastbilen). */
export type Sida = 'huvud' | 'fakturering' | 'ar';

export function lasUrl(search: string, nu: Date = new Date()): { sida: Sida; period: Manad | null; ar: number | null } {
  const p = new URLSearchParams(search);
  const per = periodFranText(p.get('per'), nu);
  const arParam = periodFranText(p.get('ar'), nu);
  const ar = arParam?.typ === 'ar' ? arParam.ar : per?.typ === 'ar' ? per.ar : null;
  const sida: Sida = p.get('flik') === 'fakturering' ? 'fakturering' : ar != null ? 'ar' : 'huvud';
  return { sida, period: per?.typ === 'man' ? per : null, ar };
}

/** /lastbil?lass=<id> — länken i notisen "Vilken maskin?". Ett tomt eller uppenbart ogiltigt id är som om det inte stod där. */
export function lasLassId(search: string): string | null {
  const id = new URLSearchParams(search).get('lass');
  return id && /^[0-9a-f-]{8,40}$/i.test(id) ? id : null;
}

export function skrivUrl(sida: Sida, period: Manad, ar?: number): string {
  if (sida === 'ar') return `?ar=${ar ?? period.ar}&per=${periodTillText(period)}`;
  return sida === 'fakturering' ? `?flik=fakturering&per=${periodTillText(period)}` : `?per=${periodTillText(period)}`;
}
