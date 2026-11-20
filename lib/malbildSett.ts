// AVLÄGGETS MÅLBILD I SKOTARLÄGET: visas på kortet vid FÖRSTA lasset per trakt (och enhet), därefter bara när man trycker på ett avlägg på kartan.
// Rena regler + minnet på enheten (localStorage, en lista med objekt-id). Ett trasigt eller avstängt minne ger "inte sett" — hellre en gång för mycket än aldrig.

import type { Lass } from './skotarLass/typer';

export const MALBILD_AVLAGG_SETT_NYCKEL = 'malbild_avlagg_sett_v1';

/** Är kortet som visas just nu maskinens FÖRSTA lass på trakten? Strukna lass räknas inte; andra maskiners lass inte heller. */
export function arForstaLassetPaTrakten(lass: readonly Pick<Lass, 'id' | 'objektId' | 'maskinId' | 'status'>[], kortLassId: string, objektId: string, maskinId: string): boolean {
  return !lass.some((l) => l.id !== kortLassId && l.objektId === objektId && l.maskinId === maskinId && l.status !== 'struket');
}

function lasLista(): string[] {
  try {
    const rå = typeof localStorage === 'undefined' ? null : localStorage.getItem(MALBILD_AVLAGG_SETT_NYCKEL);
    const v = rå ? JSON.parse(rå) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}

export const harSettAvlaggsmalbild = (objektId: string): boolean => lasLista().includes(objektId);

export function markeraAvlaggsmalbildSett(objektId: string): void {
  try {
    const lista = lasLista();
    if (!lista.includes(objektId)) localStorage.setItem(MALBILD_AVLAGG_SETT_NYCKEL, JSON.stringify([...lista, objektId].slice(-200)));
  } catch { /* privat läge eller fullt minne: då visas den en gång till */ }
}
