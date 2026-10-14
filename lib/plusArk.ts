// PLUS-ARKET ("Alla"): tre flikar (Symboler · Rita & mät · Lager), ett ark som är halv skärm och kan dras upp till hel, och Redigera för dockans sex platser.
// Princip (Martin): plus = kartan (lägga till, rita, mäta, välja vad kartan visar). Objektnamnet = objektet.
//
// Rena funktioner → testbara (plusArk.test.ts). Inget här vet något om React, kartan eller vad ett tryck gör.
// Dockans regler bor kvar i lib/plusRad (MAX_FASTA, arDockPost, vilka som får fästas) — Redigera bygger på dem, ändrar dem inte.

import { MAX_FASTA, arDockPost, arSammaPost, postNyckel, type PlusPost, type PlusRadState } from './plusRad';

export const FLIKAR = [
  { id: 'symboler', etikett: 'Symboler' },
  { id: 'rita', etikett: 'Rita & mät' },
  { id: 'lager', etikett: 'Lager' },
] as const;
export type FlikId = (typeof FLIKAR)[number]['id'];
export const FLIK_IDN: readonly FlikId[] = FLIKAR.map((f) => f.id);
export const arFlikId = (x: unknown): x is FlikId => typeof x === 'string' && (FLIK_IDN as readonly string[]).includes(x);

// ── Ark eller panel: SKÄRMENS BREDD styr, inte enheten ──
// Under 900 px: arket nerifrån (halv skärm, kan dras till hel) — exakt som förut. 900 px och bredare: en panel från höger, så ett ark inte
// lägger sig över maskinen längst ner i körvyn (maskindatorn är 1280×800) eller halva kartan vid datorn. Samma komponent (PlusArk), samma flikar.
export type PlusLage = 'ark' | 'panel';
export const PANEL_MIN_BREDD_PX = 900;
export const PANEL_BREDD_PX = 380;
export const plusLage = (fonsterBredd: number): PlusLage => (fonsterBredd >= PANEL_MIN_BREDD_PX ? 'panel' : 'ark');

// ── Arkets två lägen ──
export type Detent = 'halv' | 'hel';
/** Så långt (px) fingret måste dras för att arket byter läge. Kortare drag → arket far tillbaka. */
export const DETENT_TARSKEL_PX = 56;

/**
 * Var arket landar när fingret släpps. `dy` = hur långt fingret flyttats sedan nedtryckt (negativt = uppåt).
 * Halvt ark dras upp → helt. Helt ark dras ned → halvt. Ett halvt ark som dras ned stänger INTE — det far tillbaka
 * (stängning görs med krysset eller genom att trycka på kartan ovanför).
 */
export function valjDetent(nu: Detent, dy: number, tarskel: number = DETENT_TARSKEL_PX): Detent {
  if (nu === 'halv') return dy <= -tarskel ? 'hel' : 'halv';
  return dy >= tarskel ? 'halv' : 'hel';
}

/**
 * Objektlistans ark (telefon): som `valjDetent`, men ett halvt ark som dras NED över tröskeln STÄNGS (`kanStangas`) — listan har inget annat sätt att
 * stängas med fingret nu när ett tryck på kartan inte stänger. Plus-arket far tillbaka i stället (det stängs med krysset). Utan `kanStangas`
 * (inget objekt valt, listan är det enda som finns) far ett halvt ark som dras ned tillbaka.
 */
export function valjListdetent(nu: Detent, dy: number, kanStangas: boolean, tarskel: number = DETENT_TARSKEL_PX): Detent | 'stang' {
  if (nu === 'halv') {
    if (dy <= -tarskel) return 'hel';
    if (dy >= tarskel) return kanStangas ? 'stang' : 'halv';
    return 'halv';
  }
  return dy >= tarskel ? 'halv' : 'hel';
}

/** Arkets höjd i px under ett pågående drag: följer fingret men aldrig under 30 % eller över fönstret. */
export function dragHojd(startHojd: number, dy: number, fonsterHojd: number): number {
  const min = Math.round(fonsterHojd * 0.3);
  return Math.max(min, Math.min(fonsterHojd, Math.round(startHojd - dy)));
}

// ── Redigera: en arbetskopia av dockans platser ──
// Dockan visar alltid sex platser (fasta först, sedan mest använda — lib/plusRad.beraknaRad). I Redigera startar arbetskopian som
// de platser dockan visar just nu; "Klar" gör hela kopian till FASTA platser. Är kopian kortare än sex fyller dockan resten
// automatiskt som förut. Återställ (längst ner i Redigera) gör alla platser automatiska igen.

/** Arbetskopia av dockan: bara giltiga dock-poster, utan dubbletter, högst MAX_FASTA. */
export function startaRedigering(dockNu: PlusPost[]): PlusPost[] {
  const ut: PlusPost[] = [];
  for (const p of dockNu) {
    if (!arDockPost(p) || ut.some((q) => arSammaPost(q, p))) continue;
    ut.push(p);
    if (ut.length >= MAX_FASTA) break;
  }
  return ut;
}

export const ligger = (lista: PlusPost[], p: PlusPost): boolean => lista.some((q) => arSammaPost(q, p));

/** Rött minus: ta bort platsen. Okänd nyckel → listan oförändrad. */
export function taBortPlats(lista: PlusPost[], nyckel: string): PlusPost[] {
  return lista.filter((p) => postNyckel(p) !== nyckel);
}

export type LaggTillSvar = { ok: true; lista: PlusPost[] } | { ok: false; skal: 'full' | 'finns' | 'ej-symbol' };

/** Grönt plus: lägg posten sist. Full docka (sex) → ingenting byts ut i smyg, föraren får ta bort en först. */
export function laggTillPlats(lista: PlusPost[], p: PlusPost): LaggTillSvar {
  if (!arDockPost(p)) return { ok: false, skal: 'ej-symbol' };
  if (ligger(lista, p)) return { ok: false, skal: 'finns' };
  if (lista.length >= MAX_FASTA) return { ok: false, skal: 'full' };
  return { ok: true, lista: [...lista, p] };
}

/** Dra: flytta platsen på index `fran` till index `till` (övriga glider ett steg). Utanför listan → oförändrad. */
export function flyttaPlats(lista: PlusPost[], fran: number, till: number): PlusPost[] {
  if (fran === till || fran < 0 || fran >= lista.length) return lista;
  const t = Math.max(0, Math.min(lista.length - 1, till));
  const kopia = lista.slice();
  const [p] = kopia.splice(fran, 1);
  kopia.splice(t, 0, p);
  return kopia;
}

/** Vilken plats fingret är över: index på den närmaste av platsernas mittpunkter (en rad på bred skärm, två rader på smal). */
export function platsUnderFinger(x: number, y: number, mittar: { x: number; y: number }[]): number {
  if (mittar.length === 0) return -1;
  let basta = 0, bastaAvst = Infinity;
  for (let i = 0; i < mittar.length; i++) {
    const d = Math.hypot(x - mittar[i].x, y - mittar[i].y);
    if (d < bastaAvst) { bastaAvst = d; basta = i; }
  }
  return basta;
}

/** "Klar": arbetskopian blir dockans FASTA platser. Användningsräknarna rörs inte. Ogiltiga poster kastas tyst. */
export function redigeringTillState(s: PlusRadState, lista: PlusPost[]): PlusRadState {
  return { fasta: startaRedigering(lista), anv: s.anv };
}

/** Skiljer sig arbetskopian från det som är sparat? (Klar-knappen är bara aktiv då — dirty-state hör hemma på knappen.) */
export function arAndrad(dockNu: PlusPost[], lista: PlusPost[]): boolean {
  const a = dockNu.map(postNyckel), b = lista.map(postNyckel);
  return a.length !== b.length || a.some((k, i) => k !== b[i]);
}
