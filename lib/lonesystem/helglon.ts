// ─────────────────────────────────────────────────────────────
// HELGLÖN (GS-avtalet §10) — EN källa för vilka röda dagar som ger helglön och när den dras in.
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
// REGELN (Martin 2026-10-17, facit: Fortnox dec 2025/jan 2026):
//   1. Varje röd VARDAG i avtalets lista ger 8 tim helglön. Det är företagets PRAXIS och går över avtalets minimum:
//      §10 mom 2 ("de arbetstimmar som bortfaller") tillämpas inte. Också när man arbetar dagen: vanlig lön för de
//      arbetade timmarna OCH helglön, inget söndagstillägg.
//   2. Närvarokravet (§10 mom 4). Helglön betalas inte om
//        - sjuk, VAB, föräldraledig eller tjänstledig PÅ själva dagen (mom 4: sjukpenning/föräldrapenning, sjuklön dag 1–14,
//          tjänstledighet; "dag eller del av dag", så en deldag räknas),
//        - tjänstledigheten OMGER dagen: den närmaste vardagen före eller efter (hoppar över helger och andra röda dagar).
//      Semester, ATK, komp, permission, sjuk, VAB och föräldraledig dagen före/efter bryter INTE (facit: Daniel, Max).
//      Olovlig frånvaro byggs inte: det finns ingen sådan frånvarotyp, och en dag utan rad betyder "okänt", aldrig "olovlig".
//      Trettiodagarsregeln (mom 4, fjärde punkten) ger ingen egen effekt i appen: varje ej intjänad frånvarotyp (sjuk, VAB,
//      föräldraledig, tjänstledig) stoppar redan helglönen när den täcker dagen eller omger den, och semester/ATK/komp är
//      intjänade och bryter aldrig. Inte byggt: ledighet över fyra veckor med tillfälligt arbete, fackliga kurser över en vecka,
//      återanställning inom fyra månader (underlag saknas).
//   3. Kvalifikationstid (mom 3): ingen helglön före anställningsdatum + 3 månader. Saknas datum betalas helglönen och beräkningen
//      varnar — aldrig en gissning ur första arbetsdagen.
// "Arbete vinner": en HELDAGS frånvarorad på en dag med arbete räknas som arbete (som överallt i lönemotorn).
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

// ── datumhjälp (lokal tid, aldrig toISOString — den tappar dygn i UTC+2) ──
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dt = (s: string) => new Date(s + "T00:00:00");
const plusDagar = (s: string, n: number) => { const d = dt(s); d.setDate(d.getDate() + n); return iso(d); };

/** Datum + n månader, klippt till månadens sista dag (30 nov + 3 mån = 28 feb). */
export function laggTillManader(datum: string, n: number): string {
  const d = dt(datum);
  const dag = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const sista = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(dag, sista));
  return iso(d);
}

const arVardag = (datum: string) => { const dow = dt(datum).getDay(); return dow !== 0 && dow !== 6; };
const arRod = (datum: string) => !!getRödaDagar(Number(datum.slice(0, 4)))[datum];

/** Närmaste vardag (mån–fre) som inte är röd dag, före (-1) eller efter (+1) ett datum. Hoppar över helger och alla röda dagar. */
export function narmasteVardag(datum: string, riktning: -1 | 1): string {
  let d = plusDagar(datum, riktning);
  while (!arVardag(d) || arRod(d)) d = plusDagar(d, riktning);
  return d;
}

// ── bedömningen ──

/** Varför en röd vardag gav / inte gav helglön — det föraren ser i Min månad. */
export type HelglonSkal =
  | "betalas"            // röd vardag, ingen arbetad tid: 8 tim
  | "betalas_arbetad"    // röd vardag som arbetades: 8 tim helglön OCH vanlig lön
  | "sjuk" | "vab" | "foraldraledig" | "tjanstledig"   // på själva dagen (mom 4)
  | "tjanstledig_omger"  // tjänstledighet närmaste vardag före/efter (mom 4)
  | "kvalifikationstid"; // anställd för kort tid (mom 3)

/** En frånvaropost så som lib/franvaro levererar den (godkänd + registrerad). Klockslag = deldag. */
export type FranvaroPost = { typ: string; startdatum: string; slutdatum: string; fran_tid?: string | null; till_tid?: string | null };

export type HelglonUnderlag = {
  /** Dagar med arbete (arbetsdag med tid, eller extra tid). */
  arbetadeDatum: Set<string>;
  /** Frånvaro runt månaden — dagarna före/efter en röd dag kan ligga i grannmånaden. */
  franvaro: FranvaroPost[];
  anstallningsdatum: string | null;
};

export type HelglonDag = {
  datum: string; namn: string;
  /** Arbete den dagen. Ger ändå helglön (praxis), men märks. */
  arbetad: boolean;
  /** Dagen ger 8 tim. */
  ger: boolean;
  skal: HelglonSkal;
  /** Bytesdag (skoftning §5 mom 4): den lediga dag som den arbetade röda dagen byts mot. Sätts i loneberakning. */
  bytesLedig?: string;
};

const arDeldag = (p: FranvaroPost) => !!(p.fran_tid || p.till_tid);
const tacker = (p: FranvaroPost, datum: string) => p.startdatum <= datum && datum <= p.slutdatum;
/** Typer som bryter helglönen på själva dagen: sjukpenning/sjuklön (sjuk), tillfällig föräldrapenning (vab), föräldrapenning, tjänstledighet. */
const BRYTER_PA_DAGEN = ["sjuk", "vab", "foraldraledig", "tjanstledig"];

export function bedomHelglon(dag: { datum: string; namn: string }, u: HelglonUnderlag): { ger: boolean; skal: HelglonSkal } {
  const arbetad = u.arbetadeDatum.has(dag.datum);

  // Mom 3 — kvalifikationstid. Före allt annat: en nyanställd är "ny", inte "sjuk".
  if (u.anstallningsdatum && dag.datum < laggTillManader(u.anstallningsdatum, 3)) return { ger: false, skal: "kvalifikationstid" };

  // Mom 4 — på själva dagen. Arbete vinner över en heldagsrad, men en deldag är "del av dag" och bryter alltid.
  for (const typ of BRYTER_PA_DAGEN) {
    const rad = u.franvaro.find(p => p.typ === typ && tacker(p, dag.datum) && (arDeldag(p) || !arbetad));
    if (rad) return { ger: false, skal: typ as HelglonSkal };
  }

  // Mom 4 — tjänstledighet som omger dagen: närmaste vardag före eller efter. Arbete den dagen vinner.
  for (const grann of [narmasteVardag(dag.datum, -1), narmasteVardag(dag.datum, +1)]) {
    if (u.arbetadeDatum.has(grann)) continue;
    if (u.franvaro.some(p => p.typ === "tjanstledig" && !arDeldag(p) && tacker(p, grann))) return { ger: false, skal: "tjanstledig_omger" };
  }

  return { ger: true, skal: arbetad ? "betalas_arbetad" : "betalas" };
}

/**
 * Helglönedagarna i en arbetsmånad (YYYY-MM): röda VARDAGAR ur avtalets lista, var och en bedömd (ger / ger inte, och varför).
 */
export function helglonIManad(avtalText: string | null | undefined, arbetsperiod: string, u: HelglonUnderlag): HelglonDag[] {
  const ar = Number(arbetsperiod.slice(0, 4));
  if (!Number.isInteger(ar)) return [];
  return Object.entries(helglonDagar(avtalText, ar))
    .filter(([datum]) => datum.startsWith(arbetsperiod))
    .filter(([datum]) => arVardag(datum))
    .map(([datum, namn]) => ({ datum, namn, arbetad: u.arbetadeDatum.has(datum), ...bedomHelglon({ datum, namn }, u) }))
    .sort((a, b) => a.datum.localeCompare(b.datum));
}

/** Förarens ord för varför en dag inte gav helglön (Min månad, granskningen). */
export function helglonSkalText(skal: HelglonSkal): string {
  switch (skal) {
    case "betalas": return "";
    case "betalas_arbetad": return "arbetad, helglön ändå";
    case "sjuk": return "sjuk";
    case "vab": return "VAB";
    case "foraldraledig": return "föräldraledig";
    case "tjanstledig": return "tjänstledig";
    case "tjanstledig_omger": return "tjänstledig dagen före/efter";
    case "kvalifikationstid": return "kvalifikationstid, anställd kortare tid än tre månader";
  }
}
