// Arbetsmånaden är månadens namn överallt (Löneunderlag, Dagar, Min månad, exportdialogen): "Augusti".
// När lönen betalas står i liten text under: "lön betalas 25 september". Löneperioden (arbetsmånad + 1) är
// Fortnox' sätt att räkna och syns inte som rubrik — en månadsväljare som säger "September" och menar augusti
// gjorde att Löneunderlag och Dagar visade olika månader under samma ord (granskningen 2026-10-17).
//
// Adressen (?period=YYYY-MM) och API:erna behåller löneperioden; bara det som VISAS byter ord.
// Utbetalningsdagen är den 25:e. Ingen justering för helg eller röd dag — appen vet inte vilken dag banken kör.

export const LONEDAG = 25;

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

/** "2026-08" → "lön betalas 25 september". */
export function utbetalningText(arbetsManad: string): string {
  const [å, m] = loneperiodForArbetsManad(arbetsManad).split("-").map(Number);
  void å;
  return `lön betalas ${LONEDAG} ${MANADER[m - 1]}`;
}
