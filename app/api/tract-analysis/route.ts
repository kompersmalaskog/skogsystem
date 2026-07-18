import { NextRequest, NextResponse } from 'next/server';
import booleanIntersects from '@turf/boolean-intersects';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { polygon as turfPolygon, point as turfPoint, multiPolygon as turfMultiPolygon } from '@turf/helpers';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// === WFS/ArcGIS-baserad traktanalys med Turf.js geometrisk intersect ===
// Tar emot en polygon (lat/lon), beräknar bbox, frågar tjänster,
// och filtrerar med exakt polygon-polygon intersection (inte bara bbox).

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

// Bygg Turf-polygon från traktens {lat, lon}[]
function buildTractPolygon(polygon: { lat: number; lon: number }[]) {
  const ring = polygon.map(p => [p.lon, p.lat] as [number, number]);
  // Slut ringen om den inte redan är sluten
  if (ring.length > 0 && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
    ring.push([...ring[0]] as [number, number]);
  }
  return turfPolygon([ring]);
}

// Exakt geometrisk intersect-check: WFS GeoJSON feature mot traktpolygon
function featureIntersectsPolygon(
  featureGeom: any,
  tractPoly: ReturnType<typeof buildTractPolygon>
): boolean {
  if (!featureGeom || !featureGeom.type) return true; // Kan ej parsa → anta träff

  try {
    const type = featureGeom.type;

    // Punkt-features: kolla om punkten ligger innanför traktpolygonen
    if (type === 'Point') {
      return booleanPointInPolygon(turfPoint(featureGeom.coordinates), tractPoly);
    }

    // Skapa GeoJSON Feature för intersect-test
    const feature = { type: 'Feature' as const, properties: {}, geometry: featureGeom };
    return booleanIntersects(feature as any, tractPoly as any);
  } catch (e) {
    // Om Turf kastar (ogiltig geometri etc.) → anta träff för säkerhets skull
    console.warn('[tract-analysis] Turf intersect error, assuming hit:', (e as Error).message);
    return true;
  }
}

// Exakt geometrisk intersect-check: ArcGIS Esri-geometri mot traktpolygon
function arcgisFeatureIntersectsPolygon(
  geom: any,
  tractPoly: ReturnType<typeof buildTractPolygon>
): boolean {
  if (!geom) return true;

  try {
    // ArcGIS punkt
    if (geom.x !== undefined && geom.y !== undefined) {
      return booleanPointInPolygon(turfPoint([geom.x, geom.y]), tractPoly);
    }

    // ArcGIS polygon (rings)
    if (geom.rings && geom.rings.length > 0) {
      // Slut varje ring om den inte redan är sluten
      const rings = geom.rings.map((ring: number[][]) => {
        const r = ring as [number, number][];
        if (r.length > 0 && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1])) {
          return [...r, [...r[0]] as [number, number]];
        }
        return r;
      });
      const featurePoly = rings.length === 1
        ? turfPolygon(rings)
        : turfMultiPolygon([rings]);
      return booleanIntersects(featurePoly as any, tractPoly as any);
    }

    return true; // Okänd geometrityp → anta träff
  } catch (e) {
    console.warn('[tract-analysis] Turf ArcGIS intersect error, assuming hit:', (e as Error).message);
    return true;
  }
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
async function checkVattenskydd(bbox: ReturnType<typeof computeBbox>, tractPoly: ReturnType<typeof buildTractPolygon>): Promise<AnalysisHit[]> {
  const features = await queryWFS(
    'https://geodata.naturvardsverket.se/geoserver/am-restriction/wfs',
    'am-restriction:AM.drinkingWaterProtectionArea',
    bbox,
  );
  const hits = features
    .filter(f => featureIntersectsPolygon(f.geometry, tractPoly))
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
async function checkNaturreservat(bbox: ReturnType<typeof computeBbox>, tractPoly: ReturnType<typeof buildTractPolygon>): Promise<AnalysisHit[]> {
  const features = await queryWFS(
    'https://geodata.naturvardsverket.se/geoserver/ps-nvr/wfs',
    'ps-nvr:PS.ProtectedSites.NR',
    bbox,
  );
  return deduplicateHits(features
    .filter(f => featureIntersectsPolygon(f.geometry, tractPoly))
    .map(f => ({
      type: 'naturreservat',
      name: f.properties?.namn || 'Naturreservat',
      details: `${f.properties?.skyddstyp || 'Naturreservat'}, ${f.properties?.area_ha ? Math.round(f.properties.area_ha) + ' ha' : ''}`,
      url: 'https://skyddadnatur.naturvardsverket.se/',
      id: f.properties?.nvrid || '',
    })));
}

// Naturvårdsverket: Natura 2000
async function checkNatura2000(bbox: ReturnType<typeof computeBbox>, tractPoly: ReturnType<typeof buildTractPolygon>): Promise<AnalysisHit[]> {
  const features = await queryWFS(
    'https://geodata.naturvardsverket.se/geoserver/ps-n2k/wfs',
    'ps-n2k:PS.ProtectedSites.Natura2000',
    bbox,
  );
  return deduplicateHits(features
    .filter(f => featureIntersectsPolygon(f.geometry, tractPoly))
    .map(f => ({
      type: 'natura2000',
      name: f.properties?.omradesnamn || 'Natura 2000',
      details: `${f.properties?.omradestyp || ''}, naturtyper: ${f.properties?.naturtyper || ''}`,
      url: 'https://skyddadnatur.naturvardsverket.se/',
      id: f.properties?.objectid ? String(f.properties.objectid) : '',
    })));
}

// === Riksantikvarieämbetet: Fornlämningar via WMS GetFeatureInfo ===
// RAÄ:s WFS är avstängt ("Service WFS is disabled" → XML → gamla koden kraschade på
// response.json()). WMS-tjänsten lever och GetFeatureInfo kan svara application/json.
// KRITISKT: RAÄ:s lämningslager är SKALBEROENDE (renderas bara vid scaleDenominator
// <= 300000; ingen min-gräns). Vid fel skala returneras 0 features UTAN att lagret
// egentligen frågades — det får ALDRIG tolkas som "inga fornlämningar". Vi väljer
// därför pixelstorlek så skalan alltid hålls långt under gränsen, och en skala-vakt
// kastar ett tydligt fel om den ändå inte kan garanteras synlig. 0 får bara betyda 0.
const RAA_LAMNING_MAX_SCALE = 300000;

async function queryRaaLamningWms(
  layer: string,
  bbox: ReturnType<typeof computeBbox>,
): Promise<any[]> {
  const midLat = (bbox.minLat + bbox.maxLat) / 2;
  const widthM = Math.abs(bbox.maxLon - bbox.minLon) * 111320 * Math.cos(midLat * Math.PI / 180);
  const heightM = Math.abs(bbox.maxLat - bbox.minLat) * 111320;
  const spanM = Math.max(widthM, heightM, 1);

  // Välj pixelstorlek så scaleDenom ~ 50000 (mål), golv 256, tak 512 (BUFFER-säkert
  // mot RAÄ:s GeoServer). scaleDenom = markmeter / (px * 0.00028).
  const MAL_SCALE = 50000;
  const px = Math.min(Math.max(Math.ceil(spanM / (MAL_SCALE * 0.00028)), 256), 512);
  const scaleDenom = spanM / (px * 0.00028);

  // SKALA-VAKT: kan lagret inte garanteras synligt → kasta. Aldrig ett falskt 0.
  if (scaleDenom > RAA_LAMNING_MAX_SCALE) {
    throw new Error('Trakten är för stor för att verifiera fornlämningar i ett anrop — kontrollera manuellt i Fornsök');
  }

  const buffer = Math.floor(px / 2);
  const center = Math.floor(px / 2);
  // WMS 1.3.0 + EPSG:4326 → axelordning lat,lon
  const wmsUrl = 'https://pub.raa.se/visning/lamningar_v1/wms' +
    '?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo' +
    `&LAYERS=${layer}&QUERY_LAYERS=${layer}` +
    '&CRS=EPSG:4326' +
    `&BBOX=${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon}` +
    `&WIDTH=${px}&HEIGHT=${px}&I=${center}&J=${center}&BUFFER=${buffer}` +
    '&INFO_FORMAT=application/json&FEATURE_COUNT=100';

  const resp = await fetch(wmsUrl, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) {
    throw new Error(`RAÄ WMS ${resp.status}: ${layer}`);
  }
  const text = await resp.text();
  // Ärlig kontroll: XML = fel. Tolka aldrig ett fel-svar som "inga hittade".
  if (text.trimStart().startsWith('<')) {
    throw new Error('Kunde inte kontrollera fornlämningar — RAÄ svarade med fel (ej JSON)');
  }
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Kunde inte kontrollera fornlämningar — svaret gick inte att tolka');
  }
  return data.features || [];
}

// Riksantikvarieämbetet: Fornlämningar + möjliga fornlämningar.
// En MÖJLIG fornlämning behandlas juridiskt som fornlämning tills antikvarisk bedömning
// gjorts — därför räknas båda lagren. Misslyckas endera → hela kollen kastar (frontend
// visar "kunde inte kontrollera"), aldrig ett halvt/falskt rent besked.
async function checkFornlamningar(bbox: ReturnType<typeof computeBbox>, tractPoly: ReturnType<typeof buildTractPolygon>): Promise<AnalysisHit[]> {
  const lager: { layer: string; mojlig: boolean }[] = [
    { layer: 'fornlamning', mojlig: false },
    { layer: 'mojligfornlamning', mojlig: true },
  ];
  const alla: AnalysisHit[] = [];
  for (const { layer, mojlig } of lager) {
    const features = await queryRaaLamningWms(layer, bbox);
    for (const f of features) {
      if (!featureIntersectsPolygon(f.geometry, tractPoly)) continue;
      const typ = f.properties?.lamningstyp || 'Fornlämning';
      const nr = f.properties?.raa_nummer || f.properties?.lamningsnummer || '';
      alla.push({
        type: 'fornlamning',
        name: `${mojlig ? 'Möjlig fornlämning: ' : ''}${typ}${nr ? ` (${nr})` : ''}`,
        details: f.properties?.egenskap || '',
        warning: mojlig ? 'Möjlig fornlämning — behandlas juridiskt som fornlämning tills antikvarisk bedömning gjorts' : undefined,
        id: String(f.properties?.id || ''),
        url: f.properties?.url || '',
      });
    }
  }
  return deduplicateHits(alla);
}

// Skogsstyrelsen: Nyckelbiotoper
async function checkNyckelbiotoper(bbox: ReturnType<typeof computeBbox>, tractPoly: ReturnType<typeof buildTractPolygon>): Promise<AnalysisHit[]> {
  const features = await queryArcGIS(
    'https://geodpags.skogsstyrelsen.se/arcgis/rest/services/Geodataportal/GeodataportalVisaNyckelbiotop/MapServer',
    0, bbox,
  );
  return deduplicateHits(features
    .filter(f => arcgisFeatureIntersectsPolygon(f.geometry, tractPoly))
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
async function checkBiotopskydd(bbox: ReturnType<typeof computeBbox>, tractPoly: ReturnType<typeof buildTractPolygon>): Promise<AnalysisHit[]> {
  const features = await queryArcGIS(
    'https://geodpags.skogsstyrelsen.se/arcgis/rest/services/Geodataportal/GeodataportalVisaBiotopskydd/MapServer',
    0, bbox,
  );
  return deduplicateHits(features
    .filter(f => arcgisFeatureIntersectsPolygon(f.geometry, tractPoly))
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
async function checkSkogOchHistoria(bbox: ReturnType<typeof computeBbox>, tractPoly: ReturnType<typeof buildTractPolygon>): Promise<AnalysisHit[]> {
  const features = await queryArcGIS(
    'https://geodpags.skogsstyrelsen.se/arcgis/rest/services/Geodataportal/GeodataportalVisaSkoghistoria/MapServer',
    0, bbox,
  );
  return deduplicateHits(features
    .filter(f => arcgisFeatureIntersectsPolygon(f.geometry, tractPoly))
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
  const tractPoly = buildTractPolygon(body.polygon);
  const result: AnalysisResult = { hits: [], errors: [], bbox };

  console.log(`[tract-analysis] Analyzing polygon with ${body.polygon.length} points, bbox: ${JSON.stringify(bbox)}`);

  // Run all checks in parallel — använder Turf.js för exakt geometrisk intersect
  const checks = [
    { name: 'Vattenskyddsområde', fn: () => checkVattenskydd(bbox, tractPoly) },
    { name: 'Naturreservat', fn: () => checkNaturreservat(bbox, tractPoly) },
    { name: 'Natura 2000', fn: () => checkNatura2000(bbox, tractPoly) },
    { name: 'Fornlämningar', fn: () => checkFornlamningar(bbox, tractPoly) },
    { name: 'Nyckelbiotoper', fn: () => checkNyckelbiotoper(bbox, tractPoly) },
    { name: 'Biotopskydd', fn: () => checkBiotopskydd(bbox, tractPoly) },
    { name: 'Skog och Historia', fn: () => checkSkogOchHistoria(bbox, tractPoly) },
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
