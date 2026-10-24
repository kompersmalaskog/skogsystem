// Säkerhetsreglerna på besökssidan (tavla 5). Får inte bli för mycket — folk slutar läsa. EN huvudregel överst och högst tre rader "Här just nu", bara för det som FINNS på trakten nu.
// Ingen annan säkerhetstext på sidan. Texterna står här och bara här (ändra här, inte i vyn).

import { BESOK_RING_M } from './konstanter';

export type MaskinRoll = 'skordare' | 'skotare';

export const HUVUDREGEL = {
  rubrik: 'Gå aldrig fram till en maskin',
  steg: [
    `Stanna minst ${BESOK_RING_M.skordare} m bort`,
    'Vinka – vänta tills föraren stängt av',
    'Ha reflexväst, håll barn och hund nära',
  ],
} as const;

export type SakerhetsRad = { id: 'skotare' | 'skordare' | 'motorsag'; text: string; /** tryck på raden öppnar arket med bilden (bara skotaren) */ ark: boolean };

/** Max tre rader, i fast ordning: skotare, skördare, motorsåg. Bara det som finns på trakten nu. */
export function sakerhetsRader(a: { roller: MaskinRoll[]; harMotorsag: boolean }): SakerhetsRad[] {
  const rader: SakerhetsRad[] = [];
  if (a.roller.includes('skotare')) rader.push({ id: 'skotare', text: 'Gå aldrig bakom skotaren eller mellan skotaren och virkeshögen', ark: true });
  if (a.roller.includes('skordare')) rader.push({ id: 'skordare', text: 'Träd kan falla åt alla håll', ark: false });
  if (a.harMotorsag) rader.push({ id: 'motorsag', text: 'Någon fäller med motorsåg här', ark: false });
  return rader.slice(0, 3);
}

/** Arkets rubrik beskriver bara bilden (ingen ny regel), och dess enda text förklarar varför raden finns — inga nya regler i arket. */
export const SKOTARARK_RUBRIK = 'Skotaren sedd uppifrån';
export const SKOTARARK_TEXT = 'När skotaren backar med lass ser föraren ingenting bakom sig.';

export const ROLL_NAMN: Record<MaskinRoll, string> = { skordare: 'Skördare', skotare: 'Skotare' };
export const ROLL_ORD: Record<MaskinRoll, string> = { skordare: 'Skördaren', skotare: 'Skotaren' };
