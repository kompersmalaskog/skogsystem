// Lön → Lönesystem: hur anslutningens tider skrivs. Aldrig en ISO-tidsstämpel med sekunder ("2026-12-01 01:00:00").
// Token-datumet är bara något att göra något åt när det går ut snart (då står det, med Förnya bredvid); annars är det brus.

/** Token som går ut inom så här många dagar är värd att visa. */
export const TOKEN_VARNING_DAGAR = 14;

const MAN_KORT = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

/** "idag 23:10", "igår 23:10", annars "16 okt 23:10". */
export function relativTid(iso: string, nu: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dag = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const skillnad = Math.round((dag(nu) - dag(d)) / 86400000);
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
  const t = new Date(tokenUtgar).getTime();
  if (Number.isNaN(t)) return null;
  const dagar = (t - nu.getTime()) / 86400000;
  return dagar <= TOKEN_VARNING_DAGAR ? { utgangen: dagar <= 0 } : null;
}
