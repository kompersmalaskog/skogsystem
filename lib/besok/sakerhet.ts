// Säkerheten på besökssidan, medan maskinerna arbetar (Martin 2026-11-10). Får inte bli för mycket — folk slutar läsa.
// EN regel under kartan, och en rad per sak som FINNS på trakten nu, med en mening om VARFÖR (säger man varför tar folk regeln på allvar).
// Virkestravarna står alltid med: de gäller just markägare och deras barn. Texterna står här och bara här (ändra här, inte i vyn).

import { BESOK_RING_M } from './konstanter';

export type MaskinRoll = 'skordare' | 'skotare';

/** Raden under kartan. Ringen är röd för alla maskiner — den betyder "gå inte innanför". */
export const RINGREGEL = 'Gå aldrig in i den röda ringen. Vänta tills föraren sett dig och stängt av.';

/** Det kortaste sättet att säga regeln (kortet under besöket). */
export const HUVUDREGEL = { rubrik: 'Gå aldrig fram till en maskin' } as const;

const ROLL_ORD_LOKAL: Record<MaskinRoll, string> = { skordare: 'Skördaren', skotare: 'Skotaren' };

export type SakerhetsRad = { id: 'skordare' | 'skotare' | 'motorsag' | 'lastbil' | 'travar'; rubrik: string; text: string; /** tryck på raden öppnar arket med bilden (bara skotaren) */ ark: boolean };

/** I fast ordning: skördare, skotare, motorsåg, timmerbilar, virkestravar. Maskinerna och motorsågen bara när de finns på trakten nu.
 *  Timmerbilarna står alltid med (Martin 2026-11-16): de kommer när som helst och vi vet inte när. */
/** `kommer` = maskiner som inte står på trakten nu men vars steg i loppet inte är klart (Martin 2026-11-16): den som läser i kväll och går ut i morgon
 *  ska ha sett varningen innan maskinen kommit. Raden säger "kommer senare"; ringen på kartan finns bara för maskiner som faktiskt står där. */
export function sakerhetsRader(a: { roller: MaskinRoll[]; harMotorsag: boolean; kommer?: readonly MaskinRoll[] }): SakerhetsRad[] {
  const rader: SakerhetsRad[] = [];
  const TEXT: Record<MaskinRoll, string> = { skordare: 'Kedjan kan gå av och slungas långt. Träd kan falla åt fel håll.', skotare: 'Kranen svänger runt maskinen, och föraren ser dåligt bakåt.' };
  for (const roll of ['skordare', 'skotare'] as const) {
    const har = a.roller.includes(roll);
    if (!har && !(a.kommer ?? []).includes(roll)) continue;
    rader.push({ id: roll, rubrik: `${ROLL_ORD_LOKAL[roll]} · ${har ? `${BESOK_RING_M[roll]} m` : 'kommer senare'}`, text: har ? TEXT[roll] : `Håll ${BESOK_RING_M[roll]} m när den är här. ${TEXT[roll]}`, ark: roll === 'skotare' });
  }
  if (a.harMotorsag) rader.push({ id: 'motorsag', rubrik: `Motorsåg · ${BESOK_RING_M.motorsag} m`, text: 'Någon fäller träd för hand här.', ark: false });
  rader.push({ id: 'lastbil', rubrik: 'Timmerbilarna', text: 'De hämtar virket vid vägen. Stå aldrig nära när de lastar.', ark: false });
  rader.push({ id: 'travar', rubrik: 'Virkestravarna', text: 'Klättra aldrig på dem. De kan rasa.', ark: false });
  return rader;
}

/** Arkets rubrik beskriver bara bilden (ingen ny regel), och dess enda text förklarar varför raden finns — inga nya regler i arket. */
export const SKOTARARK_RUBRIK = 'Skotaren sedd uppifrån';
export const SKOTARARK_TEXT = 'När skotaren backar med lass ser föraren ingenting bakom sig.';

export const ROLL_NAMN: Record<MaskinRoll, string> = { skordare: 'Skördare', skotare: 'Skotare' };
export const ROLL_ORD: Record<MaskinRoll, string> = { skordare: 'Skördaren', skotare: 'Skotaren' };
