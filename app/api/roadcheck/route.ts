import { NextRequest, NextResponse } from 'next/server';
import { queryOverpass, OverpassAllFailedError } from '@/lib/overpass';

// Server-side proxy för Overpass-vägkontroll (avlägg). Löser CORS (klienten anropar
// same-origin) + centraliserar Overpass-hanteringen. Flerinstans-fallback + per-instans-timeout
// bor numera i lib/overpass.ts och DELAS med /api/tma-roads (TMA-väglinjen). Bara cachen +
// den avlägg-specifika frågan är kvar här.

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

  try {
    const { data, instance } = await queryOverpass(query);
    cache.set(key, { data, expiry: Date.now() + CACHE_TTL_MS });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'public, max-age=600', 'X-Cache': 'MISS', 'X-Overpass-Instance': instance } });
  } catch (e: unknown) {
    // Alla instanser misslyckades → 502 → klienten får 'error' (självläker via #87).
    const detail = e instanceof OverpassAllFailedError ? e.detail : (e instanceof Error ? e.message : 'fetch failed');
    return NextResponse.json({ error: 'Alla Overpass-instanser misslyckades', detail }, { status: 502 });
  }
}
