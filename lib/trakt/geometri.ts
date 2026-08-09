import * as shapefile from 'shapefile';
import proj4 from 'proj4';
import { XMLParser } from 'fast-xml-parser';

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

// === VIDA:s färger ur OGI:s formatdefinitioner ===
// FormatColor är Delphi TColor (0x00BBGGRR), INTE RGB: r=v&255, g=(v>>8)&255, b=(v>>16)&255.
// (Läser man som RGB blir basvägen blå i stället för röd.) En TYP kan ha FLERA defs — en per
// geometrityp: FormatFillStyle => yta, FormatLineStyle (utan fill) => linje, FormatFont/övrigt
// => symbol/punkt. Vi lagrar färg per (FormatID, geometrityp) så featuren kan matchas mot RÄTT
// def utifrån sin egen geometri — aldrig en annan geometrityps färg.
const _fmtParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', removeNSPrefix: true, parseTagValue: false, trimValues: true });
const _fmtText = (v: any): string | undefined => (v == null ? undefined : typeof v === 'object' ? v['#text'] : v);
function tColorTillRgb(v: string): string {
  const n = parseInt(v, 10);
  return `rgb(${n & 255},${(n >> 8) & 255},${(n >> 16) & 255})`;
}
type FargPerTyp = { area?: string; line?: string; symbol?: string };
function parseFormatFarger(ogiXml: string): Map<string, FargPerTyp> {
  const karta = new Map<string, FargPerTyp>();
  let ogi: any;
  try { ogi = _fmtParser.parse(ogiXml); } catch { return karta; }
  const defs: any[] = [];
  (function walk(o: any) {
    if (o && typeof o === 'object') {
      if (o.FormatID != null && o.FormatColor != null) defs.push(o);
      for (const k of Object.keys(o)) walk(o[k]);
    }
  })(ogi);
  for (const d of defs) {
    const id = String(_fmtText(d.FormatID) ?? '').trim();
    const fargRaw = _fmtText(d.FormatColor);
    if (!id || fargRaw == null) continue;
    const styleTyp: keyof FargPerTyp =
      d.FormatFillStyle != null ? 'area'
      : d.FormatLineStyle != null ? 'line'
      : 'symbol'; // FormatFont eller enbart FormatColor (punkt)
    const rad = karta.get(id) ?? {};
    if (rad[styleTyp] == null) rad[styleTyp] = tColorTillRgb(String(fargRaw)); // första vinner
    karta.set(id, rad);
  }
  return karta;
}

export async function packaGeometri(bilagor: Map<string, Buffer>, ogiXml?: string | null): Promise<GeoResultat> {
  const varningar: string[] = [];
  const features: any[] = [];
  const lager: GeoLager[] = [];
  let larmpunkt: { lat: number; lng: number } | null = null;
  const farger = ogiXml ? parseFormatFarger(ogiXml) : null;
  const varnadeFarg = new Set<string>(); // dedupa "saknar färg-def"-varningar per (TYP, geometrityp)

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
      // TRAKT_ID/FLBESKR/EXTRA_LABE/ANTECKNING m.m. bevaras som attribut. TRAKT_ID är VIDA:s
      // interna id — sparas som data, blir ALDRIG en objektidentitet.
      const props: any = { ...f.properties, _lager: bas, _typ: typ };
      // VIDA:s egen färg (_farg) via TYP -> FormatID, matchad mot featurens GEOMETRITYP (generell
      // regel: yta->fill-def, linje->line-def, punkt->symbol/color-def). Saknar TYP:en en def för
      // sin geometrityp använder vi INTE en annan defs färg — featuren går utan _farg (vyn faller
      // tillbaka på appens egna färger) och vi loggar det. Fel färg är sämre än ingen färg.
      if (farger) {
        const gt = String(geometri?.type || '');
        const styleTyp: keyof FargPerTyp | null = /Polygon/i.test(gt) ? 'area' : /LineString/i.test(gt) ? 'line' : /Point/i.test(gt) ? 'symbol' : null;
        const fid = props.TYP != null && String(props.TYP).trim() !== '' ? String(props.TYP).trim() : null;
        if (fid && styleTyp) {
          const farg = farger.get(fid)?.[styleTyp];
          if (farg) props._farg = farg;
          else {
            const nyckel = `${fid}:${styleTyp}`;
            if (!varnadeFarg.has(nyckel)) {
              varnadeFarg.add(nyckel);
              varningar.push(`TYP ${fid} (${props.FLBESKR ?? '?'}) saknar färg-def för ${styleTyp} — appens egen färg används.`);
            }
          }
        }
      }
      features.push({ type: 'Feature', properties: props, geometry: geometri });
      if (/^L_TILLAGGSPUNKTER$/i.test(bas) && /larmkoordinat/i.test(String(f.properties?.FLBESKR ?? ''))) {
        const c = geometri?.coordinates;
        if (Array.isArray(c) && typeof c[0] === 'number') larmpunkt = { lat: c[1], lng: c[0] };
      }
    }
    lager.push({ namn: bas, typ, antal: raa.length });
  }

  return { features, lager, larmpunkt, varningar };
}
