// Geometri för larmet: avstånd till en punkt eller linje och "är jag inne i ytan?". Ren, i meter, lokal plan approximation (räcker på 40 m).
// Alla koordinater är WGS84 { lat, lon }.

export interface LatLon { lat: number; lon: number }

const M_PER_GRAD = 111320;
const RAD = Math.PI / 180;

/** Meter öst/nord om `origo`. */
function xy(origo: LatLon, p: LatLon): [number, number] {
  return [(p.lon - origo.lon) * M_PER_GRAD * Math.cos(origo.lat * RAD), (p.lat - origo.lat) * M_PER_GRAD];
}

export function avstandPunktM(a: LatLon, b: LatLon): number {
  const [x, y] = xy(a, b);
  return Math.hypot(x, y);
}

/** Avstånd i meter från `pos` till närmaste punkt på linjen. En linje med en enda punkt är en punkt; en tom linje är oändligt långt bort. */
export function avstandTillLinjeM(pos: LatLon, linje: readonly LatLon[]): number {
  if (linje.length === 0) return Infinity;
  if (linje.length === 1) return avstandPunktM(pos, linje[0]);
  let min = Infinity;
  for (let i = 0; i < linje.length - 1; i++) {
    const [ax, ay] = xy(pos, linje[i]);
    const [bx, by] = xy(pos, linje[i + 1]);
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    // Närmaste punkt på segmentet till origo (= pos).
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2));
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < min) min = d;
  }
  return min;
}

/**
 * Ligger `pos` inne i ytan? `ringar[0]` är ytterkanten, resten är hål (jämn-udda över alla ringar, så ett hål räknas som utanför).
 * Ringen behöver inte vara sluten. Färre än tre punkter är ingen yta.
 */
export function arInnePolygon(pos: LatLon, ringar: ReadonlyArray<readonly LatLon[]>): boolean {
  let inne = false;
  for (const ring of ringar) {
    if (ring.length < 3) continue;
    let ringInne = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = xy(pos, ring[i]);
      const [xj, yj] = xy(pos, ring[j]);
      if ((yi > 0) !== (yj > 0) && 0 < ((xj - xi) * (0 - yi)) / (yj - yi) + xi) ringInne = !ringInne;
    }
    if (ringInne) inne = !inne;
  }
  return inne;
}

/** Billig förkoll: ligger pos inom `marginM` från figurens ruta? Spar tunga beräkningar för Vidas stora geometrier. */
export function narRuta(pos: LatLon, punkter: readonly LatLon[], marginM: number): boolean {
  if (punkter.length === 0) return false;
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of punkter) {
    if (p.lat < minLat) minLat = p.lat; if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon; if (p.lon > maxLon) maxLon = p.lon;
  }
  const dLat = marginM / M_PER_GRAD;
  const dLon = marginM / (M_PER_GRAD * Math.cos(pos.lat * RAD));
  return pos.lat >= minLat - dLat && pos.lat <= maxLat + dLat && pos.lon >= minLon - dLon && pos.lon <= maxLon + dLon;
}

/**
 * Avstånd i meter från `pos` till närmaste punkt på ytan: 0 när positionen ligger inne i ytan (hål räknas som utanför), annars till närmaste kant.
 * Ringarna behöver inte vara slutna. Färre än tre punkter i ytterkanten är ingen yta (Infinity).
 */
export function avstandTillYtaM(pos: LatLon, ringar: ReadonlyArray<readonly LatLon[]>): number {
  const ytter = ringar[0] ?? [];
  if (ytter.length < 3) return Infinity;
  if (arInnePolygon(pos, ringar)) return 0;
  let min = Infinity;
  for (const ring of ringar) {
    if (ring.length < 2) continue;
    const sluten = ring[0].lat === ring[ring.length - 1].lat && ring[0].lon === ring[ring.length - 1].lon ? ring : [...ring, ring[0]];
    min = Math.min(min, avstandTillLinjeM(pos, sluten));
  }
  return min;
}

/**
 * Sträckan av en linje närmast `pos`: `halvM` meter åt varje håll från närmaste punkt (kortare där linjen tar slut). Linjer som är kortare än
 * 2 × halvM returneras hela. Sträckan följer linjens egna punkter, så en böj ligger kvar. Koordinaterna returneras som { lat, lon }.
 */
export function strackaNarmast(pos: LatLon, linje: readonly LatLon[], halvM: number): LatLon[] {
  if (linje.length < 2) return [...linje];
  // Kumulativ längd längs linjen och närmaste punkt (segment + andel).
  const kum: number[] = [0];
  for (let i = 1; i < linje.length; i++) kum.push(kum[i - 1] + avstandPunktM(linje[i - 1], linje[i]));
  const total = kum[kum.length - 1];
  let bastD = Infinity, bastS = 0;
  for (let i = 0; i < linje.length - 1; i++) {
    const [ax, ay] = xy(pos, linje[i]);
    const [bx, by] = xy(pos, linje[i + 1]);
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2));
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < bastD) { bastD = d; bastS = kum[i] + t * (kum[i + 1] - kum[i]); }
  }
  const fran = Math.max(0, bastS - halvM);
  const till = Math.min(total, bastS + halvM);
  const punktVid = (s: number): LatLon => {
    let i = 1;
    while (i < kum.length - 1 && kum[i] < s) i++;
    const seg = kum[i] - kum[i - 1];
    const f = seg === 0 ? 0 : Math.max(0, Math.min(1, (s - kum[i - 1]) / seg));
    return { lat: linje[i - 1].lat + (linje[i].lat - linje[i - 1].lat) * f, lon: linje[i - 1].lon + (linje[i].lon - linje[i - 1].lon) * f };
  };
  const ut: LatLon[] = [punktVid(fran)];
  for (let i = 0; i < linje.length; i++) if (kum[i] > fran && kum[i] < till) ut.push(linje[i]);
  ut.push(punktVid(till));
  return ut;
}
