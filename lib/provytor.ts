// Slumpade provytor inuti traktgransen.
//
// VARFOR INTE kartbild_bounds: rektangeln ar kartbildens utsnitt, inte trakten.
// Uppmatt 2026-08-21: Hossjomala 4172 x 1511 m = 630 ha for en trakt pa 31,7 ha,
// Steglehylte 3015 x 1236 m = 373 ha for 18,2 ha. Trakten ar 5 % av rutan i
// bada fallen, sa nitton av tjugo likformigt dragna ytor hade hamnat utanfor -
// i grannens skog, pa vagar, i vatten. Bounds anvands DARFOR bara for att
// harleda origo (kartOrigoFranBounds), aldrig for att lotta i.
//
// Traktgransen ligger som boundary-markeringar i planering_markeringar. Summan
// av deras polygonarea landade inom nagra procent av objekt.areal (33,6 mot
// 31,7 och 17,5 mot 18,2) - ett oberoende kvitto pa bade att granserna ar
// trakten och att koordinatkonverteringen raknar ratt.
//
// METRISK RYMD: markeringarnas x/y ar skarmpixlar, och skalan (meter per pixel)
// ar konstant for ett objekt. Multiplicerar vi in den ar rymden metrisk, och da
// blir 30 m mellan ytor och 20 m in fran kanten enkla avstand i samma rymd.

import { svgToLatLon, type Origo, type LatLng } from './kartkoordinater';

export type { LatLng };

/** 100 kvadratmeter. */
export const PROVYTA_RADIE_M = 5.64;
/** Narmare kanten an sa hamnar halva ytan utanfor trakten. */
const MIN_FRAN_KANT_M = 20;
/** Tva ytor narmare varandra an sa matter i praktiken samma bestand. */
const MIN_MELLAN_YTOR_M = 30;

/**
 * MAX AVSTAND TILL NARMASTE AVVERKADE STAM. Andra inte utan att lasa detta.
 *
 * Traktgransen ar PLANEN. Den avverkade ytan ar ofta mindre - hornen togs
 * aldrig, en del kordes inte. En yta som lottas i planen men hamnar i ett
 * oavverkat horn gar inte att bedoma; det hande i falt och ar felet den har
 * troskeln finns for.
 *
 * TIO METER, av fyra skal som pekar at samma hall:
 *
 * 1. Kurvan knacker dar. Monte Carlo med 600 dragningar per objekt, filtrerade
 *    till punkter INUTI traktgransen, andel med avverkad stam inom X meter:
 *        5 m:  64 % / 60 %      (Hossjomala / Steglehylte)
 *       10 m:  94 % / 86 %
 *       15 m:  96 % / 95 %
 *       20 m:  97 % / 95 %
 *    Fran 5 till 10 vinner vi 30 respektive 26 procentenheter. Fran 10 till 15
 *    bara 2 och 9. Bortom 10 m kops nastan ingen akta bestandsyta - daremot
 *    slapps hornen tillbaka in.
 *
 * 2. Det ar ungefar tva gangar stamavstandet. Hossjomala har 387 stammar/ha och
 *    Steglehylte 463, vilket ger ett teoretiskt medelavstand pa 5,1 och 4,6 m.
 *    Vid 5 m troskel forkastas en tredjedel av verkligt avverkad mark bara for
 *    att stammarna star glest just dar.
 *
 * 3. Det stammer med ytans egen storlek. Provytan har radien 5,64 m, sa 10 m
 *    betyder att narmaste avverkade stam ligger inom ungefar tva ytradier -
 *    ytan star pa eller intill avverkad mark, inte i en glanta.
 *
 * 4. Den avvisar en trovardig andel: 6 % av Hossjomalas och 14 % av
 *    Steglehyltes planerade yta. Det ar storleksordningen "hornen togs aldrig".
 */
export const MAX_AVSTAND_TILL_STAM_M = 10;
/** Slumpdragningar per yta innan vi ger upp pa ett skifte. */
const MAX_FORSOK = 400;

export type Punkt = { x: number; y: number };
/** Polygon i METER, inte pixlar. */
type Polygon = Punkt[];

/** Meter per pixel for objektets origo. Samma formel som svgToLatLon. */
export function meterPerPixel(origo: Origo): number {
  return (156543.03392 * Math.cos((origo.lat * Math.PI) / 180)) / Math.pow(2, origo.zoom);
}

/** SVG-path -> metrisk polygon. y inverteras: skarmens y vaxer nedat. */
export function tillMetriskPolygon(path: { x?: number | null; y?: number | null }[], mpp: number): Polygon {
  return path
    .filter((p) => p && p.x != null && p.y != null)
    .map((p) => ({ x: (p.x as number) * mpp, y: -(p.y as number) * mpp }));
}

/** Shoelace. Absolutbelopp - riktningen pa ritningen spelar ingen roll. */
export function polygonArea(p: Polygon): number {
  if (p.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Ray casting. Polygonen sluts implicit mellan sista och forsta punkten. */
export function inuti(pt: Punkt, poly: Polygon): boolean {
  let inne = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > pt.y) !== (b.y > pt.y) &&
        pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) {
      inne = !inne;
    }
  }
  return inne;
}

/** Kortaste avstand fran punkt till polygonens kant. */
export function avstandTillKant(pt: Punkt, poly: Polygon): number {
  let min = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    min = Math.min(min, avstandTillSegment(pt, poly[j], poly[i]));
  }
  return min;
}

function avstandTillSegment(p: Punkt, a: Punkt, b: Punkt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const langd2 = dx * dx + dy * dy;
  if (langd2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / langd2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Fordelar N ytor over skiftena proportionellt mot area, storsta rest.
 *
 * Utan detta far ett skifte pa 0,8 ha lika manga ytor som ett pa 24,3.
 * Varje skifte som ryms far minst en yta sa inget skifte blir helt obesokt -
 * men bara sa lange det finns ytor kvar att dela ut.
 */
export function fordelaPerSkifte(areor: number[], antal: number): number[] {
  const total = areor.reduce((a, b) => a + b, 0);
  if (total <= 0 || antal <= 0) return areor.map(() => 0);

  const exakt = areor.map((a) => (a / total) * antal);
  const ut = exakt.map((v) => Math.floor(v));
  let kvar = antal - ut.reduce((a, b) => a + b, 0);

  // Storsta rest far de kvarvarande.
  const rest = exakt
    .map((v, i) => ({ i, r: v - Math.floor(v) }))
    .sort((a, b) => b.r - a.r);
  for (const { i } of rest) {
    if (kvar <= 0) break;
    ut[i]++; kvar--;
  }
  return ut;
}

/** WGS84 -> samma metriska rymd som polygonerna. Invers av svgToLatLon x mpp. */
function latLngTillMetrisk(p: LatLng, c: Origo, mpp: number): Punkt {
  void mpp; // rymden ar redan meter - mpp behovs bara for SVG-hallet
  return {
    x: (p.lng - c.lng) * 111320 * Math.cos((c.lat * Math.PI) / 180),
    y: (p.lat - c.lat) * 111320,
  };
}

export type LottadYta = { nummer: number; lat: number; lng: number };

/**
 * Lottar ytornas lagen. Tom lista = gick inte att lagga ut (ingen traktgrans,
 * eller inga giltiga lagen) - anroparen ska da saga det rakt ut, inte visa
 * en tom karta utan forklaring.
 *
 * LOTTAS EN GANG, vid start. Det far inte finnas nagon vag att lotta om:
 * kan man trycka tills lagena passar ar slumpen borta, och da mater man sin
 * egen kansla i stallet for trakten.
 */
export function lottaProvytor(
  boundaryPaths: { x?: number | null; y?: number | null }[][],
  origo: Origo,
  antal: number,
  /**
   * Avverkade stammar i WGS84. Tom lista = ingen stamkontroll; da lottas det
   * enbart innanfor traktgransen och vyn ska saga att lagena inte kunnat
   * kontrolleras mot avverkad yta.
   */
  stammar: LatLng[] = [],
): LottadYta[] {
  const mpp = meterPerPixel(origo);
  const skiften = boundaryPaths
    .map((p) => tillMetriskPolygon(p, mpp))
    .filter((p) => p.length >= 3)
    .map((p) => ({ poly: p, area: polygonArea(p) }))
    // Ett skifte som inte rymmer en yta med 20 m marginal ar inte lottbart.
    .filter((s) => s.area > Math.PI * MIN_FRAN_KANT_M * MIN_FRAN_KANT_M)
    .sort((a, b) => b.area - a.area);

  if (skiften.length === 0) return [];

  const per = fordelaPerSkifte(skiften.map((s) => s.area), antal);
  const lagda: Punkt[] = [];
  const ut: LottadYta[] = [];

  // Stammarna i SAMMA metriska rymd som polygonerna, sa narhetsprovet blir en
  // vanlig avstandsjamforelse. Rutnat med 10 m-celler: utan det blir provet
  // 12 000 stammar x 400 forsok x 7 ytor och lottningen tar sekunder.
  const rutor = new Map<string, Punkt[]>();
  const cell = MAX_AVSTAND_TILL_STAM_M;
  for (const st of stammar) {
    const m = latLngTillMetrisk(st, origo, mpp);
    const nyckel = `${Math.floor(m.x / cell)}:${Math.floor(m.y / cell)}`;
    const lista = rutor.get(nyckel);
    if (lista) lista.push(m); else rutor.set(nyckel, [m]);
  }
  const harStamNara = (p: Punkt): boolean => {
    if (stammar.length === 0) return true; // ingen stamkontroll - se doc ovan
    const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const st of rutor.get(`${cx + dx}:${cy + dy}`) ?? []) {
          if (Math.hypot(st.x - p.x, st.y - p.y) <= MAX_AVSTAND_TILL_STAM_M) return true;
        }
      }
    }
    return false;
  };

  for (let s = 0; s < skiften.length; s++) {
    const { poly } = skiften[s];
    const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);

    for (let n = 0; n < per[s]; n++) {
      let hittad: Punkt | null = null;
      for (let forsok = 0; forsok < MAX_FORSOK && !hittad; forsok++) {
        const kandidat = {
          x: minX + Math.random() * (maxX - minX),
          y: minY + Math.random() * (maxY - minY),
        };
        if (!inuti(kandidat, poly)) continue;
        if (avstandTillKant(kandidat, poly) < MIN_FRAN_KANT_M) continue;
        if (lagda.some((l) => Math.hypot(l.x - kandidat.x, l.y - kandidat.y) < MIN_MELLAN_YTOR_M)) continue;
        // Traktgransen ar planen; stammarna ar vad som faktiskt togs.
        if (!harStamNara(kandidat)) continue;
        hittad = kandidat;
      }
      // Ingen giltig plats pa detta skifte - hoppa over i stallet for att
      // slappa pa kraven. Farre ytor ar arligare an ytor pa fel plats.
      if (!hittad) break;
      lagda.push(hittad);
      const geo: LatLng = svgToLatLon(hittad.x / mpp, -hittad.y / mpp, origo);
      ut.push({ nummer: ut.length + 1, lat: geo.lat, lng: geo.lng });
    }
  }
  return ut;
}

// ---------------------------------------------------------------------------
// Att hitta till ytan
// ---------------------------------------------------------------------------

/** Meter mellan tva WGS84-punkter. */
export function avstandM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const KOMPASS = ['N', 'NO', 'O', 'SO', 'S', 'SV', 'V', 'NV'];

/** Kompassriktning fran a till b, i ord. Texten bar - inte bara en pil. */
export function riktning(a: LatLng, b: LatLng): string {
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180, lat2 = (b.lat * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const grader = (Math.atan2(y, x) * 180) / Math.PI;
  return KOMPASS[Math.round(((grader + 360) % 360) / 45) % 8];
}

/** Skadeandel i procent. RAKNAS, lagras aldrig - en lagrad andel kan glida. */
export function skadeandel(frisk: number | null, skadad: number | null): number | null {
  const f = frisk ?? 0, s = skadad ?? 0;
  if (f + s === 0) return null;
  return Math.round((s / (f + s)) * 100);
}
