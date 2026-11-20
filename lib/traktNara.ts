// Avstånd mellan en geometri (yta, linje, punkt) och TRAKTEN (Vidas L_TRAKTDEL), i meter — EN hjälp för "ligger det här inne i eller nära trakten?".
// Används av Fokus på trakten (lib/fokusTrakt: Vidas, RAÄ:s och Skogsstyrelsens ytor utanför trakten blir svaga) och är tänkt för varje annan "inom 50 m från
// traktgränsen"-regel (fastighetsgränsen, #907: NARA_STYRKA_M = 50), så att siffran 50 och sättet att mäta bara finns på ETT ställe.
//
// Mått: vi räknar i meter i ett lokalt plan (equirectangular kring traktens mitt; fel < 0,1 % på de avstånd det gäller). Avståndet är 0 när geometrin ligger
// helt eller delvis INNE i trakten (en vertex inne, en traktvertex inne i ytan, eller kanter som korsar varandra) och annars kortaste avståndet mellan kanterna.
// Ingen yta delas: en yta som är delvis inne är "inne" som helhet.

/** Inom så här många meter från traktgränsen räknas något som "vid trakten". */
export const NARA_TRAKT_M = 50;

type XY = [number, number];
type Ring = XY[];
type Poly = Ring[];            // [yttre ring, hål …]
interface Box { x0: number; y0: number; x1: number; y1: number }

export interface TraktModell {
  lat0: number;
  kx: number;                  // meter per grad longitud vid lat0
  polygoner: Poly[];
  kanter: { a: XY; b: XY; box: Box }[];
  box: Box;
}

const M_PER_GRAD_LAT = 111320;

const boxAv = (pts: readonly XY[]): Box => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  return { x0, y0, x1, y1 };
};
const boxarNara = (a: Box, b: Box, r: number): boolean => a.x0 - r <= b.x1 && a.x1 + r >= b.x0 && a.y0 - r <= b.y1 && a.y1 + r >= b.y0;
const gilltig = (c: any): c is [number, number] => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]);

/** Polygoner ur en geometri (Polygon eller MultiPolygon) som [lng, lat]-ringar. */
function polygonerUr(g: any): [number, number][][][] {
  if (g?.type === 'Polygon') return [g.coordinates];
  if (g?.type === 'MultiPolygon') return g.coordinates;
  return [];
}

function punktIRing(p: XY, ring: Ring): boolean {
  let inne = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inne = !inne;
  }
  return inne;
}
/** Inne i ytan: i yttre ringen och inte i något hål. */
const punktIPoly = (p: XY, poly: Poly): boolean => !!poly[0] && punktIRing(p, poly[0]) && !poly.slice(1).some((h) => punktIRing(p, h));

function punktSegment(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
const orient = (a: XY, b: XY, c: XY): number => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function segmentSkar(a: XY, b: XY, c: XY, d: XY): boolean {
  const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
  return ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0));
}
function segmentSegment(a: XY, b: XY, c: XY, d: XY): number {
  if (segmentSkar(a, b, c, d)) return 0;
  return Math.min(punktSegment(a, c, d), punktSegment(b, c, d), punktSegment(c, a, b), punktSegment(d, a, b));
}

/** Traktens ytor (L_TRAKTDEL) ur objektets geometri. null när traktgräns saknas — då finns inget att mäta mot. */
export function traktModell(fc: { features?: any[] } | null | undefined): TraktModell | null {
  const ra: [number, number][][][] = [];
  for (const f of fc?.features ?? []) {
    if (f?.properties?._lager !== 'L_TRAKTDEL') continue;
    for (const p of polygonerUr(f.geometry)) if (Array.isArray(p) && p.length) ra.push(p);
  }
  if (!ra.length) return null;
  let sumLat = 0, n = 0;
  for (const p of ra) for (const r of p) for (const c of r) if (gilltig(c)) { sumLat += c[1]; n++; }
  if (!n) return null;
  const lat0 = sumLat / n;
  const kx = M_PER_GRAD_LAT * Math.cos(lat0 * Math.PI / 180);
  const polygoner: Poly[] = ra
    .map((p) => p.map((r) => r.filter(gilltig).map((c): XY => [c[0] * kx, c[1] * M_PER_GRAD_LAT])).filter((r) => r.length >= 3))
    .filter((p) => p.length > 0);
  if (!polygoner.length) return null;
  const kanter: TraktModell['kanter'] = [];
  const alla: XY[] = [];
  for (const p of polygoner) for (const r of p) {
    for (let i = 0; i < r.length; i++) {
      alla.push(r[i]);
      const a = r[i], b = r[(i + 1) % r.length];
      kanter.push({ a, b, box: boxAv([a, b]) });
    }
  }
  return { lat0, kx, polygoner, kanter, box: boxAv(alla) };
}

/**
 * Kortaste avståndet (m) från geometrin till trakten: 0 när något av den ligger inne i trakten, annars avståndet mellan kanterna. Är det längre än `tak`
 * (standard NARA_TRAKT_M) svarar funktionen Infinity — det är allt som behövs för att avgöra "nära" och sparar tid på stora ytor.
 */
export function avstandTillTrakt(geometry: any, m: TraktModell, tak: number = NARA_TRAKT_M): number {
  const proj = (c: [number, number]): XY => [c[0] * m.kx, c[1] * M_PER_GRAD_LAT];
  const punkter: XY[] = [];
  const linjer: XY[][] = [];          // sträckor som kantar geometrin (linjer, ringar)
  const ytor: Poly[] = [];
  const t = geometry?.type;
  if (t === 'Point') { if (gilltig(geometry.coordinates)) punkter.push(proj(geometry.coordinates)); }
  else if (t === 'MultiPoint') { for (const c of geometry.coordinates ?? []) if (gilltig(c)) punkter.push(proj(c)); }
  else if (t === 'LineString') linjer.push((geometry.coordinates ?? []).filter(gilltig).map(proj));
  else if (t === 'MultiLineString') for (const l of geometry.coordinates ?? []) linjer.push((l ?? []).filter(gilltig).map(proj));
  else {
    for (const p of polygonerUr(geometry)) {
      const poly = p.map((r) => (r ?? []).filter(gilltig).map(proj)).filter((r) => r.length >= 3);
      if (poly.length) { ytor.push(poly); for (const r of poly) linjer.push([...r, r[0]]); }
    }
  }
  const alla: XY[] = [...punkter, ...linjer.flat()];
  if (!alla.length) return Infinity;
  const box = boxAv(alla);
  if (!boxarNara(box, m.box, tak)) return Infinity;

  // Inne: en vertex i trakten …
  for (const p of alla) if (m.polygoner.some((poly) => punktIPoly(p, poly))) return 0;
  // … eller trakten (en av dess hörn) inne i ytan (ytan omsluter trakten).
  for (const poly of m.polygoner) for (const hj of poly[0] ?? []) if (ytor.some((y) => punktIPoly(hj, y))) return 0;

  let min = Infinity;
  for (const p of punkter) {
    for (const k of m.kanter) {
      if (!boxarNara({ x0: p[0], y0: p[1], x1: p[0], y1: p[1] }, k.box, tak)) continue;
      min = Math.min(min, punktSegment(p, k.a, k.b));
    }
  }
  for (const l of linjer) {
    for (let i = 0; i + 1 < l.length; i++) {
      const a = l[i], b = l[i + 1];
      const sb = boxAv([a, b]);
      for (const k of m.kanter) {
        if (!boxarNara(sb, k.box, Math.min(tak, min))) continue;
        const d = segmentSegment(a, b, k.a, k.b);
        if (d < min) { min = d; if (min === 0) return 0; }
      }
    }
  }
  return min <= tak ? min : Infinity;
}

/** Ligger geometrin inne i trakten eller inom `radieM` från traktgränsen? */
export const narTrakten = (geometry: any, m: TraktModell, radieM: number = NARA_TRAKT_M): boolean => avstandTillTrakt(geometry, m, radieM) <= radieM;
