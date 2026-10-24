// Vad markägaren och föraren ser av en anmälan. Rena funktioner.

import { klockslag } from './tid';
import { ROLL_ORD, type MaskinRoll } from './sakerhet';

export type Kvittens = { roll: MaskinRoll; tid: string };

/** Besökssidan efter "Skicka": väntar eller "✓ Skördaren har sett det 13:52" (en rad per maskin som tryckt Uppfattat). */
export function kvitteringsRader(kv: Kvittens[]): string[] {
  const sorterade = [...kv].sort((a, b) => Date.parse(a.tid) - Date.parse(b.tid));
  return sorterade.map((k) => `✓ ${ROLL_ORD[k.roll]} har sett det ${klockslag(k.tid)}`);
}

export const VANTAR_TEXT = 'Skickat · väntar på föraren';

/** Hyttens orange kort: "Besök: Anna Svensson kommer ca 14:30". */
export const besokRubrik = (namn: string, kommer: string): string => `Besök: ${namn} ${kommer}`;

/** Har den här maskinen redan tryckt Uppfattat på besöket? */
export const harKvitterat = (kvittenser: { maskin_id: string }[], maskinId: string | null | undefined): boolean =>
  !!maskinId && kvittenser.some((k) => k.maskin_id === maskinId);
