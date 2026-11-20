// "Tillåt notiser"-kortet vid start i maskinen: en gång, bara när behörigheten saknas (Chrome har inte frågat än), sen aldrig mer. Rena funktioner + enhetens minne.
//
// Vi visar kortet bara när Chrome fortfarande står på "default" (frågan ställd av ingen). Är notiserna redan tillåtna eller blockerade finns inget att fråga om – blockerat
// kan bara föraren ändra i Chromes inställningar, och Inställningar › Notiser i hytten säger exakt var. Efter ett tryck på knappen räknas kortet som visat (oavsett svar).

import { notisStod } from './notisVisa';

const NYCKEL = 'hytt_notis_tillat_v1';

export const TILLAT_RUBRIK = 'Tillåt notiser så ser du besök och fara när Opti ligger framme';
export const TILLAT_KNAPP = 'Tillåt notiser';

/** Har kortet redan visats (knappen tryckt) på den här enheten? */
export function tillatKortVisat(): boolean {
  try { return localStorage.getItem(NYCKEL) === '1'; } catch { return false; }
}
export function markeraTillatKortVisat(): void {
  try { localStorage.setItem(NYCKEL, '1'); } catch { /* utan minne visas kortet vid nästa start igen – hellre det än att aldrig fråga */ }
}

/** Ska kortet visas nu? Maskinläget med notiserna på, webbläsaren klarar notiser, Chrome har inte frågat, och kortet har inte visats förut. */
export function skaVisaTillatKort(a: { aktiv: boolean; stods: boolean; behorighet: NotificationPermission | 'saknas'; visatForut: boolean }): boolean {
  return a.aktiv && a.stods && a.behorighet === 'default' && !a.visatForut;
}

/** Läser läget ur webbläsaren (anropas i en effekt, inte under rendering). */
export function lasTillatKortLage(aktiv: boolean): boolean {
  const s = notisStod();
  return skaVisaTillatKort({ aktiv, stods: s.stods, behorighet: s.behorighet, visatForut: tillatKortVisat() });
}
