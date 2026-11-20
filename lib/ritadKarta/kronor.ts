// RITAD KARTA, steg 2: skogen i 3D (Martin 2026-10-29: "som Apple-kartan och Snapchat"). När kartan lutas ställer sig skogen upp.
// Rena funktioner; sidan i app/karta-ritad lägger lagret (MapLibre fill-extrusion).

import { RUTA_M, klasser, tillLngLat, type Rutnat } from './skog';

export type BlockKlass = 'ung' | 'gallring' | 'mogen';

// ── Kronorna ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Först provat: en yta per skogsklass dragen till klassens höjd. Det blev en grön tårta (platta toppar) och på terrängen trappsteg, eftersom
// MapLibre lägger varje yta på EN markhöjd. Därför ritas skogen i 3D som KRONOR: en liten mångkant per ruta, dragen upp till rutans egen laserhöjd och
// svävande en bit över marken (stammen syns inte). Varje krona är liten, så den följer terrängen; tillsammans blir de ett levande krontak
// där höjdskillnaderna syns. Platsen och storleken skakas fast per ruta (samma ruta ger alltid samma krona).

/** Kronans radie (m) per klass — mogen skog sluter krontaket (10 m rutor), ungskog står glesare. */
export const KRONA_RADIE_M: Record<BlockKlass, number> = { ung: 2.8, gallring: 4.2, mogen: 5.4 };
/** Hörn per våning: fler hörn = rundare krona. */
export const KRONA_HORN = 9;

export type Krona = { klass: BlockKlass; hojd: number; bas: number; ton: number; ring: [number, number][] };

/**
 * Granens våningar, nedifrån: [från andel av höjden, till andel, radie som andel]. Tre avsmalnande våningar gör en pelare till en gran.
 * Den nedersta börjar en bit upp (stammen ritas inte), den översta är smal.
 */
export const VANINGAR: [number, number, number][] = [[0.32, 0.58, 1], [0.58, 0.8, 0.68], [0.8, 1, 0.38]];
/**
 * Hur många våningar som ritas efter hur mycket skog utsnittet har — så ritningen går lika fort på en stor trakt.
 * Upp till 25 000 skogsrutor tre våningar, upp till 50 000 två (nedre och översta, sammanslagna), däröver en.
 */
export const VANINGAR_GRANS = { tre: 25_000, tva: 50_000 } as const;

export function vaningarFor(skogsrutor: number): [number, number, number][] {
  if (skogsrutor <= VANINGAR_GRANS.tre) return VANINGAR;
  if (skogsrutor <= VANINGAR_GRANS.tva) return [[VANINGAR[0][0], VANINGAR[1][1], 1], [VANINGAR[1][1], 1, 0.5]];
  return [[VANINGAR[0][0], 1, 1]];
}

/** Kronorna per ruta med skog (aldrig avverkat, hygge eller utan data), en post per våning. ton 0–1 = färgvariation per träd. */
export function kronor(rn: Rutnat, avverkat: Set<number>, skakFn: (i: number, salt: number) => number): Krona[] {
  const kl = klasser(rn, avverkat);
  const skog = kl.reduce((n, c) => n + (c === 'ung' || c === 'gallring' || c === 'mogen' ? 1 : 0), 0);
  const vaningar = vaningarFor(skog);
  const ut: Krona[] = [];
  const mangkant = (cx: number, cy: number, rad: number, vrid: number) => {
    const ring: [number, number][] = [];
    for (let j = 0; j <= KRONA_HORN; j++) {
      const v = vrid + (j % KRONA_HORN) / KRONA_HORN * Math.PI * 2;
      ring.push(tillLngLat(cx + Math.cos(v) * rad, cy + Math.sin(v) * rad));
    }
    return ring;
  };
  const d1 = (v: number) => Math.round(v * 10) / 10;
  for (let r = 0; r < rn.hojd; r++) for (let k = 0; k < rn.bredd; k++) {
    const i = r * rn.bredd + k;
    const c = kl[i];
    if (c !== 'ung' && c !== 'gallring' && c !== 'mogen') continue;
    const hojd = d1(Math.max(1.5, (rn.hojdDm[i] ?? 0) / 10));
    const rad = KRONA_RADIE_M[c] * (0.8 + 0.4 * skakFn(i, 4));
    const cx = rn.minX + (k + 0.25 + 0.5 * skakFn(i, 5)) * RUTA_M;
    const cy = rn.maxY - (r + 0.25 + 0.5 * skakFn(i, 6)) * RUTA_M;
    const vrid = skakFn(i, 7) * Math.PI * 2;
    const ton = Math.round(skakFn(i, 8) * 100) / 100;
    vaningar.forEach(([fran, till, rr], n) => {
      ut.push({ klass: c, hojd: n === vaningar.length - 1 ? hojd : d1(hojd * till), bas: d1(hojd * fran), ton, ring: mangkant(cx, cy, rad * rr, vrid + n * Math.PI / KRONA_HORN) });
    });
  }
  return ut;
}
