// SKOGSDATA PER TRAKT — den rena delen (Martin 2026-11-17: prognosen ska bygga på laserskanningen, körspåren och högarna, helt automatiskt).
//
// Skogsstyrelsens laserdata (SkogligaGrunddata_3_1) ligger i SWEREF99 TM med 10 m rutor på jämna 10-tal. Här delas traktens ringar upp i
// UTSNITT (högst 3 km per sida, annars ett per ring), varje ruta märks inne/ute (rutans mitt i någon ring), och rutorna sammanfattas per trakt:
// volym, grundyta, grovlek, höjd, skanningsår, lutning och fukt. Rutorna sparas också (packade), så att nästa steg kan räkna
// "hur mycket stod det där skördaren har gått" utan att fråga Skogsstyrelsen igen.
//
// Inget här hämtar något. Hämtningen bor i lib/skogsdata/hamta.ts, körningen i lib/skogsdata/server.ts.
// Ett värde som saknas är null — aldrig 0.

import { tillSweref, utsnitt, RUTA_M, type Utsnitt } from '@/lib/laserGrundytaRutnat';
import { BRANT_GRANS, FUKT } from '@/lib/ritadKarta/mark';

export type Ring = [number, number][];   // [lng, lat]
export type RingXY = [number, number][]; // SWEREF99 TM

/** Saknas-märken i de packade banden. */
export const SAKNAS16 = 65535;
export const SAKNAS8 = 255;
/** Rimliga gränser — svarar tjänsten utanför dem har banden bytt plats, och det är ett fel. */
export const MAX_VOLYM_HA = 1500;   // m³sk/ha
export const MAX_GRUNDYTA = 100;    // m²/ha
export const MAX_DIAMETER_CM = 100;
export const MAX_HOJD_DM = 500;
/** Under så här stor andel rutor med laserdata sammanfattas inget (hygge, åker, fel gräns). */
export const MIN_TACKNING = 0.5;

export type Plan = { u: Utsnitt; ringar: RingXY[] };

/** Delar ringarna i utsnitt: ett för hela trakten om det ryms (≤ 3 km per sida), annars ett per ring. En ring som själv är för stor ger null. */
export function planeraUtsnitt(ringar: Ring[]): Plan[] | null {
  const xy = ringar.filter((r) => r.length >= 3).map((r) => tillSweref(r));
  if (!xy.length) return null;
  const hela = utsnitt(xy.flat());
  if (hela) return [{ u: hela, ringar: xy }];
  const ut: Plan[] = [];
  for (const r of xy) {
    const u = utsnitt(r);
    if (!u) return null;
    ut.push({ u, ringar: [r] });
  }
  return ut;
}

function iRing(x: number, y: number, r: RingXY): boolean {
  let inne = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inne = !inne;
  }
  return inne;
}

/** 1 där rutans mitt ligger i någon ring. Rad 0 = norr. */
export function inneMask(p: Plan): Uint8Array {
  const { u } = p;
  const m = new Uint8Array(u.bredd * u.hojd);
  for (let rad = 0; rad < u.hojd; rad++) {
    const y = u.maxY - (rad + 0.5) * RUTA_M;
    for (let kol = 0; kol < u.bredd; kol++) {
      const x = u.minX + (kol + 0.5) * RUTA_M;
      if (p.ringar.some((r) => iRing(x, y, r))) m[rad * u.bredd + kol] = 1;
    }
  }
  return m;
}

/** Ett utsnitt med sina band, som det sparas. Alla band har bredd × hojd värden, rad 0 = norr. */
export type Rutnat = {
  minX: number; maxY: number; bredd: number; hojd: number; rutaM: number;
  inne: Uint8Array;
  /** m³sk/ha, SAKNAS16 = ingen data */
  volym: Uint16Array;
  /** m²/ha, SAKNAS8 = ingen data */
  grundyta: Uint8Array;
  /** grundytevägd medeldiameter i cm, SAKNAS8 = ingen data (också 0: lasern ger ingen diameter på låg skog) */
  diameter: Uint8Array;
  /** medelhöjd i dm, SAKNAS16 = ingen data */
  hojdDm: Uint16Array;
  /** skanningsår − 2000, SAKNAS8 = okänt */
  ar: Uint8Array;
  /** grader, SAKNAS8 = ingen data. null = lutningen kunde inte hämtas. */
  lutning: Uint8Array | null;
  /** FuktKod (lib/ritadKarta/mark). null = markfuktigheten kunde inte hämtas. */
  fukt: Uint8Array | null;
};

type Band = ArrayLike<number>;
const ogiltig = (v: number, nodata: number | null) => !Number.isFinite(v) || v < 0 || (nodata !== null && v === nodata);

/**
 * Laserns fem band (volym, höjd, grundyta, diameter, skanningsdag) → packat rutnät. Kastar om värdena inte kan vara det de ska vara
 * (banden har bytt plats) — hellre ett fel än en prognos på höjder som lästs som volym.
 */
export function packaLaser(p: Plan, band: { volym: Band; hojd: Band; grundyta: Band; diameter: Band; dag: Band }, nodata: number | null, idag = new Date()): Rutnat {
  const { u } = p;
  const n = u.bredd * u.hojd;
  for (const b of Object.values(band)) if (b.length !== n) throw new Error('fel storlek på laserdatan');
  const inne = inneMask(p);
  const volym = new Uint16Array(n).fill(SAKNAS16), hojdDm = new Uint16Array(n).fill(SAKNAS16);
  const grundyta = new Uint8Array(n).fill(SAKNAS8), diameter = new Uint8Array(n).fill(SAKNAS8), ar = new Uint8Array(n).fill(SAKNAS8);
  const iAr = idag.getUTCFullYear();
  for (let i = 0; i < n; i++) {
    const v = band.volym[i], h = band.hojd[i], g = band.grundyta[i], d = band.diameter[i], dag = band.dag[i];
    if (!ogiltig(v, nodata)) { if (v > MAX_VOLYM_HA) throw new Error(`orimlig volym ${v}`); volym[i] = Math.round(v); }
    if (!ogiltig(h, nodata)) { if (h > MAX_HOJD_DM) throw new Error(`orimlig höjd ${h}`); hojdDm[i] = Math.round(h); }
    if (!ogiltig(g, nodata)) { if (g > MAX_GRUNDYTA) throw new Error(`orimlig grundyta ${g}`); grundyta[i] = Math.round(g); }
    if (!ogiltig(d, nodata) && d > 0) { if (d > MAX_DIAMETER_CM) throw new Error(`orimlig diameter ${d}`); diameter[i] = Math.round(d); }
    if (!ogiltig(dag, nodata) && dag > 0) {
      const y = new Date(Math.round(dag) * 86_400_000).getUTCFullYear();
      if (y < 2009 || y > iAr) throw new Error(`orimligt skanningsår ${y}`);
      ar[i] = y - 2000;
    }
  }
  return { minX: u.minX, maxY: u.maxY, bredd: u.bredd, hojd: u.hojd, rutaM: RUTA_M, inne, volym, grundyta, diameter, hojdDm, ar, lutning: null, fukt: null };
}

/** Lutningens band (grader) → en byte per ruta. */
export function packaLutning(band: Band, n: number): Uint8Array {
  if (band.length !== n) throw new Error('fel storlek på lutningen');
  const ut = new Uint8Array(n).fill(SAKNAS8);
  for (let i = 0; i < n; i++) { const g = band[i]; if (Number.isFinite(g) && g >= 0 && g <= 90) ut[i] = Math.round(g); }
  return ut;
}

export type Sammanfattning = {
  /** Ytan innanför gränsen enligt rutnätet (ha). */
  arealHa: number;
  /** Andel av rutorna innanför gränsen som har laserdata (volym). */
  tackning: number;
  /** Laserns värden över rutorna med data. null = för lite data (under MIN_TACKNING). */
  laser: {
    /** m³sk per hektar, medel */
    volymHa: number;
    /** m³sk i hela trakten (medel × ytan med data) */
    volym: number;
    /** m²/ha, medel. null = ingen ruta hade grundyta. */
    grundyta: number | null;
    /** grundytevägd medeldiameter (cm), vägd med rutornas grundyta. null = ingen ruta hade diameter. */
    diameterCm: number | null;
    /** m, medel */
    hojdM: number | null;
    /** vanligaste skanningsåret */
    ar: number | null;
  } | null;
  /** null = lutningen saknas */
  lutning: { medel: number; andelLite: number; andelMycket: number } | null;
  /** null = markfuktigheten saknas */
  fukt: { andelFuktig: number; andelBlot: number } | null;
};

const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Sammanfattar ett eller flera utsnitt till EN rad för trakten. */
export function sammanfatta(nat: Rutnat[]): Sammanfattning {
  let inne = 0, med = 0, sumV = 0, sumG = 0, antG = 0, sumDG = 0, sumGd = 0, sumH = 0, antH = 0;
  let lutN = 0, lutSum = 0, lutLite = 0, lutMycket = 0, harLut = false;
  let fuktN = 0, fuktig = 0, blot = 0, harFukt = false;
  const ar = new Map<number, number>();
  for (const r of nat) {
    const n = r.bredd * r.hojd;
    if (r.lutning) harLut = true;
    if (r.fukt) harFukt = true;
    for (let i = 0; i < n; i++) {
      if (!r.inne[i]) continue;
      inne++;
      if (r.lutning && r.lutning[i] !== SAKNAS8) {
        const g = r.lutning[i]; lutN++; lutSum += g;
        if (g >= BRANT_GRANS.mycket) lutMycket++; else if (g >= BRANT_GRANS.lite) lutLite++;
      }
      if (r.fukt) { fuktN++; if (r.fukt[i] === FUKT.blot) blot++; else if (r.fukt[i] === FUKT.fuktig) fuktig++; }
      if (r.volym[i] === SAKNAS16) continue;
      med++; sumV += r.volym[i];
      if (r.grundyta[i] !== SAKNAS8) {
        sumG += r.grundyta[i]; antG++;
        if (r.diameter[i] !== SAKNAS8) { sumDG += r.diameter[i] * r.grundyta[i]; sumGd += r.grundyta[i]; }
      }
      if (r.hojdDm[i] !== SAKNAS16) { sumH += r.hojdDm[i]; antH++; }
      if (r.ar[i] !== SAKNAS8) ar.set(r.ar[i] + 2000, (ar.get(r.ar[i] + 2000) ?? 0) + 1);
    }
  }
  const rutaHa = (RUTA_M * RUTA_M) / 10_000;
  const tackning = inne ? med / inne : 0;
  const vanligast = [...ar.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    arealHa: Math.round(inne * rutaHa * 100) / 100,
    tackning: r3(tackning),
    laser: med > 0 && tackning >= MIN_TACKNING ? {
      volymHa: r1(sumV / med),
      volym: Math.round(sumV * rutaHa),
      grundyta: antG ? r1(sumG / antG) : null,
      diameterCm: sumGd > 0 ? r1(sumDG / sumGd) : null,
      hojdM: antH ? r1(sumH / antH / 10) : null,
      ar: vanligast,
    } : null,
    lutning: harLut && lutN > 0 ? { medel: r1(lutSum / lutN), andelLite: r3(lutLite / lutN), andelMycket: r3(lutMycket / lutN) } : null,
    fukt: harFukt && fuktN > 0 ? { andelFuktig: r3(fuktig / fuktN), andelBlot: r3(blot / fuktN) } : null,
  };
}

// ---- Packning till och från det som sparas (jsonb) --------------------------------------------------------------------------------------

const b64 = (b: Uint8Array) => Buffer.from(b.buffer, b.byteOffset, b.byteLength).toString('base64');
const b64u16 = (b: Uint16Array) => Buffer.from(b.buffer, b.byteOffset, b.byteLength).toString('base64');
const fran8 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));
const fran16 = (s: string) => { const b = Buffer.from(s, 'base64'); return new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };

export type SparatRutnat = {
  minX: number; maxY: number; bredd: number; hojd: number; rutaM: number;
  inne: string; volym: string; grundyta: string; diameter: string; hojdDm: string; ar: string; lutning: string | null; fukt: string | null;
};

export function tillSparat(r: Rutnat): SparatRutnat {
  return {
    minX: r.minX, maxY: r.maxY, bredd: r.bredd, hojd: r.hojd, rutaM: r.rutaM,
    inne: b64(r.inne), volym: b64u16(r.volym), grundyta: b64(r.grundyta), diameter: b64(r.diameter), hojdDm: b64u16(r.hojdDm), ar: b64(r.ar),
    lutning: r.lutning ? b64(r.lutning) : null, fukt: r.fukt ? b64(r.fukt) : null,
  };
}

export function franSparat(s: SparatRutnat): Rutnat {
  const n = s.bredd * s.hojd;
  const r: Rutnat = {
    minX: s.minX, maxY: s.maxY, bredd: s.bredd, hojd: s.hojd, rutaM: s.rutaM,
    inne: fran8(s.inne), volym: fran16(s.volym), grundyta: fran8(s.grundyta), diameter: fran8(s.diameter), hojdDm: fran16(s.hojdDm), ar: fran8(s.ar),
    lutning: s.lutning ? fran8(s.lutning) : null, fukt: s.fukt ? fran8(s.fukt) : null,
  };
  for (const b of [r.inne, r.volym, r.grundyta, r.diameter, r.hojdDm, r.ar]) if (b.length !== n) throw new Error('sparat rutnät har fel storlek');
  return r;
}
