// RITAD — MARKEN SOM DEN ÄR (Martin 2026-10-31: "skulle man kunna få till bättre hur det ser ut i verkligheten som lutning på marken").
//
// Ur Lantmäteriets markhöjdmodell (1 m, läst i HOJD_RUTA_M-rutor av app/api/ritad-karta/hojd/route.ts) ritas två saker:
//   • HÖJDKURVOR som på orienteringskartan: tunna bruna linjer var KURVA_M:e meter, var 5:e kurva lite tjockare. Täta kurvor = brant, glesa = flackt.
//     Inga siffror på kurvorna (fast text på kartan är bara ytnamn och avläggsnummer).
//   • SKUGGNING FRÅN FLERA HÅLL: ljus från fyra riktningar (USGS "multidirectional oblique"), så både sluttningar åt norr och söder, diken och
//     åsar syns — en enda sol gör sluttningar mot solen platta. Platt mark = 128 (neutral i soft-light i lib/ritadKarta/bygg.ts).
//
// Rena funktioner (inget nät, ingen canvas). Rutnätet: rad 0 = norr, SWEREF99 TM, NaN = ingen data.

import { tillLngLat } from './skog';

/** Höjdrutnätets ruta (m). 2 m räcker för både kurvor och skuggning och håller ett 4 km-utsnitt på 2 000 × 2 000. */
export const HOJD_RUTA_M = 2;
/** Avstånd mellan höjdkurvorna (m). */
export const KURVA_M = 5;
/** Var N:e kurva är en stödkurva (tjockare). 5 × 5 m = 25 m. */
export const STODKURVA_VAR = 5;
/** Utjämning före kurvorna (rutor, gauss-sigma). 1 m-modellen har sten, stubbar och diken — utan utjämning blir kurvorna taggiga. */
export const KURVA_UTJAMNING = 2;
/** Lätt utjämning före skuggningen (rutor): stenar och stubbar blir annars ett sandpapper över hela kartan. */
export const SKUGGA_UTJAMNING = 1;
/** Förenkling av kurvorna (m). */
export const KURVA_FORENKLA_M = 1.5;
/** Kortare kurvor än så här (m) ritas inte: en sten eller en grop är ingen terräng. */
export const KURVA_MIN_M = 40;

export type Hojd = { minX: number; maxY: number; bredd: number; hojd: number; rutaM: number; z: Float32Array };

/** Gaussisk utjämning (separabel). NaN räknas inte in — en lucka i datan sprider sig inte. */
export function jamna(z: Float32Array, bredd: number, hojd: number, sigma: number): Float32Array {
  if (sigma <= 0) return Float32Array.from(z);
  const r = Math.ceil(sigma * 2.5);
  const k: number[] = [];
  for (let i = -r; i <= r; i++) k.push(Math.exp(-(i * i) / (2 * sigma * sigma)));
  const pass = (inn: Float32Array, horisontell: boolean) => {
    const ut = new Float32Array(inn.length);
    for (let y = 0; y < hojd; y++) for (let x = 0; x < bredd; x++) {
      const i = y * bredd + x;
      if (!Number.isFinite(inn[i])) { ut[i] = NaN; continue; }
      let s = 0, w = 0;
      for (let d = -r; d <= r; d++) {
        const xx = horisontell ? x + d : x, yy = horisontell ? y : y + d;
        if (xx < 0 || yy < 0 || xx >= bredd || yy >= hojd) continue;
        const v = inn[yy * bredd + xx];
        if (!Number.isFinite(v)) continue;
        s += v * k[d + r]; w += k[d + r];
      }
      ut[i] = w > 0 ? s / w : NaN;
    }
    return ut;
  };
  return pass(pass(z, true), false);
}

/** Ljusets riktningar (grader från norr) och vikter: nordväst starkast, som en vanlig karta, men tre till fyller i skuggorna. */
export const LJUS_RIKTNINGAR: readonly [number, number][] = [[225, 0.5], [270, 1], [315, 1.5], [360, 1]];
/** Solhöjd (grader). */
export const LJUS_HOJD = 45;
/** Hur mycket skuggningen överdrivs (småländsk terräng är flack). */
export const SKUGGA_OVERDRIFT = 2;

/**
 * Skuggning från flera håll: 0–255 per ruta, platt mark = 128. Rutor utan data = 128 (ingen skugga). Rad 0 = norr.
 */
export function skuggaFlera(h: Pick<Hojd, 'bredd' | 'hojd' | 'rutaM' | 'z'>, overdrift = SKUGGA_OVERDRIFT): Uint8ClampedArray {
  const { bredd, hojd, rutaM, z } = h;
  const ut = new Uint8ClampedArray(bredd * hojd).fill(128);
  const zen = ((90 - LJUS_HOJD) * Math.PI) / 180;
  const platt = Math.cos(zen);
  const vikt = LJUS_RIKTNINGAR.reduce((s, [, w]) => s + w, 0);
  const v = (x: number, y: number) => z[Math.min(hojd - 1, Math.max(0, y)) * bredd + Math.min(bredd - 1, Math.max(0, x))];
  for (let y = 0; y < hojd; y++) for (let x = 0; x < bredd; x++) {
    const c = z[y * bredd + x];
    if (!Number.isFinite(c)) continue;
    const g = (xx: number, yy: number) => { const t = v(xx, yy); return Number.isFinite(t) ? t : c; };
    // Horns metod: dz/dx österut, dz/dy NORRUT (rad 0 = norr, så norr är y − 1).
    const dzdx = ((g(x + 1, y - 1) + 2 * g(x + 1, y) + g(x + 1, y + 1)) - (g(x - 1, y - 1) + 2 * g(x - 1, y) + g(x - 1, y + 1))) / (8 * rutaM) * overdrift;
    const dzdy = ((g(x - 1, y - 1) + 2 * g(x, y - 1) + g(x + 1, y - 1)) - (g(x - 1, y + 1) + 2 * g(x, y + 1) + g(x + 1, y + 1))) / (8 * rutaM) * overdrift;
    const lutning = Math.atan(Math.hypot(dzdx, dzdy));
    const aspekt = Math.atan2(-dzdx, -dzdy); // riktningen nedför, radianer från norr medurs
    let s = 0;
    for (const [az, w] of LJUS_RIKTNINGAR) {
      const a = (az * Math.PI) / 180;
      s += w * Math.max(0, Math.cos(zen) * Math.cos(lutning) + Math.sin(zen) * Math.sin(lutning) * Math.cos(a - aspekt));
    }
    ut[y * bredd + x] = Math.round(128 + ((s / vikt) - platt) * 255);
  }
  return ut;
}

type XY = [number, number];

/**
 * Höjdkurvor med marching squares på ett (utjämnat) rutnät. Kurvan går genom rutornas MITT-punkter, i rutnätets koordinater (kolumn, rad).
 * Ut: polylinjer per nivå, segmenten ihopfogade till sammanhängande linjer.
 */
export function kurvlinjer(z: Float32Array, bredd: number, hojd: number, niva: number): XY[][] {
  const segment: [XY, XY][] = [];
  const kant = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): XY => {
    const t = (niva - z0) / (z1 - z0);
    return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
  };
  for (let y = 0; y < hojd - 1; y++) for (let x = 0; x < bredd - 1; x++) {
    const a = z[y * bredd + x], b = z[y * bredd + x + 1], c = z[(y + 1) * bredd + x + 1], d = z[(y + 1) * bredd + x];
    if (!(Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && Number.isFinite(d))) continue;
    const fall = (a >= niva ? 8 : 0) | (b >= niva ? 4 : 0) | (c >= niva ? 2 : 0) | (d >= niva ? 1 : 0);
    if (fall === 0 || fall === 15) continue;
    const topp = () => kant(x, y, a, x + 1, y, b);
    const hoger = () => kant(x + 1, y, b, x + 1, y + 1, c);
    const botten = () => kant(x, y + 1, d, x + 1, y + 1, c);
    const vanster = () => kant(x, y, a, x, y + 1, d);
    switch (fall) {
      case 1: case 14: segment.push([vanster(), botten()]); break;
      case 2: case 13: segment.push([botten(), hoger()]); break;
      case 3: case 12: segment.push([vanster(), hoger()]); break;
      case 4: case 11: segment.push([topp(), hoger()]); break;
      case 6: case 9: segment.push([topp(), botten()]); break;
      case 7: case 8: segment.push([vanster(), topp()]); break;
      case 5: case 10: {
        const mitt = (a + b + c + d) / 4;
        if ((mitt >= niva) === (fall === 10)) { segment.push([vanster(), topp()]); segment.push([botten(), hoger()]); }
        else { segment.push([vanster(), botten()]); segment.push([topp(), hoger()]); }
        break;
      }
    }
  }
  return foga(segment);
}

const nyckel = (p: XY) => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`;

/** Segment → sammanhängande linjer (varje ände möter högst ett annat segment i marching squares). */
function foga(segment: [XY, XY][]): XY[][] {
  const vid = new Map<string, number[]>();
  segment.forEach(([p, q], i) => { for (const k of [nyckel(p), nyckel(q)]) { const l = vid.get(k); if (l) l.push(i); else vid.set(k, [i]); } });
  const anvand = new Uint8Array(segment.length);
  const ut: XY[][] = [];
  const nasta = (punkt: XY): XY | null => {
    for (const j of vid.get(nyckel(punkt)) ?? []) {
      if (anvand[j]) continue;
      anvand[j] = 1;
      const [p, q] = segment[j];
      return nyckel(p) === nyckel(punkt) ? q : p;
    }
    return null;
  };
  for (let i = 0; i < segment.length; i++) {
    if (anvand[i]) continue;
    anvand[i] = 1;
    const linje: XY[] = [segment[i][0], segment[i][1]];
    for (let p = nasta(linje[linje.length - 1]); p; p = nasta(linje[linje.length - 1])) linje.push(p);
    for (let p = nasta(linje[0]); p; p = nasta(linje[0])) linje.unshift(p);
    ut.push(linje);
  }
  return ut;
}

/** Douglas–Peucker (öppen eller sluten linje, ändpunkterna behålls). */
export function forenkla(l: XY[], tol: number): XY[] {
  if (l.length <= 2) return l;
  const behall = new Uint8Array(l.length);
  behall[0] = 1; behall[l.length - 1] = 1;
  const stack: [number, number][] = [[0, l.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = l[a], [bx, by] = l[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    let max = -1, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = len === 0 ? Math.hypot(l[i][0] - ax, l[i][1] - ay) : Math.abs(dy * l[i][0] - dx * l[i][1] + bx * ay - by * ax) / len;
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol && idx > 0) { behall[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return l.filter((_, i) => behall[i]);
}

const langd = (l: XY[]) => { let s = 0; for (let i = 1; i < l.length; i++) s += Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]); return s; };

/**
 * Höjdkurvorna som GeoJSON (lng/lat). `s` = 1 på stödkurvorna (var STODKURVA_VAR:e), annars 0. Rutor utan data ger inga kurvor.
 */
export function hojdkurvor(h: Hojd, intervall = KURVA_M): GeoJSON.FeatureCollection {
  const z = jamna(h.z, h.bredd, h.hojd, KURVA_UTJAMNING);
  let min = Infinity, max = -Infinity;
  for (const v of z) if (Number.isFinite(v)) { if (v < min) min = v; if (v > max) max = v; }
  const features: GeoJSON.Feature[] = [];
  if (!Number.isFinite(min)) return { type: 'FeatureCollection', features };
  const tillLL = ([kx, ry]: XY): [number, number] => {
    const [lng, lat] = tillLngLat(h.minX + (kx + 0.5) * h.rutaM, h.maxY - (ry + 0.5) * h.rutaM);
    return [Math.round(lng * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6];
  };
  for (let niva = Math.ceil(min / intervall) * intervall; niva <= max; niva += intervall) {
    const stod = Math.round(niva / intervall) % STODKURVA_VAR === 0 ? 1 : 0;
    for (const l of kurvlinjer(z, h.bredd, h.hojd, niva)) {
      const m = l.map(([x, y]) => [x * h.rutaM, y * h.rutaM] as XY);
      if (langd(m) < KURVA_MIN_M) continue;
      const enkel = forenkla(m, KURVA_FORENKLA_M).map(([x, y]) => [x / h.rutaM, y / h.rutaM] as XY);
      features.push({ type: 'Feature', properties: { s: stod, z: niva }, geometry: { type: 'LineString', coordinates: enkel.map(tillLL) } });
    }
  }
  return { type: 'FeatureCollection', features };
}
