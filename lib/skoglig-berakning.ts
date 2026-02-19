// Skoglig volymberäkning via Skogsstyrelsens ImageServer REST API
//
// Huvudkälla: SkogligaGrunddata_3_1 (laserdata, 10m pixel, EPSG:3006)
//   Band 0: Volym (m³sk/ha), 1: Medelhöjd (dm), 2: Grundyta (m²/ha), 3: Medeldiameter (cm)
//   Band 4: Biomassa, 5: P95, 6: Vegkvot, 7: UnixDay, 8: Löv/Avlövat, 9: NMD skogsmark
//   Rasterfunktion "Gallringsindex": 4 klasser (0=Lågt, 1=Medel, 2=Högt, 3=Akut)
//
// Trädslagsfördelning: SLUskogskarta_1_0 (satellit+riksskogstax, 12.5m pixel)
//   Band 5-11: Volym per trädslag (raw / 100 = m³sk/ha)
//   Används BARA för procentuell fördelning, appliceras på laservolym

const SGD_SERVICE = 'https://geodata.skogsstyrelsen.se/arcgis/rest/services/Publikt/SkogligaGrunddata_3_1/ImageServer';
const SLU_SERVICE = 'https://geodata.skogsstyrelsen.se/arcgis/rest/services/Publikt/SLUskogskarta_1_0/ImageServer';

export interface Tradslag {
  namn: string;
  volymHa: number;     // m³sk/ha
  totalVolym: number;  // m³sk total
  andel: number;       // 0-1
}

export interface GallringsResultat {
  behov: boolean;           // true om gallringsbehov finns
  klass: string;            // 'Lågt' | 'Medel' | 'Högt' | 'Akut'
  fordelning: { lagt: number; medel: number; hogt: number; akut: number }; // andel 0-1
  totalPixlar: number;      // antal skogspixlar (exkl NoData)
  sis: string;              // ståndortsindex-mall, t.ex. 'G16-G22'
  grundyta: number;         // m²/ha
  stamantal: number;        // stammar/ha (beräknat)
  malGrundyta?: number;     // rekommenderad grundyta efter gallring (m²/ha)
}

export interface VolymResultat {
  status: 'done' | 'error' | 'no_data';
  areal: number;            // ha
  arealSkog: number;        // ha produktiv skogsmark
  totalVolymHa: number;     // m³sk/ha medel (på skogsmark)
  totalVolym: number;       // m³sk total
  medeldiameter: number;    // cm
  medelhojd: number;        // m
  grundyta: number;         // m²/ha
  tradslag: Tradslag[];
  gallring?: GallringsResultat;
  skanningsAr: number;      // År laserdatan skannades
  sluAr: number;            // År SLU Skogskarta baseras på (ca 2018-2020)
  andelSkog: number;        // Andel produktiv skogsmark (0-1)
  avverkatVarning: boolean; // Sant om stor andel verkar avverkad
  felmeddelande?: string;
}

// WGS84 → SWEREF99TM (EPSG:3006) förenklad konvertering
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

function polyArea(coords: { x: number; y: number }[]): number {
  let area = 0;
  const n = coords.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += coords[i].x * coords[j].y;
    area -= coords[j].x * coords[i].y;
  }
  return Math.abs(area) / 2;
}

// POST form-encoded body via wms-proxy to avoid URL length limits.
async function fetchStats(service: string, geometry: string, proxyUrl: string, renderingRule?: string) {
  const formParams = new URLSearchParams({
    geometry,
    geometryType: 'esriGeometryPolygon',
    geometrySR: '3006',
    f: 'json',
  });
  if (renderingRule) formParams.set('renderingRule', renderingRule);

  const targetUrl = `${service}/computeStatisticsHistograms`;
  const formBody = formParams.toString();

  console.log(`[skoglig] fetchStats POST: ${targetUrl}`);
  console.log(`[skoglig] fetchStats body length: ${formBody.length} chars`);

  const resp = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetUrl, body: formBody }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    console.error(`[skoglig] fetchStats error: ${resp.status} ${text.slice(0, 300)}`);
    throw new Error(`API ${resp.status}`);
  }

  const data = await resp.json();
  console.log(`[skoglig] fetchStats response: ${JSON.stringify(data).slice(0, 300)}...`);
  return data;
}

// SLU Skogskarta 1.0: computeStatisticsHistograms and getSamples are broken
// server-side (tested with curl — identical results for all polygons regardless
// of location). The data has per-tile granularity (~40 tiles covering Sweden,
// each tile ~50-100 km across). identify at the polygon centroid returns the
// correct tile-specific values. Two polygons within the same tile WILL get
// the same species %. Polygons in different tiles get different %.
async function fetchSluIdentify(
  service: string,
  centroid: { x: number; y: number },
  proxyUrl: string,
): Promise<number[]> {
  const geometry = JSON.stringify({
    x: Math.round(centroid.x),
    y: Math.round(centroid.y),
  });
  const params = new URLSearchParams({
    geometry,
    geometryType: 'esriGeometryPoint',
    geometrySR: '3006',
    returnGeometry: 'false',
    returnCatalogItems: 'true',
    f: 'json',
  });
  const targetUrl = `${service}/identify?${params.toString()}`;

  console.log(`[skoglig] fetchSluIdentify: centroid=(${Math.round(centroid.x)}, ${Math.round(centroid.y)})`);

  const resp = await fetch(`${proxyUrl}?url=${encodeURIComponent(targetUrl)}`);
  if (!resp.ok) throw new Error(`SLU identify ${resp.status}`);

  const data = await resp.json();

  // Log which tile we got data from
  const catalogItems = data.catalogItems?.features || [];
  const primaryTile = catalogItems.find(
    (f: { attributes: { Category: number; Name: string } }) => f.attributes.Category === 1,
  );
  if (primaryTile) {
    console.log(`[skoglig] SLU tile: ${primaryTile.attributes.Name} (regional resolution ~50-100km)`);
  }

  const valueStr = data.value;
  if (!valueStr || valueStr === 'NoData') {
    console.log(`[skoglig] fetchSluIdentify: no data (value=${valueStr})`);
    return [];
  }

  // identify returns comma-separated: "22283, 503, 1300, 89, ..."
  const values = valueStr.split(',').map((s: string) => Number(s.trim()));
  console.log(`[skoglig] SLU values: Tall=${values[5]} Gran=${values[6]} Björk=${values[7]}`);
  return values;
}

// Gallringsmall: mål-grundyta efter gallring baserat på medelhöjd och ståndortsindex
// Förenklad tabell efter Skogforsk/Skogsstyrelsen gallringsmallar
function gallringsMalGrundyta(medelhojdM: number, sis: string): number | undefined {
  // Linjär interpolering av "gallra-till"-kurvan
  // Format: [medelhöjd_m, mål_grundyta_m2ha]
  const mallar: Record<string, [number, number][]> = {
    'g16-g22': [[8, 12], [10, 14], [12, 16], [14, 18], [16, 19], [18, 20], [20, 21], [25, 23]],
    'g23-g28': [[8, 14], [10, 16], [12, 18], [14, 20], [16, 22], [18, 23], [20, 24], [25, 26]],
    'g29-g34': [[8, 16], [10, 18], [12, 20], [14, 22], [16, 24], [18, 25], [20, 26], [25, 28]],
    'g35-g40': [[8, 18], [10, 20], [12, 22], [14, 24], [16, 26], [18, 27], [20, 28], [25, 30]],
    't14-t17': [[8, 10], [10, 12], [12, 14], [14, 15], [16, 16], [18, 17], [20, 18], [25, 19]],
    't18-t21': [[8, 12], [10, 14], [12, 16], [14, 17], [16, 18], [18, 19], [20, 20], [25, 21]],
    't22-t25': [[8, 14], [10, 16], [12, 18], [14, 19], [16, 20], [18, 21], [20, 22], [25, 23]],
    't26-t30': [[8, 16], [10, 18], [12, 20], [14, 21], [16, 22], [18, 23], [20, 24], [25, 25]],
  };
  const points = mallar[sis];
  if (!points || medelhojdM < 8) return undefined;
  // Linjär interpolering
  for (let i = 0; i < points.length - 1; i++) {
    const [h1, g1] = points[i];
    const [h2, g2] = points[i + 1];
    if (medelhojdM >= h1 && medelhojdM <= h2) {
      return g1 + (g2 - g1) * (medelhojdM - h1) / (h2 - h1);
    }
  }
  // Utanför tabellen — returnera sista värdet
  return points[points.length - 1][1];
}

function parseGallringsHistogram(
  data: Record<string, unknown>,
  grundyta: number,
  medeldiameterCm: number,
  medelhojdM: number,
  sis: string,
): GallringsResultat | undefined {
  const histograms = data.histograms as { counts: number[] }[] | undefined;
  if (!histograms || !histograms[0]?.counts) return undefined;
  const counts = histograms[0].counts;
  // Klasser: 0=Lågt, 1=Medel, 2=Högt, 3=Akut, 255=NoData
  const lagt = counts[0] || 0;
  const medel = counts[1] || 0;
  const hogt = counts[2] || 0;
  const akut = counts[3] || 0;
  const total = lagt + medel + hogt + akut;
  if (total === 0) return undefined;

  const fordelning = {
    lagt: lagt / total,
    medel: medel / total,
    hogt: hogt / total,
    akut: akut / total,
  };

  // Dominerande klass
  const max = Math.max(lagt, medel, hogt, akut);
  let klass = 'Lågt';
  if (max === akut) klass = 'Akut';
  else if (max === hogt) klass = 'Högt';
  else if (max === medel) klass = 'Medel';

  // Gallringsbehov = mer än 30% högt+akut
  const behov = (fordelning.hogt + fordelning.akut) > 0.3;

  // Stamantal: N = grundyta / (π/4 × (d/100)²)
  const dM = medeldiameterCm / 100;
  const stamantal = dM > 0 ? Math.round(grundyta / (Math.PI / 4 * dM * dM)) : 0;

  // Mål-grundyta efter gallring
  const malGy = behov ? gallringsMalGrundyta(medelhojdM, sis) : undefined;

  return {
    behov, klass, fordelning, totalPixlar: total,
    sis: sis.toUpperCase().replace('-', '–'),
    grundyta: Math.round(grundyta * 10) / 10,
    stamantal,
    malGrundyta: malGy ? Math.round(malGy) : undefined,
  };
}

const emptyResult = (arealHa: number, msg: string, status: 'error' | 'no_data' = 'error'): VolymResultat => ({
  status, areal: arealHa, arealSkog: 0, totalVolymHa: 0, totalVolym: 0,
  medeldiameter: 0, medelhojd: 0, grundyta: 0, tradslag: [], skanningsAr: 0, sluAr: 0,
  andelSkog: 0, avverkatVarning: false, felmeddelande: msg,
});

export async function beraknaVolym(
  polygonLatLon: { lat: number; lon: number }[],
  proxyUrl: string
): Promise<VolymResultat> {
  if (polygonLatLon.length < 3) return emptyResult(0, 'Minst 3 punkter krävs');

  const swerefCoords = polygonLatLon.map(p => wgs84ToSweref(p.lat, p.lon));
  const arealHa = polyArea(swerefCoords) / 10000;
  if (arealHa < 0.01) return emptyResult(0, 'Polygonen är för liten');

  const ring = swerefCoords.map(c => [c.x, c.y]);
  if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
    ring.push([ring[0][0], ring[0][1]]);
  }
  const geometry = JSON.stringify({ rings: [ring] });

  // Centroid for SLU identify (simple average of polygon vertices)
  const centroid = swerefCoords.reduce(
    (acc, c) => ({ x: acc.x + c.x / swerefCoords.length, y: acc.y + c.y / swerefCoords.length }),
    { x: 0, y: 0 },
  );

  try {
    // Hämta alla parallellt
    const gallringsRule = JSON.stringify({
      rasterFunction: 'Gallringsindex',
      rasterFunctionArguments: { sis: 'g16-g22' },
    });
    // SGD: computeStatisticsHistograms works correctly (POST)
    // SLU: computeStatisticsHistograms is broken — use identify at centroid
    const [sgdData, sluBandValues, gallringsData] = await Promise.all([
      fetchStats(SGD_SERVICE, geometry, proxyUrl),
      fetchSluIdentify(SLU_SERVICE, centroid, proxyUrl),
      fetchStats(SGD_SERVICE, geometry, proxyUrl, gallringsRule).catch(() => null),
    ]);
    const sgdStats = sgdData.statistics || [];

    // --- SkogligaGrunddata (laserdata) ---
    if (!sgdStats || sgdStats.length < 10 || sgdStats[0].count === 0) {
      return emptyResult(arealHa, 'Ingen laserdata för detta område', 'no_data');
    }

    const sgdVolymHa = sgdStats[0].mean;   // m³sk/ha direkt
    const medelhojdDm = sgdStats[1].mean;  // dm direkt
    const grundyta = sgdStats[2].mean;     // m²/ha direkt
    const medeldiameter = sgdStats[3].mean; // cm direkt
    const unixDay = sgdStats[7].mean;       // skanningsdatum
    const nmdMean = sgdStats[9].mean;       // NMD skogsmark (0/1/2)

    // Skanningsår
    const skanningsDatum = new Date(unixDay * 86400000);
    const skanningsAr = skanningsDatum.getFullYear();

    // Andel produktiv skogsmark
    // NMD: 0=ej skog, 1=produktiv skog, 2=ej produktiv skog
    // mean ≈ andel med skog (1 och 2). Vi vill veta andel=1 (produktiv).
    // Approximation: om mean ~1 är det mest produktiv skog
    // Vi använder histogrammet om det finns, annars approximerar
    let andelSkog = 1.0;
    if (sgdStats[9].min === 0 && sgdStats[9].max <= 2) {
      // Om min=0 finns icke-skog. Approximera:
      // mean=0 → 0% skog, mean=1 → 100% prod skog, mean=2 → 100% ej prod skog
      // Enklast: andel skogsmark = andel pixlar där volym > 0
      const totalPixlar = sgdStats[0].count;
      // Om volym-min > 0 är allt skog
      if (sgdStats[0].min > 0) {
        andelSkog = 1.0;
      } else {
        // Uppskatta andel skog från NMD: mean ~1 ≈ mesta prod skog
        // mean ~0 ≈ mest öppet, mean ~2 ≈ myr/impediment
        // Förenkling: prod skog ≈ pixlar med NMD=1
        andelSkog = Math.max(0, Math.min(1, nmdMean > 0 ? (2 - nmdMean) / 1.0 : 0));
        // Fallback: om medelvärde volym > 20 men andelSkog beräknas låg, justera
        if (sgdVolymHa > 20 && andelSkog < 0.3) andelSkog = 0.5;
      }
    }

    const arealSkog = arealHa * andelSkog;

    // Gallringsindex
    const medelhojdM = medelhojdDm / 10;
    const gallringSis = 'g16-g22';
    const gallring = gallringsData
      ? parseGallringsHistogram(gallringsData, grundyta, medeldiameter, medelhojdM, gallringSis)
      : undefined;

    // Avverkningsvarning: mycket låg volym trots att det "borde" vara skog
    const avverkatVarning = sgdVolymHa < 15 && andelSkog > 0.5;

    if (avverkatVarning) {
      return {
        status: 'done',
        areal: Math.round(arealHa * 100) / 100,
        arealSkog: Math.round(arealSkog * 100) / 100,
        totalVolymHa: Math.round(sgdVolymHa * 10) / 10,
        totalVolym: Math.round(sgdVolymHa * arealSkog),
        medeldiameter: Math.round(medeldiameter * 10) / 10,
        medelhojd: Math.round(medelhojdM * 10) / 10,
        grundyta: Math.round(grundyta * 10) / 10,
        tradslag: [],
        gallring,
        skanningsAr,
        sluAr: 2020,
        andelSkog,
        avverkatVarning: true,
      };
    }

    const totalVolym = sgdVolymHa * arealSkog;

    // --- SLU Skogskarta (trädslagsfördelning) ---
    const tradslagDef = [
      { band: 5, namn: 'Tall', key: 'tall' },
      { band: 6, namn: 'Gran', key: 'gran' },
      { band: 7, namn: 'Björk', key: 'bjork' },
      { band: 8, namn: 'Contorta', key: 'contorta' },
      { band: 9, namn: 'Bok', key: 'bok' },
      { band: 10, namn: 'Ek', key: 'ek' },
      { band: 11, namn: 'Övrigt löv', key: 'ovrigt' },
    ];

    const tradslag: Tradslag[] = [];

    console.log(`[skoglig] SLU identify bands: ${sluBandValues.length}`);
    if (sluBandValues.length >= 12) {
      console.log(`[skoglig] SLU band values: Tall=${sluBandValues[5]} Gran=${sluBandValues[6]} Björk=${sluBandValues[7]} Contorta=${sluBandValues[8]} Bok=${sluBandValues[9]} Ek=${sluBandValues[10]} Övrigt=${sluBandValues[11]}`);
    }

    if (sluBandValues.length >= 12 && sluBandValues[5] > 0) {
      // identify returns pixel values for all 12 bands at the centroid
      // Bands 5-11: Tall, Gran, Björk, Contorta, Bok, Ek, Övrigt löv (raw values)
      let sluSumma = 0;
      for (const def of tradslagDef) {
        sluSumma += Math.max(0, sluBandValues[def.band]);
      }

      console.log(`[skoglig] SLU trädslag summa: ${sluSumma}`);

      for (const def of tradslagDef) {
        const sluRaw = Math.max(0, sluBandValues[def.band]);
        const andel = sluSumma > 0 ? sluRaw / sluSumma : 0;
        if (andel < 0.005) continue; // Skippa < 0.5%

        // Applicera andelen på laservolym
        const volymHa = sgdVolymHa * andel;
        const totalVol = volymHa * arealSkog;

        tradslag.push({
          namn: def.namn,
          volymHa: Math.round(volymHa * 10) / 10,
          totalVolym: Math.round(totalVol),
          andel,
        });
      }
    } else {
      // Ingen SLU-data — visa totalvolym utan trädslagsfördelning
      tradslag.push({
        namn: 'Okänt trädslag',
        volymHa: Math.round(sgdVolymHa * 10) / 10,
        totalVolym: Math.round(totalVolym),
        andel: 1,
      });
    }

    tradslag.sort((a, b) => b.totalVolym - a.totalVolym);

    return {
      status: 'done',
      areal: Math.round(arealHa * 100) / 100,
      arealSkog: Math.round(arealSkog * 100) / 100,
      totalVolymHa: Math.round(sgdVolymHa * 10) / 10,
      totalVolym: Math.round(totalVolym),
      medeldiameter: Math.round(medeldiameter * 10) / 10,
      medelhojd: Math.round(medelhojdM * 10) / 10,
      grundyta: Math.round(grundyta * 10) / 10,
      tradslag,
      gallring,
      skanningsAr,
      sluAr: 2020,
      andelSkog,
      avverkatVarning: false,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Okänt fel';
    return emptyResult(arealHa, msg);
  }
}
