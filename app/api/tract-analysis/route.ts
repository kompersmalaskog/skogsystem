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
  warning?: string;
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
    `&SRSNAME=EPSG:4326` +
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

// === Skogsstyrelsen ArcGIS REST API (geodpags) ===
// Kräver Basic Auth + User-Agent för att passera WAF
function sksAuthHeaders(): Record<string, string> {
  const user = process.env.SKS_WMS_USER;
  const pass = process.env.SKS_WMS_PASS;
  if (!user || !pass) throw new Error('SKS credentials not configured');
  return {
    Authorization: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'),
    'User-Agent': UA,
  };
}

async function queryArcGIS(
  serviceUrl: string,
  layerIndex: number,
  bbox: ReturnType<typeof computeBbox>,
  maxFeatures: number = 50,
): Promise<any[]> {
  const geom = `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`;
  const queryUrl = `${serviceUrl}/${layerIndex}/query?` +
    `where=1%3D1` +
    `&geometry=${encodeURIComponent(geom)}` +
    `&geometryType=esriGeometryEnvelope` +
    `&inSR=4326&outSR=4326` +
    `&spatialRel=esriSpatialRelIntersects` +
    `&outFields=*` +
    `&returnGeometry=true` +
    `&f=json` +
    `&resultRecordCount=${maxFeatures}`;

  const resp = await fetch(queryUrl, {
    headers: sksAuthHeaders(),
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) {
    throw new Error(`ArcGIS ${resp.status}: ${serviceUrl}`);
  }

  const data = await resp.json();
  if (data.error) {
    throw new Error(`ArcGIS error: ${data.error.message || JSON.stringify(data.error)}`);
  }
  return data.features || [];
}

// Konvertera ArcGIS Esri-geometri (rings) till [lon, lat][] för intersection-test
function extractArcGISCoords(geom: any): [number, number][] {
  if (!geom) return [];
  const rings = geom.rings;
  if (rings && rings.length > 0) {
    return rings.flat() as [number, number][];
  }
  // Point
  if (geom.x !== undefined && geom.y !== undefined) {
    return [[geom.x, geom.y]];
  }
  return [];
}

function arcgisFeatureIntersectsPolygon(
  geom: any,
  polygon: { lat: number; lon: number }[]
): boolean {
  const coords = extractArcGISCoords(geom);
  if (!coords || coords.length === 0) return true;

  for (const [lon, lat] of coords) {
    if (pointInPolygon(lat, lon, polygon)) return true;
  }

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

// Deduplicera hits baserat på namn+typ (eller id om det finns)
function deduplicateHits(hits: AnalysisHit[]): AnalysisHit[] {
  const seen = new Set<string>();
  return hits.filter(h => {
    const key = h.id ? `${h.type}:${h.id}` : `${h.type}:${h.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Naturvårdsverket: Vattenskyddsområde
async function checkVattenskydd(bbox: ReturnType<typeof computeBbox>, polygon: { lat: number; lon: number }[]): Promise<AnalysisHit[]> {
  const features = await queryWFS(
    'https://geodata.naturvardsverket.se/geoserver/am-restriction/wfs',
    'am-restriction:AM.drinkingWaterProtectionArea',
    bbox,
  );
  const hits = features
    .filter(f => featureIntersectsPolygon(f.geometry, polygon))
    .map(f => {
      const p = f.properties || {};
      const detailParts: string[] = [];
      if (p.beslutsstatus) detailParts.push(p.beslutsstatus);
      if (p.kommun) detailParts.push(`Kommun: ${p.kommun}`);
      if (p.area_ha) detailParts.push(`${Math.round(p.area_ha)} ha`);
      if (p.skog_ha) detailParts.push(`varav skog: ${Math.round(p.skog_ha)} ha`);
      if (p.urspr_beslutsdatum) {
        const d = p.urspr_beslutsdatum;
        const formatted = d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;
        detailParts.push(`Beslut: ${formatted}`);
      }
      if (p.beslutsmyndighet && p.beslutsmyndighet.trim()) detailParts.push(`Myndighet: ${p.beslutsmyndighet}`);
      return {
        type: 'vattenskydd' as const,
        name: p.namn || 'Vattenskyddsområde',
        details: detailParts.join(' | '),
        warning: 'Särskilda restriktioner gäller för bränslehantering. Invallning krävs vid tankning. Kontrollera föreskrifterna hos Länsstyrelsen.',
        url: 'https://skyddadnatur.naturvardsverket.se/',
        id: p.nvrid || '',
      };
    });
  // Deduplicera baserat på namn
  return deduplicateHits(hits);
}

// Naturvårdsverket: Naturreservat
async function checkNaturreservat(bbox: ReturnType<typeof computeBbox>, polygon: { lat: number; lon: number }[]): Promise<AnalysisHit[]> {
  const features = await queryWFS(
    'https://geodata.naturvardsverket.se/geoserver/ps-nvr/wfs',
    'ps-nvr:PS.ProtectedSites.NR',
    bbox,
  );
  return deduplicateHits(features
    .filter(f => featureIntersectsPolygon(f.geometry, polygon))
    .map(f => ({
      type: 'naturreservat',
      name: f.properties?.namn || 'Naturreservat',
      details: `${f.properties?.skyddstyp || 'Naturreservat'}, ${f.properties?.area_ha ? Math.round(f.properties.area_ha) + ' ha' : ''}`,
      url: 'https://skyddadnatur.naturvardsverket.se/',
      id: f.properties?.nvrid || '',
    })));
}

// Naturvårdsverket: Natura 2000
async function checkNatura2000(bbox: ReturnType<typeof computeBbox>, polygon: { lat: number; lon: number }[]): Promise<AnalysisHit[]> {
  const features = await queryWFS(
    'https://geodata.naturvardsverket.se/geoserver/ps-n2k/wfs',
    'ps-n2k:PS.ProtectedSites.Natura2000',
    bbox,
  );
  return deduplicateHits(features
    .filter(f => featureIntersectsPolygon(f.geometry, polygon))
    .map(f => ({
      type: 'natura2000',
      name: f.properties?.omradesnamn || 'Natura 2000',
      details: `${f.properties?.omradestyp || ''}, naturtyper: ${f.properties?.naturtyper || ''}`,
      url: 'https://skyddadnatur.naturvardsverket.se/',
      id: f.properties?.objectid ? String(f.properties.objectid) : '',
    })));
}

// Riksantikvarieämbetet: Fornlämningar
async function checkFornlamningar(bbox: ReturnType<typeof computeBbox>, polygon: { lat: number; lon: number }[]): Promise<AnalysisHit[]> {
  const features = await queryWFS(
    'https://pub.raa.se/visning/lamningar_v1/wfs',
    'fornlamning',
    bbox,
  );
  return deduplicateHits(features
    .filter(f => featureIntersectsPolygon(f.geometry, polygon))
    .map(f => ({
      type: 'fornlamning',
      name: `${f.properties?.lamningstyp || 'Fornlämning'} (${f.properties?.lamningsnummer || ''})`,
      details: f.properties?.egenskap || '',
      id: f.properties?.id || '',
      url: f.properties?.url || '',
    })));
}

// Skogsstyrelsen: Nyckelbiotoper
async function checkNyckelbiotoper(bbox: ReturnType<typeof computeBbox>, polygon: { lat: number; lon: number }[]): Promise<AnalysisHit[]> {
  const features = await queryArcGIS(
    'https://geodpags.skogsstyrelsen.se/arcgis/rest/services/Geodataportal/GeodataportalVisaNyckelbiotop/MapServer',
    0, bbox,
  );
  return deduplicateHits(features
    .filter(f => arcgisFeatureIntersectsPolygon(f.geometry, polygon))
    .map(f => {
      const a = f.attributes || {};
      const detailParts: string[] = [];
      if (a.Biotop1) detailParts.push(a.Biotop1);
      if (a.Biotop2) detailParts.push(a.Biotop2);
      if (a.Hektar) detailParts.push(`${a.Hektar} ha`);
      if (a.Kommun) detailParts.push(a.Kommun);
      if (a.Beskrivn1) detailParts.push(a.Beskrivn1);
      return {
        type: 'nyckelbiotop',
        name: a.Objnamn || a.Beteckn || 'Nyckelbiotop',
        details: detailParts.join(' | '),
        url: a.Url || 'https://www.skogsstyrelsen.se/skogensparlor',
        id: a.Beteckn || String(a.ObjectId || ''),
      };
    }));
}

// Skogsstyrelsen: Biotopskydd
async function checkBiotopskydd(bbox: ReturnType<typeof computeBbox>, polygon: { lat: number; lon: number }[]): Promise<AnalysisHit[]> {
  const features = await queryArcGIS(
    'https://geodpags.skogsstyrelsen.se/arcgis/rest/services/Geodataportal/GeodataportalVisaBiotopskydd/MapServer',
    0, bbox,
  );
  return deduplicateHits(features
    .filter(f => arcgisFeatureIntersectsPolygon(f.geometry, polygon))
    .map(f => {
      const a = f.attributes || {};
      const detailParts: string[] = [];
      if (a.Biotyp) detailParts.push(a.Biotyp);
      if (a.Naturtyp) detailParts.push(a.Naturtyp);
      if (a.AreaTot) detailParts.push(`${a.AreaTot} ha`);
      if (a.Kommun) detailParts.push(a.Kommun);
      return {
        type: 'biotopskydd',
        name: a.Beteckn || 'Biotopskydd',
        details: detailParts.join(' | '),
        warning: 'Biotopskyddsområde — avverkning och markberedning är förbjuden utan dispens från Skogsstyrelsen.',
        url: a.Url || 'https://www.skogsstyrelsen.se/skogensparlor',
        id: a.Beteckn || String(a.OBJECTID || ''),
      };
    }));
}

// Skogsstyrelsen: Skog och Historia
async function checkSkogOchHistoria(bbox: ReturnType<typeof computeBbox>, polygon: { lat: number; lon: number }[]): Promise<AnalysisHit[]> {
  const features = await queryArcGIS(
    'https://geodpags.skogsstyrelsen.se/arcgis/rest/services/Geodataportal/GeodataportalVisaSkoghistoria/MapServer',
    0, bbox,
  );
  return deduplicateHits(features
    .filter(f => arcgisFeatureIntersectsPolygon(f.geometry, polygon))
    .map(f => {
      const a = f.attributes || {};
      return {
        type: 'skogochhistoria',
        name: a.Lamnnamn || a.Sakord || 'Kulturlämning',
        details: a.Beskrivnin || a.Sakord || '',
        id: String(a.Objectid || a.Objektnr || ''),
      };
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
    { name: 'Nyckelbiotoper', fn: () => checkNyckelbiotoper(bbox, polygon) },
    { name: 'Biotopskydd', fn: () => checkBiotopskydd(bbox, polygon) },
    { name: 'Skog och Historia', fn: () => checkSkogOchHistoria(bbox, polygon) },
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

  // Slutgiltig deduplicering
  result.hits = deduplicateHits(result.hits);

  console.log(`[tract-analysis] Klart: ${result.hits.length} träffar, ${result.errors.length} fel`);

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'no-cache' },
  });
}
