// SMHI:s observationer (metobs), lufttemperatur timvärde = parameter 1. Läses BARA på servern (opendata-download-metobs har ingen CORS för oss
// och ska inte belastas från varje telefon). Används av kalibreringens väderkoll: "har vädret ändrat sig sedan senaste kontrollen?".
//
// Format (SMHI:s dokumentation + R-paketet metno/gibson): stationslistan `parameter/1.json` → `station[]` med key, name, latitude, longitude, active;
// data `…/station/<key>/period/<period>/data.json` → `value[]` med `date` (Unix-tid i ms), `value` (TEXT, t.ex. "-3.2") och `quality`.
// Perioderna: latest-day (senaste dygnet, uppdateras varje timme) och latest-months (ca fyra månader bakåt, uppdateras en gång per dygn).
// Inte provat mot riktiga svar från bygget (sandlådan når inte SMHI) — tolkningen är därför tolerant: date i sekunder räknas om, ett värde som
// inte är ett tal släpps, och ett svar utan värden är "inget svar" (aldrig 0 °C).

export type Station = { key: string; namn: string; lat: number; lon: number; aktiv: boolean };
export type TempObs = { ms: number; temp: number };

const BAS = 'https://opendata-download-metobs.smhi.se/api/version/1.0/parameter/1';

const tal = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

export function tolkaStationer(json: unknown): Station[] {
  const lista = (json as { station?: unknown })?.station;
  if (!Array.isArray(lista)) return [];
  const ut: Station[] = [];
  for (const s of lista) {
    const lat = tal(s?.latitude), lon = tal(s?.longitude);
    const key = s?.key != null ? String(s.key) : '';
    if (!key || lat == null || lon == null) continue;
    ut.push({ key, namn: typeof s?.name === 'string' ? s.name : key, lat, lon, aktiv: s?.active !== false });
  }
  return ut;
}

export function tolkaObservationer(json: unknown): TempObs[] {
  const lista = (json as { value?: unknown })?.value;
  if (!Array.isArray(lista)) return [];
  const ut: TempObs[] = [];
  for (const v of lista) {
    let ms = tal(v?.date);
    const temp = tal(v?.value);
    if (ms == null || temp == null) continue;
    if (ms < 1e11) ms *= 1000; // sekunder
    ut.push({ ms, temp });
  }
  return ut;
}

/** Slår ihop observationer från flera perioder: en per tidpunkt (den senast lästa vinner), i tidsordning. */
export function slaIhopObs(...listor: TempObs[][]): TempObs[] {
  const per = new Map<number, number>();
  for (const l of listor) for (const o of l) per.set(o.ms, o.temp);
  return [...per.entries()].sort((a, b) => a[0] - b[0]).map(([ms, temp]) => ({ ms, temp }));
}

const RAD = Math.PI / 180;
export const avstandKm = (a: { lat: number; lon: number }, b: { lat: number; lon: number }): number => {
  const x = (b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * RAD) * 111.32;
  const y = (b.lat - a.lat) * 111.32;
  return Math.hypot(x, y);
};

/** De aktiva stationerna inom `maxKm`, närmast först. */
export function narmasteStationer(pos: { lat: number; lon: number }, stationer: Station[], maxKm = 60): (Station & { km: number })[] {
  return stationer.filter(s => s.aktiv)
    .map(s => ({ ...s, km: avstandKm(pos, s) }))
    .filter(s => s.km <= maxKm)
    .sort((a, b) => a.km - b.km);
}

// Minnet i serverinstansen: stationslistan ett dygn, observationerna en kvart (SMHI uppdaterar en gång i timmen).
let stationCache: { at: number; lista: Station[] } | null = null;
const obsCache = new Map<string, { at: number; obs: TempObs[] }>();
const STATION_TTL = 24 * 3_600_000;
const OBS_TTL = 15 * 60_000;

async function hamtaJson(url: string, hamta: typeof fetch): Promise<unknown | null> {
  try {
    const r = await hamta(url, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

export async function hamtaStationer(hamta: typeof fetch = fetch, nu = Date.now()): Promise<Station[] | null> {
  if (stationCache && nu - stationCache.at < STATION_TTL) return stationCache.lista;
  const lista = tolkaStationer(await hamtaJson(`${BAS}.json`, hamta));
  if (!lista.length) return null;
  stationCache = { at: nu, lista };
  return lista;
}

/** Stationens timvärden (senaste dygnet + månaderna). null = inget svar alls. */
export async function hamtaObservationer(key: string, hamta: typeof fetch = fetch, nu = Date.now()): Promise<TempObs[] | null> {
  const c = obsCache.get(key);
  if (c && nu - c.at < OBS_TTL) return c.obs;
  const [dag, man] = await Promise.all([
    hamtaJson(`${BAS}/station/${encodeURIComponent(key)}/period/latest-day/data.json`, hamta),
    hamtaJson(`${BAS}/station/${encodeURIComponent(key)}/period/latest-months/data.json`, hamta),
  ]);
  const obs = slaIhopObs(tolkaObservationer(man), tolkaObservationer(dag));
  if (!obs.length) return null;
  obsCache.set(key, { at: nu, obs });
  return obs;
}

/** Tömmer minnet (tester). */
export function _tomSmhiObsCache() { stationCache = null; obsCache.clear(); }
