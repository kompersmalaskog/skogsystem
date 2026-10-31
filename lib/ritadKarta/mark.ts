// RITAD — BLÖTT OCH BRANT (Martin 2026-10-31: "det måste bli super tydligt för maskinförarna vad det är blött och backigt").
//
// Tre saker på marken, inget mer:
//   • BLÖTT = blått, tre steg ur SLU:s markfuktighetskarta, läst ur SAMMA bild som lagret Markfuktighet: grönt där → ljust blått ("det
//     gröna är ju lite blött med", Martin 2026-10-31), turkos → blått, blått → starkt blått. Torr och frisk mark får INGEN färg — skogen syns som förut. Öppet vatten ritas av
//     vattenlagret, inte här.
//   • BACKIGT = skuggning: Lantmäteriets terrängskuggning ur 1 m-höjdmodellen, blandad in i skogsbilden (inte ett grått lager ovanpå).
//   • BRANT = röda snedstreck från BRANT_GRAD (samma tecken som Brant-ytan i appen). 20–25° visas inte — annars blir kartan full av varningar.
//
// Rena funktioner; hämtningen bor i app/api/ritad-karta/mark/route.ts, sammanfogningen i lib/ritadKarta/bygg.ts.

import { tillLngLat, type Utsnitt } from './skog';

/** Rutstorlek för blött och brant (m). Finare än skogens 10 m — en blöt svacka är ofta smal. */
export const MARK_RUTA_M = 5;
/** Brant från (grader). */
export const BRANT_GRAD = 25;
/** Mindre sammanhängande brant än så här (rutor à 5 × 5 m) visas inte: en enstaka sten eller dikeskant är ingen brant. */
export const BRANT_MIN_RUTOR = 8;

export const FUKT = { ingen: 0, lite: 1, fuktig: 2, blot: 3 } as const;
export type FuktKod = (typeof FUKT)[keyof typeof FUKT];

/** Färg per fuktkod (RGBA, alfa = hur mycket av skogen som täcks). Blått = blött i hela appen. */
export const FUKT_FARG: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 0, 0],
  [110, 178, 240, 120],
  [52, 132, 232, 175],
  [24, 88, 214, 220],
];

/**
 * Markfuktighet ur SAMMA bild som lagret Markfuktighet i appen (tjänstens egen färgsättning), så Ritad visar exakt det man ser där
 * (Martin 2026-10-31: "det är mer med än vad din karta visar"). Färgskalan går brunt/gult (torrt, friskt) → grönt → turkos → blått.
 * Grönt = lite blött, turkos = fuktigt, blått = blött. Grått, genomskinligt och okänd färg = ingen färg (aldrig en gissning åt det blöta hållet).
 */
export function fuktKodFranFarg(r: number, g: number, b: number, a: number): FuktKod {
  if (a < 128) return FUKT.ingen;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === 0 || (max - min) / max < 0.2) return FUKT.ingen;
  const d = max - min;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; if (h < 0) h += 360;
  if (h >= 85 && h < 150) return FUKT.lite;
  if (h >= 150 && h < 195) return FUKT.fuktig;
  if (h >= 195 && h <= 265) return FUKT.blot;
  return FUKT.ingen;
}

/** Lutning saknas. */
export const LUTNING_SAKNAS = 255;

export type MarkRutnat = {
  minX: number; maxY: number; bredd: number; hojd: number; rutaM: number;
  /** FuktKod per ruta, rad 0 = norr. */
  fukt: Uint8Array;
  /** Lutning i hela grader (0–90), LUTNING_SAKNAS = ingen data. */
  lutning: Uint8Array;
};

/** Markens rutnät över samma utsnitt som skogen (laserns 10 m), med finare rutor. */
export function markUtsnitt(u: Pick<Utsnitt, 'minX' | 'maxY' | 'maxX' | 'minY'>): { minX: number; maxY: number; bredd: number; hojd: number } {
  return { minX: u.minX, maxY: u.maxY, bredd: Math.round((u.maxX - u.minX) / MARK_RUTA_M), hojd: Math.round((u.maxY - u.minY) / MARK_RUTA_M) };
}

/** Markfuktighetens klassnamn → vår kod (tjänstens egen attributtabell). "Öppet vatten" ritas av vattenlagret. */
export function fuktKodFranNamn(namn: string | null | undefined): FuktKod {
  const n = (namn ?? '').toLowerCase().normalize('NFC');
  if (/vatten/.test(n)) return FUKT.ingen;
  if (/bl[öo]t/.test(n)) return FUKT.blot;
  if (/frisk.*fukt/.test(n)) return FUKT.lite;
  if (/fukt/.test(n)) return FUKT.fuktig;
  return FUKT.ingen;
}

/**
 * Brant mark som polygoner (lng/lat) för ett fill-pattern-lager: rutor ≥ BRANT_GRAD, sammanhängande ytor under BRANT_MIN_RUTOR tas bort,
 * och varje rad slås ihop till rektanglar så antalet former hålls nere.
 */
export function brantYtor(m: Pick<MarkRutnat, 'minX' | 'maxY' | 'bredd' | 'hojd' | 'rutaM' | 'lutning'>): GeoJSON.FeatureCollection {
  const { bredd, hojd } = m;
  const brant = new Uint8Array(bredd * hojd);
  for (let i = 0; i < brant.length; i++) { const v = m.lutning[i]; brant[i] = v !== LUTNING_SAKNAS && v >= BRANT_GRAD ? 1 : 0; }
  // Små ytor bort (4-grannskap).
  const sedd = new Uint8Array(brant.length);
  const ko: number[] = [];
  for (let s = 0; s < brant.length; s++) {
    if (!brant[s] || sedd[s]) continue;
    const yta: number[] = [];
    ko.length = 0; ko.push(s); sedd[s] = 1;
    while (ko.length) {
      const i = ko.pop()!; yta.push(i);
      const r = Math.floor(i / bredd), k = i % bredd;
      for (const [rr, kk] of [[r - 1, k], [r + 1, k], [r, k - 1], [r, k + 1]]) {
        if (rr < 0 || kk < 0 || rr >= hojd || kk >= bredd) continue;
        const j = rr * bredd + kk;
        if (brant[j] && !sedd[j]) { sedd[j] = 1; ko.push(j); }
      }
    }
    if (yta.length < BRANT_MIN_RUTOR) for (const i of yta) brant[i] = 0;
  }
  const features: GeoJSON.Feature[] = [];
  const hornAt = (r: number, k: number) => tillLngLat(m.minX + k * m.rutaM, m.maxY - r * m.rutaM);
  for (let r = 0; r < hojd; r++) {
    let k = 0;
    while (k < bredd) {
      if (!brant[r * bredd + k]) { k++; continue; }
      const start = k;
      while (k < bredd && brant[r * bredd + k]) k++;
      features.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[hornAt(r, start), hornAt(r, k), hornAt(r + 1, k), hornAt(r + 1, start), hornAt(r, start)]] } });
    }
  }
  return { type: 'FeatureCollection', features };
}

export const tillBase64 = (b: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return typeof btoa === 'function' ? btoa(s) : Buffer.from(b).toString('base64');
};
export const franBase64 = (s: string): Uint8Array => {
  if (typeof atob !== 'function') return new Uint8Array(Buffer.from(s, 'base64'));
  const bin = atob(s);
  const ut = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) ut[i] = bin.charCodeAt(i);
  return ut;
};
