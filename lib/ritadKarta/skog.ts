// RITAD KARTA, steg 1 (Martin 2026-10-28/29: "som Apple-kartan och Snapchat"). Skogen ritad ur laserdatan i stället för flygfoto.
//
// Rena funktioner — läsningen mot Skogsstyrelsen bor i app/api/ritad-karta/laser/route.ts, sidan i app/karta-ritad.
//  - Rutnätet är Skogsstyrelsens Skogliga grunddata (10 m rutor, SWEREF99 TM, rad 0 = norr): medelhöjd i dm och skanningsdag.
//  - Höjden ger en skogsklass: öppet/hygge, ungskog, gallringsskog, mogen skog (KLASS_GRANS). Lasern kan inte skilja hygge från åker —
//    det kräver marktäckedata (NMD), nästa steg.
//  - Det som skördaren fällt (stammarnas positioner) ritas som avverkat, oavsett vad den äldre lasern säger.
//  - Träden ritas som symboler, ett per TRAD_STEG_M, storlek efter höjden. Platsen skakas fast (samma ruta ger alltid samma plats),
//    så kartan inte "dansar" när den ritas om.

import proj4 from 'proj4';

export const SWEREF99TM = '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
export const RUTA_M = 10;
/** Marginal runt trakten som ritas (m). */
export const MARGINAL_M = 300;
/** Största utsnitt (rutor per sida) = 4 km. */
export const MAX_SIDA = 400;

export type Klass = 'ingen' | 'oppet' | 'ung' | 'gallring' | 'mogen' | 'avverkat';
/** Övre gräns (m) per klass. Under 1,5 m = öppet/hygge, 1,5–7 m ungskog, 7–16 m gallringsskog, däröver mogen skog. */
export const KLASS_GRANS = { oppet: 1.5, ung: 7, gallring: 16 } as const;

export type Rutnat = {
  minX: number; maxY: number; bredd: number; hojd: number;
  /** Medelhöjd i dm per ruta, rad 0 = norr; null = ingen data. */
  hojdDm: (number | null)[];
  /** Skanningsår (vanligaste i utsnittet), null om okänt. */
  ar: number | null;
};

export type Utsnitt = { minX: number; minY: number; maxX: number; maxY: number; bredd: number; hojd: number };

export const tillSweref = (lng: number, lat: number) => proj4('EPSG:4326', SWEREF99TM, [lng, lat]) as [number, number];
export const tillLngLat = (x: number, y: number) => proj4(SWEREF99TM, 'EPSG:4326', [x, y]) as [number, number];

/** Utsnittet på jämna 10 m runt trakten + marginal. Null om inga punkter eller orimligt stort. */
export function utsnittForRingar(ringar: [number, number][][], marginal = MARGINAL_M): Utsnitt | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of ringar) for (const [lng, lat] of r) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    const [x, y] = tillSweref(lng, lat);
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return null;
  const u = {
    minX: Math.floor((minX - marginal) / RUTA_M) * RUTA_M,
    minY: Math.floor((minY - marginal) / RUTA_M) * RUTA_M,
    maxX: Math.ceil((maxX + marginal) / RUTA_M) * RUTA_M,
    maxY: Math.ceil((maxY + marginal) / RUTA_M) * RUTA_M,
  };
  const bredd = Math.round((u.maxX - u.minX) / RUTA_M);
  const hojd = Math.round((u.maxY - u.minY) / RUTA_M);
  if (bredd <= 0 || hojd <= 0 || bredd > MAX_SIDA || hojd > MAX_SIDA) return null;
  return { ...u, bredd, hojd };
}

export function klassFor(hojdDm: number | null): Klass {
  if (hojdDm == null || !Number.isFinite(hojdDm)) return 'ingen';
  const m = hojdDm / 10;
  if (m < KLASS_GRANS.oppet) return 'oppet';
  if (m < KLASS_GRANS.ung) return 'ung';
  if (m < KLASS_GRANS.gallring) return 'gallring';
  return 'mogen';
}

/**
 * Rutorna där skördaren fällt minst en stam (index i rutnätet). En ruta utan stam men omgiven av avverkat (minst 5 av 8 grannar, två varv)
 * räknas också: en 10 m-ruta där ingen stam råkade stå är inte skog som stod kvar.
 */
export function avverkadeRutor(rn: Pick<Rutnat, 'minX' | 'maxY' | 'bredd' | 'hojd'>, stammar: { lat: number; lng: number }[]): Set<number> {
  const ut = rutorMedStam(rn, stammar);
  for (let varv = 0; varv < 2; varv++) {
    const nya: number[] = [];
    for (let r = 0; r < rn.hojd; r++) for (let k = 0; k < rn.bredd; k++) {
      const i = r * rn.bredd + k;
      if (ut.has(i)) continue;
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dk = -1; dk <= 1; dk++) {
        if (!dr && !dk) continue;
        const rr = r + dr, kk = k + dk;
        if (rr >= 0 && kk >= 0 && rr < rn.hojd && kk < rn.bredd && ut.has(rr * rn.bredd + kk)) n++;
      }
      if (n >= 5) nya.push(i);
    }
    if (!nya.length) break;
    for (const i of nya) ut.add(i);
  }
  return ut;
}

function rutorMedStam(rn: Pick<Rutnat, 'minX' | 'maxY' | 'bredd' | 'hojd'>, stammar: { lat: number; lng: number }[]): Set<number> {
  const ut = new Set<number>();
  for (const s of stammar) {
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue;
    const [x, y] = tillSweref(s.lng, s.lat);
    const kol = Math.floor((x - rn.minX) / RUTA_M);
    const rad = Math.floor((rn.maxY - y) / RUTA_M);
    if (kol < 0 || rad < 0 || kol >= rn.bredd || rad >= rn.hojd) continue;
    ut.add(rad * rn.bredd + kol);
  }
  return ut;
}

/** Klass per ruta, med det avverkade ovanpå lasern. */
export function klasser(rn: Rutnat, avverkat: Set<number>): Klass[] {
  return rn.hojdDm.map((h, i) => (avverkat.has(i) ? 'avverkat' : klassFor(h)));
}

/** Fast pseudo-slump i [0,1) per ruta — samma ruta ger alltid samma tal. */
export function skak(i: number, salt: number): number {
  let h = (i * 374761393 + salt * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export const TRAD_STEG_M = 30;
export type Trad = { lng: number; lat: number; storlek: number; klass: Exclude<Klass, 'ingen' | 'oppet' | 'avverkat'> };

/**
 * Ett träd per TRAD_STEG_M (2 × 2 rutor) där skogen står (minst ungskog), aldrig på avverkat. Storlek 0,4–1 efter höjden (30 m = 1).
 * Platsen skakas inom blocket; en del block får inget träd så det inte blir ett rutnät.
 */
export function trad(rn: Rutnat, kl: Klass[]): Trad[] {
  const steg = Math.max(1, Math.round(TRAD_STEG_M / RUTA_M));
  const ut: Trad[] = [];
  for (let r = 0; r < rn.hojd; r += steg) {
    for (let k = 0; k < rn.bredd; k += steg) {
      const i = r * rn.bredd + k;
      const c = kl[i];
      if (c !== 'ung' && c !== 'gallring' && c !== 'mogen') continue;
      if (skak(i, 1) < 0.15) continue;
      const h = (rn.hojdDm[i] ?? 0) / 10;
      const x = rn.minX + (k + skak(i, 2) * steg) * RUTA_M;
      const y = rn.maxY - (r + skak(i, 3) * steg) * RUTA_M;
      const [lng, lat] = tillLngLat(x, y);
      ut.push({ lng, lat, storlek: Math.round(Math.min(1, Math.max(0.4, h / 30)) * 100) / 100, klass: c });
    }
  }
  return ut;
}

/** Hörnen (lng/lat) för rutnätets bild: övre vänster, övre höger, nedre höger, nedre vänster — som MapLibres image-källa vill ha dem. */
export function bildHorn(rn: Pick<Rutnat, 'minX' | 'maxY' | 'bredd' | 'hojd'>): [[number, number], [number, number], [number, number], [number, number]] {
  const maxX = rn.minX + rn.bredd * RUTA_M, minY = rn.maxY - rn.hojd * RUTA_M;
  return [tillLngLat(rn.minX, rn.maxY), tillLngLat(maxX, rn.maxY), tillLngLat(maxX, minY), tillLngLat(rn.minX, minY)];
}

const KLASSER: Klass[] = ['ingen', 'oppet', 'ung', 'gallring', 'mogen', 'avverkat'];
/** Utjämningens bredd i rutor. 0,6 = kanten följer rutnätet men utan trappsteg. */
export const UTJAMNING = 0.6;
/** Hur brett blandningsbandet vid en kant är (andel av rösterna). Litet = skarp men inte pixlig kant. */
export const KANT_MJUK = 0.2;

/**
 * Skogsbilden förstorad SKALA gånger med mjuka kanter: varje pixel får den klass som väger mest bland de närmaste 4 × 4 rutorna (gaussvikt efter
 * avstånd). Kanten mellan två klasser blir en mjuk kurva i stället för 10 m-trappor (det "ritade" utseendet), och inga påhittade mellanklasser
 * uppstår där hygge möter mogen skog (det hade en interpolerad höjd gett). Rutor utan data blir genomskinliga.
 * Ut: RGBA, rad 0 = norr, storlek (bredd × SKALA) × (hojd × SKALA).
 */
export function renderaSkog(rn: Rutnat, avverkat: Set<number>, farg: Record<Klass, [number, number, number, number]>, skala = 6): { data: Uint8ClampedArray; bredd: number; hojd: number } {
  const B = rn.bredd * skala, H = rn.hojd * skala;
  const ut = new Uint8ClampedArray(B * H * 4);
  const kl = new Uint8Array(rn.bredd * rn.hojd);
  for (let i = 0; i < kl.length; i++) kl[i] = KLASSER.indexOf(avverkat.has(i) ? 'avverkat' : klassFor(rn.hojdDm[i]));
  const tva = 2 * UTJAMNING * UTJAMNING;
  const rost = new Float64Array(KLASSER.length);
  for (let py = 0; py < H; py++) {
    const fy = (py + 0.5) / skala - 0.5;
    const r0 = Math.floor(fy);
    for (let px = 0; px < B; px++) {
      const fx = (px + 0.5) / skala - 0.5;
      const k0 = Math.floor(fx);
      rost.fill(0);
      for (let r = r0 - 1; r <= r0 + 2; r++) {
        if (r < 0 || r >= rn.hojd) continue;
        for (let k = k0 - 1; k <= k0 + 2; k++) {
          if (k < 0 || k >= rn.bredd) continue;
          const dx = k - fx, dy = r - fy;
          rost[kl[r * rn.bredd + k]] += Math.exp(-(dx * dx + dy * dy) / tva);
        }
      }
      // Bäst och näst bäst: precis vid kanten blandas de två färgerna, så kanten blir kantutjämnad i stället för pixlig.
      let bast = 0, nast = -1;
      for (let j = 1; j < rost.length; j++) {
        if (rost[j] > rost[bast]) { nast = bast; bast = j; } else if (nast < 0 || rost[j] > rost[nast]) nast = j;
      }
      const c1 = farg[KLASSER[bast]];
      const o = (py * B + px) * 4;
      const summa = rost[bast] + (nast >= 0 ? rost[nast] : 0);
      const t = nast < 0 || summa === 0 ? 1 : Math.min(1, ((rost[bast] - rost[nast]) / summa) / KANT_MJUK);
      const a = 0.5 + 0.5 * t;
      const c2 = nast >= 0 ? farg[KLASSER[nast]] : c1;
      for (let j = 0; j < 4; j++) ut[o + j] = Math.round(c1[j] * a + c2[j] * (1 - a));
    }
  }
  return { data: ut, bredd: B, hojd: H };
}

/** Rimlig medelhöjd i dm (0–60 m). Annat betyder att banden bytt plats. */
export const rimligHojdDm = (v: number | null) => v == null || (v >= 0 && v <= 600);
