/**
 * ERA5-arkivets timtemperaturer (Open-Meteo archive-api, samma källa som kontrollernas väder i importen) — för Frost i Över tid, som behöver
 * dygnet FÖRE varje kontroll. Läses bara på servern.
 *
 * ERA5 har ett rutnät på 0,25°, så positionen avrundas dit: alla kontroller i samma ruta delar ETT anrop för hela perioden. Arkivet ligger ca 5 dygn
 * efter; timmar som saknas släpps (aldrig 0 °C). Svaret sparas i serverinstansens minne i 12 timmar.
 */
import type { TempObs } from '@/lib/smhi-obs';

const BAS = 'https://archive-api.open-meteo.com/v1/archive';
export const ERA5_RUTA = 0.25;
export const rutaAv = (v: number): number => Math.round(v / ERA5_RUTA) * ERA5_RUTA;

/** Open-Meteos svar med timezone=UTC: hourly.time ["2026-11-01T00:00", …] (UTC utan Z), hourly.temperature_2m [tal | null]. */
export function tolkaEra5(json: unknown): TempObs[] {
  const h = (json as { hourly?: { time?: unknown; temperature_2m?: unknown } })?.hourly;
  if (!h || !Array.isArray(h.time) || !Array.isArray(h.temperature_2m)) return [];
  const ut: TempObs[] = [];
  for (let i = 0; i < h.time.length; i++) {
    const t = h.temperature_2m[i];
    const ms = Date.parse(`${String(h.time[i])}${/Z$|[+-]\d\d:?\d\d$/.test(String(h.time[i])) ? '' : 'Z'}`);
    if (typeof t !== 'number' || !Number.isFinite(t) || !Number.isFinite(ms)) continue;
    ut.push({ ms, temp: t });
  }
  return ut;
}

const cache = new Map<string, { at: number; obs: TempObs[] }>();
const TTL = 12 * 3_600_000;

/** Timvärden för rutan runt (lat, lon) från fran till till (YYYY-MM-DD, båda med). null = inget svar. */
export async function hamtaEra5(lat: number, lon: number, fran: string, till: string, hamta: typeof fetch = fetch, nu = Date.now()): Promise<TempObs[] | null> {
  const la = rutaAv(lat), lo = rutaAv(lon);
  const nyckel = `${la}|${lo}|${fran}|${till}`;
  const c = cache.get(nyckel);
  if (c && nu - c.at < TTL) return c.obs;
  const url = `${BAS}?latitude=${la}&longitude=${lo}&start_date=${fran}&end_date=${till}&hourly=temperature_2m&timezone=UTC`;
  try {
    const r = await hamta(url, { cache: 'no-store' });
    if (!r.ok) return null;
    const obs = tolkaEra5(await r.json());
    cache.set(nyckel, { at: nu, obs });
    return obs;
  } catch { return null; }
}

export function _tomEra5Cache() { cache.clear(); }
