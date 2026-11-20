// Loppet på markägarens länk (Martin 2026-11-16): var i kedjan är vi? Skördaren → Skotaren → Klart. Rena funktioner — servern räknar, sidan ritar.
//
// Rubriken ÄR svaret ("Skördaren arbetar nu"). Tre lägen per steg: klar (grön bock), pågår (vit), kommer sen (grå ring).
// Inga procent och inget klart-datum (beslut 2026-11-10): en stapel som står still en regnig vecka ser ut som att ingen jobbar, och en dag vi inte håller är värre än ingen dag.
// Bara det appen vet av sig själv: har maskinen kört något på trakten, är skördningen/skotningen avslutad, står en maskin där nu. Ingen fyller i något.

import type { MaskinRoll } from './sakerhet';

export type StegLage = 'klar' | 'pagar' | 'vantar';
export type LoppSteg = { id: 'skordare' | 'skotare' | 'klart'; namn: string; text: string; lage: StegLage };
export type Lopp = { rubrik: string; steg: LoppSteg[] };

export type LoppIndata = {
  gallring: boolean;
  /** objektet är avslutat (länken visar "Varför ser det ut så här?") */
  avslutat: boolean;
  /** skördaren/skotaren har kört något på trakten (volym finns) */
  harSkordat: boolean;
  harSkotat: boolean;
  /** avslutsdatum satt (dim_objekt) */
  skordningKlar: boolean;
  skotningKlar: boolean;
  /** markägaren skotar själv — då finns inget skotarsteg */
  egenSkotning: boolean;
  /** maskiner som står på trakten just nu */
  roller: readonly MaskinRoll[];
};

export const LAGE_ORD: Record<StegLage, string> = { klar: 'Klar', pagar: 'Pågår', vantar: 'Kommer sen' };

export const RUBRIK = {
  bada: 'Skördaren och skotaren arbetar',
  skordare: 'Skördaren arbetar nu',
  skotare: 'Skotaren kör ut virket',
  ingenStart: 'Vi har inte börjat än',
  ingenNu: 'Ingen maskin här just nu',
  klart: 'Vi är klara',
} as const;

/** Står maskinen på trakten nu PÅGÅR steget, vad avslutsdatumet än säger — maskinen har kommit tillbaka, och rubriken får aldrig säga emot steget. */
const lage = (klar: boolean, igang: boolean, harNu: boolean): StegLage => (harNu ? 'pagar' : klar ? 'klar' : igang ? 'pagar' : 'vantar');

export function byggLopp(d: LoppIndata): Lopp {
  const skordareHar = d.roller.includes('skordare');
  const skotareHar = d.roller.includes('skotare');
  const steg: LoppSteg[] = [
    { id: 'skordare', namn: 'Skördaren', text: d.gallring ? 'Gallrar skogen' : 'Fäller träden', lage: lage(d.avslutat || d.skordningKlar, d.harSkordat, skordareHar && !d.avslutat) },
  ];
  if (!d.egenSkotning) steg.push({ id: 'skotare', namn: 'Skotaren', text: 'Kör ut virket till vägen', lage: lage(d.avslutat || d.skotningKlar, d.harSkotat, skotareHar && !d.avslutat) });
  steg.push({ id: 'klart', namn: 'Klart', text: d.egenSkotning ? 'Vi är klara i din skog' : 'Allt virke ligger vid vägen', lage: d.avslutat ? 'klar' : 'vantar' });

  let rubrik: string;
  if (d.avslutat) rubrik = RUBRIK.klart;
  else if (skordareHar && skotareHar) rubrik = RUBRIK.bada;
  else if (skordareHar) rubrik = RUBRIK.skordare;
  else if (skotareHar) rubrik = RUBRIK.skotare;
  else rubrik = d.harSkordat || d.harSkotat ? RUBRIK.ingenNu : RUBRIK.ingenStart;
  return { rubrik, steg };
}
