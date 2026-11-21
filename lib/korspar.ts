// KÖRSPÅREN — hela vägen och snygga (Martin 2026-11-21). BARA RITNINGEN: det som sparas (hyttspar.points) och det som räknas på
// (avverkad areal, skotarens stråkunderlag, lassen) använder RÅDATA (lib/hyttspar) som förut.
//
// FELET (mätt på Giants riktiga punkter, Bondeskog 5–6 nov och Edestad 2–4 nov, fixturerna lib/__fixtures__/korspar_*):
//   • Spåren BRYTS inte av tidsluckor — varje dag är ETT segment (inga steg över 200 m utom Edestads hemresa 4 nov). Det som förstörde
//     ritningen var STRÅKBYGGAREN (lib/strak, sedan 2026-10-28): den lade alla dagar i ett rutnät, tog skelettet och stycklade
//     skelettet i korsningar och piggar → Bondeskog blev 54 bitar (33 under 20 m: "korta stumpar" där skördaren stod still och
//     upparbetade), och på Edestad räckte EN enda punkt 47 km bort (Giants sista punkt 4 nov, flytten hem) för att förstora rutnätet
//     till 4,2 m per ruta — 30 % av råpunkterna hamnade då längre än 8 m från stråket. Utjämningen före var också tung (−40 % längd).
//   • Därför ritas nu varje dags rensade och lätt utjämnade linje för sig, som ett BAND med verklig bredd i meter. Ligger flera dagar
//     ovanpå varandra är det samma band, inte en tråd som spretar.
//
// KEDJAN (ren funktion, ingen kartkod):
//   1. rensaHopp     enstaka punkt som hoppar ≥ 10 m och direkt tillbaka (GPS:en, inte maskinen) tas bort — oavsett hur långt hoppet är
//   2. segmentera    bryt BARA när steget mellan två punkter är > 200 m (aldrig på tid: skördaren står still och upparbetar, skotaren lastar)
//   3. dubbletter    punkter närmare än 2 m från förra behållna är brus från en maskin som står still
//   4. tatSteg       inget steg längre än 3 m (de sparade punkterna är RDP-gallrade och glesa längs raka vägar)
//   5. jamnaLatt     Gauss över sträckan (σ 2,5 m) med spegling vid ändarna → ändarna flyttas inte och linjen krymper inte
//   6. douglasPeucker 0,3 m (samma form med färre hörn)
// Segment kortare än 8 m ritas inte (ett ensamt hopp långt bort är ingen väg).

import type { HyttPunkt } from './hyttspar';
import { HYTTSPAR_SEGMENT_GAP_M } from './hyttspar';

export type Koord = [number, number];   // [lng, lat] som GeoJSON
type XY = [number, number];             // meter i en lokal plan

export const KORSPAR = {
  /** En punkt som hoppar så här långt (m) dit OCH tillbaka är ett GPS-hopp. */
  HOPP_M: 10,
  /** Bryt linjen först när steget är längre än så här (m). Samma som lib/hyttspar — tid ignoreras helt. */
  BRYT_M: HYTTSPAR_SEGMENT_GAP_M,
  /** Närmare än så här (m) från förra behållna punkten = brus. */
  DUBBLETT_M: 2,
  /** Inget steg längre än så här (m) före utjämningen. */
  MAX_STEG_M: 3,
  /** Utjämningens bredd (m längs sträckan). Punkterna är redan täta — lätt. */
  SIGMA_M: 2.5,
  /** Förenkling (m). */
  TOLERANS_M: 0.3,
  /** Ett segment kortare än så här (m) ritas inte. */
  MIN_SEGMENT_M: 8,
} as const;

const M_PER_GRAD = 111_320;
const dist = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function projektion(pts: { lat: number; lng: number }[]) {
  const lat0 = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  const k = Math.cos((lat0 * Math.PI) / 180) * M_PER_GRAD;
  const lng0 = pts[0].lng, lat00 = pts[0].lat;
  return {
    till: (p: { lat: number; lng: number }): XY => [(p.lng - lng0) * k, (p.lat - lat00) * M_PER_GRAD],
    fran: (p: XY): Koord => [lng0 + p[0] / k, lat00 + p[1] / M_PER_GRAD],
  };
}

/**
 * 1. GPS-hopp: punkten i är ett hopp när steget IN och UT båda är ≥ hoppM men punkterna före och efter ligger nära varandra (under halva
 * det kortaste steget) — maskinen gick inte dit. Jämförs mot SENAST BEHÅLLNA punkt, så två hopp i rad också försvinner. Gäller varje avstånd:
 * ett hopp på 300 m och tillbaka bryter alltså inte linjen.
 */
export function rensaHopp(p: XY[], hoppM: number = KORSPAR.HOPP_M): XY[] {
  if (p.length < 3) return p.slice();
  const ut: XY[] = [p[0]];
  for (let i = 1; i < p.length - 1; i++) {
    const fore = ut[ut.length - 1];
    const a = dist(fore, p[i]), b = dist(p[i], p[i + 1]), g = dist(fore, p[i + 1]);
    if (a >= hoppM && b >= hoppM && g < Math.min(a, b) / 2) continue;
    ut.push(p[i]);
  }
  ut.push(p[p.length - 1]);
  return ut;
}

/** 2. Dela vid steg > brytM (m). Tid ignoreras. */
export function segmentera(p: XY[], brytM: number = KORSPAR.BRYT_M): XY[][] {
  const segs: XY[][] = [];
  let cur: XY[] = [];
  for (const q of p) {
    if (cur.length && dist(cur[cur.length - 1], q) > brytM) { segs.push(cur); cur = []; }
    cur.push(q);
  }
  if (cur.length) segs.push(cur);
  return segs;
}

/** 3. Behåll en punkt per `minM` meter (sista punkten alltid). */
export function utanDubbletter(p: XY[], minM: number = KORSPAR.DUBBLETT_M): XY[] {
  if (p.length < 3) return p.slice();
  const ut: XY[] = [p[0]];
  for (let i = 1; i < p.length - 1; i++) if (dist(ut[ut.length - 1], p[i]) >= minM) ut.push(p[i]);
  ut.push(p[p.length - 1]);
  return ut;
}

/** 4. Fyll i rak interpolation så att inget steg är längre än maxM. */
export function tatSteg(p: XY[], maxM: number = KORSPAR.MAX_STEG_M): XY[] {
  if (p.length < 2) return p.slice();
  const ut: XY[] = [p[0]];
  for (let i = 1; i < p.length; i++) {
    const n = Math.ceil(dist(p[i - 1], p[i]) / maxM);
    for (let k = 1; k < n; k++) { const t = k / n; ut.push([p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t]); }
    ut.push(p[i]);
  }
  return ut;
}

/**
 * 5. Gauss över sträckan. Fönstret ±2,5 σ; bortom ändarna speglas punkterna (udda spegling: p(−k) = 2·p(0) − p(k)) så att medelvärdet inte
 * dras in mot mitten — linjen kortas inte, och ändpunkterna flyttas aldrig (de sätts tillbaka ordagrant).
 */
export function jamnaLatt(p: XY[], sigmaM: number = KORSPAR.SIGMA_M): XY[] {
  const n = p.length;
  if (n < 3 || !(sigmaM > 0)) return p.slice();
  const s = [0]; for (let i = 1; i < n; i++) s.push(s[i - 1] + dist(p[i - 1], p[i]));
  const rad = sigmaM * 2.5;
  // förläng med speglade punkter så långt som fönstret når
  const sFore: number[] = [], pFore: XY[] = [];
  for (let k = 1; k < n && s[k] <= rad; k++) { sFore.unshift(-s[k]); pFore.unshift([2 * p[0][0] - p[k][0], 2 * p[0][1] - p[k][1]]); }
  const sEfter: number[] = [], pEfter: XY[] = [];
  for (let k = n - 2; k >= 0 && s[n - 1] - s[k] <= rad; k--) { sEfter.push(2 * s[n - 1] - s[k]); pEfter.push([2 * p[n - 1][0] - p[k][0], 2 * p[n - 1][1] - p[k][1]]); }
  const S = [...sFore, ...s, ...sEfter], P = [...pFore, ...p, ...pEfter], off = sFore.length;
  const ut: XY[] = new Array(n);
  ut[0] = [p[0][0], p[0][1]]; ut[n - 1] = [p[n - 1][0], p[n - 1][1]];
  const tva = 2 * sigmaM * sigmaM;
  for (let i = 1; i < n - 1; i++) {
    const si = S[off + i];
    let sx = 0, sy = 0, sw = 0;
    for (let j = off + i; j >= 0 && si - S[j] <= rad; j--) { const w = Math.exp(-((si - S[j]) ** 2) / tva); sx += P[j][0] * w; sy += P[j][1] * w; sw += w; }
    for (let j = off + i + 1; j < S.length && S[j] - si <= rad; j++) { const w = Math.exp(-((S[j] - si) ** 2) / tva); sx += P[j][0] * w; sy += P[j][1] * w; sw += w; }
    ut[i] = [sx / sw, sy / sw];
  }
  return ut;
}

/** 6. Douglas-Peucker (iterativ), ändpunkterna behålls. */
export function douglasPeucker(p: XY[], tolM: number = KORSPAR.TOLERANS_M): XY[] {
  if (p.length < 3) return p.slice();
  const behall = new Uint8Array(p.length); behall[0] = 1; behall[p.length - 1] = 1;
  const stack: [number, number][] = [[0, p.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const dx = p[b][0] - p[a][0], dy = p[b][1] - p[a][1], L = Math.hypot(dx, dy);
    let max = -1, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = L > 0 ? Math.abs(dx * (p[i][1] - p[a][1]) - dy * (p[i][0] - p[a][0])) / L : dist(p[i], p[a]);
      if (d > max) { max = d; mi = i; }
    }
    if (max > tolM && mi > 0) { behall[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return p.filter((_, i) => behall[i] === 1);
}

const langd = (p: XY[]) => { let s = 0; for (let i = 1; i < p.length; i++) s += dist(p[i - 1], p[i]); return s; };

/**
 * Linjerna som RITAS för en dags hyttspårspunkter: en [lng, lat]-linje per sammanhängande körning. Ändpunkterna är ORDAGRANT originalets
 * (efter att eventuella GPS-hopp tagits bort) — linjen börjar och slutar där maskinen var, också live. Använd ALDRIG till en beräkning.
 */
export function korsparLinjer(points: HyttPunkt[]): Koord[][] {
  const giltiga = (points || []).filter((q) => q && Number.isFinite(q.lat) && Number.isFinite(q.lng));
  if (giltiga.length < 2) return [];
  const pr = projektion(giltiga);
  const xy = rensaHopp(giltiga.map(pr.till));
  const ut: Koord[][] = [];
  for (const seg of segmentera(xy)) {
    if (langd(seg) < KORSPAR.MIN_SEGMENT_M) continue;
    const fore = seg[0], efter = seg[seg.length - 1];   // ändpunkterna sätts tillbaka oförändrade (utjämningen rör dem inte; projektionen är linjär)
    let p = utanDubbletter(seg);
    p = tatSteg(p);
    p = jamnaLatt(p);
    p = douglasPeucker(p);
    if (p.length < 2) continue;
    p[0] = fore; p[p.length - 1] = efter;
    ut.push(p.map(pr.fran));
  }
  return ut;
}

// ── CACHE: en dag räknas fram EN gång (Martin: "inte vid varje kartrörelse") ───────────────────────────────────────────────────────────
// Kartan ritar om från färdiga linjer; nyckeln säger vilken dag och hur många punkter den bygger på, så en dag som växer (idag) räknas om
// och en avslutad dag aldrig mer än en gång. Högst CACHE_MAX dagar sparas (äldst först bort).
const CACHE_MAX = 64;
const cache = new Map<string, Koord[][]>();
export function cachadeKorspar(nyckel: string, points: HyttPunkt[]): Koord[][] {
  const k = `${nyckel}|${points?.length ?? 0}`;
  const hit = cache.get(k);
  if (hit) { cache.delete(k); cache.set(k, hit); return hit; }
  const ny = korsparLinjer(points);
  cache.set(k, ny);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  return ny;
}
/** Tester. */
export function tomKorsparCache(): void { cache.clear(); }
export function korsparCacheStorlek(): number { return cache.size; }
