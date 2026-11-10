// Säkerheten på besökssidan, medan maskinerna arbetar (Martin 2026-11-10). Får inte bli för mycket — folk slutar läsa.
// EN regel under kartan, och en rad per sak som FINNS på trakten nu, med en mening om VARFÖR (säger man varför tar folk regeln på allvar).
// Virkestravarna står alltid med: de gäller just markägare och deras barn. Texterna står här och bara här (ändra här, inte i vyn).

import { BESOK_RING_M } from './konstanter';

export type MaskinRoll = 'skordare' | 'skotare';

/** Raden under kartan. Ringen är röd för alla maskiner — den betyder "gå inte innanför". */
export const RINGREGEL = 'Gå aldrig in i den röda ringen. Vänta tills föraren sett dig och stängt av.';

/** Det kortaste sättet att säga regeln (kortet under besöket). */
export const HUVUDREGEL = { rubrik: 'Gå aldrig fram till en maskin' } as const;

export type SakerhetsRad = { id: 'skordare' | 'skotare' | 'motorsag' | 'travar'; rubrik: string; text: string; /** tryck på raden öppnar arket med bilden (bara skotaren) */ ark: boolean };

/** I fast ordning: skördare, skotare, motorsåg, virkestravar. Maskinerna och motorsågen bara när de finns på trakten nu. */
export function sakerhetsRader(a: { roller: MaskinRoll[]; harMotorsag: boolean }): SakerhetsRad[] {
  const rader: SakerhetsRad[] = [];
  if (a.roller.includes('skordare')) rader.push({ id: 'skordare', rubrik: `Skördaren · ${BESOK_RING_M.skordare} m`, text: 'Kedjan kan gå av och slungas långt. Träd kan falla åt fel håll.', ark: false });
  if (a.roller.includes('skotare')) rader.push({ id: 'skotare', rubrik: `Skotaren · ${BESOK_RING_M.skotare} m`, text: 'Kranen svänger runt maskinen, och föraren ser dåligt bakåt.', ark: true });
  if (a.harMotorsag) rader.push({ id: 'motorsag', rubrik: `Motorsåg · ${BESOK_RING_M.motorsag} m`, text: 'Någon fäller träd för hand här.', ark: false });
  rader.push({ id: 'travar', rubrik: 'Virkestravarna', text: 'Klättra aldrig på dem. De kan rasa.', ark: false });
  return rader;
}

/** Arkets rubrik beskriver bara bilden (ingen ny regel), och dess enda text förklarar varför raden finns — inga nya regler i arket. */
export const SKOTARARK_RUBRIK = 'Skotaren sedd uppifrån';
export const SKOTARARK_TEXT = 'När skotaren backar med lass ser föraren ingenting bakom sig.';

export const ROLL_NAMN: Record<MaskinRoll, string> = { skordare: 'Skördare', skotare: 'Skotare' };
export const ROLL_ORD: Record<MaskinRoll, string> = { skordare: 'Skördaren', skotare: 'Skotaren' };
