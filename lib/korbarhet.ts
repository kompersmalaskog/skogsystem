// Körbarhetsanalys – kombinerar markfuktighet (SLU), lutning (SKS) och jordart (SGU)
//
// Markfuktighet: Markfuktighet_SLU_2_0 ImageServer (klasser 1-5)
// Lutning: Lutning_1_0 ImageServer (grader)
// Jordart: SGU WMS GetFeatureInfo via maps3.sgu.se (jordarter 25-100K)
// Säsong: SMHI nederbördsdata (parameter 5) från närmaste station

const MARKFUKT_SERVICE = 'https://geodata.skogsstyrelsen.se/arcgis/rest/services/Publikt/Markfuktighet_SLU_2_0/ImageServer';
const LUTNING_SERVICE = 'https://geodata.skogsstyrelsen.se/arcgis/rest/services/Publikt/Lutning_1_0/ImageServer';
const SGU_WMS = 'https://maps3.sgu.se/geoserver/jord/ows';
const SGU_LAYER = 'SE.GOV.SGU.JORD.GRUNDLAGER.25K';

export interface SmhiData {
  sasong: 'torrt' | 'normalt' | 'blott';
  nederbord7d: number;
  station: string;
}

export interface KorbarhetsResultat {
  status: 'done' | 'error';
  fordelning: { gron: number; gul: number; rod: number };
  dominantJordart: string;
  jordartFordelning: { namn: string; andel: number }[];
  medelLutning: number;
  smhi?: SmhiData;
  felmeddelande?: string;
}

// ---------- Koordinatkonvertering ----------

function wgs84ToSweref(lat: number, lon: number): { x: number; y: number } {
  const a = 6378137.0;
  const f = 1 / 298.257222101;
  const k0 = 0.9996;
  const lonOrigin = 15.0;
  const falseE = 500000;
  const falseN = 0;
  const e2 = 2 * f - f * f;
  const ep2 = e2 / (1 - e2);
  const latRad = lat * Math.PI / 180;
  const lonRad = lon * Math.PI / 180;
  const lonOrigRad = lonOrigin * Math.PI / 180;
  const dLon = lonRad - lonOrigRad;
  const N = a / Math.sqrt(1 - e2 * Math.sin(latRad) * Math.sin(latRad));
  const T = Math.tan(latRad) * Math.tan(latRad);
  const C = ep2 * Math.cos(latRad) * Math.cos(latRad);
  const A = Math.cos(latRad) * dLon;
  const M = a * (
    (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256) * latRad
    - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 * e2 * e2 / 1024) * Math.sin(2 * latRad)
    + (15 * e2 * e2 / 256 + 45 * e2 * e2 * e2 / 1024) * Math.sin(4 * latRad)
    - (35 * e2 * e2 * e2 / 3072) * Math.sin(6 * latRad)
  );
  const x = falseE + k0 * N * (
    A + (1 - T + C) * A * A * A / 6
    + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A * A * A * A * A / 120
  );
  const y = falseN + k0 * (
    M + N * Math.tan(latRad) * (
      A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A * A * A * A / 24
      + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A * A * A * A * A * A / 720
    )
  );
  return { x, y };
}

// ---------- Geometrihjälp ----------

function pointInPolygon(px: number, py: number, polygon: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i].y, yj = polygon[j].y;
    const xi = polygon[i].x, xj = polygon[j].x;
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function generateSamplingPoints(polygon: { x: number; y: number }[], targetCount = 12): { x: number; y: number }[] {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of polygon) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const spacing = Math.sqrt((width * height) / (targetCount * 3));
  if (spacing < 1) return [{ x: (minX + maxX) / 2, y: (minY + maxY) / 2 }];

  const points: { x: number; y: number }[] = [];
  for (let x = minX + spacing / 2; x < maxX; x += spacing) {
    for (let y = minY + spacing / 2; y < maxY; y += spacing) {
      if (pointInPolygon(x, y, polygon)) points.push({ x, y });
    }
  }
  if (points.length === 0) points.push({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 });
  if (points.length > targetCount) {
    const step = points.length / targetCount;
    const selected: { x: number; y: number }[] = [];
    for (let i = 0; i < targetCount; i++) selected.push(points[Math.floor(i * step)]);
    return selected;
  }
  return points;
}

// ---------- API-anrop ----------

async function fetchStatistics(service: string, geometry: string, proxyUrl: string) {
  const params = new URLSearchParams({
    geometry,
    geometryType: 'esriGeometryPolygon',
    spatialReference: JSON.stringify({ wkid: 3006 }),
    f: 'json',
  });
  const targetUrl = `${service}/computeStatisticsHistograms?${params.toString()}`;
  const resp = await fetch(`${proxyUrl}?url=${encodeURIComponent(targetUrl)}`);
  if (!resp.ok) throw new Error(`API ${resp.status}`);
  return await resp.json();
}

// ---------- Jordart (SGU via maps3.sgu.se) ----------

type JordartKategori = 'berg' | 'moran' | 'sand' | 'lera' | 'torv' | 'okand';

function parseJordart(text: string): JordartKategori {
  const t = text.toLowerCase();
  if (t.includes('berg') || t.includes('häll')) return 'berg';
  if (t.includes('morän') || t.includes('moran')) return 'moran';
  if (t.includes('sand') || t.includes('grus') || t.includes('isälv')) return 'sand';
  if (t.includes('lera') || t.includes('silt')) return 'lera';
  if (t.includes('torv') || t.includes('kärr') || t.includes('mosse')) return 'torv';
  return 'okand';
}

function jordartDisplayName(kat: JordartKategori): string {
  switch (kat) {
    case 'berg': return 'Berg/hällmark';
    case 'moran': return 'Morän';
    case 'sand': return 'Sand/grus';
    case 'lera': return 'Lera/silt';
    case 'torv': return 'Torv';
    case 'okand': return 'Okänd';
  }
}

// x = easting, y = northing i SWEREF99TM
async function fetchJordartAtPoint(x: number, y: number, sguProxyUrl: string): Promise<JordartKategori> {
  // WMS 1.3.0 med CRS=EPSG:3006: BBOX = minNorthing,minEasting,maxNorthing,maxEasting
  const d = 500; // 1km bbox
  const bbox = `${y - d},${x - d},${y + d},${x + d}`;
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetFeatureInfo',
    LAYERS: SGU_LAYER,
    QUERY_LAYERS: SGU_LAYER,
    CRS: 'EPSG:3006',
    BBOX: bbox,
    WIDTH: '256',
    HEIGHT: '256',
    I: '128',
    J: '128',
    INFO_FORMAT: 'application/json',
  });
  const targetUrl = `${SGU_WMS}?${params.toString()}`;
  try {
    const resp = await fetch(`${sguProxyUrl}?url=${encodeURIComponent(targetUrl)}`);
    if (!resp.ok) return 'okand';
    const data = await resp.json();
    if (data.features && data.features.length > 0) {
      const props = data.features[0].properties || {};
      // SGU returnerar fältet "Jordart" med värden som "Lera--silt", "Morän"
      if (props.Jordart) return parseJordart(String(props.Jordart));
      // Fallback: sök bland alla properties
      for (const key of Object.keys(props)) {
        const k = key.toLowerCase();
        if (k.includes('jordart') || k.includes('jord')) {
          return parseJordart(String(props[key]));
        }
      }
    }
  } catch { /* SGU offline */ }
  return 'okand';
}

// ---------- Markfuktighet (histogram) ----------

type FuktKlass = 'torr' | 'frisk' | 'friskFuktig' | 'fuktig' | 'blot';

interface MarkfuktFordelning {
  torr: number; frisk: number; friskFuktig: number; fuktig: number; blot: number;
}

function parseMarkfuktighet(data: Record<string, unknown>): MarkfuktFordelning {
  const def: MarkfuktFordelning = { torr: 0, frisk: 1, friskFuktig: 0, fuktig: 0, blot: 0 };
  const histograms = data.histograms as { counts: number[]; min?: number; max?: number }[] | undefined;
  if (!histograms?.[0]?.counts) return def;

  const hist = histograms[0];
  const counts = hist.counts;
  const histMin = hist.min ?? 0;
  const histMax = hist.max ?? (counts.length - 1);
  const binWidth = counts.length > 1 ? (histMax - histMin) / counts.length : 1;

  // Klasser: 1=torr, 2=frisk, 3=frisk-fuktig, 4=fuktig, 5=blöt
  const classCounts = [0, 0, 0, 0, 0, 0]; // index 0 = nodata/utanför
  for (let i = 0; i < counts.length; i++) {
    const binCenter = histMin + (i + 0.5) * binWidth;
    const ci = Math.round(binCenter);
    if (ci >= 1 && ci <= 5) classCounts[ci] += counts[i];
  }
  const total = classCounts[1] + classCounts[2] + classCounts[3] + classCounts[4] + classCounts[5];
  if (total === 0) return def;

  return {
    torr: classCounts[1] / total,
    frisk: classCounts[2] / total,
    friskFuktig: classCounts[3] / total,
    fuktig: classCounts[4] / total,
    blot: classCounts[5] / total,
  };
}

// ---------- Lutning (statistik + histogram) ----------

interface LutningData {
  mean: number;
  ranges: { maxDeg: number; fraction: number }[];
}

function parseLutning(data: Record<string, unknown>): LutningData {
  const stats = data.statistics as { mean: number }[] | undefined;
  const mean = stats?.[0]?.mean ?? 10;

  const ranges = [
    { maxDeg: 15, fraction: 0 },
    { maxDeg: 20, fraction: 0 },
    { maxDeg: 25, fraction: 0 },
    { maxDeg: 90, fraction: 0 },
  ];

  const histograms = data.histograms as { counts: number[]; min?: number; max?: number }[] | undefined;
  if (!histograms?.[0]?.counts) {
    for (const r of ranges) { if (mean < r.maxDeg) { r.fraction = 1; break; } }
    if (ranges.every(r => r.fraction === 0)) ranges[3].fraction = 1;
    return { mean, ranges };
  }

  const hist = histograms[0];
  const counts = hist.counts;
  const histMin = hist.min ?? 0;
  const histMax = hist.max ?? 90;
  const binWidth = counts.length > 1 ? (histMax - histMin) / counts.length : 1;

  let total = 0;
  const rc = [0, 0, 0, 0]; // <15, 15-20, 20-25, >25
  for (let i = 0; i < counts.length; i++) {
    const deg = histMin + (i + 0.5) * binWidth;
    total += counts[i];
    if (deg < 15) rc[0] += counts[i];
    else if (deg < 20) rc[1] += counts[i];
    else if (deg < 25) rc[2] += counts[i];
    else rc[3] += counts[i];
  }
  if (total > 0) for (let i = 0; i < 4; i++) ranges[i].fraction = rc[i] / total;
  else ranges[0].fraction = 1;

  return { mean, ranges };
}

// ---------- Klassificering ----------

function klassificera(jordart: JordartKategori, fukt: FuktKlass, lutning: number): 'gron' | 'gul' | 'rod' {
  // 1. Torv — ALLTID röd oavsett fuktighet/lutning/säsong
  if (jordart === 'torv') return 'rod';

  // 2. Brant lutning — alltid röd
  if (lutning > 25) return 'rod';

  // 3. Blöt mark (klass 5) — alltid röd
  if (fukt === 'blot') return 'rod';

  // 4. Fuktig mark (klass 4)
  if (fukt === 'fuktig') {
    if ((jordart === 'moran' || jordart === 'sand' || jordart === 'berg') && lutning < 15) return 'gul';
    return 'rod'; // lera + fuktig = röd
  }

  // 5. Frisk-fuktig (klass 3)
  if (fukt === 'friskFuktig') {
    if ((jordart === 'moran' || jordart === 'berg') && lutning < 20) return 'gron';
    if (jordart === 'sand' && lutning < 20) return 'gron';
    if (jordart === 'lera' && lutning < 15) return 'gul';
    return 'gul';
  }

  // 6. Torr (klass 1) / Frisk (klass 2)
  switch (jordart) {
    case 'berg':
    case 'moran':
    case 'sand':
      if (lutning < 20) return 'gron';
      return 'gul';

    case 'lera':
      if (lutning < 15) return 'gul';
      return 'rod';

    default:
      if (lutning < 15) return 'gul';
      return 'rod';
  }
}

// ---------- Huvudfunktion ----------

const emptyError = (msg: string): KorbarhetsResultat => ({
  status: 'error',
  fordelning: { gron: 0, gul: 0, rod: 0 },
  dominantJordart: 'Okänd',
  jordartFordelning: [],
  medelLutning: 0,
  felmeddelande: msg,
});

export async function beraknaKorbarhet(
  polygonLatLon: { lat: number; lon: number }[],
  proxyUrl: string,
  sguProxyUrl: string,
): Promise<KorbarhetsResultat> {
  if (polygonLatLon.length < 3) return emptyError('Minst 3 punkter krävs');

  const swerefCoords = polygonLatLon.map(p => wgs84ToSweref(p.lat, p.lon));

  const ring = swerefCoords.map(c => [c.x, c.y]);
  if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
    ring.push([ring[0][0], ring[0][1]]);
  }
  const geometry = JSON.stringify({ rings: [ring] });

  const samplingPoints = generateSamplingPoints(swerefCoords, 12);

  // Beräkna polygonens centroid för SMHI-anrop
  const centerLat = polygonLatLon.reduce((s, p) => s + p.lat, 0) / polygonLatLon.length;
  const centerLon = polygonLatLon.reduce((s, p) => s + p.lon, 0) / polygonLatLon.length;

  try {
    // Hämta allt parallellt: markfuktighet, lutning, SMHI, jordart
    const smhiPromise: Promise<SmhiData | null> = fetch(`/api/smhi-nederb?lat=${centerLat}&lon=${centerLon}`)
      .then(r => r.ok ? r.json() as Promise<SmhiData> : null)
      .catch(() => null);

    const [markfuktData, lutningData, smhiData, ...jordartResults] = await Promise.all([
      fetchStatistics(MARKFUKT_SERVICE, geometry, proxyUrl),
      fetchStatistics(LUTNING_SERVICE, geometry, proxyUrl),
      smhiPromise,
      ...samplingPoints.map(p => fetchJordartAtPoint(p.x, p.y, sguProxyUrl)),
    ]);

    const fukt = parseMarkfuktighet(markfuktData as Record<string, unknown>);
    const lutning = parseLutning(lutningData as Record<string, unknown>);

    // Jordart-fördelning
    const jordartCounts: Record<JordartKategori, number> = { berg: 0, moran: 0, sand: 0, lera: 0, torv: 0, okand: 0 };
    for (const j of jordartResults) jordartCounts[j as JordartKategori]++;
    const totalPts = jordartResults.length || 1;

    let dominantKat: JordartKategori = 'okand';
    let maxCount = 0;
    for (const [kat, count] of Object.entries(jordartCounts) as [JordartKategori, number][]) {
      if (count > maxCount) { maxCount = count; dominantKat = kat; }
    }

    const jordartFordelning = (Object.entries(jordartCounts) as [JordartKategori, number][])
      .filter(([, c]) => c > 0)
      .map(([kat, c]) => ({ namn: jordartDisplayName(kat), andel: c / totalPts }))
      .sort((a, b) => b.andel - a.andel);

    // Kombinera: jordart × fuktighet × lutningsintervall
    const fordelning = { gron: 0, gul: 0, rod: 0 };
    const fuktClasses: FuktKlass[] = ['torr', 'frisk', 'friskFuktig', 'fuktig', 'blot'];
    const lutRepresentative = [10, 17, 22, 30];

    for (const [kat, count] of Object.entries(jordartCounts) as [JordartKategori, number][]) {
      if (count === 0) continue;
      const jw = count / totalPts;

      for (const fk of fuktClasses) {
        const fw = fukt[fk];
        if (fw < 0.001) continue;

        for (let li = 0; li < lutning.ranges.length; li++) {
          const lw = lutning.ranges[li].fraction;
          if (lw < 0.001) continue;

          const klass = klassificera(kat, fk, lutRepresentative[li]);
          fordelning[klass] += jw * fw * lw;
        }
      }
    }

    // Normalisera
    const sum = fordelning.gron + fordelning.gul + fordelning.rod;
    if (sum > 0) {
      fordelning.gron /= sum;
      fordelning.gul /= sum;
      fordelning.rod /= sum;
    }

    return {
      status: 'done',
      fordelning,
      dominantJordart: jordartDisplayName(dominantKat),
      jordartFordelning,
      medelLutning: Math.round(lutning.mean * 10) / 10,
      smhi: smhiData || undefined,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Okänt fel';
    return emptyError(msg);
  }
}
