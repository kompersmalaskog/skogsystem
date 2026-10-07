/* ── Ett läsfel är aldrig "ingen" ──
   Ett Supabase-svar räknas som LÄST bara när det saknar fel OCH data är en lista. Allt annat — ett fel, data: null, ett svar som inte
   är en lista — är OKÄNT och ska visas som okänt (orange meddelande + "Försök igen"), aldrig som "inga faror" eller "tom kö".
   En tom lista från ett lyckat svar är däremot ett SANT "inga rader". Ren logik: ingen import av supabase, testas i las-svar.test.ts. */

export type LasSvar = { data?: unknown; error?: unknown } | null | undefined;

/** Raderna om svaret lästes utan fel (kan vara tom = sant "inga rader"); annars null = okänt. */
export function lastLista<T = any>(svar: LasSvar): T[] | null {
  if (!svar || svar.error || !Array.isArray(svar.data)) return null;
  return svar.data as T[];
}

/** Kort orsak till att ett svar inte räknades som läst — till konsolen (tekniken), inte till föraren. */
export function lasFelOrsak(svar: LasSvar): string {
  if (!svar) return 'inget svar';
  const e: any = svar.error;
  if (e) return `${e.code ?? ''} ${e.message ?? String(e)}`.trim();
  return 'svaret var inte en lista';
}
