// Arbetsmånaden är månadens namn överallt (Löneunderlag, Dagar, Min månad, exportdialogen): "Augusti".
// Bredvid står i dämpad text vilken månad lönen kommer: "Augusti · lön i september". Aldrig ett datum — lönen betalas inte
// en fast dag (augusti 2026 betalades den 18 september; Martin 2026-10-17). Löneperioden (arbetsmånad + 1) är
// Fortnox' sätt att räkna och syns inte som rubrik — en månadsväljare som säger "September" och menar augusti
// gjorde att Löneunderlag och Dagar visade olika månader under samma ord (granskningen 2026-10-17).
//
// Adressen (?period=YYYY-MM) och API:erna behåller löneperioden; bara det som VISAS byter ord.

const MANADER = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];

/** "2026-08" → "augusti 2026". */
export function arbetsManadText(arbetsManad: string): string {
  const [å, m] = arbetsManad.split("-").map(Number);
  return `${MANADER[m - 1] ?? arbetsManad} ${å}`;
}

/** Löneperioden för en arbetsmånad: "2026-08" → "2026-09". */
export function loneperiodForArbetsManad(arbetsManad: string): string {
  const [å, m] = arbetsManad.split("-").map(Number);
  const d = new Date(å, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Arbetsmånaden för en löneperiod: "2026-09" → "2026-08". */
export function arbetsManadForLoneperiod(loneperiod: string): string {
  const [å, m] = loneperiod.split("-").map(Number);
  const d = new Date(å, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "2026-08" → "lön i september": månaden lönen kommer, aldrig ett datum. */
export function utbetalningText(arbetsManad: string): string {
  const m = Number(loneperiodForArbetsManad(arbetsManad).split("-")[1]);
  return `lön i ${MANADER[m - 1]}`;
}

/** "2026-08" → "Augusti"; ett annat år än nuvarande tas med: "Augusti 2025". Versal först, resten som det är. */
export function manadNamn(arbetsManad: string, nuAr: number = new Date().getFullYear()): string {
  const [å, m] = arbetsManad.split("-").map(Number);
  const namn = MANADER[m - 1] ?? arbetsManad;
  return `${namn.charAt(0).toUpperCase()}${namn.slice(1)}${å === nuAr ? "" : ` ${å}`}`;
}

/** "2026-08" → "Augusti · lön i september" — det som står i en rubrik där EN textsträng behövs (test, dialogtitel). */
export function manadRubrik(arbetsManad: string, nuAr?: number): string {
  return `${manadNamn(arbetsManad, nuAr)} · ${utbetalningText(arbetsManad)}`;
}

/**
 * Den pågående arbetsmånaden (idag "2026-10-25" → "2026-10") går att ÖPPNA i Löneunderlag och Förare · Månad,
 * men aldrig skicka: månaden är inte slut och förarna har inte godkänt den. `idag` är en svensk dag (YYYY-MM-DD).
 */
export function arPagaendeArbetsManad(arbetsManad: string, idag: string): boolean {
  return arbetsManad >= idag.slice(0, 7);
}

/** Senaste löneperiod som går att öppna: den pågående arbetsmånadens ("2026-10-25" → "2026-11"). */
export function senasteLoneperiod(idag: string): string {
  return loneperiodForArbetsManad(idag.slice(0, 7));
}

/** Dagens datum i Sverige (YYYY-MM-DD), samma på servern (UTC) som i webbläsaren. */
export function svenskIdag(nu: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" }).format(nu);
}
