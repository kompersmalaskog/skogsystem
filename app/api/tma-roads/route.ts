import { NextRequest, NextResponse } from 'next/server';
import { queryOverpass, OverpassAllFailedError } from '@/lib/overpass';

// Server-side proxy för TMA-väglinjen: hämtar ALLA highway-vägar i en bounding box runt en
// traktgräns. Löser CORS (klienten anropade tidigare overpass-api.de direkt → 406/ingen ACAO →
// tyst död linje) + delar flerinstans-fallbacken med /api/roadcheck via lib/overpass.ts.
// Klienten (checkBoundaryTma) skickar bbox:en och parsar den råa Overpass-JSON:en oförändrat.

const CACHE_TTL_MS = 10 * 60 * 1000;   // 10 min
const MAX_SPAN_DEG = 0.5;              // skydd mot orimligt stora frågor (appens bbox är ~0.01°)

const cache = new Map<string, { data: unknown; expiry: number }>();

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const minLat = Number(p.get('minLat'));
  const minLon = Number(p.get('minLon'));
  const maxLat = Number(p.get('maxLat'));
  const maxLon = Number(p.get('maxLon'));
  const nums = [minLat, minLon, maxLat, maxLon];
  const finite = nums.every(n => Number.isFinite(n));
  if (!finite || minLat >= maxLat || minLon >= maxLon
    || minLat < -90 || maxLat > 90 || minLon < -180 || maxLon > 180
    || (maxLat - minLat) > MAX_SPAN_DEG || (maxLon - minLon) > MAX_SPAN_DEG) {
    return NextResponse.json({ error: 'Invalid bbox' }, { status: 400 });
  }

  // Cachenyckel: avrundad bbox (~100 m) — samma trakt delar svar.
  const key = `${minLat.toFixed(3)},${minLon.toFixed(3)},${maxLat.toFixed(3)},${maxLon.toFixed(3)}`;
  const hit = cache.get(key);
  if (hit && hit.expiry > Date.now()) {
    return NextResponse.json(hit.data, { headers: { 'Cache-Control': 'public, max-age=600', 'X-Cache': 'HIT' } });
  }

  // EXAKT samma fråga som tidigare låg klientsidan (checkBoundaryTma): alla highway-vägar i bbox:en.
  // Parsningen (vägklass-filter, 50 m-nearbyGeom) ligger kvar oförändrad i klienten.
  const query = `[out:json][timeout:15];way(${minLat},${minLon},${maxLat},${maxLon})["highway"];out body geom;`;

  try {
    const { data, instance } = await queryOverpass(query);
    cache.set(key, { data, expiry: Date.now() + CACHE_TTL_MS });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'public, max-age=600', 'X-Cache': 'MISS', 'X-Overpass-Instance': instance } });
  } catch (e: unknown) {
    // Alla instanser misslyckades → 502 → klienten sätter status 'error' → SYNLIGT besked på boundaryn.
    const detail = e instanceof OverpassAllFailedError ? e.detail : (e instanceof Error ? e.message : 'fetch failed');
    return NextResponse.json({ error: 'Alla Overpass-instanser misslyckades', detail }, { status: 502 });
  }
}
