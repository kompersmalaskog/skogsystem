// Lön → Lönesystem: hur anslutningens tider skrivs. Aldrig en ISO-tidsstämpel med sekunder ("2026-12-01 01:00:00").
// Token-datumet är bara något att göra något åt när det går ut snart (då står det, med Förnya bredvid); annars är det brus.

/** Token som går ut inom så här många dagar är värd att visa. */
export const TOKEN_VARNING_DAGAR = 14;

const MAN_KORT = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

/**
 * Kalenderdagar från `fran` till `till` — räknat på DYGN, inte på 24-timmarssteg.
 *
 * Ett dygn på väggklockan är 23 eller 25 timmar natten till sommar- resp.
 * vintertid. En rå `(b - a) / 86400000` ger därför 14,04 för exakt två veckor
 * när sommartiden försvinner emellan (17 okt 12:00 → 31 okt 12:00 i
 * Europe/Stockholm), och en gräns på `<= 14` missar den. Här jämförs i stället
 * DATUMEN, lagda på UTC-midnatt, så skillnaden alltid är ett helt antal dygn.
 *
 * EN regel för hela filen — både "hur länge sedan" och "hur länge kvar".
 */
function dagarMellan(fran: Date, till: Date): number {
  const dag = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
  return (dag(till) - dag(fran)) / 86400000;
}

/** "idag 23:10", "igår 23:10", annars "16 okt 23:10". */
export function relativTid(iso: string, nu: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const skillnad = dagarMellan(d, nu);
  const kl = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (skillnad === 0) return `idag ${kl}`;
  if (skillnad === 1) return `igår ${kl}`;
  return `${d.getDate()} ${MAN_KORT[d.getMonth()]} ${kl}`;
}

/** "9 okt". */
export function relativDatum(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.getDate()} ${MAN_KORT[d.getMonth()]}`;
}

/** Token som går ut inom TOKEN_VARNING_DAGAR dagar (eller redan har gått ut). Annars null: datumet är då inget att göra något åt. */
export function tokenGarUtSnart(tokenUtgar: string | null | undefined, nu: Date = new Date()): { utgangen: boolean } | null {
  if (!tokenUtgar) return null;
  const d = new Date(tokenUtgar);
  if (Number.isNaN(d.getTime())) return null;
  // Utgången är en TIDPUNKT, inte en dag: en token som dör 14:00 i dag lever
  // 13:00. Därför jämförs tidsstämplarna här — inte datumen.
  if (d.getTime() <= nu.getTime()) return { utgangen: true };
  // "Går den ut inom 14 dagar?" är en fråga om DAGAR, och då räknas dygn.
  return dagarMellan(nu, d) <= TOKEN_VARNING_DAGAR ? { utgangen: false } : null;
}
