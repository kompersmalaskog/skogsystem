import { NextRequest, NextResponse } from 'next/server';

// Server-side proxy för Overpass-vägkontroll (avlägg). Löser CORS (klienten anropar
// same-origin) + centraliserar Overpass-hanteringen: fallback över flera instanser,
// per-instans-timeout och enkel cache. Modell: app/api/sgu-proxy/route.ts.

// Overpass-instanser i prio-ordning. Publika instanser är flakiga (OSM rapporterar
// ~8v störningar 2026) → proxyn provar nästa om en felar/timear. Byt/lägg till HÄR,
// utan att röra appen.
const OVERPASS_INSTANCES = [
  'https://overpass.openstreetmap.fr/api/interpreter',   // FR — stabilast/snabbast → primär
  'https://overpass-api.de/api/interpreter',             // DE — pågående lastproblem 2026
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const PER_INSTANCE_TIMEOUT_MS = 9000;
const CACHE_TTL_MS = 10 * 60 * 1000;   // 10 min

// Enkel in-memory cache (best-effort; Vercel-instanser är efemära → resetas vid cold start,
// men minskar Overpass-last vid skapande-bursts på samma koordinat).
const cache = new Map<string, { data: unknown; expiry: number }>();

export async function GET(req: NextRequest) {
  const latS = req.nextUrl.searchParams.get('lat');
  const lonS = req.nextUrl.searchParams.get('lon');
  const lat = Number(latS);
  const lon = Number(lonS);
  if (!latS || !lonS || Number.isNaN(lat) || Number.isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json({ error: 'Invalid lat/lon' }, { status: 400 });
  }

  // Cachenyckel: avrundad ~4 decimaler (~11 m) — avlägg på samma plats delar svar.
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit && hit.expiry > Date.now()) {
    return NextResponse.json(hit.data, { headers: { 'Cache-Control': 'public, max-age=600', 'X-Cache': 'HIT' } });
  }

  // Samma fråga som tidigare låg klientsidan (vägar inom 50 m + korsningar/plankorsningar inom 250 m).
  const query = `[out:json][timeout:10];(way(around:50,${lat},${lon})["highway"];node(around:250,${lat},${lon})["highway"="crossing"];node(around:250,${lat},${lon})["railway"="level_crossing"];);out body geom;`;
  const body = `data=${encodeURIComponent(query)}`;

  let lastErr = '';
  for (const base of OVERPASS_INSTANCES) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PER_INSTANCE_TIMEOUT_MS);
    try {
      const resp = await fetch(base, {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Skogsystem RoadCheck Proxy' },
        signal: controller.signal,
      });
      if (!resp.ok) { lastErr = `${base}: HTTP ${resp.status}`; continue; }
      const data = await resp.json();
      cache.set(key, { data, expiry: Date.now() + CACHE_TTL_MS });
      return NextResponse.json(data, { headers: { 'Cache-Control': 'public, max-age=600', 'X-Cache': 'MISS' } });
    } catch (e: unknown) {
      lastErr = `${base}: ${e instanceof Error ? e.message : 'fetch failed'}`;
      continue;   // prova nästa instans
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Alla instanser misslyckades → 502 → klienten får 'error' (självläker via #87).
  return NextResponse.json({ error: 'Alla Overpass-instanser misslyckades', detail: lastErr }, { status: 502 });
}
