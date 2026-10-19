// Rundarkets tre lägen och vad ett drag i greppet gör. RENT — ingen React, ingen DOM.
//
// Arket är alltid så högt som det högsta läget (`hel`) och förskjuts nedåt med translateY, så ett läge är bara ett tal: hur många pixlar
// av arket som syns. dock = brickorna (och raden för det markerade), halv = Rundan-innehållet under dem, hel = nästan hela skärmen.

export type ArkLage = 'dock' | 'halv' | 'hel';

/** Synlig höjd i px per läge. Alltid dock <= halv <= hel. */
export type ArkHojder = { dock: number; halv: number; hel: number };

/** Hur långt ett drag måste gå innan arket byter läge — under det ligger det kvar (ett darrande finger är inget val). */
export const ARK_TARSKEL_PX = 56;

/** Halva lägets andel av skärmhöjden. */
export const ARK_HALV_ANDEL = 0.6;

/** Det halva läget ska ge innehållet under brickorna minst så här mycket plats, hur hög dockan än är (markerad bricka + rad). */
export const ARK_HALV_INNEHALL_PX = 240;

/**
 * Lägenas höjder. `dockPx` är det uppmätta innehållet i dockan (grepp + raden + brickorna); `toppReservPx` är det som alltid ska vara
 * synligt ovanför arket i hela läget (huvudet och luften under det). Halv ger innehållet under brickorna minst
 * ARK_HALV_INNEHALL_PX (annars skulle en dock med markerad bricka äta hela det halva läget), men aldrig mer än hel. Dockan får aldrig bli
 * högre än hel, hur liten skärmen än är (en vriden telefon): ordningen dock <= halv <= hel gäller alltid.
 */
export function arkHojder(args: { fonsterHojd: number; dockPx: number; toppReservPx: number }): ArkHojder {
  const hel = Math.max(0, Math.round(args.fonsterHojd - args.toppReservPx));
  const dock = Math.min(Math.max(0, Math.round(args.dockPx)), hel);
  const halv = Math.min(hel, Math.max(dock + ARK_HALV_INNEHALL_PX, Math.round(args.fonsterHojd * ARK_HALV_ANDEL)));
  return { dock, halv, hel };
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
  const lagen: ArkLage[] = ['dock', 'halv', 'hel'];
  let bast: ArkLage = nu;
  let basta = Infinity;
  for (const l of lagen) {
    const d = Math.abs(h[l] - mal);
    if (d < basta) { basta = d; bast = l; }
  }
  return bast;
}

/** Tryck på greppet växlar utan drag: dock → halv → dock. Hel nås bara genom att dra (eller med knappen i arket). */
export function nastaGreppLage(nu: ArkLage): ArkLage {
  return nu === 'dock' ? 'halv' : 'dock';
}
