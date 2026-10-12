// Avverkad areal ur skördarens hyttspår — "Avverkat X av Y ha" i objektinfon och "efter"-bedömningen i körvyns objektpill.
//
// SAMMA beräkning för båda (Martins spec 2026-10-05): skördarens hyttspår, 10 m buffert runt spåret, klippt mot objektets
// traktgräns, areal i hektar. Skördaren når ungefär 10 m åt varje håll, så spåret med 10 m buffert är ytan den har arbetat.
//
// METOD: rasterisering i lokala meter (ingen turf/polygon-clipping i appen). Varje spårsegment markerar rutorna vars mitt
// ligger ≤ buffert från segmentet; markerade rutor inom traktgränsen räknas. UNION av alla segment — samma yta körd två
// gånger räknas en gång, och flera dagars spår kan skickas in tillsammans (dubbletter gör ingen skada). Ruta 2 m ger
// ca 1–2 % fel på ett 20 m brett stråk, långt under spridningen i själva GPS-spåret.
//
// Rena funktioner → testbara (avverkadAreal.test.ts mot kända geometrier).

export type Punkt = [number, number]; // [lng, lat]

export const AVVERKAT_BUFFERT_M = 10;
const JORDRADIE_M = 6371008.8;
const MAX_RUTOR = 4_000_000;

export interface AvverkatOpts {
  /** Objektets traktgräns (yttre ringar, [lng,lat]). Saknas/tom → ingen klippning. */
  ringar?: Punkt[][] | null;
  bufferM?: number;
  /** Rutstorlek i meter (växer automatiskt för mycket stora ytor). */
  cellM?: number;
}

function projicera(alla: Punkt[]): (p: Punkt) => [number, number] {
  let lat0 = 0, lng0 = 0;
  for (const p of alla) { lat0 += p[1]; lng0 += p[0]; }
  lat0 /= alla.length; lng0 /= alla.length;
  const rad = Math.PI / 180;
  const kx = JORDRADIE_M * Math.cos(lat0 * rad) * rad;
  const ky = JORDRADIE_M * rad;
  return (p) => [(p[0] - lng0) * kx, (p[1] - lat0) * ky];
}

function punktIRing(x: number, y: number, ring: [number, number][]): boolean {
  let inne = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) inne = !inne;
  }
  return inne;
}

const giltig = (p: any): p is Punkt => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);

/** Avverkad yta i m²: union av `bufferM` runt alla spårsegment, klippt mot traktgränsen. */
export function avverkadAreaM2(segment: readonly (readonly Punkt[])[] | null | undefined, opts: AvverkatOpts = {}): number {
  const buffert = opts.bufferM ?? AVVERKAT_BUFFERT_M;
  const segs = (segment || []).map((s) => (s || []).filter(giltig)).filter((s) => s.length > 0);
  if (segs.length === 0) return 0;
  const ringarIn = (opts.ringar || []).map((r) => (r || []).filter(giltig)).filter((r) => r.length >= 3);

  const alla: Punkt[] = segs.flat();
  const proj = projicera(alla);
  const spar = segs.map((s) => s.map(proj));
  const ringar = ringarIn.map((r) => r.map(proj));

  // Rutnätets utsträckning: spårets bbox + buffert, snittad med ringarnas bbox (utanför trakten räknas ändå inget).
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of spar) for (const [x, y] of s) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  x0 -= buffert; y0 -= buffert; x1 += buffert; y1 += buffert;
  if (ringar.length > 0) {
    let rx0 = Infinity, ry0 = Infinity, rx1 = -Infinity, ry1 = -Infinity;
    for (const r of ringar) for (const [x, y] of r) { if (x < rx0) rx0 = x; if (x > rx1) rx1 = x; if (y < ry0) ry0 = y; if (y > ry1) ry1 = y; }
    x0 = Math.max(x0, rx0); y0 = Math.max(y0, ry0); x1 = Math.min(x1, rx1); y1 = Math.min(y1, ry1);
  }
  if (!(x1 > x0) || !(y1 > y0)) return 0;

  let cell = opts.cellM ?? 2;
  cell = Math.max(cell, Math.sqrt(((x1 - x0) * (y1 - y0)) / MAX_RUTOR));
  const nx = Math.max(1, Math.ceil((x1 - x0) / cell));
  const ny = Math.max(1, Math.ceil((y1 - y0) / cell));
  const rutor = new Uint8Array(nx * ny);
  const b2 = buffert * buffert;

  const markera = (ax: number, ay: number, bx: number, by: number) => {
    const minx = Math.min(ax, bx) - buffert, maxx = Math.max(ax, bx) + buffert;
    const miny = Math.min(ay, by) - buffert, maxy = Math.max(ay, by) + buffert;
    const ix0 = Math.max(0, Math.floor((minx - x0) / cell)), ix1 = Math.min(nx - 1, Math.floor((maxx - x0) / cell));
    const iy0 = Math.max(0, Math.floor((miny - y0) / cell)), iy1 = Math.min(ny - 1, Math.floor((maxy - y0) / cell));
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    for (let iy = iy0; iy <= iy1; iy++) {
      const cy = y0 + (iy + 0.5) * cell;
      for (let ix = ix0; ix <= ix1; ix++) {
        const cx = x0 + (ix + 0.5) * cell;
        let t = l2 > 0 ? ((cx - ax) * dx + (cy - ay) * dy) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = ax + t * dx - cx, py = ay + t * dy - cy;
        if (px * px + py * py <= b2) rutor[iy * nx + ix] = 1;
      }
    }
  };
  for (const s of spar) {
    if (s.length === 1) markera(s[0][0], s[0][1], s[0][0], s[0][1]);
    for (let i = 1; i < s.length; i++) markera(s[i - 1][0], s[i - 1][1], s[i][0], s[i][1]);
  }

  let antal = 0;
  for (let iy = 0; iy < ny; iy++) {
    const cy = y0 + (iy + 0.5) * cell;
    for (let ix = 0; ix < nx; ix++) {
      if (!rutor[iy * nx + ix]) continue;
      if (ringar.length > 0) {
        const cx = x0 + (ix + 0.5) * cell;
        if (!ringar.some((r) => punktIRing(cx, cy, r))) continue;
      }
      antal++;
    }
  }
  return antal * cell * cell;
}

/** Avverkad andel 0–1 av objektets areal (ha). Okänt/ogiltigt areal → null (aldrig en gissad andel). */
export function avverkadAndel(avverkatM2: number, arealHa: number | null | undefined): number | null {
  if (arealHa == null || !(arealHa > 0) || !Number.isFinite(avverkatM2)) return null;
  return Math.min(1, Math.max(0, avverkatM2 / (arealHa * 10000)));
}

/** Avverkat i ha, klampat till objektets areal (en avverkad yta kan inte vara större än objektet). */
export function avverkatHa(avverkatM2: number, arealHa: number | null | undefined): number {
  const ha = Math.max(0, avverkatM2) / 10000;
  return arealHa != null && arealHa > 0 ? Math.min(ha, arealHa) : ha;
}
