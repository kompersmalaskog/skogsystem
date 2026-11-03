import { NextRequest, NextResponse } from 'next/server';
import { kravInloggad } from '@/lib/auth/server';
import { VAG_MAX_LANKAR, nvdbTillVagar, vagBox } from '@/lib/ritadKarta/vagar';

// Ritad — vägarna runt trakten ur Trafikverkets NVDB (hela vägnätet, också enskilda vägar och skogsbilvägar). Se lib/ritadKarta/vagar.ts.
// In:  { ringar: [lng, lat][][] }
// Ut:  GeoJSON FeatureCollection, varje väg med { k: 'stor' | 'skog' }.  Fel: { error } — inga gissade vägar.
// Nyckeln (TRAFIKVERKET_API_KEY) är serverns, samma som TMA-vägdatan (lib/nvdb.ts).

const ENDPOINT = 'https://api.trafikinfo.trafikverket.se/v2/data.json';
const NAMESPACE = 'vägdata.nvdb_dk_o';
const OBJEKTTYP = 'FunktionellVägklass';
const SIDA = 1000;
const TIDSGRANS_MS = 20_000;

export const maxDuration = 30;

const fel = (status: number, text: string) => NextResponse.json({ error: text }, { status });

export async function POST(req: NextRequest) {
  const vakt = await kravInloggad();
  if (!vakt.ok) return vakt.res;

  let ringar: [number, number][][];
  try {
    ringar = (await req.json())?.ringar;
    if (!Array.isArray(ringar) || ringar.length === 0 || ringar.length > 200) throw new Error();
  } catch {
    return fel(400, 'Fel indata');
  }
  const box = vagBox(ringar);
  if (!box) return fel(400, 'Fel indata');
  const nyckel = process.env.TRAFIKVERKET_API_KEY;
  if (!nyckel) return fel(503, 'Vägarna från Trafikverket är inte aktiverade');

  const rader: unknown[] = [];
  for (let skip = 0; skip < VAG_MAX_LANKAR; skip += SIDA) {
    const xml =
      `<REQUEST><LOGIN authenticationkey="${nyckel}"/>` +
      `<QUERY objecttype="${OBJEKTTYP}" namespace="${NAMESPACE}" schemaversion="1" limit="${SIDA}" skip="${skip}">` +
      `<FILTER><WITHIN name="Geometry.WKT-WGS84-3D" shape="box" value="${box.minLon} ${box.minLat}, ${box.maxLon} ${box.maxLat}"/></FILTER>` +
      `</QUERY></REQUEST>`;
    const styr = new AbortController();
    const t = setTimeout(() => styr.abort(), TIDSGRANS_MS);
    let sida: unknown[];
    try {
      const r = await fetch(ENDPOINT, { method: 'POST', body: xml, headers: { 'Content-Type': 'text/xml' }, signal: styr.signal });
      if (!r.ok) return fel(502, `Trafikverket svarade ${r.status}`);
      const j: any = await r.json();
      const res = j?.RESPONSE?.RESULT?.[0];
      if (res?.ERROR) return fel(502, `Trafikverket: ${String(res.ERROR.MESSAGE ?? 'fel').slice(0, 120)}`);
      sida = Array.isArray(res?.[OBJEKTTYP]) ? res[OBJEKTTYP] : [];
    } catch {
      return fel(502, 'Kunde inte hämta vägarna från Trafikverket');
    } finally {
      clearTimeout(t);
    }
    rader.push(...sida);
    if (sida.length < SIDA) break;
  }
  return NextResponse.json(nvdbTillVagar(rader), { headers: { 'Cache-Control': 'private, max-age=3600' } });
}
