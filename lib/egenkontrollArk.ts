// Rundarkets tre lägen och vad ett drag i greppet gör. RENT — ingen React, ingen DOM.
//
// Arket är alltid så högt som skärmen tillåter (`max`: skärmen minus det som ska synas ovanför) och förskjuts nedåt med translateY, så ett läge
// är bara ett tal: hur många pixlar av arket som syns. Tre lägen, vart och ett med ETT jobb som går att säga med ett ord (LAGE_JOBB):
//   sänkt = gå     — bara greppet syns; kartan får nästan hela skärmen
//   dock  = svara  — raden för det markerade och brickorna
//   hel   = rundan — dockan + Rundan-innehållet, men bara så högt som innehållet är (kort innehåll lämnar kartan synlig ovanför)
//
// REGELN FÖR ETT LÄGE: det får finnas bara om dess jobb går att säga med ett ord. Kommer ett fjärde läge som inte går att beskriva så ska det
// inte byggas (Martin 2026-10-19) — LAGE_JOBB och dess test vaktar det. Det finns inget halvt mellanläge: ett läge som är en bestämd andel av
// skärmen gav kartan 126 px (oanvändbart); hel följer i stället sitt innehåll.
//
// Inget läge byts av sig självt. Undantaget är symboltrycket på kartan, som lyfter sänkt → dock (raden måste gå att nå): se `efterSymboltryck`.

export type ArkLage = 'sankt' | 'dock' | 'hel';

/** Lägena nerifrån och upp. Ordningen styr tryck-på-greppet-cykeln och vilket håll ett drag går. */
export const ARK_LAGEN: readonly ArkLage[] = ['sankt', 'dock', 'hel'] as const;

/** Lägets jobb i ETT ord. Ett läge utan ett sådant ord får inte finnas. */
export const LAGE_JOBB: Record<ArkLage, string> = { sankt: 'gå', dock: 'svara', hel: 'rundan' };

/** Synlig höjd i px per läge. Alltid sankt <= dock <= hel <= max. `max` är arkets egen höjd (det högsta det kan synas), inget läge. */
export type ArkHojder = { sankt: number; dock: number; hel: number; max: number };

/** Kartan ska ha minst så här många px mellan huvudet och arkets överkant i dock (390 × 760). Det avgör hur högt radens innehållsfält får bli. */
export const KARTA_MIN_PX = 300;

/** Minsta innehåll under dockan i hel, så att en tom runda inte ser trasig ut (en lucka där innehållet borde vara). */
export const HEL_MIN_INNEHALL_PX = 200;

/** Hur långt ett drag måste gå innan arket byter läge — under det ligger det kvar (ett darrande finger är inget val). */
export const ARK_TARSKEL_PX = 56;

/**
 * Lägenas höjder. `dockPx` är det uppmätta innehållet i hela toppen (grepp + raden + brickorna + hemindikatorns luft); `sanktPx` är bara
 * greppet och luften under det; `toppReservPx` är det som alltid ska vara synligt ovanför arket (huvudet och luften under det); `innehallPx`
 * är Rundan-innehållets egen höjd (inklusive dess marginaler). hel = dockan + innehållet, minst dockan + HEL_MIN_INNEHALL_PX och högst max.
 * Dockan blir aldrig högre än max, hur liten skärmen än är, och sänkt aldrig högre än dockan.
 */
export function arkHojder(args: { fonsterHojd: number; sanktPx: number; dockPx: number; toppReservPx: number; innehallPx: number }): ArkHojder {
  const max = Math.max(0, Math.round(args.fonsterHojd - args.toppReservPx));
  const dock = Math.min(Math.max(0, Math.round(args.dockPx)), max);
  const sankt = Math.min(Math.max(0, Math.round(args.sanktPx)), dock);
  const onskad = dock + Math.max(HEL_MIN_INNEHALL_PX, Math.round(args.innehallPx));
  return { sankt, dock, hel: Math.min(max, Math.max(dock, onskad)), max };
}

/**
 * Hur högt radens innehållsfält (kommentar, typ, foton) får bli i dockan: så att kartan har minst KARTA_MIN_PX kvar. `bas` är dockan utan
 * fältet. Aldrig under `golv` (två rader text) — på en riktigt liten skärm går kartan före inte.
 */
export function radFaltMax(args: { max: number; bas: number; golv: number; tak: number }): number {
  return Math.max(args.golv, Math.min(args.tak, Math.round(args.max - KARTA_MIN_PX - args.bas)));
}

/** Förskjutningen nedåt (translateY) för ett läge. Arket är max högt, så ett läge som är lägre än max sänks med mellanskillnaden. */
export function arkForskjutning(lage: ArkLage, h: ArkHojder): number {
  return h.max - h[lage];
}

/** Synlig höjd medan fingret drar: lägets höjd minus draget (dy > 0 = nedåt), aldrig under sänkt eller över hel. */
export function arkDragHojd(nu: ArkLage, dy: number, h: ArkHojder): number {
  return Math.min(h.hel, Math.max(h.sankt, h[nu] - dy));
}

/**
 * Läget arket landar i när fingret släpps. Ligger kvar om draget var kortare än tröskeln. Annars: det närmaste — men ALDRIG tillbaka där man
 * började: ett drag över tröskeln flyttar minst ett läge i dragets riktning (lägena ligger ~300 px isär, så "närmast" skulle kräva ett drag
 * på halva avståndet, och med handske är ett kort, bestämt drag det som går att göra). Drag åt båda hållen fungerar; i ändlägena ligger arket kvar.
 */
export function valjArkLage(nu: ArkLage, dy: number, h: ArkHojder): ArkLage {
  if (Math.abs(dy) < ARK_TARSKEL_PX) return nu;
  const mal = arkDragHojd(nu, dy, h);
  const i = ARK_LAGEN.indexOf(nu);
  let narmast = 0;
  ARK_LAGEN.forEach((l, k) => { if (Math.abs(h[l] - mal) < Math.abs(h[ARK_LAGEN[narmast]] - mal)) narmast = k; });
  const upp = dy < 0;
  const steg = upp ? Math.min(ARK_LAGEN.length - 1, i + 1) : Math.max(0, i - 1);
  const mot = upp ? Math.max(narmast, steg) : Math.min(narmast, steg);
  return ARK_LAGEN[mot];
}

/** Tryck på greppet (eller huvudets namn) går vidare ett läge varje gång: sänkt → dock → hel → sänkt. */
export function nastaGreppLage(nu: ArkLage): ArkLage {
  return ARK_LAGEN[(ARK_LAGEN.indexOf(nu) + 1) % ARK_LAGEN.length];
}

/** Tryck på en punkts symbol på kartan (eller en rad som markerar en punkt): sänkt → dock, eftersom raden måste gå att nå. Allt annat ligger kvar. */
export function efterSymboltryck(nu: ArkLage): ArkLage {
  return nu === 'sankt' ? 'dock' : nu;
}
