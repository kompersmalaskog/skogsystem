// Rena ring-operationer för "Redigera hörn" (dra hörnen). Koordinat-agnostiska: en ring är en lista
// av [x, y]-punkter (i appen [lng, lat]). Editering sker på en ÖPPEN ring (unika hörn, ingen
// dubblett-slutpunkt); lagring/rendering sluter ringen (slutRing). Testade i ringEdit_test.mjs.

export type Punkt = [number, number];

/** Ta bort en ev. dubblett-slutpunkt (första == sista) → öppen ring med unika hörn. */
export function oppnaRing(ring: Punkt[]): Punkt[] {
  if (ring.length >= 2) {
    const a = ring[0], b = ring[ring.length - 1];
    if (a[0] === b[0] && a[1] === b[1]) return ring.slice(0, -1);
  }
  return ring.slice();
}

/** Slut ringen (lägg tillbaka slutpunkt = förstapunkt) för lagring/rendering som polygon. */
export function slutRing(ring: Punkt[]): Punkt[] {
  if (ring.length >= 3) {
    const a = ring[0], b = ring[ring.length - 1];
    if (a[0] !== b[0] || a[1] !== b[1]) return [...ring, [a[0], a[1]]];
  }
  return ring.slice();
}

/** Flytta hörn `i` till `pt`. Utanför intervallet → oförändrad ring. */
export function flyttaHorn(ring: Punkt[], i: number, pt: Punkt): Punkt[] {
  if (i < 0 || i >= ring.length) return ring.slice();
  const r = ring.slice();
  r[i] = [pt[0], pt[1]];
  return r;
}

/** Lägg till ett hörn på kanten mellan hörn `kantIndex` och nästa (wrap) — vid `pt` (typ. kantens
 *  mittpunkt). Nya hörnet hamnar direkt EFTER `kantIndex`. Utanför intervallet → oförändrad. */
export function laggTillHorn(ring: Punkt[], kantIndex: number, pt: Punkt): Punkt[] {
  if (kantIndex < 0 || kantIndex >= ring.length) return ring.slice();
  const r = ring.slice();
  r.splice(kantIndex + 1, 0, [pt[0], pt[1]]);
  return r;
}

/** Ta bort hörn `i`. En yta behöver minst 3 hörn → tar aldrig bort under 3. Utanför intervallet → oförändrad. */
export function taBortHorn(ring: Punkt[], i: number): Punkt[] {
  if (ring.length <= 3) return ring.slice();
  if (i < 0 || i >= ring.length) return ring.slice();
  const r = ring.slice();
  r.splice(i, 1);
  return r;
}

/** Mittpunkt på varje kant (inkl. sista→första) → "lägg till hörn"-handtag. kantIndex matchar laggTillHorn. */
export function kantMittpunkter(ring: Punkt[]): { kantIndex: number; pt: Punkt }[] {
  const res: { kantIndex: number; pt: Punkt }[] = [];
  const n = ring.length;
  if (n < 2) return res;
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    res.push({ kantIndex: i, pt: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] });
  }
  return res;
}

/** Centroid (medelpunkt) av hörnen — för sifferplacering under redigering. */
export function ringMitt(ring: Punkt[]): Punkt {
  if (ring.length === 0) return [0, 0];
  let sx = 0, sy = 0;
  for (const p of ring) { sx += p[0]; sy += p[1]; }
  return [sx / ring.length, sy / ring.length];
}

// ── Förenkling och ångra (Redigera hörn, 2026-11-25) ─────────────────────────────────────────────────────────────────

/** Lokala meter runt ringens första punkt (räcker för en trakt): [lng, lat] → [x, y] i meter. */
function tillMeter(ring: Punkt[]): [number, number][] {
  const lat0 = ring[0][1], lng0 = ring[0][0];
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 111000;
  return ring.map((p) => [(p[0] - lng0) * kx, (p[1] - lat0) * ky]);
}

function avstandTillStracka(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

export interface Forenkling { ring: Punkt[]; fore: number; efter: number }

/**
 * Förenklar en ring med Douglas–Peucker i meter (en SLUTEN ring: den delas vid första punkten och punkten längst från den, så ingen hörnpunkt är "start").
 * Bara hörn som avviker mindre än `toleransM` från linjen mellan sina grannar tas bort; formen ändras alltså som mest `toleransM` meter.
 * Aldrig under `minHorn` hörn: blir det färre behålls de viktigaste (störst avvikelse) i stället. Returnerar en ÖPPEN ring + antalet före/efter.
 */
export function forenklaRing(ring: Punkt[], toleransM = 2, minHorn = 4): Forenkling {
  const oppen = oppnaRing(ring);
  const n = oppen.length;
  if (n <= Math.max(3, minHorn)) return { ring: oppen, fore: n, efter: n };
  const m = tillMeter(oppen);
  // Viktighet per hörn = avvikelsen när det valdes som delpunkt (aldrig större än sin förälders: ett barn till ett borttaget hörn försvinner också).
  const vikt = new Array<number>(n).fill(0);
  let langst = 1, ld = -1;
  for (let i = 1; i < n; i++) { const d = Math.hypot(m[i][0] - m[0][0], m[i][1] - m[0][1]); if (d > ld) { ld = d; langst = i; } }
  vikt[0] = Infinity; vikt[langst] = Infinity;
  const delning = (i: number, j: number, tak: number) => {
    // hörn strikt mellan i och j (cykliskt, j kan vara 0 = n)
    const slut = j <= i ? j + n : j;
    let k = -1, bd = -1;
    for (let q = i + 1; q < slut; q++) { const idx = q % n; const d = avstandTillStracka(m[idx], m[i], m[j % n]); if (d > bd) { bd = d; k = idx; } }
    if (k < 0) return;
    vikt[k] = Math.min(bd, tak);
    delning(i, k, vikt[k]);
    delning(k, j, vikt[k]);
  };
  delning(0, langst, Infinity);
  delning(langst, 0, Infinity);
  let behall = vikt.map((v, i) => (v > toleransM ? i : -1)).filter((i) => i >= 0);
  if (behall.length < minHorn) {
    behall = vikt.map((v, i) => ({ v, i })).sort((a, b) => (b.v === a.v ? a.i - b.i : b.v - a.v)).slice(0, minHorn).map((x) => x.i).sort((a, b) => a - b);
  }
  const ut = behall.map((i) => [oppen[i][0], oppen[i][1]] as Punkt);
  return { ring: ut, fore: n, efter: ut.length };
}

/** Ångra-stapeln: ögonblicksbilder av ringen FÖRE varje handling (ett drag, ett nytt hörn, ett borttaget hörn = ett steg). Ren — returnerar nya stapeln. */
export const ANGRA_MAX = 200;
export function skjutInSteg(steg: Punkt[][], ring: Punkt[]): Punkt[][] {
  const ny = [...steg, ring.map((p) => [p[0], p[1]] as Punkt)];
  return ny.length > ANGRA_MAX ? ny.slice(ny.length - ANGRA_MAX) : ny;
}
export function angraSteg(steg: Punkt[][]): { ring: Punkt[] | null; steg: Punkt[][] } {
  if (steg.length === 0) return { ring: null, steg };
  return { ring: steg[steg.length - 1].map((p) => [p[0], p[1]] as Punkt), steg: steg.slice(0, -1) };
}

/** Kort fingeravtryck av en rings geometri (punkter i valfria enheter, avrundade) — samma form → samma avtryck, ett flyttat hörn → ett nytt. */
export function ringAvtryck(punkter: { x: number; y: number }[]): string {
  let h = 5381;
  for (const p of punkter) {
    const t = `${p.x.toFixed(1)},${p.y.toFixed(1)};`;
    for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  }
  return `${punkter.length}:${(h >>> 0).toString(36)}`;
}
