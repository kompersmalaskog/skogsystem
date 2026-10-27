// DET SOM LIGGER LÅNGT UTANFÖR TRAKTEN TONAS NED LÄTT (Martin 2026-10-27: "inne i trakten ska flygfotot synas i full skärpa — utanför lätt nedtonat, ca 25 % mörkare").
//
// Trakten är det man arbetar i, så den ska vara det ljusaste på kartan. Nedtoningen är ETT lager (`trakt-utanfor-ton`): en svart yta med 25 % opacitet över allt som ligger
// MER än 50 m från traktgränsen (samma 50 m som Fokus på trakten, lib/traktNara). Inne i trakten och i en 50 m bred kant runt den ritas ingenting, så flygfotot syns i full
// skärpa där. Vägar och hus utanför syns fortfarande — 25 % svart släcker inget. Saknas traktgräns (Vidas L_TRAKTDEL) finns ingen yta och därmed ingen nedtoning.
//
// Hur: ytan är hela världen med ett hål där trakten + 50 m ligger. Hålet räknas i ett rutnät i meter (inne i trakten eller inom 50 m från en kant) och dras sedan upp som en
// kontur med marching squares — det är en exakt "buffert" utan polygonbibliotek (appen har inget). Noggrannheten är rutnätets (≈ 2–3 m), vilket syns inte i en 25-procentig
// nedtoning. Ren logik (ingen karta, ingen canvas): testas i node.
import { FARG } from './design/tokens';
import { NARA_TRAKT_M } from './traktNara';

/** Svart, genomskinlig: nedtoning är mörkare, aldrig en annan färg. */
export const UTANFOR_TON_FARG = FARG.bg;
/** Så mycket mörkare blir det utanför: 25 %. */
export const UTANFOR_TON_OPACITET = 0.25;
/** Avståndet från traktgränsen där nedtoningen börjar (samma som Fokus på trakten). */
export const UTANFOR_TON_AVSTAND_M = NARA_TRAKT_M;
export const UTANFOR_TON_LAGER = 'trakt-utanfor-ton';
export const UTANFOR_TON_KALLA = 'trakt-utanfor-ton-source';

type LL = number[];
type XY = [number, number];
export type TonPolygon = LL[][];   // [yttre ring, hål …] i [lng, lat]

export interface TonYta { type: 'FeatureCollection'; features: Array<{ type: 'Feature'; properties: Record<string, never>; geometry: { type: 'MultiPolygon'; coordinates: LL[][][] } }> }
export const INGEN_TON: TonYta = { type: 'FeatureCollection', features: [] };

const M_PER_GRAD = 111320;
const arPar = (c: unknown): c is LL => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]);

/** Traktens polygoner (Vidas L_TRAKTDEL) ur objektets geometri. Samma urval som Fokus på trakten och traktGrans. */
export function traktPolygoner(fc: { features?: any[] } | null | undefined): TonPolygon[] {
  const ut: TonPolygon[] = [];
  for (const f of fc?.features ?? []) {
    if (f?.properties?._lager !== 'L_TRAKTDEL') continue;
    const g = f.geometry;
    const polys: unknown[] = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
    for (const p of polys) {
      if (!Array.isArray(p)) continue;
      const ringar = p.filter((r: unknown) => Array.isArray(r) && r.length >= 4 && (r as unknown[]).every(arPar)) as LL[][];
      if (ringar.length > 0) ut.push(ringar);
    }
  }
  return ut;
}

const signeradArea = (r: XY[]): number => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] * r[i][1]) - (r[i][0] * r[j][1]); return a / 2; };
function punktIRing(p: XY, r: XY[]): boolean {
  let inne = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if ((r[i][1] > p[1]) !== (r[j][1] > p[1]) && p[0] < ((r[j][0] - r[i][0]) * (p[1] - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) inne = !inne;
  }
  return inne;
}

/** Douglas–Peucker på en sluten ring (första = sista punkten); behåller alltid ringens ändpunkt. */
function forenkla(r: XY[], tol: number): XY[] {
  if (r.length <= 4) return r;
  const open = r.slice(0, -1);
  const keep = new Uint8Array(open.length);
  keep[0] = 1; keep[open.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, open.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maxD = 0, idx = -1;
    const [ax, ay] = open[a], [bx, by] = open[b];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const t = l2 ? Math.max(0, Math.min(1, ((open[i][0] - ax) * dx + (open[i][1] - ay) * dy) / l2)) : 0;
      const d = Math.hypot(open[i][0] - (ax + t * dx), open[i][1] - (ay + t * dy));
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  const ut = open.filter((_, i) => keep[i]);
  ut.push([ut[0][0], ut[0][1]]);
  return ut;
}

/**
 * Nedtoningens yta: hela världen minus (trakten + 50 m), som ett MultiPolygon-lager. Inget traktgräns → INGEN_TON (ingen nedtoning, lagret göms).
 * `avstandM` finns bara så testet kan prova andra avstånd; appen använder alltid UTANFOR_TON_AVSTAND_M.
 */
export function byggTonYta(polygoner: readonly TonPolygon[], avstandM: number = UTANFOR_TON_AVSTAND_M): TonYta {
  const alla = polygoner.filter((p) => p.length > 0 && p[0].length >= 4);
  if (alla.length === 0) return INGEN_TON;
  // lokalt plan i meter kring traktens mitt
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const p of alla) for (const r of p) for (const [lo, la] of r) { if (lo < minLng) minLng = lo; if (lo > maxLng) maxLng = lo; if (la < minLat) minLat = la; if (la > maxLat) maxLat = la; }
  const lat0 = (minLat + maxLat) / 2, lng0 = (minLng + maxLng) / 2;
  const kx = M_PER_GRAD * Math.cos((lat0 * Math.PI) / 180), ky = M_PER_GRAD;
  const tillM = (r: LL[]): XY[] => r.map(([lo, la]) => [(lo - lng0) * kx, (la - lat0) * ky]);
  const poly: XY[][][] = alla.map((p) => p.map(tillM));
  const x0 = (minLng - lng0) * kx - avstandM - 8, x1 = (maxLng - lng0) * kx + avstandM + 8, y0 = (minLat - lat0) * ky - avstandM - 8, y1 = (maxLat - lat0) * ky + avstandM + 8;
  const cell = Math.max(2, Math.max(x1 - x0, y1 - y0) / 700);
  const nx = Math.ceil((x1 - x0) / cell) + 2, ny = Math.ceil((y1 - y0) / cell) + 2;   // +2: en tom ram runt så konturerna alltid blir slutna
  const gx = (i: number) => x0 + (i - 1 + 0.5) * cell, gy = (j: number) => y0 + (j - 1 + 0.5) * cell;
  const klar = new Uint8Array(nx * ny);   // 1 = inne i trakten eller inom avståndet från en kant

  // 1) inne i trakten: scanline, jämna/udda över ALLA ringar i polygonen (hål blir tomma)
  for (const p of poly) {
    for (let j = 1; j < ny - 1; j++) {
      const y = gy(j); const xs: number[] = [];
      for (const r of p) for (let a = 0, b = r.length - 1; a < r.length; b = a++) {
        const [ax, ay] = r[b], [bx, by] = r[a];
        if ((ay > y) !== (by > y)) xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
      }
      xs.sort((u, v) => u - v);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const i0 = Math.max(1, Math.ceil((xs[k] - x0) / cell + 0.5)), i1 = Math.min(nx - 2, Math.floor((xs[k + 1] - x0) / cell + 0.5));
        for (let i = i0; i <= i1; i++) klar[j * nx + i] = 1;
      }
    }
    // 2) inom avståndet från varje kant (både yttre ringar och hål)
    for (const r of p) for (let a = 0, b = r.length - 1; a < r.length; b = a++) {
      const [ax, ay] = r[b], [bx, by] = r[a];
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const i0 = Math.max(1, Math.floor((Math.min(ax, bx) - avstandM - x0) / cell)), i1 = Math.min(nx - 2, Math.ceil((Math.max(ax, bx) + avstandM - x0) / cell) + 1);
      const j0 = Math.max(1, Math.floor((Math.min(ay, by) - avstandM - y0) / cell)), j1 = Math.min(ny - 2, Math.ceil((Math.max(ay, by) + avstandM - y0) / cell) + 1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        if (klar[j * nx + i]) continue;
        const x = gx(i), y = gy(j);
        const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
        if (Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= avstandM) klar[j * nx + i] = 1;
      }
    }
  }

  // 3) marching squares: konturen mellan "klar" och "inte klar" som slutna ringar (kantmittpunkter)
  const v = (i: number, j: number) => klar[j * nx + i];
  const mitt = (id: string): XY => {   // id: h:i,j (mellan (i,j) och (i+1,j))  eller v:i,j (mellan (i,j) och (i,j+1))
    const t = id[0], [i, j] = id.slice(2).split(',').map(Number);
    return t === 'h' ? [(gx(i) + gx(i + 1)) / 2, gy(j)] : [gx(i), (gy(j) + gy(j + 1)) / 2];
  };
  const grannar = new Map<string, string[]>();
  const kant = (a: string, b: string) => { (grannar.get(a) ?? grannar.set(a, []).get(a)!).push(b); (grannar.get(b) ?? grannar.set(b, []).get(b)!).push(a); };
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const tl = v(i, j), tr = v(i + 1, j), br = v(i + 1, j + 1), bl = v(i, j + 1);
    const fall = (tl << 3) | (tr << 2) | (br << 1) | bl;
    if (fall === 0 || fall === 15) continue;
    const top = `h:${i},${j}`, bottom = `h:${i},${j + 1}`, left = `v:${i},${j}`, right = `v:${i + 1},${j}`;
    switch (fall) {
      case 1: case 14: kant(left, bottom); break;
      case 2: case 13: kant(bottom, right); break;
      case 3: case 12: kant(left, right); break;
      case 4: case 11: kant(top, right); break;
      case 6: case 9: kant(top, bottom); break;
      case 7: case 8: kant(left, top); break;
      case 5: kant(left, top); kant(bottom, right); break;      // tl och br klara (diagonal): hålls isär
      case 10: kant(top, right); kant(left, bottom); break;     // tr och bl klara
    }
  }
  const besokt = new Set<string>();
  const ringar: XY[][] = [];
  for (const start of grannar.keys()) {
    if (besokt.has(start)) continue;
    const kedja: string[] = [start]; besokt.add(start);
    let prev = '', cur = start;
    for (;;) {
      const g = grannar.get(cur)!;
      const nasta = g.find((x) => x !== prev && !besokt.has(x)) ?? g.find((x) => x !== prev && x === start && kedja.length > 2);
      if (!nasta || nasta === start) break;
      besokt.add(nasta); kedja.push(nasta); prev = cur; cur = nasta;
    }
    if (kedja.length < 4) continue;
    const r = kedja.map(mitt); r.push([r[0][0], r[0][1]]);
    ringar.push(forenkla(r, Math.max(0.6, cell / 3)));
  }
  if (ringar.length === 0) return INGEN_TON;

  // 4) kontur → yta. Djup = antal ringar som innesluter ringen: jämnt djup = yttre kant på det klara området (ett HÅL i nedtoningen),
  //    udda djup = ett hål i det klara området (nedtoning finns kvar där, en egen polygon). Resten följer av nästling.
  const arean = ringar.map((r) => Math.abs(signeradArea(r)));
  const forald = ringar.map((r, i) => {
    let bast = -1;
    for (let k = 0; k < ringar.length; k++) if (k !== i && arean[k] > arean[i] && punktIRing(r[0], ringar[k]) && (bast < 0 || arean[k] < arean[bast])) bast = k;
    return bast;
  });
  const djup = (i: number): number => (forald[i] < 0 ? 0 : 1 + djup(forald[i]));
  const tillLL = (r: XY[]): LL[] => r.map(([x, y]) => [lng0 + x / kx, lat0 + y / ky] as LL);
  const varld: LL[] = [[lng0 - 1.5, lat0 - 1], [lng0 + 1.5, lat0 - 1], [lng0 + 1.5, lat0 + 1], [lng0 - 1.5, lat0 + 1], [lng0 - 1.5, lat0 - 1]];
  const polygoner2: LL[][][] = [];
  const yttre: LL[][] = [varld];
  const poly2 = new Map<number, LL[][]>();   // ringindex (udda djup) → polygon [yttre, hål …]
  ringar.forEach((r, i) => {
    const d = djup(i);
    if (d === 0) yttre.push(tillLL(r));                  // hål i världen
    else if (d % 2 === 1) poly2.set(i, [tillLL(r)]);      // ny nedtonad polygon inuti ett klart område
    else { const f = forald[i]; poly2.get(f)?.push(tillLL(r)); }   // klart område inuti en sådan polygon = hål i den
  });
  polygoner2.push(yttre, ...poly2.values());
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: polygoner2 } }] };
}

/** Ligger punkten i nedtoningen (alltså i någon av polygonerna och inte i dess hål)? Används av testet. */
export function arNedtonad(yta: TonYta, lng: number, lat: number): boolean {
  for (const f of yta.features) for (const poly of f.geometry.coordinates) {
    const [yttre, ...hal] = poly;
    if (punktIRing([lng, lat], yttre as XY[]) && !hal.some((h) => punktIRing([lng, lat], h as XY[]))) return true;
  }
  return false;
}
