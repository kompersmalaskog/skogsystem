// Rollen avgör vad /oversikt-v2 får göra. Ren logik (Node-importerbar, testas i lage.test.ts) — sidan kopplar in den.
//
// FAIL-CLOSED: skrivrättighet ges bara åt roller som uttryckligen har den (admin, chef). Allt annat — en förare, en roll som
// inte är läst än, en roll som saknas eller är okänd — får ALDRIG knappar som skriver. Förare är i läsläge på alla maskiner
// och objekt. En förare vars maskin inte går att fastställa (maskin_id saknas, maskinen finns inte, eller är avvecklad) får
// kartan och inget mer: inga ark, inga knappar. Tidigare räknades "inte förare med en maskin" som förman.

import { maskinAktiv, type MaskinRad } from './nasta-v2';

export type Lage =
  | { typ: 'laddar' }                     // rollen (eller maskinlistan) är inte läst än → inget får öppnas eller skrivas
  | { typ: 'forman' }                     // admin/chef: kö-knappar, GROT-chip, GROT-redigering
  | { typ: 'forare'; maskinId: string }   // förare med giltig maskin: LÄSLÄGE på alla maskiner och objekt
  | { typ: 'karta' };                     // allt annat: kartan, inga ark, inga knappar

export function arbetsLage(a: {
  roll: string | null | undefined;
  rollLaddar: boolean;
  /** medarbetare.maskin_id — jämförs ordagrant mot dim_maskin (ingen trimning: ett id som inte stämmer är inte giltigt). */
  maskinId: string | null | undefined;
  /** dim_maskin; null = inte läst än. */
  maskiner: MaskinRad[] | null;
  idag: string;
}): Lage {
  if (a.rollLaddar) return { typ: 'laddar' };
  if (a.roll === 'admin' || a.roll === 'chef') return { typ: 'forman' };
  if (a.roll === 'forare') {
    if (!a.maskiner) return { typ: 'laddar' }; // maskinlistan avgör om maskinen är giltig → vänta in den
    const m = a.maskinId ? a.maskiner.find((x) => x.maskin_id === a.maskinId) : undefined;
    return m && maskinAktiv(m, a.idag) ? { typ: 'forare', maskinId: m.maskin_id } : { typ: 'karta' };
  }
  return { typ: 'karta' }; // ingen medarbetare-rad, eller en roll som inte finns i listan ovan
}
