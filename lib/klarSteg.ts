// "Klar med trakten?" — stegen i GÖRA-läget. Varje område som kan vara kvar är ETT steg med samma uppbyggnad (rubrik, innehåll, stora knappar, framstegsstreck,
// "‹ traktnamn", Föregående / Hoppa över). "Gå igenom" går genom det som är kvar; en rad i "Behöver dig" öppnar bara sitt steg. Ren logik, ingen rendering.

import type { KlarStatus, PostId } from './klarTrakt';

/** Stegen i den ordning de ligger. `sammanfattning` är sista steget i "Gå igenom"; `ovrigt` (Markägare & övrigt) nås bara från sammanställningen. */
export type StegId = 'avlagg' | 'basvag' | 'forutsattningar' | 'maskiner' | 'medelstam' | 'harDu' | 'prognos' | 'ovrigt' | 'sammanfattning';

export const STEG_ORDNING: readonly StegId[] = ['avlagg', 'basvag', 'forutsattningar', 'maskiner', 'medelstam', 'harDu', 'prognos', 'sammanfattning'];

export const STEG_NAMN: Record<StegId, string> = {
  avlagg: 'Avlägg', basvag: 'Basväg', forutsattningar: 'Förutsättningar', maskiner: 'Maskiner', medelstam: 'Medelstam', harDu: 'Har du …', prognos: 'Prognos', ovrigt: 'Markägare & övrigt', sammanfattning: 'Sammanfattning',
};

/** Vilka steg som är kvar just nu, i ordning. Samma antal som `status.antalKvar`. */
export function kvarSteg(status: KlarStatus): StegId[] {
  const post = (id: PostId) => status.poster.find((x) => x.id === id)?.kvar ?? false;
  const kvar: Record<StegId, boolean> = {
    avlagg: post('avlagg'),
    basvag: post('basvag'),
    forutsattningar: status.forutsattningarKvar > 0,
    maskiner: status.maskinerKvar > 0,
    medelstam: post('medelstam'),
    harDu: status.frågorKvar.length > 0,
    prognos: post('prognos'),
    ovrigt: false,
    sammanfattning: false,
  };
  return STEG_ORDNING.filter((id) => kvar[id]);
}

/**
 * Stegen i en genomgång: det som var kvar när man tryckte "Gå igenom" (ett steg försvinner inte mitt i för att man just fyllt i det), prognosen om den är kvar NU
 * (ändrar man något tidigare i genomgången gäller inte det godkända underlaget längre), och sist sammanfattningen.
 */
export function genomgangSteg(vidStart: readonly StegId[], prognosKvarNu: boolean): StegId[] {
  const ids = new Set<StegId>(vidStart);
  if (prognosKvarNu) ids.add('prognos');
  return [...STEG_ORDNING.filter((id) => id !== 'sammanfattning' && ids.has(id)), 'sammanfattning'];
}
