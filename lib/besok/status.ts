// Vad markägaren och föraren ser av en anmälan. Rena funktioner.

import { klockslag } from './tid';
import { ROLL_ORD, type MaskinRoll } from './sakerhet';

export type Kvittens = { roll: MaskinRoll; tid: string };

/** Besökssidan efter "Skicka": väntar eller "✓ Skördaren har sett det 13:52" (en rad per maskin som tryckt Uppfattat). */
export function kvitteringsRader(kv: Kvittens[]): string[] {
  const sorterade = [...kv].sort((a, b) => Date.parse(a.tid) - Date.parse(b.tid));
  return sorterade.map((k) => `✓ ${ROLL_ORD[k.roll]} har sett det ${klockslag(k.tid)}`);
}

export type MaskinRad = { etikett: string; roll: MaskinRoll; tid: string | null };

export const EJ_SETT_TEXT = 'Föraren har inte sett dig än – gå inte in, ring oss';

/** Besökssidan efter "Skicka": en rad per maskin som ska ha sett besöket. Sedd: "✓ Skördaren Scorpion har sett att du kommer" (grön). Inte sedd: en tydlig varning med maskinen utpekad när det finns flera. */
export function maskinStatusRader(maskiner: readonly MaskinRad[]): { text: string; sett: boolean }[] {
  const flera = maskiner.length > 1;
  return [...maskiner]
    .sort((a, b) => (a.tid && b.tid ? Date.parse(a.tid) - Date.parse(b.tid) : a.tid ? -1 : b.tid ? 1 : 0))   // sedda först (äldst först), de som inte sett i serverns ordning (skördare före skotare)
    .map((m) => (m.tid ? { text: `✓ ${m.etikett} har sett att du kommer`, sett: true } : { text: flera ? `${m.etikett}: ${EJ_SETT_TEXT[0].toLowerCase()}${EJ_SETT_TEXT.slice(1)}` : EJ_SETT_TEXT, sett: false }));
}

export const VANTAR_TEXT = 'Skickat · väntar på föraren';

/** Hyttens orange kort: "Besök: Anna Svensson kommer ca 14:30". */
export const besokRubrik = (namn: string, kommer: string): string => `Besök: ${namn} ${kommer}`;

/** Har den här maskinen redan tryckt Uppfattat på besöket? */
export const harKvitterat = (kvittenser: { maskin_id: string }[], maskinId: string | null | undefined): boolean =>
  !!maskinId && kvittenser.some((k) => k.maskin_id === maskinId);
