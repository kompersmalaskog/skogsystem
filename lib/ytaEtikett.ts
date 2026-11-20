// EN ETIKETT PER YTA, aldrig dubbel eller avklippt (Martin 2026-10-22: en Nyckelbiotop-yta visade "NYCKELBIOTOP" två gånger, den ena avklippt).
//
// Orsaken: etikettlagren lästes direkt ur polygonkällan. MapLibre placerar en polygonetikett per KARTRUTA (tile) och per delpolygon — en yta som går över en rutgräns,
// eller en MultiPolygon med flera delar, får därför en etikett per bit, och med `text-allow-overlap` döljs inget av dem. Lösningen är att etiketten inte är en
// egenskap hos polygonen utan en egen PUNKT: ett enda punktobjekt per yta, i den största delens mest inre punkt. En punkt ligger i exakt en kartruta.
//
// Samma yta kan också levereras som flera features (samma nyckel: Beteckn/LOPNR/lamningsnu): de delar punkt (den största delen vinner).
// Rena funktioner; sidan matar källorna `trakt-etikett-source` (Vidas ytor) och `zones-etikett-source` (egna zoner).

import { ytaNyckel } from './traktGeometri';

type Pos = [number, number];
type Ring = Pos[];
type Poly = Ring[];
type FC = { type: 'FeatureCollection'; features: any[] };

const M = 111320;

const arPos = (c: any): c is Pos => Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number' && Number.isFinite(c[0]) && Number.isFinite(c[1]);
const ring = (r: any): Ring => (Array.isArray(r) ? r.filter(arPos) as Ring : []);

/** Delpolygonerna i en geometri (Polygon eller MultiPolygon), yttre ring först. */
export function delar(g: any): Poly[] {
  if (!g || !Array.isArray(g.coordinates)) return [];
  const polys: any[] = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  return polys.map((p) => (Array.isArray(p) ? p.map(ring).filter((r: Ring) => r.length >= 3) : [])).filter((p: Poly) => p.length > 0);
}

function area(r: Ring, kx: number, ky: number): number {
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += r[j][0] * kx * (r[i][1] * ky) - r[i][0] * kx * (r[j][1] * ky);
  return Math.abs(s / 2);
}

function iRing(x: number, y: number, r: Ring): boolean {
  let inne = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inne = !inne;
  }
  return inne;
}
const iPoly = (x: number, y: number, p: Poly): boolean => iRing(x, y, p[0]) && !p.slice(1).some((h) => iRing(x, y, h));

/** Meter från (x,y) till närmaste kant i polygonen (alla ringar). */
function kantAvstand(x: number, y: number, p: Poly, kx: number, ky: number): number {
  let min = Infinity;
  for (const r of p) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const ax = r[j][0] * kx, ay = r[j][1] * ky, bx = r[i][0] * kx, by = r[i][1] * ky;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x * kx - ax) * dx + (y * ky - ay) * dy) / l2));
      const d = Math.hypot(x * kx - (ax + t * dx), y * ky - (ay + t * dy));
      if (d < min) min = d;
    }
  }
  return min;
}

/** Mest inre punkten: den punkt inne i ytan som ligger längst från kanten (rutnät + förfining). En C-formad yta får punkten i C:t, aldrig i hålet. */
export function inrePunkt(p: Poly): Pos {
  const lat0 = p[0].reduce((s, c) => s + c[1], 0) / p[0].length;
  const kx = M * Math.cos((lat0 * Math.PI) / 180), ky = M;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of p[0]) { if (c[0] < x0) x0 = c[0]; if (c[0] > x1) x1 = c[0]; if (c[1] < y0) y0 = c[1]; if (c[1] > y1) y1 = c[1]; }
  let bast: Pos | null = null, bastD = -1;
  const sok = (ax: number, ay: number, bx: number, by: number, n: number) => {
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      const x = ax + ((bx - ax) * i) / n, y = ay + ((by - ay) * j) / n;
      if (!iPoly(x, y, p)) continue;
      const d = kantAvstand(x, y, p, kx, ky);
      if (d > bastD) { bastD = d; bast = [x, y]; }
    }
  };
  sok(x0, y0, x1, y1, 24);
  if (bast) {                                   // förfina runt den bästa rutan, två varv
    for (let varv = 0; varv < 2; varv++) {
      const [bx, by] = bast as Pos;
      const sx = ((x1 - x0) / 24) / (varv + 1), sy = ((y1 - y0) / 24) / (varv + 1);
      sok(bx - sx, by - sy, bx + sx, by + sy, 12);
    }
    return bast;
  }
  // Mycket tunn yta där inget rutnätspunkt hamnade inne: första hörnet duger som nödlösning.
  return p[0][0];
}

/** Den största delen (yttre ringens yta) av en eller flera geometrier. */
function storsta(geometrier: any[]): Poly | null {
  let bast: Poly | null = null, bastA = -1;
  for (const g of geometrier) {
    for (const p of delar(g)) {
      const lat0 = p[0].reduce((s, c) => s + c[1], 0) / p[0].length;
      const a = area(p[0], M * Math.cos((lat0 * Math.PI) / 180), M);
      if (a > bastA) { bastA = a; bast = p; }
    }
  }
  return bast;
}

const punktFeature = (props: Record<string, any>, p: Pos) => ({ type: 'Feature', properties: { ...props }, geometry: { type: 'Point', coordinates: p } });

/** Vidas ytor som har en etikett (hänsynsyta, nyckelbiotop, fornlämningsyta): EN punkt per yta. Samma yta i flera features (samma nyckel) delar en punkt. */
export function vidaEtikettPunkter(fc: { features?: any[] } | null | undefined): FC {
  const ut: FC = { type: 'FeatureCollection', features: [] };
  const grupper = new Map<string, { props: Record<string, any>; geometrier: any[] }>();
  (fc?.features ?? []).forEach((f, i) => {
    const p = f?.properties;
    if (!p) return;
    const arEtikettyta = p._typ === 'hänsynsyta' || p._lager === 'SV_SKS_NYCKELBIOTOP_101' || p._lager === 'L_RAA_POLY_101';
    if (!arEtikettyta || (f.geometry?.type !== 'Polygon' && f.geometry?.type !== 'MultiPolygon')) return;
    const nyckel = ytaNyckel(p);
    const k = nyckel ? `${p._lager}|${nyckel}` : `${p._lager}|#${i}`;     // utan stabil nyckel kan inget slås ihop: varje feature är sin egen yta
    const g = grupper.get(k);
    if (g) g.geometrier.push(f.geometry); else grupper.set(k, { props: p, geometrier: [f.geometry] });
  });
  for (const { props, geometrier } of grupper.values()) {
    const poly = storsta(geometrier);
    if (poly) ut.features.push(punktFeature(props, inrePunkt(poly)));
  }
  return ut;
}

/** Egna zoner (zones-source): EN punkt per zon, med zonens egenskaper (zoneType m.fl.). */
export function zonEtikettPunkter(features: readonly any[]): FC {
  const ut: FC = { type: 'FeatureCollection', features: [] };
  for (const f of features) {
    if (!f?.properties || (f.geometry?.type !== 'Polygon' && f.geometry?.type !== 'MultiPolygon')) continue;
    const poly = storsta([f.geometry]);
    if (poly) ut.features.push(punktFeature(f.properties, inrePunkt(poly)));
  }
  return ut;
}
