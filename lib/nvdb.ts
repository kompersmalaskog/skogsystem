// NVDB (Trafikverket Öppet API) — PRIMÄRKÄLLA för TMA-vägdata. Hämtar numrerade allmänna vägar
// (Vägnummer) i en bbox och normaliserar till samma Overpass-"elements"-KONTRAKT som Overpass-reserven,
// så checkBoundaryTma (konsumentsidan) läser identisk form oavsett källa. Server-side — nyckeln läses
// ur env (TRAFIKVERKET_API_KEY), aldrig klientsidan.
//
// Exakt syntax (bekräftad live mot API:t): POST text/xml till /v2/data.json,
//   namespace="vägdata.nvdb_dk_o", objecttype="Vägnummer", schemaversion="1",
//   spatialt filter WITHIN name="Geometry.WKT-WGS84-3D", box i WGS84 = "minLon minLat, maxLon maxLat".
// Geometrin returneras som WKT "LINESTRING Z (lon lat höjd, ...)" i WGS84.

const ENDPOINT = 'https://api.trafikinfo.trafikverket.se/v2/data.json';
const NAMESPACE = 'vägdata.nvdb_dk_o';

export interface Bbox { minLat: number; minLon: number; maxLat: number; maxLon: number; }
export interface VagElement { type: 'way'; id: any; tags: Record<string, string>; geometry: { lat: number; lon: number }[]; }

// "LINESTRING Z (lon lat höjd, lon lat höjd, ...)" → [{lat,lon}] (höjden kastas).
function parseWktWgs84(wkt: string | undefined): { lat: number; lon: number }[] {
  if (!wkt) return [];
  const m = wkt.match(/\(([^)]*)\)/);
  if (!m) return [];
  return m[1].split(',').map((p) => {
    const t = p.trim().split(/\s+/).map(Number);
    return { lon: t[0], lat: t[1] };
  }).filter((pt) => Number.isFinite(pt.lat) && Number.isFinite(pt.lon));
}

// Hämtar Vägnummer-segment i bbox, normaliserar till elements-kontraktet. KASTAR vid API-fel
// (nätverk/behörighet/ERROR-svar) → anroparen faller till Overpass-reserven. Returnerar null om
// ingen nyckel finns (då kör anroparen direkt på reserven).
export async function hamtaNvdbVagar(bbox: Bbox): Promise<{ elements: VagElement[] } | null> {
  const key = process.env.TRAFIKVERKET_API_KEY;
  if (!key) return null;
  const box = `${bbox.minLon} ${bbox.minLat}, ${bbox.maxLon} ${bbox.maxLat}`;
  const xml =
    `<REQUEST><LOGIN authenticationkey="${key}"/>` +
    `<QUERY objecttype="Vägnummer" namespace="${NAMESPACE}" schemaversion="1" limit="1000">` +
    `<FILTER><WITHIN name="Geometry.WKT-WGS84-3D" shape="box" value="${box}"/></FILTER>` +
    `</QUERY></REQUEST>`;
  const resp = await fetch(ENDPOINT, { method: 'POST', body: xml, headers: { 'Content-Type': 'text/xml' } });
  if (!resp.ok) throw new Error(`NVDB HTTP ${resp.status}`);
  const data: any = await resp.json();
  const res = data?.RESPONSE?.RESULT?.[0];
  if (res?.ERROR) throw new Error(`NVDB ${res.ERROR.SOURCE}: ${res.ERROR.MESSAGE}`);
  const rows: any[] = res?.['Vägnummer'] || [];
  const elements: VagElement[] = [];
  for (const r of rows) {
    const geom = parseWktWgs84(r?.Geometry?.['WKT-WGS84-3D']);
    if (geom.length < 2) continue;
    // Numrerad väg = allmän väg. Europaväg → 'trunk', övrigt → 'primary' (passerar TMA:s klassfilter
    // trunk/primary/secondary/tertiary). maxspeed/namn saknas i Vägnummer → berikas ev. senare
    // (Hastighetsgräns/Gatunamn) utan att röra kontraktet.
    elements.push({
      type: 'way',
      id: r.GID ?? r.Feature_Oid ?? `${r.Element_Id}:${r.Seq_No}`,
      tags: { highway: r.Europaväg ? 'trunk' : 'primary', ref: String(r.Huvudnummer) },
      geometry: geom,
    });
  }
  return { elements };
}
