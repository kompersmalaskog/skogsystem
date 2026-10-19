// Rundarkets två lägen och vad ett drag i greppet gör. RENT — ingen React, ingen DOM.
//
// Arket är alltid så högt som skärmen tillåter (`max`: skärmen minus det som ska synas ovanför) och förskjuts nedåt med translateY, så ett läge
// är bara ett tal: hur många pixlar av arket som syns. dock = brickorna (och raden för det markerade). hel = dockan + Rundan-innehållet,
// men bara så högt som innehållet är: kort innehåll lämnar kartan synlig ovanför, långt innehåll tar skärmen minus huvudet (och scrollar).
// Det finns inget mellanläge: ett läge som är en bestämd andel av skärmen gav kartan 126 px (oanvändbart) — hel följer i stället sitt innehåll.

export type ArkLage = 'dock' | 'hel';

/** Synlig höjd i px per läge. Alltid dock <= hel <= max. `max` är arkets egen höjd (det högsta det kan synas), inget läge. */
export type ArkHojder = { dock: number; hel: number; max: number };

/** Minsta innehåll under dockan i hel, så att en tom runda inte ser trasig ut (en lucka där innehållet borde vara). */
export const HEL_MIN_INNEHALL_PX = 200;

/** Hur långt ett drag måste gå innan arket byter läge — under det ligger det kvar (ett darrande finger är inget val). */
export const ARK_TARSKEL_PX = 56;

/**
 * Lägenas höjder. `dockPx` är det uppmätta innehållet i dockan (grepp + raden + brickorna); `toppReservPx` är det som alltid ska vara
 * synligt ovanför arket (huvudet och luften under det); `innehallPx` är Rundan-innehållets egen höjd (inklusive dess marginaler).
 * hel = dockan + innehållet, minst dockan + HEL_MIN_INNEHALL_PX och högst max. Dockan blir aldrig högre än max, hur liten skärmen än är.
 */
export function arkHojder(args: { fonsterHojd: number; dockPx: number; toppReservPx: number; innehallPx: number }): ArkHojder {
  const max = Math.max(0, Math.round(args.fonsterHojd - args.toppReservPx));
  const dock = Math.min(Math.max(0, Math.round(args.dockPx)), max);
  const onskad = dock + Math.max(HEL_MIN_INNEHALL_PX, Math.round(args.innehallPx));
  return { dock, hel: Math.min(max, Math.max(dock, onskad)), max };
}

/** Förskjutningen nedåt (translateY) för ett läge. Arket är max högt, så ett läge som är lägre än max sänks med mellanskillnaden. */
export function arkForskjutning(lage: ArkLage, h: ArkHojder): number {
  return h.max - h[lage];
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
