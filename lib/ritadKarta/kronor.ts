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
/** Kronan börjar på denna andel av höjden (resten är stam, som inte ritas). */
export const KRONA_BAS = 0.35;
export const KRONA_HORN = 7;

export type Krona = { klass: BlockKlass; hojd: number; bas: number; ton: number; ring: [number, number][] };
/** Granens två våningar: den nedre bred upp till VANING_SKARV av höjden, den övre smal (VANING_SMAL av radien) till toppen. Det gör en pelare till en gran. */
export const VANING_SKARV = 0.68;
export const VANING_SMAL = 0.55;
/** Över så här många rutor med skog ritas bara en våning (ritningen ska gå lika fort på en stor trakt). */
export const MAX_TVA_VANINGAR = 40_000;

/** Kronorna per ruta med skog (aldrig avverkat, hygge eller utan data): två våningar, eller en på ett mycket stort utsnitt. ton 0–1 = färgvariation per träd. */
export function kronor(rn: Rutnat, avverkat: Set<number>, skakFn: (i: number, salt: number) => number): Krona[] {
  const kl = klasser(rn, avverkat);
  const skog = kl.reduce((n, c) => n + (c === 'ung' || c === 'gallring' || c === 'mogen' ? 1 : 0), 0);
  const tva = skog <= MAX_TVA_VANINGAR;
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
    const bas = d1(hojd * KRONA_BAS);
    if (!tva) { ut.push({ klass: c, hojd, bas, ton, ring: mangkant(cx, cy, rad, vrid) }); continue; }
    const skarv = d1(hojd * VANING_SKARV);
    ut.push({ klass: c, hojd: skarv, bas, ton, ring: mangkant(cx, cy, rad, vrid) });
    ut.push({ klass: c, hojd, bas: skarv, ton, ring: mangkant(cx, cy, rad * VANING_SMAL, vrid + Math.PI / KRONA_HORN) });
  }
  return ut;
}
