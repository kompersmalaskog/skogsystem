// Maskindatorns startsekvens (maskinläge): svart → kartan tonar upp utzoomad över traktgränsen →
// EN mjuk flyTo ner till maskinen (körriktning upp, körvyns baszoom) → objekt-raden när kameran landat.
// INGEN logga och ingen text i sekvensen (loggan finns bara i felskärmarna).
//
// Ren, tidsstyrd tillståndsmaskin (ingen sidoeffekt) så den kan enhetstestas. Sidan (page.tsx) matar in
// tidsstämplar för de händelser som sker (karta redo, första fix, flygningen startade) och renderar utifrån fasen.

export type StartFas = 'svart' | 'oversikt' | 'flyger' | 'landat' | 'klar';

export const SVART_MAX_MS = 10000;   // kartan hann inte bli redo → släpp svart och visa det som ligger under
export const COVER_FADE_MS = 700;    // svart tonar ut (kartan "tonar upp")
export const REVEAL_MS = 700;        // kartan syns utzoomad så här länge innan flygningen börjar (= fade-tiden)
export const FLY_MS = 1500;          // EN mjuk flyTo ner till maskinen
export const RAD_MS = 5000;          // objekt-raden står kvar så här länge efter landning
export const FIX_TIMEOUT_MS = 30000; // utzoomad utan fix så här länge → "Ingen GPS-fix" (står kvar tills fix kommer)

export interface StartIn {
  startMs: number;                 // sekvensen startade
  nuMs: number;
  kartaRedoMs: number | null;      // kartan är målad i översiktsläge (bakom svart) — null = laddar än
  ingenKarta: boolean;             // beslutet blev förarlista → det finns ingen karta att tona upp
  fixMs: number | null;            // första giltiga GPS-fixen — null = ingen än
  flygStartMs: number | null;      // flygningen startade — null = ej än
}

/** Fas ur tidsstämplarna.
 *  - `svart`   : kartan laddar (helt svart, ingen logga/text). Max SVART_MAX_MS.
 *  - `oversikt`: kartan har tonat upp, utzoomad över traktgränsen. Väntar på fix (och REVEAL_MS).
 *  - `flyger`  : EN flyTo pågår (FLY_MS).
 *  - `landat`  : kameran har landat → objekt-raden syns (RAD_MS).
 *  - `klar`    : sekvensen är slut (eller hoppades över) → vanlig körvy / förarlista.
 *  Kartan blev aldrig redo (SVART_MAX_MS) eller beslutet blev förarlista → direkt `klar`: svart släpps
 *  och det som ligger under (listan) visas i stället för en död svart skärm. */
export function startFas(i: StartIn): StartFas {
  if (i.flygStartMs != null) {
    const t = i.nuMs - i.flygStartMs;
    if (t < FLY_MS) return 'flyger';
    if (t < FLY_MS + RAD_MS) return 'landat';
    return 'klar';
  }
  if (i.kartaRedoMs != null) return 'oversikt';
  if (i.ingenKarta || i.nuMs - i.startMs >= SVART_MAX_MS) return 'klar';
  return 'svart';
}

/** Ska flygningen starta nu? Kartan har tonat upp (REVEAL_MS sedan den blev redo) OCH vi har en fix. */
export function flygKlar(i: StartIn): boolean {
  return startFas(i) === 'oversikt'
    && i.fixMs != null
    && i.kartaRedoMs != null
    && i.nuMs - i.kartaRedoMs >= REVEAL_MS;
}

/** Svart täckskikt är ogenomskinligt bara i `svart`; i alla andra faser tonar det ut. */
export function startCoverSynlig(fas: StartFas): boolean {
  return fas === 'svart';
}

/** Overlayen (täckskikt + rad) ska renderas i alla faser utom `klar`. */
export function startOverlaySynlig(fas: StartFas): boolean {
  return fas !== 'klar';
}

/** Kameran ägs av sekvensen i svart/översikt/flygning: körvyns följ-effekt (easeTo vid varje GPS-tick) och
 *  trakt-geometrins fitBounds MÅSTE vara tysta, annars avbryter de flygningen. Släpps vid landning. */
export function startKameraLas(fas: StartFas | null): boolean {
  return fas === 'svart' || fas === 'oversikt' || fas === 'flyger';
}

/** Nedre radens text. `oversikt` utan fix: "Söker GPS" (→ "Ingen GPS-fix" efter FIX_TIMEOUT_MS, står kvar).
 *  `landat`: "<objekt> – N m³ kvar". Alla andra faser: ingen rad (svart har ingen text alls). */
export function startRadText(
  fas: StartFas,
  ctx: { fixMs: number | null; kartaRedoMs: number | null; nuMs: number; objekt: { namn?: string | null; m3kvar?: number | null } | null | undefined },
): string | null {
  if (fas === 'oversikt') {
    if (ctx.fixMs != null) return null;   // fix finns → flygningen startar strax, ingen rad
    const vantat = ctx.kartaRedoMs != null ? ctx.nuMs - ctx.kartaRedoMs : 0;
    return vantat >= FIX_TIMEOUT_MS ? 'Ingen GPS-fix' : 'Söker GPS';
  }
  if (fas === 'landat') {
    const namn = (ctx.objekt?.namn || '').trim() || 'Objekt';
    return ctx.objekt?.m3kvar != null ? `${namn} – ${Math.round(ctx.objekt.m3kvar)} m³ kvar` : namn;
  }
  return null;
}
