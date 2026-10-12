// Maskindatorns startsekvens (maskinläge): svart → kartan tonar upp utzoomad → EN mjuk flyTo ner till maskinen
// (körriktning upp, körvyns baszoom) → objekt-raden när kameran landat.
// INGEN logga i sekvensen (loggan finns bara i felskärmarna). Svart under 1 s visar INGENTING; varar det längre visas
// maskinens namn + en långsam förloppsrad, och efter 10 s vad som dröjer (svartInfo nedan).
//
// Ren, tidsstyrd tillståndsmaskin (ingen sidoeffekt) så den kan enhetstestas. Sidan (page.tsx) matar in
// tidsstämplar för de händelser som sker (karta redo, position känd, flygningen startade) och renderar utifrån fasen.
//
// POSITIONEN är maskinens SENAST KÄNDA (lokal maskinPos eller senaste hyttspår-punkt, lib/maskinPosition) — sekvensen
// väntar inte på en GPS-fix. Först när ingen position alls finns väntar den på en riktig fix.

export type StartFas = 'svart' | 'oversikt' | 'flyger' | 'landat' | 'klar';

export const SVART_MAX_MS = 30000;   // kartan hann inte bli redo → släpp svart och visa det som ligger under (svart förklarar sig själv efter 1/10 s)
export const COVER_FADE_MS = 700;    // svart tonar ut (kartan "tonar upp")
export const REVEAL_MS = 700;        // kartan syns utzoomad så här länge innan flygningen börjar (= fade-tiden)
export const FLY_MS = 1500;          // EN mjuk flyTo ner till maskinen
export const RAD_MS = 5000;          // objekt-raden står kvar så här länge efter landning
export const FIX_TIMEOUT_MS = 30000; // utzoomad utan NÅGON position så här länge → "Ingen GPS-fix" (står kvar tills fix kommer)

export interface StartIn {
  startMs: number;                 // sekvensen startade
  nuMs: number;
  kartaRedoMs: number | null;      // kartan är målad i översiktsläge (bakom svart) — null = laddar än
  ingenKarta: boolean;             // beslutet blev förarlista → det finns ingen karta att tona upp
  posMs: number | null;            // position känd (senast kända ELLER riktig fix) — null = ingen än
  flygStartMs: number | null;      // flygningen startade — null = ej än
}

/** Fas ur tidsstämplarna.
 *  - `svart`   : kartan laddar (helt svart, ingen logga/text). Max SVART_MAX_MS.
 *  - `oversikt`: kartan har tonat upp, utzoomad över traktgränsen. Väntar på position (och REVEAL_MS).
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

/** Ska flygningen starta nu? Kartan har tonat upp (REVEAL_MS sedan den blev redo) OCH vi har en position. */
export function flygKlar(i: StartIn): boolean {
  return startFas(i) === 'oversikt'
    && i.posMs != null
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

/** Nedre radens text. `oversikt` utan position: "Söker GPS" (→ "Ingen GPS-fix" efter FIX_TIMEOUT_MS, står kvar).
 *  `landat`: "<objekt> – N m³ kvar". Alla andra faser: ingen rad (svart har ingen text alls). */
export function startRadText(
  fas: StartFas,
  ctx: { posMs: number | null; kartaRedoMs: number | null; nuMs: number; objekt: { namn?: string | null; m3kvar?: number | null } | null | undefined },
): string | null {
  if (fas === 'oversikt') {
    if (ctx.posMs != null) return null;   // position finns → flygningen startar strax, ingen rad
    const vantat = ctx.kartaRedoMs != null ? ctx.nuMs - ctx.kartaRedoMs : 0;
    return vantat >= FIX_TIMEOUT_MS ? 'Ingen GPS-fix' : 'Söker GPS';
  }
  if (fas === 'landat') {
    const namn = (ctx.objekt?.namn || '').trim() || 'Objekt';
    return ctx.objekt?.m3kvar != null ? `${namn} – ${Math.round(ctx.objekt.m3kvar)} m³ kvar` : namn;
  }
  return null;
}

// ───────────── Vad svart skärm säger om sig själv ─────────────
// Under SVART_INFO_MS (1 s) visas INGENTING. Varar svart längre: maskinens namn i liten grå text + en tunn, långsam
// förloppsrad under. Efter SVART_STATUS_MS (10 s): en rad som säger VAD som dröjer. Tiden räknas från NAVIGERINGEN
// (performance.now()) — samma klocka för alla svarta lager (Suspense-fallback, väntläge, sekvensens täckskikt), så
// inget av dem startar om räkningen när det byter av ett annat.
export const SVART_INFO_MS = 1000;
export const SVART_STATUS_MS = 10000;

export type SvartVad = 'nat' | 'position' | 'karta';

/** Vad dröjer? Utan nät: nätet. Finns ännu ingen karta (position/objekt hämtas): positionen. Annars kartan. */
export function svartVad(a: { online: boolean; kartaFinns: boolean }): SvartVad {
  if (!a.online) return 'nat';
  if (!a.kartaFinns) return 'position';
  return 'karta';
}

export const SVART_VAD_TEXT: Record<SvartVad, string> = {
  nat: 'Väntar på nät',
  position: 'Hämtar position',
  karta: 'Hämtar karta',
};

export interface SvartInfo {
  namn: string | null;     // maskinens namn (liten grå text mitt på skärmen) — null = visa inget namn
  forlopp: boolean;        // den tunna, långsamma förloppsraden under
  text: string | null;     // vad som dröjer (först efter SVART_STATUS_MS)
}

export function svartInfo(a: { sedanNavigeringMs: number; namn: string | null | undefined; vad: SvartVad }): SvartInfo {
  if (a.sedanNavigeringMs < SVART_INFO_MS) return { namn: null, forlopp: false, text: null };
  const namn = (a.namn || '').trim() || null;
  if (a.sedanNavigeringMs < SVART_STATUS_MS) return { namn, forlopp: true, text: null };
  return { namn, forlopp: true, text: SVART_VAD_TEXT[a.vad] };
}
