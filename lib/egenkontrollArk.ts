// Rundarkets två lägen och vad ett drag i greppet gör. RENT — ingen React, ingen DOM.
//
// Arket är alltid så högt som det högsta läget (`hel`) och förskjuts nedåt med translateY, så ett läge är bara ett tal: hur många pixlar
// av arket som syns. dock = brickorna (och raden för det markerade), hel = nästan hela skärmen med Rundan-innehållet under brickorna.
// Det finns inget mellanläge: en halv höjd gav kartan 126 px (oanvändbart) och innehållet en nästan lika liten remsa — att flytta gränsen
// flyttar bara problemet. Kartan eller innehållet, aldrig ett mellanting.

export type ArkLage = 'dock' | 'hel';

/** Synlig höjd i px per läge. Alltid dock <= hel. */
export type ArkHojder = { dock: number; hel: number };

/** Hur långt ett drag måste gå innan arket byter läge — under det ligger det kvar (ett darrande finger är inget val). */
export const ARK_TARSKEL_PX = 56;

/**
 * Lägenas höjder. `dockPx` är det uppmätta innehållet i dockan (grepp + raden + brickorna); `toppReservPx` är det som alltid ska vara
 * synligt ovanför arket i hel (huvudet och luften under det). Dockan blir aldrig högre än hel, hur liten skärmen än är (en vriden telefon).
 */
export function arkHojder(args: { fonsterHojd: number; dockPx: number; toppReservPx: number }): ArkHojder {
  const hel = Math.max(0, Math.round(args.fonsterHojd - args.toppReservPx));
  const dock = Math.min(Math.max(0, Math.round(args.dockPx)), hel);
  return { dock, hel };
}

/** Förskjutningen nedåt (translateY) för ett läge. Hel = 0. */
export function arkForskjutning(lage: ArkLage, h: ArkHojder): number {
  return h.hel - h[lage];
}

/** Synlig höjd medan fingret drar: lägets höjd minus draget (dy > 0 = nedåt), aldrig under dockan eller över hel. */
export function arkDragHojd(nu: ArkLage, dy: number, h: ArkHojder): number {
  return Math.min(h.hel, Math.max(h.dock, h[nu] - dy));
}

/** Läget arket landar i när fingret släpps: det närmaste, men ligger kvar om draget var kortare än tröskeln. */
export function valjArkLage(nu: ArkLage, dy: number, h: ArkHojder): ArkLage {
  if (Math.abs(dy) < ARK_TARSKEL_PX) return nu;
  const mal = arkDragHojd(nu, dy, h);
  return Math.abs(h.hel - mal) < Math.abs(h.dock - mal) ? 'hel' : 'dock';
}

/** Tryck på greppet (eller huvudets namn) växlar utan drag: dock ↔ hel. */
export function nastaGreppLage(nu: ArkLage): ArkLage {
  return nu === 'dock' ? 'hel' : 'dock';
}
