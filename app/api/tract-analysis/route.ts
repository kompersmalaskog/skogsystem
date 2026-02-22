import { NextRequest, NextResponse } from 'next/server';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// === WFS-baserad traktanalys ===
// Tar emot en polygon (lat/lon), beräknar bbox, och frågar WFS-tjänster
// för att hitta överlappande skyddade områden, fornlämningar etc.

interface AnalysisRequest {
  polygon: { lat: number; lon: number }[];
}

interface AnalysisHit {
  type: string;       // vattenskydd, naturreservat, natura2000, fornlamning, nyckelbiotop, biotopskydd
  name: string;
  details?: string;
  url?: string;
  id?: string;
}

interface AnalysisResult {
  hits: AnalysisHit[];
  errors: string[];
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
}

function computeBbox(polygon: { lat: number; lon: number }[]) {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of polygon) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  // Expand bbox slightly (50m ~ 0.0005 degrees)
  const pad = 0.0005;
  return {
    minLon: minLon - pad,
    minLat: minLat - pad,
    maxLon: maxLon + pad,
    maxLat: maxLat + pad,
  };
}

// Point-in-polygon test (ray casting)
function pointInPolygon(lat: number, lon: number, polygon: { lat: number; lon: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lon, yi = polygon[i].lat;
    const xj = polygon[j].lon, yj = polygon[j].lat;
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Feature intersects polygon (any vertex inside, or polygon centroid inside feature bbox)
function featureIntersectsPolygon(
  featureGeom: any,
  polygon: { lat: number; lon: number }[]
): boolean {
  // Extract coordinates from GeoJSON geometry
  const coords = extractCoords(featureGeom);
  if (!coords || coords.length === 0) return true; // If can't parse, assume hit

  // Check if any feature point is inside the tract polygon
  for (const [lon, lat] of coords) {
    if (pointInPolygon(lat, lon, polygon)) return true;
  }

  // Check if any tract polygon vertex is inside the feature (simple bbox check)
  let fMinLon = Infinity, fMaxLon = -Infinity, fMinLat = Infinity, fMaxLat = -Infinity;
  for (const [lon, lat] of coords) {
    if (lon < fMinLon) fMinLon = lon;
    if (lon > fMaxLon) fMaxLon = lon;
    if (lat < fMinLat) fMinLat = lat;
    if (lat > fMaxLat) fMaxLat = lat;
  }
  for (const p of polygon) {
    if (p.lon >= fMinLon && p.lon <= fMaxLon && p.lat >= fMinLat && p.lat <= fMaxLat) return true;
  }

  return false;
}

function extractCoords(geom: any): [number, number][] {
  if (!geom) return [];
  const type = geom.type;
  if (type === 'Point') return [geom.coordinates];
  if (type === 'MultiPoint' || type === 'LineString') return geom.coordinates;
  if (type === 'MultiLineString' || type === 'Polygon') return geom.coordinates.flat();
  if (type === 'MultiPolygon') return geom.coordinates.flat(2);
  return [];
}

async function queryWFS(
  url: string,
  typeName: string,
  bbox: ReturnType<typeof computeBbox>,
  maxFeatures: number = 50,
): Promise<any[]> {
  const bboxStr = `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat},EPSG:4326`;
  const wfsUrl = `${url}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
    `&TYPENAMES=${encodeURIComponent(typeName)}` +
    `&BBOX=${bboxStr}` +
    `&COUNT=${maxFeatures}` +
    `&OUTPUTFORMAT=${encodeURIComponent('application/json')}`;

  const resp = await fetch(wfsUrl, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(12000),
  });

  if (!resp.ok) {
    throw new Error(`WFS ${resp.status}: ${typeName}`);
  }

  const data = await resp.json();
  return data.features || [];
}

// Naturvårdsverket: Vattenskyddsområde
async function checkVattenskydd(bbox: ReturnType<typeof computeBbox>, polygon: { lat: number; lon: number }[]): Promise<AnalysisHit[]> {
  const features = await queryWFS(
    'https://geodata.naturvardsverket.se/geoserver/am-restriction/wfs',
    'am-restriction:AM.drinkingWaterProtectionArea',
    bbox,
  );
  return features
    .filter(f => featureIntersectsPolygon(f.geometry, polygon))
    .map(f => ({
      type: 'vattenskydd',
      name: f.properties?.namn || 'Vattenskyddsområde',
      details: f.properties?.skyddstyp || '',
      id: f.properties?.nvrid || '',
    }));
}

// Naturvårdsverket: Naturreservat
async function checkNaturreservat(bbox: ReturnType<typeof computeBbox>, polygon: { lat: number; lon: number }[]): Promise<AnalysisHit[]> {
  const features = await queryWFS(
    'https://geodata.naturvardsverket.se/geoserver/ps-nvr/wfs',
    'ps-nvr:PS.ProtectedSites.NR',
    bbox,
  );
  return features
    .filter(f => featureIntersectsPolygon(f.geometry, polygon))
    .map(f => ({
      type: 'naturreservat',
      name: f.properties?.namn || 'Naturreservat',
      details: `${f.properties?.skyddstyp || 'Naturreservat'}, ${f.properties?.area_ha ? Math.round(f.properties.area_ha) + ' ha' : ''}`,
      id: f.properties?.nvrid || '',
    }));
}

// Naturvårdsverket: Natura 2000
async function checkNatura2000(bbox: ReturnType<typeof computeBbox>, polygon: { lat: number; lon: number }[]): Promise<AnalysisHit[]> {
  const features = await queryWFS(
    'https://geodata.naturvardsverket.se/geoserver/ps-n2k/wfs',
    'ps-n2k:PS.ProtectedSites.Natura2000',
    bbox,
  );
  return features
    .filter(f => featureIntersectsPolygon(f.geometry, polygon))
    .map(f => ({
      type: 'natura2000',
      name: f.properties?.omradesnamn || 'Natura 2000',
      details: `${f.properties?.omradestyp || ''}, naturtyper: ${f.properties?.naturtyper || ''}`,
      id: f.properties?.objectid ? String(f.properties.objectid) : '',
    }));
}

// Riksantikvarieämbetet: Fornlämningar
async function checkFornlamningar(bbox: ReturnType<typeof computeBbox>, polygon: { lat: number; lon: number }[]): Promise<AnalysisHit[]> {
  const features = await queryWFS(
    'https://pub.raa.se/visning/lamningar_v1/wfs',
    'fornlamning',
    bbox,
  );
  return features
    .filter(f => featureIntersectsPolygon(f.geometry, polygon))
    .map(f => ({
      type: 'fornlamning',
      name: `${f.properties?.lamningstyp || 'Fornlämning'} (${f.properties?.lamningsnummer || ''})`,
      details: f.properties?.egenskap || '',
      id: f.properties?.id || '',
      url: f.properties?.url || '',
    }));
}

export async function POST(req: NextRequest) {
  let body: AnalysisRequest;
  try {
    body = await req.json();
    if (!body.polygon || body.polygon.length < 3) {
      return NextResponse.json({ error: 'Polygon must have at least 3 points' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const bbox = computeBbox(body.polygon);
  const polygon = body.polygon;
  const result: AnalysisResult = { hits: [], errors: [], bbox };

  console.log(`[tract-analysis] Analyzing polygon with ${polygon.length} points, bbox: ${JSON.stringify(bbox)}`);

  // Run all checks in parallel
  const checks = [
    { name: 'Vattenskyddsområde', fn: () => checkVattenskydd(bbox, polygon) },
    { name: 'Naturreservat', fn: () => checkNaturreservat(bbox, polygon) },
    { name: 'Natura 2000', fn: () => checkNatura2000(bbox, polygon) },
    { name: 'Fornlämningar', fn: () => checkFornlamningar(bbox, polygon) },
  ];

  const results = await Promise.allSettled(checks.map(c => c.fn()));

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      result.hits.push(...r.value);
      console.log(`[tract-analysis] ${checks[i].name}: ${r.value.length} träffar`);
    } else {
      const msg = `${checks[i].name}: ${r.reason?.message || 'Okänt fel'}`;
      result.errors.push(msg);
      console.error(`[tract-analysis] FEL: ${msg}`);
    }
  }

  console.log(`[tract-analysis] Klart: ${result.hits.length} träffar, ${result.errors.length} fel`);

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'no-cache' },
  });
}
