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
