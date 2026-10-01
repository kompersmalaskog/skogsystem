// Delad kolumntabellmatte + cellstilar för ekonomins datortabeller
// (Per klass, Mot ackord) — EN plats så vyerna inte kan drifta.
//
// Avrunda varje rad FÖRST (skillen: summan är summan av det som visas):
// ackord/timpeng per m³ som heltal, skillnad = differensen av de VISADE
// talen, Totalt kr = skillnad × avrundad volym (heltal × heltal — exakt,
// kontrollräknbar med miniräknare). Summan summerar radernas visade
// volymer och Totalt exakt; vägd skillnad = Totalt ÷ volym (en kvot,
// avrundad — märks "volymvägd" där den visas). Sortering på Totalt kr
// fallande: vyerna styr på var pengarna ligger, inte bästa marginal
// per kubik.

import type { CSSProperties } from 'react';
import { FARG, TYP, TAL_FONT, AVSTAND } from '@/lib/design/tokens';

export type TabellRad = {
  volym: number;
  ackord: number | null;
  timpeng: number | null;
  skillnad: number;
  totalt: number;
};

export function tabellRad(k: { ackord: number; timpeng: number; volym: number }, diffKrUtanVolym = 0): TabellRad {
  const volym = Math.round(k.volym);
  // 0-volym: kr/m³ är odefinierat (null-celler, streck i vyn) men radens
  // VERKLIGA kr-diff får inte tappas ur summan — den går in som Totalt
  // (avrundad), annars försvinner kronor tyst ur heron/summaraden.
  if (!(k.volym > 0)) return { volym, ackord: null, timpeng: null, skillnad: 0, totalt: Math.round(diffKrUtanVolym) };
  const ackord = Math.round(k.ackord / k.volym);
  const timpeng = Math.round(k.timpeng / k.volym);
  const skillnad = ackord - timpeng;
  return { volym, ackord, timpeng, skillnad, totalt: skillnad * volym };
}

export function beraknaTabell<T extends { ackord: number; timpeng: number; volym: number; diff?: number }>(poster: T[]) {
  const rader = poster
    .map(p => ({ post: p, ...tabellRad(p, p.diff ?? 0) }))
    .sort((a, b) => b.totalt - a.totalt || b.skillnad - a.skillnad);
  const volym = rader.reduce((s, r) => s + r.volym, 0);
  const totalt = rader.reduce((s, r) => s + r.totalt, 0);
  const skillnadVagd = volym > 0 ? Math.round(totalt / volym) : 0;
  return { rader, summa: { volym, totalt, skillnadVagd } };
}

// Cellstilar — rubriker små/dämpade versaler, talceller högerställda i
// TAL_FONT (monospace + tabulära siffror så kolumner läses uppifrån ner).
export const rubrikCell: CSSProperties = { ...TYP.micro, color: FARG.text3, textAlign: 'right' };
export const talCell: CSSProperties = { ...TYP.text, ...TAL_FONT, textAlign: 'right', color: FARG.text };
export function gridRad(kolumner: string): CSSProperties {
  return { display: 'grid', gridTemplateColumns: kolumner, columnGap: AVSTAND.l, alignItems: 'baseline' };
}
