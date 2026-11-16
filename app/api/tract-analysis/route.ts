import { NextRequest, NextResponse } from 'next/server';
import { analyseraPolygon } from '@/lib/traktAnalys/kor';

// POST /api/tract-analysis — planeringens traktanalys på en polygon man ritat ({ polygon: {lat, lon}[] }).
// Själva analysen bor i lib/traktAnalys/kor.ts och delas med cron-jobbet som kör den av sig själv mot Vidas traktgräns.

export async function POST(req: NextRequest) {
  let polygon: { lat: number; lon: number }[];
  try {
    const body = await req.json();
    polygon = body?.polygon;
    if (!Array.isArray(polygon) || polygon.length < 3) {
      return NextResponse.json({ error: 'Polygon must have at least 3 points' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const result = await analyseraPolygon(polygon);
  console.log(`[tract-analysis] Klart: ${result.hits.length} träffar, ${result.errors.length} fel`);
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-cache' } });
}
