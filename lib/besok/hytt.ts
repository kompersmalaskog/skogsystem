// Hyttens sida av besöken (maskinläget): vilka anmälningar som är aktiva, vilka den här maskinen ännu inte tryckt Uppfattat på, och ringens geometri. Rena funktioner.

import { arBesokAktivt } from './tid';
import { harKvitterat } from './status';

export type HyttBesok = { id: string; namn: string; telefon: string; besokstid: string };
export type HyttKvittens = { besok_id: string; maskin_id: string };

/** Aktiva besök (till besökstid + 2 h), tidigast först. */
export function aktivaBesok(besok: HyttBesok[], nu: Date = new Date()): HyttBesok[] {
  return besok.filter((b) => arBesokAktivt(b.besokstid, nu)).sort((a, b) => Date.parse(a.besokstid) - Date.parse(b.besokstid));
}

/** De aktiva besök som den här maskinen inte kvitterat — kortet ligger kvar i hytten tills Uppfattat. */
export function ejKvitterade(aktiva: HyttBesok[], kvitt: HyttKvittens[], maskinId: string | null | undefined): HyttBesok[] {
  return aktiva.filter((b) => !harKvitterat(kvitt.filter((k) => k.besok_id === b.id), maskinId));
}

/** Ska ringen ritas? Så länge något besök är aktivt — också efter Uppfattat (föraren ska fortfarande veta var 70 m går). */
export const ringAktiv = (aktiva: HyttBesok[]): boolean => aktiva.length > 0;
