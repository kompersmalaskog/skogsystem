import * as shapefile from 'shapefile';
import proj4 from 'proj4';

// Geometrin ur en envz: shapefiler (.shp/.dbf/.prj/.cpg) i SWEREF99 TM (EPSG:3006) ->
// GeoJSON i WGS84. Vi ITERERAR över de lager som faktiskt kom — antar aldrig en fast lista.
// L_TRAKTDEL är enda obligatoriska; saknas det sparar vi ingen geometri alls (hellre ingen
// än halv). Okända lagernamn loggas (då märker vi om VIDA lägger till ett lager) i stället
// för att ignoreras tyst. Teckenkodningen läses ur .cpg — aldrig gissad, annars blir
// "Basväg" till "BasvÃ¤g" och det står fel om kraftledningen på förarens karta.

const SWEREF99TM = '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';

// Känd lager-mappning: filnamn (utan ändelse) -> logisk typ. FLBESKR i dbf:en bär
// underbeskrivningen (t.ex. "Basväg", "Kraftledning", "Larmkoordinat").
const LAGER: { namn: string; typ: string }[] = [
  { namn: 'L_TRAKTDEL', typ: 'traktgräns' },
  { namn: 'L_TILLAGGSYTOR', typ: 'hänsynsyta' },
  { namn: 'L_TILLAGGSLINJER', typ: 'linje' },
  { namn: 'L_TILLAGGSPUNKTER', typ: 'punkt' },
];

export interface GeoLager {
  namn: string;
  typ: string;
  antal: number;
}
export interface GeoResultat {
  features: any[]; // GeoJSON Feature[] i WGS84
  lager: GeoLager[];
  larmpunkt: { lat: number; lng: number } | null; // L_TILLAGGSPUNKTER, FLBESKR=Larmkoordinat
  varningar: string[];
}

// En vy in i poolen ger fel data — skär ut exakt den här bufferten.
function tillArrayBuffer(b: Buffer): ArrayBuffer {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

// Transformera GeoJSON-koordinater rekursivt SWEREF99 TM -> WGS84.
function tillWgs84(geom: any): any {
  if (!geom || !geom.coordinates) return geom;
  const conv = (c: any): any =>
    typeof c[0] === 'number'
      ? (() => { const [lng, lat] = proj4(SWEREF99TM, 'WGS84', [c[0], c[1]]); return [lng, lat]; })()
      : c.map(conv);
  return { ...geom, coordinates: conv(geom.coordinates) };
}

async function lasLager(shpBuf: Buffer, dbfBuf: Buffer | undefined, encoding: string): Promise<any[]> {
  const source = await shapefile.open(
    tillArrayBuffer(shpBuf),
    dbfBuf ? tillArrayBuffer(dbfBuf) : undefined,
    { encoding },
  );
  const ut: any[] = [];
  for (;;) {
    const res = await source.read();
    if (res.done) break;
    ut.push(res.value); // GeoJSON Feature i källans (SWEREF) koordinater
  }
  return ut;
}

// Bounding box-centrum (deterministiskt, inget bibliotek) över features av en viss typ.
// Kartpinen sätts till bbox-mitten av traktgränsen — inte areaviktad centroid; för en pin
// räcker det gott och är stabilt. null om inga features av typen finns.
export function bboxCentrum(features: any[], typ = 'traktgräns'): { lat: number; lng: number } | null {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity, n = 0;
  const scan = (c: any): void => {
    if (typeof c[0] === 'number') {
      const lng = c[0], lat = c[1];
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      n++;
    } else {
      for (const x of c) scan(x);
    }
  };
  for (const f of features) {
    if (typ && f.properties?._typ !== typ) continue;
    if (f.geometry?.coordinates) scan(f.geometry.coordinates);
  }
  if (n === 0) return null;
  return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
}

export async function packaGeometri(bilagor: Map<string, Buffer>): Promise<GeoResultat> {
  const varningar: string[] = [];
  const features: any[] = [];
  const lager: GeoLager[] = [];
  let larmpunkt: { lat: number; lng: number } | null = null;

  const shpNamn = Array.from(bilagor.keys()).filter((n) => /\.shp$/i.test(n));

  // L_TRAKTDEL obligatoriskt.
  if (!shpNamn.some((n) => /^L_TRAKTDEL\.shp$/i.test(n))) {
    varningar.push('L_TRAKTDEL saknas — sparar ingen geometri (hellre ingen än halv).');
    return { features: [], lager: [], larmpunkt: null, varningar };
  }

  for (const shp of shpNamn) {
    const bas = shp.replace(/\.shp$/i, '');
    const konf = LAGER.find((l) => l.namn.toLowerCase() === bas.toLowerCase());
    const typ = konf?.typ ?? 'okänt';
    if (!konf) {
      varningar.push(`Okänt lagernamn "${bas}" — importeras som typ 'okänt'. Kolla om VIDA lagt till ett lager.`);
    }

    const shpBuf = bilagor.get(shp)!;
    const dbfBuf = bilagor.get(`${bas}.dbf`);
    const cpgBuf = bilagor.get(`${bas}.cpg`);
    if (!dbfBuf) varningar.push(`${bas}: ingen .dbf — attribut (FLBESKR m.m.) saknas.`);
    // Teckenkodning ur .cpg. Gissa aldrig — men om .cpg saknas är UTF-8 minst skadliga default.
    let encoding = 'utf-8';
    if (cpgBuf) encoding = cpgBuf.toString('ascii').trim() || 'utf-8';
    else varningar.push(`${bas}: ingen .cpg — antar utf-8 (bör inte hända).`);

    let raa: any[];
    try {
      raa = await lasLager(shpBuf, dbfBuf, encoding);
    } catch (e: any) {
      varningar.push(`${bas}: kunde inte läsa shapefile (${e?.message ?? e}) — hoppar lagret.`);
      continue;
    }

    for (const f of raa) {
      const geometri = tillWgs84(f.geometry);
      features.push({
        type: 'Feature',
        // TRAKT_ID/FLBESKR/EXTRA_LABE/ANTECKNING m.m. bevaras som attribut. TRAKT_ID är VIDA:s
        // interna id — sparas som data, blir ALDRIG en objektidentitet.
        properties: { ...f.properties, _lager: bas, _typ: typ },
        geometry: geometri,
      });
      if (/^L_TILLAGGSPUNKTER$/i.test(bas) && /larmkoordinat/i.test(String(f.properties?.FLBESKR ?? ''))) {
        const c = geometri?.coordinates;
        if (Array.isArray(c) && typeof c[0] === 'number') larmpunkt = { lat: c[1], lng: c[0] };
      }
    }
    lager.push({ namn: bas, typ, antal: raa.length });
  }

  return { features, lager, larmpunkt, varningar };
}
