import { NextRequest, NextResponse } from 'next/server';
import { hamtaPrognos, nederbordPerDatum } from '@/lib/smhi-prognos';

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

// SMHI SNOW1gv1 (ersätter PMP3gv2, stängd 2026-03-31): 10-dagars prognos med temperatur och nederbörd per dag.
interface PrognosDag {
  datum: string;
  nederbord: number;
  symbol: number;
  tempMin: number;
  tempMax: number;
}

async function fetchPrognos(lat: number, lon: number): Promise<{ dagar: PrognosDag[]; summa3d: number; summa7d: number } | null> {
  try {
    const steg = await hamtaPrognos(lat, lon, false);
    if (!steg) return null;

    const utcDatum = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    // Nederbörd är en mängd per intervall (SNOW1g) och fördelas på tid — summeras aldrig rått per steg.
    const regnPerDag = nederbordPerDatum(steg, utcDatum);

    // Aggregera per dag: symbol och temperatur
    const dagMap = new Map<string, { symbols: number[]; temps: number[] }>();
    for (const ts of steg) {
      const dag = utcDatum(ts.ms); // 'YYYY-MM-DD'
      const entry = dagMap.get(dag) || { symbols: [], temps: [] };
      if (ts.temp != null) entry.temps.push(ts.temp);
      // Dagssymbol: använd dagtid (6-18) för representativt väder
      const hour = new Date(ts.ms).getUTCHours();
      if (ts.symbol != null && hour >= 6 && hour <= 18) entry.symbols.push(ts.symbol);
      dagMap.set(dag, entry);
    }
    for (const dag of regnPerDag.keys()) if (!dagMap.has(dag)) dagMap.set(dag, { symbols: [], temps: [] });

    // Konvertera till array, sorterat, max 10 dagar
    const today = new Date().toISOString().slice(0, 10);
    const dagar: PrognosDag[] = [];
    for (const [datum, val] of Array.from(dagMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      if (datum < today) continue;
      if (dagar.length >= 10) break;

      // Mest förekommande symbol (mode)
      let symbol = 1;
      if (val.symbols.length > 0) {
        const freq = new Map<number, number>();
        for (const s of val.symbols) freq.set(s, (freq.get(s) || 0) + 1);
        let maxFreq = 0;
        for (const [s, f] of freq) {
          if (f > maxFreq) { maxFreq = f; symbol = s; }
        }
      }

      // Min/max temperatur
      const tempMin = val.temps.length > 0 ? Math.round(Math.min(...val.temps)) : 0;
      const tempMax = val.temps.length > 0 ? Math.round(Math.max(...val.temps)) : 0;

      dagar.push({
        datum,
        nederbord: Math.round((regnPerDag.get(datum) ?? 0) * 10) / 10,
        symbol,
        tempMin,
        tempMax,
      });
    }

    const summa3d = dagar.slice(0, 3).reduce((s, d) => s + d.nederbord, 0);
    const summa7d = dagar.slice(0, 7).reduce((s, d) => s + d.nederbord, 0);

    return {
      dagar,
      summa3d: Math.round(summa3d * 10) / 10,
      summa7d: Math.round(summa7d * 10) / 10,
    };
  } catch (e) {
    console.error('[smhi-nederb] SNOW1g prognos error:', e);
    return null;
  }
}

export async function GET(req: NextRequest) {
  const lat = parseFloat(req.nextUrl.searchParams.get('lat') || '');
  const lon = parseFloat(req.nextUrl.searchParams.get('lon') || '');
  if (isNaN(lat) || isNaN(lon)) return NextResponse.json({ error: 'Missing lat/lon' }, { status: 400 });

  try {
    // Hämta historik och prognos parallellt
    const [stations, prognos] = await Promise.all([
      getActiveStations(),
      fetchPrognos(lat, lon),
    ]);

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

    // Automatisk markstatus med prognos
    const summa3d = prognos?.summa3d ?? 0;
    let sasong: 'torrt' | 'normalt' | 'blott';
    if (sum7d > 25 || summa3d > 20) {
      sasong = 'blott';
    } else if (sum7d < 5 && summa3d < 5) {
      sasong = 'torrt';
    } else {
      sasong = 'normalt';
    }

    return NextResponse.json({
      sasong,
      nederbord7d: sum7d,
      station: nearest.name,
      prognos: prognos || undefined,
    }, {
      headers: { 'Cache-Control': 'public, max-age=1800' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'SMHI error';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
