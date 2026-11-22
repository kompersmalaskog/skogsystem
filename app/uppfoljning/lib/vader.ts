// Vädret på trakten under avverkningen: från skördarens första dag till sista
// lasset (eller idag när trakten inte är färdigskotad). Rena funktioner — svaret
// från Open-Meteo tolkas och summeras här, hämtningen bor i
// app/api/uppfoljning/vader/route.ts.
//
// Källan är Open-Meteos väder för traktens egen punkt (en modell, inte en
// mätning), uppdaterad fram till idag. ERA5 (som kalibreringen läser) släpar
// fem dagar och passar inte för "fram till nu".

export type VaderDag = { datum: string; regnMm: number | null; tMin: number | null; tMax: number | null };

export type VaderSumma = {
  fran: string;
  till: string;
  dagar: number;      // dagar med värde
  saknas: number;     // dagar i perioden utan värde
  regnMm: number | null;
  regnDagar: number;  // dagar med minst 1 mm
  tMin: number | null;
  tMax: number | null;
};

/** En vecka av perioden: ISO-veckans nummer och samma summa som hela perioden, för dagarna i veckan. */
export type VaderVecka = { vecka: number; summa: VaderSumma };

export type VaderSvar =
  | { ok: true; summa: VaderSumma; veckor?: VaderVecka[] }
  | { ok: false; orsak: 'saknar_plats' | 'saknar_datum' | 'las'; fel?: string };

const tal = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Open-Meteos `daily` → en rad per dag. Ett svar utan `daily.time` är ett fel. */
export function tolkaDaily(svar: unknown): VaderDag[] {
  const d = (svar as { daily?: Record<string, unknown[]> } | null)?.daily;
  if (!d || !Array.isArray(d.time)) throw new Error('Svaret saknar daily.time');
  const regn = (d.precipitation_sum ?? []) as unknown[];
  const min = (d.temperature_2m_min ?? []) as unknown[];
  const max = (d.temperature_2m_max ?? []) as unknown[];
  return d.time.map((t, i) => ({ datum: String(t), regnMm: tal(regn[i]), tMin: tal(min[i]), tMax: tal(max[i]) }));
}

function antalDagar(fran: string, till: string): number {
  return Math.round((Date.parse(till) - Date.parse(fran)) / 864e5) + 1;
}

/** Summerar dagarna inom fran..till (båda med). Dagar utan värde räknas som saknade, aldrig som 0. */
export function summera(dagar: VaderDag[], fran: string, till: string): VaderSumma {
  const inom = dagar.filter(d => d.datum >= fran && d.datum <= till);
  const medRegn = inom.filter(d => d.regnMm != null);
  const mins = inom.map(d => d.tMin).filter((v): v is number => v != null);
  const maxs = inom.map(d => d.tMax).filter((v): v is number => v != null);
  const harVarde = inom.filter(d => d.regnMm != null || d.tMin != null || d.tMax != null).length;
  return {
    fran, till,
    dagar: harVarde,
    saknas: Math.max(0, antalDagar(fran, till) - harVarde),
    regnMm: medRegn.length > 0 ? Math.round(medRegn.reduce((s, d) => s + (d.regnMm as number), 0)) : null,
    regnDagar: medRegn.filter(d => (d.regnMm as number) >= 1).length,
    tMin: mins.length > 0 ? Math.round(Math.min(...mins)) : null,
    tMax: maxs.length > 0 ? Math.round(Math.max(...maxs)) : null,
  };
}

/** ISO-veckans nummer för ett datum "YYYY-MM-DD" (räknat på datumet, aldrig på klockan). */
export function isoVeckaNr(datum: string): number {
  const d = new Date(`${datum}T00:00:00Z`);
  const dag = (d.getUTCDay() + 6) % 7; // mån = 0
  d.setUTCDate(d.getUTCDate() - dag + 3); // torsdagen i samma vecka
  return 1 + Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5 / 7);
}

/** Perioden fran..till delad i ISO-veckor (måndag–söndag, första och sista veckan kapade mot perioden),
 *  varje vecka summerad med `summera`. Samma regler som hela perioden: saknat värde är aldrig 0. */
export function veckor(dagar: VaderDag[], fran: string, till: string): VaderVecka[] {
  const ut: VaderVecka[] = [];
  let start = fran;
  while (start <= till) {
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + (6 - ((d.getUTCDay() + 6) % 7))); // söndagen
    const son = d.toISOString().slice(0, 10);
    const slut = son < till ? son : till;
    ut.push({ vecka: isoVeckaNr(start), summa: summera(dagar, start, slut) });
    d.setUTCDate(d.getUTCDate() + 1);
    start = d.toISOString().slice(0, 10);
  }
  return ut;
}

/** "−2 till 11 °C" — minustecken, inte bindestreck. */
export function tempText(tMin: number | null, tMax: number | null): string | null {
  if (tMin == null || tMax == null) return null;
  const f = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `${n}`);
  return tMin === tMax ? `${f(tMin)} °C` : `${f(tMin)} till ${f(tMax)} °C`;
}

/** Open-Meteos väder-api för en period. Inom 90 dagar: prognos-api (täcker fram till idag);
 *  äldre: det historiska prognosarkivet. Samma svar i båda. */
export function vaderUrl(lat: number, lng: number, fran: string, till: string, idag: string): string {
  const nyligen = Date.parse(idag) - Date.parse(fran) <= 90 * 864e5;
  const bas = nyligen ? 'https://api.open-meteo.com/v1/forecast' : 'https://historical-forecast-api.open-meteo.com/v1/forecast';
  const p = new URLSearchParams({
    latitude: lat.toFixed(4), longitude: lng.toFixed(4),
    daily: 'precipitation_sum,temperature_2m_min,temperature_2m_max',
    timezone: 'Europe/Stockholm', start_date: fran, end_date: till,
  });
  return `${bas}?${p.toString()}`;
}
