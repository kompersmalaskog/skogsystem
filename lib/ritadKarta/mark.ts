// RITAD — BLÖTT OCH BRANT (Martin 2026-10-31: "det måste bli super tydligt för maskinförarna vad det är blött och backigt").
//
// Tre saker på marken, inget mer:
//   • BLÖTT = blå vågräta streck, som orienteringskartans myr (Martin 2026-10-31: "så lätt att ett barn förstår det direkt"): glesa streck =
//     fuktigt, täta = blött. Talet är SLU:s sannolikhet för blöt mark (band 1, 0–100) — aldrig färgerna i en bild och aldrig en gissad
//     klassnumrering (två försök med det tappade allt grönt). Öppet vatten (band 2, klass 4) ritas av vattenlagret, inte här.
//   • BACKIGT = skuggning: Lantmäteriets terrängskuggning ur 1 m-höjdmodellen, blandad in i skogsbilden (inte ett grått lager ovanpå).
//   • BRANT = röda snedstreck i två nivåer (Martin 2026-10-31: "lite brant, mycket brant"): glesa = lite brant, täta = mycket brant — samma
//     tanke som blött (glest = fuktigt, tätt = blött). Gränserna är Skogforsks terrängklasser för lutning: klass 4 från 33 % (≈ 18°), klass 5
//     från 50 % (≈ 27°). Flackare än klass 4 visas inte — annars blir kartan full av varningar.
//
// Rena funktioner; hämtningen bor i app/api/ritad-karta/mark/route.ts, sammanfogningen i lib/ritadKarta/bygg.ts.

import { tillLngLat, type Utsnitt } from './skog';

/** Rutstorlek för blött och brant (m). Finare än skogens 10 m — en blöt svacka är ofta smal. */
export const MARK_RUTA_M = 5;
/** Brant från (grader): lite brant = Skogforsks lutningsklass 4 (33 % ≈ 18°), mycket brant = klass 5 (50 % ≈ 27°). Ändras bara här. */
export const BRANT_GRANS = { lite: 18, mycket: 27 } as const;
/** Mindre sammanhängande brant än så här (rutor à 5 × 5 m) visas inte: en enstaka sten eller dikeskant är ingen brant. */
export const BRANT_MIN_RUTOR = 8;

export const FUKT = { ingen: 0, fuktig: 1, blot: 2 } as const;
export type FuktKod = (typeof FUKT)[keyof typeof FUKT];

/**
 * Gränserna på SLU:s sannolikhet för blöt mark (0–100). Valda så att det gröna i lagret Markfuktighet blir fuktigt och det blå blött
 * ("det gröna är ju lite blött med", Martin 2026-10-31). Ändras bara här.
 */
export const FUKT_GRANS = { fuktig: 50, blot: 75 } as const;
/** SLU:s klassband: 4 = öppet vatten. */
export const KLASS_VATTEN = 4;
/** Mindre blöt yta än så här (rutor à 5 × 5 m) ritas inte: en enstaka svacka på 50 m² är ingen blöt mark för en maskin. */
export const BLOTT_MIN_RUTOR = 4;

/** Sannolikhet (0–100) + klass (valfri) → kod. Värden utanför 0–100 är "ingen data". */
export function fuktKod(sannolikhet: number, klass?: number): FuktKod {
  if (klass === KLASS_VATTEN) return FUKT.ingen;
  if (!Number.isFinite(sannolikhet) || sannolikhet < 0 || sannolikhet > 100) return FUKT.ingen;
  if (sannolikhet >= FUKT_GRANS.blot) return FUKT.blot;
  if (sannolikhet >= FUKT_GRANS.fuktig) return FUKT.fuktig;
  return FUKT.ingen;
}

/** SLU:s klassband (dokumentationen och korbarhet-tiles säger samma sak): 1 torr–frisk, 2 frisk–fuktig, 3 fuktig–blöt, 4 öppet vatten. */
export const KLASS_KOD: Readonly<Record<number, FuktKod>> = { 1: FUKT.ingen, 2: FUKT.fuktig, 3: FUKT.blot, 4: FUKT.ingen };

type Band = ArrayLike<number>;
function bandInfo(b: Band) {
  let med = 0, over100 = 0, max = -Infinity, min = Infinity, heltal = true;
  for (let i = 0; i < b.length; i++) {
    const v = b[i];
    if (!Number.isFinite(v) || v === 255 || v < 0) continue;
    if (v > 100) { over100++; continue; }
    med++; if (v > max) max = v; if (v < min) min = v; if (heltal && v !== Math.round(v)) heltal = false;
  }
  return { med, over100, max, min, heltal };
}

/**
 * Tjänstens band → kod per ruta. Sannolikhetsbandet (värden upp till 100) går först; finns bara klassbandet (heltal 0–4) används det med
 * `KLASS_KOD`. Annars ett fel som säger vad banden innehöll — aldrig en gissning.
 */
export function tolkaFuktBand(band: Band[]): { koder: Uint8Array; kalla: 'sannolikhet' | 'klass'; info: string } {
  const infos = band.map(bandInfo);
  const beskr = infos.map((x, i) => `band ${i + 1}: ${x.med ? `${x.min}–${x.max}` : 'tomt'}`).join(', ');
  const pi = infos.findIndex((x) => x.med > 0 && x.max > 5 && x.over100 <= x.med * 0.01);
  const ki = infos.findIndex((x) => x.med > 0 && x.heltal && x.min >= 0 && x.max <= 4 && x.max >= 1);
  const n = band[0]?.length ?? 0;
  const koder = new Uint8Array(n);
  if (pi >= 0) {
    const p = band[pi], k = ki >= 0 ? band[ki] : null;
    for (let i = 0; i < n; i++) koder[i] = fuktKod(p[i], k ? Math.round(k[i]) : undefined);
    return { koder, kalla: 'sannolikhet', info: beskr };
  }
  if (ki >= 0) {
    const k = band[ki];
    for (let i = 0; i < n; i++) koder[i] = KLASS_KOD[Math.round(k[i])] ?? FUKT.ingen;
    return { koder, kalla: 'klass', info: beskr };
  }
  throw new Error(`okänt innehåll (${beskr || 'inga band'})`);
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

/**
 * Rutor där `med` är sant som polygoner (lng/lat) för ett fill-pattern-lager: sammanhängande ytor under `minRutor` tas bort och varje rad
 * slås ihop till rektanglar så antalet former hålls nere.
 */
export function maskYtor(
  m: Pick<MarkRutnat, 'minX' | 'maxY' | 'bredd' | 'hojd' | 'rutaM'>, med: (i: number) => boolean, minRutor: number, egenskaper: Record<string, unknown> = {},
): GeoJSON.Feature[] {
  const { bredd, hojd } = m;
  const mask = new Uint8Array(bredd * hojd);
  for (let i = 0; i < mask.length; i++) mask[i] = med(i) ? 1 : 0;
  const sedd = new Uint8Array(mask.length);
  const ko: number[] = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || sedd[s]) continue;
    const yta: number[] = [];
    ko.length = 0; ko.push(s); sedd[s] = 1;
    while (ko.length) {
      const i = ko.pop()!; yta.push(i);
      const r = Math.floor(i / bredd), k = i % bredd;
      for (const [rr, kk] of [[r - 1, k], [r + 1, k], [r, k - 1], [r, k + 1]]) {
        if (rr < 0 || kk < 0 || rr >= hojd || kk >= bredd) continue;
        const j = rr * bredd + kk;
        if (mask[j] && !sedd[j]) { sedd[j] = 1; ko.push(j); }
      }
    }
    if (yta.length < minRutor) for (const i of yta) mask[i] = 0;
  }
  const ut: GeoJSON.Feature[] = [];
  const hornAt = (r: number, k: number) => tillLngLat(m.minX + k * m.rutaM, m.maxY - r * m.rutaM);
  for (let r = 0; r < hojd; r++) {
    let k = 0;
    while (k < bredd) {
      if (!mask[r * bredd + k]) { k++; continue; }
      const start = k;
      while (k < bredd && mask[r * bredd + k]) k++;
      ut.push({ type: 'Feature', properties: { ...egenskaper }, geometry: { type: 'Polygon', coordinates: [[hornAt(r, start), hornAt(r, k), hornAt(r + 1, k), hornAt(r + 1, start), hornAt(r, start)]] } });
    }
  }
  return ut;
}

/**
 * Brant mark i två nivåer: `k` = 'lite' (glesa snedstreck) eller 'mycket' (täta). Den lite branta ytan räknas med det mycket branta i sig (som
 * blött), så en kort mycket brant kant i en lite brant sluttning inte försvinner; det mycket branta ritas ovanpå. Ytor under BRANT_MIN_RUTOR bort.
 */
export function brantYtor(m: Pick<MarkRutnat, 'minX' | 'maxY' | 'bredd' | 'hojd' | 'rutaM' | 'lutning'>): GeoJSON.FeatureCollection {
  const minst = (g: number) => (i: number) => m.lutning[i] !== LUTNING_SAKNAS && m.lutning[i] >= g;
  return { type: 'FeatureCollection', features: [
    ...maskYtor(m, minst(BRANT_GRANS.lite), BRANT_MIN_RUTOR, { k: 'lite' }),
    ...maskYtor(m, minst(BRANT_GRANS.mycket), BRANT_MIN_RUTOR, { k: 'mycket' }),
  ] };
}

/**
 * Blöt mark: `k` = 'fuktig' (glesa streck) eller 'blot' (täta). En fuktig yta räknas med det blöta i sig, så en blöt kärna i en fuktig svacka
 * inte tar bort den fuktiga ytan när den är liten; det blöta ritas ovanpå.
 */
export function blottYtor(m: Pick<MarkRutnat, 'minX' | 'maxY' | 'bredd' | 'hojd' | 'rutaM' | 'fukt'>): GeoJSON.FeatureCollection {
  const fuktig = maskYtor(m, (i) => m.fukt[i] === FUKT.fuktig || m.fukt[i] === FUKT.blot, BLOTT_MIN_RUTOR, { k: 'fuktig' });
  const blot = maskYtor(m, (i) => m.fukt[i] === FUKT.blot, BLOTT_MIN_RUTOR, { k: 'blot' });
  return { type: 'FeatureCollection', features: [...fuktig, ...blot] };
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
