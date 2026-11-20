// FASTIGHETSGRÄNS (rågång) — ren logik, ingen karta. Datat är Vidas lager SV_FASTIGHET i objekt_geometri (Lantmäteriets fastighetsytor runt trakten):
// polygoner med TRAKT ("ÖSTRA TORAMÅLA"), BLOCKENHET ("2:2") och FASTIGHET ("ÖSTRA TORAMÅLA 2:2>5", suffixet efter > är område-nummer). En fastighet kan bestå av
// flera områden (OMRNR) — den identifieras av kommun + TRAKT + BLOCKENHET, aldrig av en enskild polygon.
//
// Det här gör modulen (alla beslut har tester, lib/fastighetsgrans.test.ts):
//  1. byggRagang(fc): rågångens linjer (varje polygons ringar, delade i full/svag styrka efter närhet till trakten), fastighetsytorna (nedtoning av alla utom de trakten ligger på) och
//     beteckningarna längs gränsen. Inga gränspinnar: rött betyder fara i hela appen (Martin 2026-10-22).
//  2. bedomTrakt: VILKA fastigheter trakten överlappar — punktprov i traktdelarna mot fastighetsytorna. Appen vet inte vem som äger vad (samma ägare kan äga
//     grannfastigheten), så det som räknas är om MARKEN ingår i trakten: de fastigheterna lämnas orörda, alla övriga tonas ned. Saknas fastighetsdata
//     runt trakten helt tonas ingenting.
//  3. avstandTillRagang / fastighetsFall: avståndet till rågången för fällningscirkeln (30 m, ALLA gränser oavsett styrka), och vilka fastigheter som möts vid ett
//     tryck (kortet).
// Gränsen kan avvika några meter från verkligheten (Vidas data är digitaliserad): ingenting här påstår mer än så, och kortet säger det.

import { avstandTillLinjeM, narRuta, type LatLon } from './larm/geo';

export const FASTIGHET_LAGER = 'SV_FASTIGHET';
export const TRAKTDEL_LAGER = 'L_TRAKTDEL';

type Pos = [number, number];          // [lng, lat]
type Ring = Pos[];
type Poly = Ring[];                   // [yttre, ...hål]

export interface Fastighet {
  /** Kommun|TRAKT|BLOCKENHET — samma fastighet över alla dess områden. */
  nyckel: string;
  /** "Östra Toramåla 2:2" */
  namn: string;
  ytor: Poly[];
}

export interface Trakturval {
  /** 'kand' = minst en fastighet överlappar trakten (då är resten "utanför"); 'okand' = vi kan inte avgöra och tonar ingenting. */
  status: 'kand' | 'okand';
  /** Per fastighet (samma ordning som `fastigheter`): ingår någon del av fastigheten i trakten? Alla false när status är 'okand'. */
  iTrakten: boolean[];
  /** Varför det inte gick att avgöra (för test och felsökning) — aldrig visad för föraren. */
  skal: 'overlapp' | 'ingen_traktgrans' | 'inga_fastigheter' | 'ingen_yta' | 'ingen_overlapp';
  /** Andel av traktens provpunkter per fastighet (samma ordning som `fastigheter`) och andelen utan fastighet. */
  andelar: number[];
  otackt: number;
}

// En fastighet "ingår i trakten" när minst 4 % av traktens yta ligger i den. Traktgränsen ligger sällan exakt på rågången: några meter över gränsen (några procent av
// ytan) är digitaliseringsbrus, inte mark som ingår. Allt över det är mark vi jobbar på.
export const TRAKT_MIN_ANDEL = 0.04;
/** Rågångens stycken som berör trakten eller ligger så här nära den ritas i full styrka; resten tunnare och svagare. */
export const NARA_STYRKA_M = 50;

// ---------------------------------------------------------------------------------------------------------------------------------
// Namn
// ---------------------------------------------------------------------------------------------------------------------------------

const txt = (v: unknown): string => (v == null ? '' : String(v).trim());

/** "ÖSTRA TORAMÅLA" → "Östra Toramåla"; bindestreck behåller sina led ("SÖDRA-HÖKA" → "Södra-Höka"). */
export function titelRegler(s: string): string {
  return s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
}

/** Lantmäteriets enhetsbeteckning: litet prefix (S:1 → s:1, FS:1 → fs:1), siffrorna orörda. */
const blockEnhet = (b: string): string => b.replace(/^([A-Za-zÅÄÖåäö]{1,3}):/, (_m, a: string) => `${a.toLowerCase()}:`);

/** "Outrett" = Lantmäteriet har inte utrett enheten än: ingen beteckning finns. Vi påstår ingen. */
export const OUTRETT_NAMN = 'Outrett område';
const arOutrett = (p: Record<string, any>): boolean => /^outrett/i.test(txt(p.DETALJTYP));
/** Fiskesamfälligheter ligger på sjöar och är ingen mark att fälla på: ingen rågång, ingen ägare. */
const arFiske = (p: Record<string, any>): boolean => /fiske/i.test(txt(p.DETALJTYP));

/** Beteckningen som föraren läser: "Östra Toramåla 2:2". Samfälligheter heter "Lummemåla s:1" (litet s, som i Lantmäteriets egen skrivning). */
export function fastighetNamn(props: Record<string, any> | null | undefined): string {
  const p = props ?? {};
  if (arOutrett(p)) return OUTRETT_NAMN;
  const trakt = txt(p.TRAKT);
  const block = blockEnhet(txt(p.BLOCKENHET));
  if (trakt && block) return `${titelRegler(trakt)} ${block}`;
  const fast = txt(p.FASTIGHET).replace(/>.*$/, '');
  if (fast) return fast.replace(/^(\S.*?)(\s+\S*\d\S*)$/u, (_m, a: string, b: string) => titelRegler(a) + b.replace(/^(\s+)([A-Za-zÅÄÖåäö]{1,3}):/, (_x, sp: string, l: string) => `${sp}${l.toLowerCase()}:`));
  return OUTRETT_NAMN;
}

function fastighetNyckel(p: Record<string, any>, index: number): string {
  if (arOutrett(p)) return `outrett|${txt(p.FLID) || index}`;   // varje outrett område är sitt eget — de slås aldrig ihop
  const trakt = txt(p.TRAKT), block = txt(p.BLOCKENHET);
  if (trakt && block) return `${txt(p.KOMMUNKOD)}|${trakt}|${block}`;
  return `${txt(p.KOMMUNKOD)}|${txt(p.FASTIGHET).replace(/>.*$/, '') || index}`;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Ur Vidas geometri
// ---------------------------------------------------------------------------------------------------------------------------------

const arPos = (c: any): c is Pos => Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number' && Number.isFinite(c[0]) && Number.isFinite(c[1]);
const rensaRing = (r: any): Ring => (Array.isArray(r) ? r.filter(arPos).map((c) => [c[0], c[1]] as Pos) : []);
function polygonerUr(g: any): Poly[] {
  if (!g || !g.coordinates) return [];
  const polys: any[] = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  return polys.map((p) => (Array.isArray(p) ? p.map(rensaRing).filter((r) => r.length >= 4) : [])).filter((p) => p.length > 0 && p[0].length >= 4);
}

export function fastigheterUr(fc: { features?: any[] } | null | undefined): Fastighet[] {
  const grupper = new Map<string, Fastighet>();
  (fc?.features ?? []).forEach((f, index) => {
    const p = f?.properties;
    if (!p || p._lager !== FASTIGHET_LAGER || arFiske(p)) return;
    const ytor = polygonerUr(f.geometry);
    if (ytor.length === 0) return;
    const nyckel = fastighetNyckel(p, index);
    const g = grupper.get(nyckel);
    if (g) g.ytor.push(...ytor);
    else grupper.set(nyckel, { nyckel, namn: fastighetNamn(p), ytor });
  });
  return [...grupper.values()];
}

export function traktdelarUr(fc: { features?: any[] } | null | undefined): Poly[] {
  const ut: Poly[] = [];
  for (const f of fc?.features ?? []) {
    if (f?.properties?._lager !== TRAKTDEL_LAGER) continue;
    ut.push(...polygonerUr(f.geometry));
  }
  return ut;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Geometri
// ---------------------------------------------------------------------------------------------------------------------------------

const M_PER_GRAD = 111320;

function bbox(ring: Ring): [number, number, number, number] {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const [x, y] of ring) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; }
  return [a, b, c, d];
}

function iRing(x: number, y: number, ring: Ring): boolean {
  let inne = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inne = !inne;
  }
  return inne;
}

/** Punkt i polygon: i yttre ringen och inte i något hål. */
export function punktIPolygon(x: number, y: number, poly: Poly): boolean {
  if (!iRing(x, y, poly[0])) return false;
  for (let h = 1; h < poly.length; h++) if (iRing(x, y, poly[h])) return false;
  return true;
}

/** Provpunkter jämnt över traktdelarna (rutnät i meter, aldrig fler än ~2 500 och aldrig glesare än var 3:e meter — en grövre ruta ger "hopp" på 5 % när traktgränsen
 *  ligger ett par meter över en rågång, och då skulle grannen lysa upp av en slump). Små ytor får minst en punkt. */
export function provpunkter(trakt: readonly Poly[]): Pos[] {
  const ut: Pos[] = [];
  for (const poly of trakt) {
    const [x0, y0, x1, y1] = bbox(poly[0]);
    const latM = (y0 + y1) / 2;
    const kx = M_PER_GRAD * Math.cos((latM * Math.PI) / 180), ky = M_PER_GRAD;
    const bredd = (x1 - x0) * kx, hojd = (y1 - y0) * ky;
    const steg = Math.max(3, Math.sqrt(Math.max(bredd * hojd, 1) / 2500));
    const dx = steg / kx, dy = steg / ky;
    const innan = ut.length;
    for (let y = y0 + dy / 2; y < y1; y += dy) for (let x = x0 + dx / 2; x < x1; x += dx) if (punktIPolygon(x, y, poly)) ut.push([x, y]);
    if (ut.length === innan) {   // tunn eller liten yta: ett hörn som ligger i den duger, annars medelpunkten
      const v = poly[0].find((c) => punktIPolygon(c[0], c[1], poly));
      const mx = poly[0].reduce((s, c) => s + c[0], 0) / poly[0].length, my = poly[0].reduce((s, c) => s + c[1], 0) / poly[0].length;
      if (punktIPolygon(mx, my, poly)) ut.push([mx, my]); else if (v) ut.push([v[0], v[1]]);
    }
  }
  return ut;
}

/** Vilka fastigheter överlappar trakten? Se TRAKT_MIN_ANDEL. Går det inte att avgöra (ingen traktgräns, inga fastigheter, ingen fastighet över tröskeln) tonas ingenting. */
export function bedomTrakt(trakt: readonly Poly[], fastigheter: readonly Fastighet[]): Trakturval {
  const okand = (skal: Trakturval['skal'], andelar: number[] = [], otackt = 0): Trakturval => ({ status: 'okand', iTrakten: fastigheter.map(() => false), skal, andelar, otackt });
  if (trakt.length === 0) return okand('ingen_traktgrans');
  if (fastigheter.length === 0) return okand('inga_fastigheter');
  const prov = provpunkter(trakt);
  if (prov.length === 0) return okand('ingen_yta');
  const boxar = fastigheter.map((f) => f.ytor.map((p) => bbox(p[0])));
  const antal = new Array(fastigheter.length).fill(0);
  let otackt = 0;
  for (const [x, y] of prov) {
    let traff = false;
    fastigheter.forEach((f, i) => {
      const inne = f.ytor.some((p, k) => { const b = boxar[i][k]; return x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3] && punktIPolygon(x, y, p); });
      if (inne) { antal[i]++; traff = true; }
    });
    if (!traff) otackt++;
  }
  const andelar = antal.map((n) => n / prov.length);
  const iTrakten = andelar.map((a) => a >= TRAKT_MIN_ANDEL);
  if (!iTrakten.some(Boolean)) return okand('ingen_overlapp', andelar, otackt / prov.length);
  return { status: 'kand', iTrakten, skal: 'overlapp', andelar, otackt: otackt / prov.length };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Modellen kartan ritar
// ---------------------------------------------------------------------------------------------------------------------------------

/** Fastighetens förhållande till trakten: ingår i den (orörd), ligger utanför (nedtonad) eller okänt (ingenting). */
export type Sida = 'trakt' | 'utanfor' | 'okand';
type FC = { type: 'FeatureCollection'; features: any[] };

export interface RagangModell {
  fastigheter: Fastighet[];
  urval: Trakturval;
  /** Rågångens linjer: varje polygons ringar i stycken. Egenskaper: namn, nyckel, sida, styrka ('full' | 'svag'). Täcker ALLA gränser (fällningsvarning och tryck). */
  linjer: FC;
  /** Fastighetsytor (bara 'utanfor' ritas, nedtonade; 'trakt' är orörd flygbild). Egenskaper: namn, nyckel, sida. */
  ytor: FC;
  /** Beteckningar längs gränsen, på varje fastighets egen sida (linjer inskjutna i den egna ytan). Egenskaper: text. */
  etiketter: FC;
}

const tomFC = (): FC => ({ type: 'FeatureCollection', features: [] });

function sidaFor(urval: Trakturval, i: number): Sida {
  if (urval.status !== 'kand') return 'okand';
  return urval.iTrakten[i] ? 'trakt' : 'utanfor';
}

/** Etikettens text: bara beteckningen, "Kompersmåla 3:12", på båda sidor av linjen. Aldrig "granne" eller ägare — appen vet inte vem som äger vad. */
export function etikettText(namn: string): string {
  return namn;
}

/** Närheten som ritar: på Vida-fastigheter nära trakten (rutan runt traktdelarna utvidgad så här mycket) sätts beteckningar. */
export const NARA_TRAKTEN_M = 600;
/** Beteckningar sätts bara på fastigheter vars rand ligger så här nära trakten (det är grannarna föraren möter, inte hela bygden). */
export const ETIKETT_NARA_M = 250;
/** Rågången delas i stycken om högst så här många meter, så styrkan (full/svag) kan växla mitt i en lång gräns. */
export const STYRKA_STEG_M = 10;

// -- beteckningar -------------------------------------------------------------------------------------------------------------------

export const ETIKETT_INSKJUT_M = 14;       // beteckningens linje ligger så långt in i den egna fastigheten att texten inte hamnar på rågångsbandet
export const ETIKETT_LANGD_M = 320;        // längden på linjen texten följer (längre än texten vid de zoomnivåer den visas)

function signeratArea(ring: Ring, kx: number, ky: number): number {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += (ring[j][0] * kx) * (ring[i][1] * ky) - (ring[i][0] * kx) * (ring[j][1] * ky);
  return s / 2;
}

/** Kortaste raka sträcka där en beteckning får plats (texten är ~60–80 m lång vid zoomen där den visas). */
export const ETIKETT_MIN_SPAN_M = 40;
/** Ett hörn skarpare än så avslutar den raka sträckan: MapLibre lägger inte text runt ett hörn (text-max-angle), så en linje genom ett hörn ger ingen text alls. */
export const ETIKETT_MAX_KNICK_GRADER = 25;

/**
 * Linjen längs en fastighets yttre rand där beteckningen ska stå: den RAKA sträckan närmast trakten (som är minst ETIKETT_MIN_SPAN_M lång, annars den längsta),
 * skjuten `ETIKETT_INSKJUT_M` åt fastighetens EGEN sida. Null om ingen sträcka får plats inne i ytan.
 */
export function etikettLinje(poly: Poly, traktPunkter: Pos[], kx: number, ky: number): Pos[] | null {
  const ring = poly[0].slice(0, -1);
  const n = ring.length;
  if (n < 3) return null;
  const ccw = signeratArea([...ring, ring[0]], kx, ky) > 0;   // moturs: ytan ligger till vänster om färdriktningen
  const meter = (p: Pos, q: Pos) => Math.hypot((q[0] - p[0]) * kx, (q[1] - p[1]) * ky);
  const gaIn = (i: number): Pos => {
    const a = ring[(i + n - 1) % n], b = ring[i], c = ring[(i + 1) % n];
    const norm = (p: Pos, q: Pos): [number, number] => {
      const dx = (q[0] - p[0]) * kx, dy = (q[1] - p[1]) * ky, l = Math.hypot(dx, dy) || 1;
      return ccw ? [-dy / l, dx / l] : [dy / l, -dx / l];
    };
    const n1 = norm(a, b), n2 = norm(b, c);
    let nx = n1[0] + n2[0], ny = n1[1] + n2[1];
    const l = Math.hypot(nx, ny);
    if (l < 0.3) { nx = n1[0]; ny = n1[1]; } else { nx /= l; ny /= l; }
    // vid skarpa hörn växer förskjutningen — begränsa den till 1,5 × inskjutet
    const skala = Math.min(1.5, 1 / Math.max(0.5, (n1[0] * nx + n1[1] * ny)));
    return [b[0] + (nx * ETIKETT_INSKJUT_M * skala) / kx, b[1] + (ny * ETIKETT_INSKJUT_M * skala) / ky];
  };
  const kantRiktning = (i: number) => { const a = ring[i], b = ring[(i + 1) % n]; return Math.atan2((b[1] - a[1]) * ky, (b[0] - a[0]) * kx); };
  const knick = (i: number): number => {          // hörnets vinkel (grader) mellan kanten före och kanten efter vertex i
    let d = Math.abs(kantRiktning(i) - kantRiktning((i + n - 1) % n)) * (180 / Math.PI);
    if (d > 180) d = 360 - d;
    return d;
  };
  // Dela ringen i raka sträckor: bryt vid varje skarpt hörn. Börja vid ett skarpt hörn så ingen sträcka delas av ringens startpunkt.
  let s0 = 0;
  for (let i = 0; i < n; i++) if (knick(i) > ETIKETT_MAX_KNICK_GRADER) { s0 = i; break; }
  const sträckor: { idx: number[]; len: number }[] = [];
  let cur: number[] = [s0], len = 0;
  for (let k = 0; k < n; k++) {
    const i = (s0 + k) % n, j = (i + 1) % n;
    len += meter(ring[i], ring[j]); cur.push(j);
    if (k === n - 1 || knick(j) > ETIKETT_MAX_KNICK_GRADER) { sträckor.push({ idx: cur, len }); cur = [j]; len = 0; }
  }
  // Avstånd från sträckan till trakten: närmaste av hörn och kantmittpunkter.
  const dTrakt = (idx: number[]): { d: number; pos: number } => {
    let d = Infinity, pos = 0;
    idx.forEach((v, q) => {
      const kand: Pos[] = [ring[v]];
      if (q + 1 < idx.length) { const b = ring[idx[q + 1]]; kand.push([(ring[v][0] + b[0]) / 2, (ring[v][1] + b[1]) / 2]); }
      for (const c of kand) for (const t of traktPunkter) { const dd = meter(c, t); if (dd < d) { d = dd; pos = q; } }
    });
    return { d, pos };
  };
  const kandidater = sträckor
    .map((st) => ({ ...st, ...dTrakt(st.idx) }))
    .sort((x, y) => {
      const xOk = x.len >= ETIKETT_MIN_SPAN_M, yOk = y.len >= ETIKETT_MIN_SPAN_M;
      if (xOk !== yOk) return xOk ? -1 : 1;
      return xOk ? (x.d - y.d) || (y.len - x.len) : y.len - x.len;
    });
  for (const k of kandidater) {
    // Längre än ETIKETT_LANGD_M: ta fönstret runt den punkt som ligger närmast trakten.
    let idx = k.idx;
    if (k.len > ETIKETT_LANGD_M) {
      let from = k.pos, to = k.pos, lang = 0;
      while ((from > 0 || to < idx.length - 1) && lang < ETIKETT_LANGD_M) {
        if (from > 0 && (lang <= 0 || to >= idx.length - 1 || from >= idx.length - 1 - to)) { lang += meter(ring[idx[from - 1]], ring[idx[from]]); from--; }
        else if (to < idx.length - 1) { lang += meter(ring[idx[to]], ring[idx[to + 1]]); to++; }
        else break;
      }
      idx = idx.slice(from, to + 1);
    }
    if (idx.length < 2) continue;
    const linje = idx.map(gaIn);
    // Texten ligger på den egna sidan eller inte alls: varje inskjuten punkt måste ligga inne i fastighetens yta.
    if (linje.every((p) => punktIPolygon(p[0], p[1], poly))) return linje;
  }
  return null;
}

// -- närhet till trakten ------------------------------------------------------------------------------------------------------------

type Seg = [Pos, Pos];

/** Meter från punkt till sträcka (lokal plan approximation). */
function punktTillSegM(p: Pos, a: Pos, b: Pos, kx: number, ky: number): number {
  const ax = a[0] * kx, ay = a[1] * ky, bx = b[0] * kx, by = b[1] * ky, px = p[0] * kx, py = p[1] * ky;
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Rågångens stycken: varje ring delas i bitar om högst STYRKA_STEG_M, och intilliggande bitar med samma styrka slås ihop. 'full' = biten berör trakten eller ligger
 * inom NARA_STYRKA_M från den, annars 'svag'. Utan traktgräns är allt 'full' (vi vet inte vad som är nära).
 */
export function ringStycken(ring: Ring, trakt: readonly Poly[], kx: number, ky: number): { styrka: 'full' | 'svag'; coords: Pos[] }[] {
  const traktBox = trakt.length
    ? trakt.map((p) => bbox(p[0])).reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] as [number, number, number, number])
    : null;
  const traktSeg: Seg[] = trakt.flatMap((p) => p.flatMap((r) => r.slice(1).map((c, i): Seg => [r[i], c])));
  const narTrakt = (p: Pos): boolean => {
    if (!traktBox) return true;
    const m = NARA_STYRKA_M;
    if (p[0] < traktBox[0] - m / kx || p[0] > traktBox[2] + m / kx || p[1] < traktBox[1] - m / ky || p[1] > traktBox[3] + m / ky) return false;
    if (trakt.some((t) => punktIPolygon(p[0], p[1], t))) return true;
    for (const [a, b] of traktSeg) if (punktTillSegM(p, a, b, kx, ky) <= m) return true;
    return false;
  };
  // Täta ringen: punkter högst STYRKA_STEG_M isär.
  const pts: Pos[] = [ring[0]];
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i];
    const len = Math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * ky);
    const n = Math.max(1, Math.ceil(len / STYRKA_STEG_M));
    for (let k = 1; k <= n; k++) pts.push(k === n ? b : [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  const ut: { styrka: 'full' | 'svag'; coords: Pos[] }[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    // Biten är nära om någon av dess ändar eller mitten är det (en bit som korsar trakten berör den).
    const styrka: 'full' | 'svag' = narTrakt(a) || narTrakt(b) || narTrakt([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]) ? 'full' : 'svag';
    const sista = ut[ut.length - 1];
    if (sista && sista.styrka === styrka) sista.coords.push(b);
    else ut.push({ styrka, coords: [a, b] });
  }
  return ut;
}

// -- hela modellen ------------------------------------------------------------------------------------------------------------------

export function byggRagang(fc: { features?: any[] } | null | undefined): RagangModell | null {
  const fastigheter = fastigheterUr(fc);
  if (fastigheter.length === 0) return null;
  const trakt = traktdelarUr(fc);
  const urval = bedomTrakt(trakt, fastigheter);

  const alla = fastigheter.flatMap((f) => f.ytor.map((p) => p[0]));
  const latM = alla.reduce((s, r) => s + r[0][1], 0) / alla.length;
  const kx = M_PER_GRAD * Math.cos((latM * Math.PI) / 180), ky = M_PER_GRAD;

  // Närhet till trakten för beteckningarna: rutan runt traktdelarna, utvidgad NARA_TRAKTEN_M.
  const tb = trakt.length ? trakt.map((p) => bbox(p[0])).reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] as [number, number, number, number]) : null;
  const nara = (p: Pos): boolean => !tb || (p[0] >= tb[0] - NARA_TRAKTEN_M / kx && p[0] <= tb[2] + NARA_TRAKTEN_M / kx && p[1] >= tb[1] - NARA_TRAKTEN_M / ky && p[1] <= tb[3] + NARA_TRAKTEN_M / ky);
  const traktPunkter: Pos[] = trakt.flatMap((p) => p[0]);

  const linjer = tomFC(), ytor = tomFC(), etiketter = tomFC();

  fastigheter.forEach((f, i) => {
    const sida = sidaFor(urval, i);
    for (const poly of f.ytor) {
      ytor.features.push({ type: 'Feature', properties: { namn: f.namn, nyckel: f.nyckel, sida }, geometry: { type: 'Polygon', coordinates: poly } });
      poly.forEach((ring) => {
        for (const st of ringStycken(ring, trakt, kx, ky)) {
          linjer.features.push({ type: 'Feature', properties: { namn: f.namn, nyckel: f.nyckel, sida, styrka: st.styrka }, geometry: { type: 'LineString', coordinates: st.coords } });
        }
      });
    }
    // Beteckning: en per fastighet, på randen närmast trakten (och bara när fastigheten faktiskt är i närheten).
    if (traktPunkter.length === 0) return;
    let bast: { poly: Poly; punkt: Pos; d: number } | null = null;
    for (const poly of f.ytor) {
      for (const c of poly[0]) {
        if (!nara(c)) continue;
        let d = Infinity;
        for (const t of traktPunkter) { const dd = Math.hypot((c[0] - t[0]) * kx, (c[1] - t[1]) * ky); if (dd < d) d = dd; }
        if (!bast || d < bast.d) bast = { poly, punkt: c, d };
      }
    }
    if (!bast || bast.d > ETIKETT_NARA_M) return;
    const linje = etikettLinje(bast.poly, traktPunkter, kx, ky);
    if (linje) etiketter.features.push({ type: 'Feature', properties: { text: etikettText(f.namn) }, geometry: { type: 'LineString', coordinates: linje } });
  });

  return { fastigheter, urval, linjer, ytor, etiketter };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Avstånd (fällningscirkeln) och tryck (kortet)
// ---------------------------------------------------------------------------------------------------------------------------------

export const FASTIGHET_FALL_M = 30;

const tillLL = (c: Pos): LatLon => ({ lat: c[1], lon: c[0] });

/** Meter till närmaste rågångslinje, eller null om ingen ligger inom `inomM` (billig förkoll per linje). */
export function avstandTillRagang(pos: LatLon, modell: RagangModell | null, inomM = FASTIGHET_FALL_M + 5): number | null {
  if (!modell) return null;
  let min = Infinity;
  for (const f of modell.linjer.features) {
    const ll = (f.geometry.coordinates as Pos[]).map(tillLL);
    if (!narRuta(pos, ll, inomM)) continue;
    const d = avstandTillLinjeM(pos, ll);
    if (d < min) min = d;
  }
  return Number.isFinite(min) && min <= inomM ? min : null;
}

export interface GransFall { avstandM: number }
/** Fällningscirkeln: ligger rågången inom `radieM` (30 m) av skördaren? Avrundat till hela meter (kortet: "Fastighetsgräns 18 m"). */
export function fastighetsFall(pos: LatLon | null, modell: RagangModell | null, radieM = FASTIGHET_FALL_M): GransFall | null {
  if (!pos || !modell) return null;
  const d = avstandTillRagang(pos, modell, radieM + 5);
  if (d == null || d > radieM) return null;
  return { avstandM: Math.round(d) };
}

export interface GransMot { a: string; b: string | null; aSida: Sida; bSida: Sida | null }
/**
 * Vilka fastigheter möts vid ett tryck på rågången? Fastigheterna vars rand ligger inom `toleransM` av tryckpunkten. Egen fastighet först när vi vet vilken den är.
 * Ligger bara en rand där (grannen finns inte i Vidas data) blir `b` null. Null om ingen rand är nära.
 */
export function gransVidTryck(lngLat: { lng: number; lat: number }, modell: RagangModell | null, toleransM = 14): GransMot | null {
  if (!modell) return null;
  const pos: LatLon = { lat: lngLat.lat, lon: lngLat.lng };
  const traffar = new Map<string, { namn: string; sida: Sida; d: number }>();
  for (const f of modell.linjer.features) {
    const ll = (f.geometry.coordinates as Pos[]).map(tillLL);
    if (!narRuta(pos, ll, toleransM + 2)) continue;
    const d = avstandTillLinjeM(pos, ll);
    if (d > toleransM) continue;
    const nyckel = f.properties.nyckel as string;
    const tidigare = traffar.get(nyckel);
    if (!tidigare || d < tidigare.d) traffar.set(nyckel, { namn: f.properties.namn, sida: f.properties.sida, d });
  }
  const lista = [...traffar.values()].sort((x, y) => (x.sida === 'trakt' ? -1 : 0) - (y.sida === 'trakt' ? -1 : 0) || x.d - y.d);
  if (lista.length === 0) return null;
  return { a: lista[0].namn, b: lista[1]?.namn ?? null, aSida: lista[0].sida, bSida: lista[1]?.sida ?? null };
}

export const FASTIGHET_KORT_MENING = 'Gränsen kan avvika några meter. Lita på snitsel och märkning i fält.';

/** Kortets rubrik: "Fastighetsgräns · Stänkelsmåla 1:3 mot Stänkelsmåla 1:9". Känner vi bara den ena sidan (andra fastigheten finns inte i Vidas data) står bara den. */
export function gransRubrik(m: GransMot): string {
  return m.b ? `Fastighetsgräns · ${m.a} mot ${m.b}` : `Fastighetsgräns · ${m.a}`;
}

/** Kortet i fällningsläget: "Fastighetsgräns 18 m" + uppmaningen. */
export function fastighetsFallText(f: GransFall): { rubrik: string; rad: string } {
  return { rubrik: `Fastighetsgräns ${f.avstandM} m`, rad: 'Fäll inte åt det hållet' };
}
