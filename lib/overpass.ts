// Delad Overpass-hämtare — flerinstans-fallback + per-instans-timeout. Utbruten ur #88:s
// /api/roadcheck så roadChecken (avlägg) och /api/tma-roads (TMA-väglinjen) delar EN
// fallback-implementation. Publika Overpass-instanser är flakiga (OSM rapporterar störningar
// 2026) → prova nästa om en felar/timear. Byt/lägg till instanser HÄR, ett ställe.
//
// Server-side (import bara från route-handlers) → klienten når Overpass same-origin via proxyn,
// vilket löser CORS (de publika instanserna sätter ingen Access-Control-Allow-Origin).

export const OVERPASS_INSTANCES = [
  'https://overpass.openstreetmap.fr/api/interpreter',   // FR — stabilast/snabbast → primär
  'https://overpass-api.de/api/interpreter',             // DE — pågående lastproblem 2026
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

export const PER_INSTANCE_TIMEOUT_MS = 9000;

export class OverpassAllFailedError extends Error {
  constructor(public detail: string) {
    super('Alla Overpass-instanser misslyckades');
    this.name = 'OverpassAllFailedError';
  }
}

// Kör en Overpass-QL-fråga mot instanserna i tur och ordning. Returnerar första lyckade svaret
// (parsad JSON) + vilken instans som svarade. Kastar OverpassAllFailedError om ALLA felar/timear.
export async function queryOverpass(query: string): Promise<{ data: any; instance: string }> {
  const body = `data=${encodeURIComponent(query)}`;
  let lastErr = '';
  for (const base of OVERPASS_INSTANCES) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PER_INSTANCE_TIMEOUT_MS);
    try {
      const resp = await fetch(base, {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Skogsystem Overpass Proxy' },
        signal: controller.signal,
      });
      if (!resp.ok) { lastErr = `${base}: HTTP ${resp.status}`; continue; }
      const data = await resp.json();
      return { data, instance: base };
    } catch (e: unknown) {
      lastErr = `${base}: ${e instanceof Error ? e.message : 'fetch failed'}`;
      continue;   // prova nästa instans
    } finally {
      clearTimeout(timeoutId);
    }
  }
  throw new OverpassAllFailedError(lastErr);
}
