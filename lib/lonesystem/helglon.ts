// ─────────────────────────────────────────────────────────────
// HELGLÖN (GS-avtalet §10) — EN källa för vilka röda dagar som ger helglön.
//
// Datumen räknas i KOD (lib/roda-dagar, påsk med Gregorius-formeln), inte i en
// tabell som glöms att fyllas på i januari. Formeln är verifierad datum för
// datum mot almanackan 2025–2028 (scripts/verifiera-roda-dagar.ts, 0 fel).
//
// Vilka dagar som ger helglön är AVTALETS sak: gs_avtal.helglon_dagar är en
// textrad med tolv namn. Den här filen kopplar namnen till årets datum. Två
// namn stavas olika i avtalet och i roda-dagar (Trettondagen/Trettondedag jul,
// 1 maj/Första maj, Långfredagen/Långfredag) — mappningen bor här, på ett ställe.
//
// Regeln som byggs: en rad per röd VARDAG i arbetsmånaden där föraren inte
// arbetat, HELGLON_TIMMAR (8) per dag. Två frågor avgör om det kan bli en riktig
// Fortnox-rad (Martin tar dem med löneansvariga):
//   1. kräver helglön närvaro dagen före och efter?
//   2. ska den som jobbar på en röd dag ha helglön PLUS OB, eller bara det ena?
// Tills dess: granskningsrad, ingen lönerad — samma väg som OB och sjuk.
// ─────────────────────────────────────────────────────────────
import { getRödaDagar } from "../roda-dagar";

export const HELGLON_TIMMAR = 8;

/** Avtalets tolv namn (facit i gs_avtal.helglon_dagar) → namnet i lib/roda-dagar. */
const NAMN_TILL_RODA: Record<string, string> = {
  "nyårsdagen": "Nyårsdagen",
  "trettondagen": "Trettondedag jul",
  "trettondedag jul": "Trettondedag jul",
  "långfredagen": "Långfredag",
  "långfredag": "Långfredag",
  "annandag påsk": "Annandag påsk",
  "1 maj": "Första maj",
  "första maj": "Första maj",
  "kristi himmelsfärd": "Kristi himmelsfärd",
  "kristi himmelsfärdsdag": "Kristi himmelsfärd",
  "nationaldagen": "Nationaldagen",
  "midsommarafton": "Midsommarafton",
  "julafton": "Julafton",
  "juldagen": "Juldagen",
  "annandag jul": "Annandag jul",
  "nyårsafton": "Nyårsafton",
};

/** Avtalets lista om gs_avtal.helglon_dagar saknas — de tolv i avtalet 2025-04-01. */
export const HELGLON_DAGAR_DEFAULT =
  "Nyårsdagen,Trettondagen,Långfredagen,Annandag påsk,1 maj,Kristi himmelsfärd,Nationaldagen,Midsommarafton,Julafton,Juldagen,Annandag jul,Nyårsafton";

/** Tolkar avtalets textrad till roda-dagar-namn. Okända namn returneras separat
 *  så granskningen kan säga "det här namnet känner appen inte igen". */
export function tolkaHelglonNamn(text: string | null | undefined): { namn: string[]; okanda: string[] } {
  const namn: string[] = [], okanda: string[] = [];
  for (const del of String(text || HELGLON_DAGAR_DEFAULT).split(",")) {
    const n = del.trim();
    if (!n) continue;
    const r = NAMN_TILL_RODA[n.toLowerCase()];
    if (r) { if (!namn.includes(r)) namn.push(r); } else okanda.push(n);
  }
  return { namn, okanda };
}

/** Helglönedagarna ett givet år: datum → namn. Bara de dagar avtalet räknar upp. */
export function helglonDagar(avtalText: string | null | undefined, ar: number): Record<string, string> {
  const { namn } = tolkaHelglonNamn(avtalText);
  const alla = getRödaDagar(ar);
  const ut: Record<string, string> = {};
  for (const [datum, n] of Object.entries(alla)) if (namn.includes(n)) ut[datum] = n;
  return ut;
}

export type HelglonDag = { datum: string; namn: string; arbetad: boolean };

/**
 * Helglönedagar i en arbetsmånad (YYYY-MM): röda VARDAGAR ur avtalets lista.
 * `arbetadeDatum` = dagar med arbete (arbetad_min > 0 eller extra tid) — de
 * markeras `arbetad` så granskningen kan visa dem, men räknas inte som helglön
 * förrän frågan om "helglön + OB eller bara det ena" är svarad.
 */
export function helglonIManad(avtalText: string | null | undefined, arbetsperiod: string, arbetadeDatum: Set<string>): HelglonDag[] {
  const ar = Number(arbetsperiod.slice(0, 4));
  if (!Number.isInteger(ar)) return [];
  return Object.entries(helglonDagar(avtalText, ar))
    .filter(([datum]) => datum.startsWith(arbetsperiod))
    .filter(([datum]) => { const dow = new Date(datum + "T00:00:00").getDay(); return dow !== 0 && dow !== 6; })
    .map(([datum, namn]) => ({ datum, namn, arbetad: arbetadeDatum.has(datum) }))
    .sort((a, b) => a.datum.localeCompare(b.datum));
}
