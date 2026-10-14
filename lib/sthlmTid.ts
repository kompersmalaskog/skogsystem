/**
 * Stockholmstid. arbetsdag.start_tid/slut_tid är lokal klocktid (Stockholm) och läses i datorns lokala ram (new Date("YYYY-MM-DDTHH:MM")).
 * Ett riktigt ögonblick (new Date(), en timestamptz ur databasen) måste därför räknas om till Stockholms väggklocka innan det jämförs med
 * dem — servern (Vercel) kör UTC, så datorns tidszon duger inte. En webbläsare i Sverige har samma ram som Stockholm; då är omräkningen
 * en identitet.
 */
const STHLM = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export type SthlmDelar = { datum: string; min: number; ar: number; man: number; dag: number; h: number; mi: number };

/** Stockholmstid för ett ögonblick: lokalt datum "YYYY-MM-DD", minuter från midnatt och delarna. null för ogiltigt datum. */
export function sthlmDelar(d: Date): SthlmDelar | null {
  if (Number.isNaN(d.getTime())) return null;
  const p: Record<string, number> = {};
  for (const x of STHLM.formatToParts(d)) if (x.type !== "literal") p[x.type] = Number(x.value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { datum: `${p.year}-${pad(p.month)}-${pad(p.day)}`, min: p.hour * 60 + p.minute, ar: p.year, man: p.month, dag: p.day, h: p.hour, mi: p.minute };
}

/** Stockholms väggklocka för ett ögonblick, uttryckt i datorns lokala ram — samma ram som lib/vilobrott läser arbetsdagarnas klockslag i. */
export function sthlmVaggklocka(d: Date): Date | undefined {
  const p = sthlmDelar(d);
  return p ? new Date(p.ar, p.man - 1, p.dag, p.h, p.mi) : undefined;
}
