// Kö över roller (/oversikt-v2). Ren logik, Node-importerbar, testas i ko-regler.test.ts.
//
// Ett objekt får ligga i en skördares kö OCH en skotares kö samtidigt — skotaren ska kunna ha trakten i kön medan skördaren
// fortfarande arbetar där, och tvärtom. Spärren gäller bara SAMMA roll: två skördare, eller två skotare, på samma objekt.
// En maskin av annan roll som har objektet i kön visas som info ("i kö för X"), inte som spärr.
//
// Okänd roll (kö-raden pekar på en maskin som inte finns i listan) räknas som spärr — samma försiktighet som förut, då
// vilken kö som helst spärrade.

import type { MaskinKoItem } from '../oversikt/oversikt-types';
import type { MaskinTyp } from './nasta-v2';

export interface KoLaget {
  /** Maskiner av SAMMA roll (inklusive maskinen själv) som redan har objektet i kön → objektet går inte att lägga till. */
  spar: string[];
  /** Maskiner av ANNAN roll som har objektet i kön → bara info. */
  info: string[];
}

/** Hur ligger objektet i kö, sett från en maskin (med rollen `roll`) som vill ha det? Namnen är sorterade och utan dubbletter. */
export function koLaget(a: {
  objektId: string;
  maskinId: string;
  roll: MaskinTyp;
  ko: MaskinKoItem[];
  rollAv: (maskinId: string) => MaskinTyp | null;
  namnAv: (maskinId: string) => string;
}): KoLaget {
  const spar = new Set<string>(); const info = new Set<string>();
  for (const k of a.ko) {
    if (k.objekt_id !== a.objektId) continue;
    const rollen = a.rollAv(k.maskin_id);
    (k.maskin_id === a.maskinId || rollen == null || rollen === a.roll ? spar : info).add(a.namnAv(k.maskin_id));
  }
  const sorterat = (s: Set<string>) => Array.from(s).sort((x, y) => x.localeCompare(y, 'sv'));
  return { spar: sorterat(spar), info: sorterat(info) };
}
