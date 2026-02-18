// Skoglig volymberäkning via Skogsstyrelsens ImageServer REST API
// Använder SLUskogskarta_1_0 (12 band, EPSG:3006, 12.5m pixel)
// Band 0: TotalVolym, 1: Medelhöjd(dm), 3: Medeldiameter(cm),
// 5: TallVolym, 6: GranVolym, 7: BjörkVolym, 8: Contorta, 9: Bok, 10: Ek, 11: Övrigt
// Pixelvärden / 100 = m³sk/ha (empiriskt verifierad skalfaktor)

const SLU_SERVICE = 'https://geodata.skogsstyrelsen.se/arcgis/rest/services/Publikt/SLUskogskarta_1_0/ImageServer';
const PIXEL_SCALE = 100; // raw pixel / 100 = m³sk/ha
const DIAM_BAND = 3;     // Medeldiameter, raw = cm (from SLU, tiondelar)
const DIAM_SCALE = 10;   // raw / 10 = cm

export interface Tradslag {
  namn: string;
  volymHa: number;     // m³sk/ha
  totalVolym: number;  // m³sk total
  andel: number;       // 0-1
  sagtimmer: number;   // m³fub
  massaved: number;    // m³fub
  grot: number;        // ton TS
}

export interface VolymResultat {
  status: 'done' | 'error' | 'no_data';
  areal: number;            // ha
  totalVolymHa: number;     // m³sk/ha medel
  totalVolym: number;       // m³sk total
  medeldiameter: number;    // cm
  tradslag: Tradslag[];
  felmeddelande?: string;
}

// WGS84 → SWEREF99TM (EPSG:3006) förenklad konvertering
function wgs84ToSweref(lat: number, lon: number): { x: number; y: number } {
  // Transverse Mercator approximation for SWEREF99TM
  const a = 6378137.0;
  const f = 1 / 298.257222101;
  const k0 = 0.9996;
  const lonOrigin = 15.0; // Central meridian for SWEREF99TM
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

// Beräkna polygonarea i m² (Shoelace formula, SWEREF99TM-koordinater)
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

// Sortimentsfördelning baserat på medeldiameter
// Förenklad utbytestabell (sydsvenska förhållanden)
function sortimentsFordelning(tradslag: string, medeldiamCm: number, volymM3sk: number) {
  // Omräkningsfaktor m³sk → m³fub (under bark)
  const skToFub: Record<string, number> = {
    tall: 0.83, gran: 0.83, bjork: 0.80, contorta: 0.83, bok: 0.78, ek: 0.75, ovrigt: 0.78,
  };
  const fubFactor = skToFub[tradslag] || 0.80;
  const volymFub = volymM3sk * fubFactor;

  // Andel sågtimmer baserat på medeldiameter
  let sagtimmerAndel: number;
  if (tradslag === 'bjork' || tradslag === 'bok' || tradslag === 'ek' || tradslag === 'ovrigt') {
    // Löv: lägre sågutbyte
    if (medeldiamCm < 15) sagtimmerAndel = 0;
    else if (medeldiamCm < 20) sagtimmerAndel = 0.10;
    else if (medeldiamCm < 25) sagtimmerAndel = 0.25;
    else if (medeldiamCm < 30) sagtimmerAndel = 0.35;
    else sagtimmerAndel = 0.45;
  } else {
    // Barr: tall/gran/contorta
    if (medeldiamCm < 14) sagtimmerAndel = 0;
    else if (medeldiamCm < 18) sagtimmerAndel = 0.15;
    else if (medeldiamCm < 22) sagtimmerAndel = 0.40;
    else if (medeldiamCm < 26) sagtimmerAndel = 0.55;
    else if (medeldiamCm < 30) sagtimmerAndel = 0.65;
    else sagtimmerAndel = 0.75;
  }

  const sagtimmer = volymFub * sagtimmerAndel;
  const massaved = volymFub * (1 - sagtimmerAndel);

  // GROT (grenar och toppar) i ton torrsubstans
  // Andel av stamvolym: gran 27%, tall 18%, björk 22%, övrigt 20%
  const grotAndel: Record<string, number> = {
    tall: 0.18, gran: 0.27, bjork: 0.22, contorta: 0.18, bok: 0.20, ek: 0.20, ovrigt: 0.20,
  };
  // Densitet torrsubstans ~0.4 ton/m³fub (förenklat)
  const grot = volymFub * (grotAndel[tradslag] || 0.20) * 0.4;

  return { sagtimmer, massaved, grot };
}

// Huvudfunktion: beräkna volym per trädslag för en polygon
export async function beraknaVolym(
  polygonLatLon: { lat: number; lon: number }[],
  proxyUrl: string
): Promise<VolymResultat> {
  if (polygonLatLon.length < 3) {
    return { status: 'error', areal: 0, totalVolymHa: 0, totalVolym: 0, medeldiameter: 0, tradslag: [], felmeddelande: 'Minst 3 punkter krävs' };
  }

  // Konvertera polygon till SWEREF99TM
  const swerefCoords = polygonLatLon.map(p => wgs84ToSweref(p.lat, p.lon));

  // Beräkna areal
  const arealM2 = polyArea(swerefCoords);
  const arealHa = arealM2 / 10000;

  if (arealHa < 0.01) {
    return { status: 'error', areal: 0, totalVolymHa: 0, totalVolym: 0, medeldiameter: 0, tradslag: [], felmeddelande: 'Polygonen är för liten' };
  }

  // Bygg ArcGIS ring (stäng polygon)
  const ring = swerefCoords.map(c => [c.x, c.y]);
  if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
    ring.push([ring[0][0], ring[0][1]]);
  }

  const geometry = JSON.stringify({ rings: [ring] });
  const params = new URLSearchParams({
    geometry,
    geometryType: 'esriGeometryPolygon',
    spatialReference: JSON.stringify({ wkid: 3006 }),
    f: 'json',
  });

  const targetUrl = `${SLU_SERVICE}/computeStatisticsHistograms?${params.toString()}`;
  const fetchUrl = `${proxyUrl}?url=${encodeURIComponent(targetUrl)}`;

  try {
    const resp = await fetch(fetchUrl);
    if (!resp.ok) {
      return { status: 'error', areal: arealHa, totalVolymHa: 0, totalVolym: 0, medeldiameter: 0, tradslag: [], felmeddelande: `API-fel: ${resp.status}` };
    }

    const data = await resp.json();
    const stats = data.statistics;

    if (!stats || stats.length < 12) {
      return { status: 'no_data', areal: arealHa, totalVolymHa: 0, totalVolym: 0, medeldiameter: 0, tradslag: [], felmeddelande: 'Ingen skogsdata för detta område' };
    }

    // Kontrollera att vi har giltiga pixlar
    if (stats[0].count === 0) {
      return { status: 'no_data', areal: arealHa, totalVolymHa: 0, totalVolym: 0, medeldiameter: 0, tradslag: [], felmeddelande: 'Ingen skogsdata (inga pixlar)' };
    }

    const totalVolymHa = stats[0].mean / PIXEL_SCALE;
    const medeldiameter = stats[DIAM_BAND].mean / DIAM_SCALE;
    const totalVolym = totalVolymHa * arealHa;

    // Per trädslag: band 5-11
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
    for (const def of tradslagDef) {
      const volymHa = stats[def.band].mean / PIXEL_SCALE;
      if (volymHa < 0.1) continue; // Skippa obetydliga trädslag

      const totalVol = volymHa * arealHa;
      const andel = totalVolymHa > 0 ? volymHa / totalVolymHa : 0;
      const sort = sortimentsFordelning(def.key, medeldiameter, totalVol);

      tradslag.push({
        namn: def.namn,
        volymHa,
        totalVolym: totalVol,
        andel,
        sagtimmer: sort.sagtimmer,
        massaved: sort.massaved,
        grot: sort.grot,
      });
    }

    // Sortera efter volym (störst först)
    tradslag.sort((a, b) => b.totalVolym - a.totalVolym);

    return {
      status: 'done',
      areal: Math.round(arealHa * 100) / 100,
      totalVolymHa: Math.round(totalVolymHa * 10) / 10,
      totalVolym: Math.round(totalVolym),
      medeldiameter: Math.round(medeldiameter * 10) / 10,
      tradslag,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Okänt fel';
    return { status: 'error', areal: arealHa, totalVolymHa: 0, totalVolym: 0, medeldiameter: 0, tradslag: [], felmeddelande: msg };
  }
}
