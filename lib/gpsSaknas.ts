// "GPS saknas": ingen giltig fix på över en minut medan körvyn är öppen. Visas som EN diskret rad och försvinner direkt när en fix kommer; med bra fix
// står ingen GPS-text alls (ren skärm är ett krav, Martin 2026-10-24). Ren logik.
export const GPS_SAKNAS_MS = 60_000

/** `senastGiltigMs`: när sista giltiga fixen kom (null = ingen sedan körvyn öppnades), `oppnadMs`: när körvyn öppnades. */
export function gpsSaknas(nuMs: number, senastGiltigMs: number | null, oppnadMs: number | null): boolean {
  const sedan = senastGiltigMs != null && (oppnadMs == null || senastGiltigMs >= oppnadMs) ? senastGiltigMs : oppnadMs
  if (sedan == null) return false
  return nuMs - sedan > GPS_SAKNAS_MS
}

/** Windows-notisen "GPS saknas – faror varnas inte" (lib/hytt/notiser) kommer tidigare än raden i appen: skyddet är borta, föraren ska veta det fort. */
export const GPS_SAKNAS_NOTIS_MS = 30_000
