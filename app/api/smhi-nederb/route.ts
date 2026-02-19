import { NextRequest, NextResponse } from 'next/server';

interface Station {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
}

let cachedStations: Station[] | null = null;
let cachedAt = 0;

async function getActiveStations(): Promise<Station[]> {
  if (cachedStations && Date.now() - cachedAt < 3600000) return cachedStations;
  const resp = await fetch('https://opendata-download-metobs.smhi.se/api/version/1.0/parameter/5.json');
  if (!resp.ok) throw new Error(`SMHI stations ${resp.status}`);
  const data = await resp.json();
  cachedStations = (data.station || [])
    .filter((s: Record<string, unknown>) => s.active === true)
    .map((s: Record<string, unknown>) => ({
      id: s.id as number,
      name: s.name as string,
      latitude: s.latitude as number,
      longitude: s.longitude as number,
    }));
  cachedAt = Date.now();
  return cachedStations!;
}

function findNearest(stations: Station[], lat: number, lon: number): Station | null {
  let nearest: Station | null = null;
  let minDist = Infinity;
  for (const s of stations) {
    const dLat = s.latitude - lat;
    const dLon = (s.longitude - lon) * Math.cos(lat * Math.PI / 180);
    const dist = dLat * dLat + dLon * dLon;
    if (dist < minDist) { minDist = dist; nearest = s; }
  }
  return nearest;
}

export async function GET(req: NextRequest) {
  const lat = parseFloat(req.nextUrl.searchParams.get('lat') || '');
  const lon = parseFloat(req.nextUrl.searchParams.get('lon') || '');
  if (isNaN(lat) || isNaN(lon)) return NextResponse.json({ error: 'Missing lat/lon' }, { status: 400 });

  try {
    const stations = await getActiveStations();
    const nearest = findNearest(stations, lat, lon);
    if (!nearest) return NextResponse.json({ error: 'No station found' }, { status: 404 });

    const dataResp = await fetch(
      `https://opendata-download-metobs.smhi.se/api/version/1.0/parameter/5/station/${nearest.id}/period/latest-months/data.json`
    );
    if (!dataResp.ok) throw new Error(`SMHI data ${dataResp.status}`);
    const dataJson = await dataResp.json();

    // Summera senaste 7 dygn
    const values = dataJson.value || [];
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 86400000;
    let sum7d = 0;
    for (const v of values) {
      if (v.to >= sevenDaysAgo && v.to <= now) {
        const val = parseFloat(v.value);
        if (!isNaN(val)) sum7d += val;
      }
    }
    sum7d = Math.round(sum7d * 10) / 10;

    const sasong = sum7d < 5 ? 'torrt' : sum7d <= 25 ? 'normalt' : 'blott';

    return NextResponse.json({
      sasong,
      nederbord7d: sum7d,
      station: nearest.name,
    }, {
      headers: { 'Cache-Control': 'public, max-age=1800' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'SMHI error';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
