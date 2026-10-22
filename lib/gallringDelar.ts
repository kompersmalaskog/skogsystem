// Första och andra gallring i samma trakt — appens förslag ur stammarnas grovlek och läge. Rena funktioner, inga anrop.
//
// Martin 2026-10-22: Sandåsen var både första och andra gallring men Vida levererade EN traktdel ("Första gallring").
// Ett snitt per hektar över båda säger ingenting: väster tog ut ca 410 stammar/ha (median 9,5 cm), öster ca 210
// (14,5 cm), och tumreglerna för vad som ska stå kvar skiljer sig (900–1 200 efter första, 500–600 efter sista i tall).
// "Det går att se på grovleken vilken del som var vilken."
//
// REGLERNA (allt ur de avverkade stammarna som räknas i den gallrade ytan, lib/gallradYta.ts):
//  1. Den gallrade ytan delas i rutor om RUTA_M. Varje ruta får medianen av diametrarna för stammarna i den och
//     rutorna runt om (3 × 3) — så en enstaka grov tall i en ung del inte färgar sin ruta.
//  2. Rutorna delas i två grupper vid den gräns som skiljer grupperna mest (Otsus metod, viktad med antalet stammar).
//     Klenare = första gallring, grövre = andra.
//  3. Sammanhängande bitar mindre än MIN_BIT_HA byter grupp till den som omger dem (en skog delas inte i fläckar).
//  4. Förslaget finns BARA om delarna verkligen skiljer sig: medianerna minst MIN_SKILLNAD_MM isär och båda delarna
//     minst MIN_DEL_HA och MIN_DEL_ANDEL av ytan. Annars är det en gallring, och då föreslås ingenting.
//  5. Ett svar från en människa går före förslaget: "stämmer", "tvärtom", "en gallring" eller en RITAD gräns
//     (gallring_yta_svar, nyckeln DELNING_NYCKEL). Förslaget och svaret syns alltid båda.
//  6. Ritad gräns (Martin 2026-10-22: "jag vill kunna rita om så det stämmer med verkligheten"): en ring runt den ena
//     delen; den gallrade marken innanför är den delen, resten är den andra. Ringen sparas i lat/lng så den står still
//     när filen växer. Uttaget och "kvar" räknas på samma sätt som för förslaget. Ritningen behöver inget förslag.

import type { GallradYta, StamPos } from './gallradYta';
import { RUTA } from './gallradYta';
import { punktIPolygon } from './skotat';

/** Rutans sida i meter — ungefär två stickvägar breda, så ett stråk aldrig är en egen ruta. */
export const RUTA_M = 25;
/** Stammar som krävs runt en ruta (3 × 3) för att den ska få ett värde. */
export const MIN_STAMMAR = 8;
/** Medianerna måste skilja så här mycket för att det ska vara två gallringar. */
export const MIN_SKILLNAD_MM = 25;
/** Varje del måste vara minst så här stor ... */
export const MIN_DEL_HA = 1;
/** ... och minst så stor andel av den gallrade ytan. */
export const MIN_DEL_ANDEL = 0.15;
/** Bitar mindre än så byter grupp. */
export const MIN_BIT_HA = 0.5;

/** Nyckeln i gallring_yta_svar. */
export const DELNING_NYCKEL = 'delning';
export type DelningSvar = 'stammer' | 'tvartom' | 'en' | 'ritad';
/** Svaren man väljer i en lista. "Ritad" kommer från Rita om, inte från listan. */
export const DELNING_ORD: Record<Exclude<DelningSvar, 'ritad'>, string> = {
  stammer: 'Stämmer',
  tvartom: 'Tvärtom',
  en: 'Det var en gallring',
};

export type DelNamn = 'forsta' | 'andra';
export const DEL_ORD: Record<DelNamn, string> = { forsta: 'Första gallring', andra: 'Andra gallring' };

/** Värdet i delningens rutnät (samma rutnät som den gallrade ytan): 0 = inte gallrat, 1 = första, 2 = andra. */
export const DEL_RUTA = { ingen: 0, forsta: 1, andra: 2 } as const;

export type Del = {
  namn: DelNamn;
  /** Andel av den gallrade ytans rutor. Multiplicera med arealen per hektar räknas på. */
  andelYta: number;
  /** Stammarna (id) som hör till delen — en delmängd av yta.raknade. */
  stammar: Set<StamPos['id']>;
  medianDbhMm: number;
  /** Väderstreck för delens tyngdpunkt jämfört med den andra delen, för en mening: "väster", "nordost" ... */
  lage: string;
  innehaller: (lng: number, lat: number) => boolean;
};

/** En ritad gräns: ringen runt den ena delen, [lng, lat]. */
export type RitadDelning = { del: DelNamn; ring: [number, number][] };

export type Delning = {
  /** Appens förslag (klenare först). null = appen ser en gallring — men en ritad gräns gäller ändå. */
  forslag: [Del, Del] | null;
  svar: DelningSvar | null;
  /** Den ritade gränsen när svaret är "ritad". */
  ritad: RitadDelning | null;
  /** Det som gäller: null = en gallring (svaret "en", eller en ritning som inte delar ytan), annars [första, andra]. */
  delar: [Del, Del] | null;
  /** Ritningen gav ingen delning (allt eller inget av den gallrade marken låg innanför). */
  ritadDelarInte: boolean;
  /** Rutnätet med DEL_RUTA för kartan, samma storlek som yta.karta. Det som gäller (förslaget när inget annat gäller). */
  rutor: Uint8Array;
};

/** Minst tre olika punkter, alla tal. */
export function giltigRing(ring: unknown): ring is [number, number][] {
  return Array.isArray(ring) && ring.length >= 3
    && ring.every((p) => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && Number.isFinite(v)));
}

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Otsus gräns: värdet som delar (värde, vikt) i två grupper med störst skillnad mellan grupperna. */
export function otsuGrans(punkter: { v: number; w: number }[]): number | null {
  const s = [...punkter].sort((a, b) => a.v - b.v);
  const W = s.reduce((t, p) => t + p.w, 0);
  const S = s.reduce((t, p) => t + p.w * p.v, 0);
  let w0 = 0, s0 = 0, bast = -1, grans: number | null = null;
  for (let i = 0; i < s.length - 1; i++) {
    w0 += s[i].w; s0 += s[i].w * s[i].v;
    if (s[i].v === s[i + 1].v) continue;
    const w1 = W - w0;
    if (w0 <= 0 || w1 <= 0) continue;
    const m0 = s0 / w0, m1 = (S - s0) / w1;
    const mellan = w0 * w1 * (m0 - m1) ** 2;
    if (mellan > bast) { bast = mellan; grans = (s[i].v + s[i + 1].v) / 2; }
  }
  return grans;
}

const VADERSTRECK = ['öster', 'nordost', 'norr', 'nordväst', 'väster', 'sydväst', 'söder', 'sydost'];

/** Väderstreck från b till a i rutnätet (x österut, y söderut). */
export function vaderstreck(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const vinkel = Math.atan2(-(a.y - b.y), a.x - b.x); // y söderut → norr uppåt
  const steg = Math.round(vinkel / (Math.PI / 4));
  return VADERSTRECK[(steg + 8) % 8];
}

export function foreslaDelning(
  yta: GallradYta, stammar: StamPos[], svar: DelningSvar | null = null, ritad: RitadDelning | null = null,
): Delning | null {
  const { bredd, hojd, rutor: fina } = yta.karta;
  const gallrad = (c: number) => c === RUTA.gallrat || c === RUTA.utanforGallring;
  const iRutan = (s: StamPos) => {
    const p = yta.tillRuta(s.lng, s.lat);
    const x = Math.floor(p.x), y = Math.floor(p.y);
    return x < 0 || y < 0 || x >= bredd || y >= hojd ? null : { x, y };
  };

  // Delarna ur ett rutnät (1 = första, 2 = andra) och varje stams del. null = en del är tom.
  const delarUr = (rut: Uint8Array, stamDel: Map<StamPos['id'], 1 | 2>): [Del, Del] | null => {
    const antal = [0, 0, 0], sx = [0, 0, 0], sy = [0, 0, 0];
    for (let i = 0; i < rut.length; i++) {
      const e = rut[i];
      if (!e) continue;
      antal[e]++; sx[e] += i % bredd; sy[e] += Math.floor(i / bredd);
    }
    const totalt = antal[1] + antal[2];
    if (!antal[1] || !antal[2]) return null;
    const delSt: Set<StamPos['id']>[] = [new Set(), new Set(), new Set()];
    const dia: number[][] = [[], [], []];
    for (const s of stammar) {
      const e = stamDel.get(s.id);
      if (!e) continue;
      delSt[e].add(s.id);
      const d = Number(s.dbhMm);
      if (Number.isFinite(d) && d > 0) dia[e].push(d);
    }
    if (!dia[1].length || !dia[2].length) return null;
    const mitt = (e: number) => ({ x: sx[e] / antal[e], y: sy[e] / antal[e] });
    const del = (namn: DelNamn, e: 1 | 2): Del => ({
      namn,
      andelYta: antal[e] / totalt,
      stammar: delSt[e],
      medianDbhMm: median(dia[e]),
      lage: vaderstreck(mitt(e), mitt(e === 1 ? 2 : 1)),
      innehaller: (lng, lat) => {
        const p = yta.tillRuta(lng, lat);
        const x = Math.floor(p.x), y = Math.floor(p.y);
        return x >= 0 && y >= 0 && x < bredd && y < hojd && rut[y * bredd + x] === e;
      },
    });
    return [del('forsta', 1), del('andra', 2)];
  };
  const byt = (rut: Uint8Array, stamDel: Map<StamPos['id'], 1 | 2>) => ({
    rut: rut.map((v) => (v === 1 ? 2 : v === 2 ? 1 : 0)),
    stamDel: new Map([...stamDel].map(([id, e]) => [id, (e === 1 ? 2 : 1) as 1 | 2])),
  });

  const fors = beraknaForslag(yta, stammar);
  const forslag = fors && fors.giltig ? delarUr(fors.rut, fors.stamDel) : null;
  const tomt = new Uint8Array(bredd * hojd);

  if (svar === 'ritad' && ritad && giltigRing(ritad.ring)) {
    const ring = ritad.ring.map(([lng, lat]) => { const p = yta.tillRuta(lng, lat); return [p.x, p.y]; });
    const innan = ritad.del === 'forsta' ? 1 : 2;
    const utan = innan === 1 ? 2 : 1;
    const rut = new Uint8Array(bredd * hojd);
    for (let y = 0; y < hojd; y++) for (let x = 0; x < bredd; x++) {
      const i = y * bredd + x;
      if (gallrad(fina[i])) rut[i] = punktIPolygon([x + 0.5, y + 0.5], ring) ? innan : utan;
    }
    const stamDel = new Map<StamPos['id'], 1 | 2>();
    for (const s of stammar) {
      if (!yta.raknade.has(s.id) || !iRutan(s)) continue;
      const p = yta.tillRuta(s.lng, s.lat);
      stamDel.set(s.id, punktIPolygon([p.x, p.y], ring) ? innan : utan);
    }
    const delar = delarUr(rut, stamDel);
    return { forslag, svar, ritad, delar, ritadDelarInte: !delar, rutor: delar ? rut : fors?.rut ?? tomt };
  }

  if (!forslag || !fors) return null;
  // En ritning utan giltig ring räknas inte som ett svar: då gäller förslaget.
  const bas = { forslag, svar: svar === 'ritad' ? null : svar, ritad: null, ritadDelarInte: false };
  if (svar === 'en') return { ...bas, delar: null, rutor: fors.rut };
  if (svar === 'tvartom') {
    const b = byt(fors.rut, fors.stamDel);
    return { ...bas, delar: delarUr(b.rut, b.stamDel), rutor: b.rut };
  }
  return { ...bas, delar: forslag, rutor: fors.rut };
}

/** Appens förslag: rutnätet (1 klenare, 2 grövre), varje stams del, och om delarna skiljer sig nog (regel 4). */
function beraknaForslag(yta: GallradYta, stammar: StamPos[]):
  { rut: Uint8Array; stamDel: Map<StamPos['id'], 1 | 2>; giltig: boolean } | null {
  const { bredd, hojd, rutor: fina, rutaM } = yta.karta;
  const f = Math.max(1, Math.round(RUTA_M / rutaM));
  const gb = Math.ceil(bredd / f), gh = Math.ceil(hojd / f);
  const gn = gb * gh;
  const grov = (x: number, y: number) => Math.floor(y / f) * gb + Math.floor(x / f);
  const gallrad = (c: number) => c === RUTA.gallrat || c === RUTA.utanforGallring;

  // Stammarna som räknas, per grov ruta.
  const perRuta: number[][] = Array.from({ length: gn }, () => []);
  const stamGrov = new Map<StamPos['id'], number>();
  for (const s of stammar) {
    if (!yta.raknade.has(s.id)) continue;
    const p = yta.tillRuta(s.lng, s.lat);
    const x = Math.floor(p.x), y = Math.floor(p.y);
    if (x < 0 || y < 0 || x >= bredd || y >= hojd) continue;
    const g = grov(x, y);
    stamGrov.set(s.id, g);
    const d = Number(s.dbhMm);
    if (Number.isFinite(d) && d > 0) perRuta[g].push(d);
  }

  // Grova rutor som har gallrad mark, och hur mycket (fina rutor) — bitarnas storlek räknas på den gallrade marken.
  const harYta = new Uint8Array(gn);
  const finaPer = new Float64Array(gn);
  for (let y = 0; y < hojd; y++) for (let x = 0; x < bredd; x++) {
    if (!gallrad(fina[y * bredd + x])) continue;
    const g = grov(x, y);
    harYta[g] = 1;
    finaPer[g]++;
  }

  // 1. Utjämnad median per ruta.
  const varde = new Float64Array(gn).fill(NaN);
  const vikt = new Float64Array(gn);
  for (let g = 0; g < gn; g++) {
    if (!harYta[g]) continue;
    const gx = g % gb, gy = (g - gx) / gb;
    const d: number[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = gx + dx, y = gy + dy;
      if (x < 0 || y < 0 || x >= gb || y >= gh) continue;
      for (const v of perRuta[y * gb + x]) d.push(v);
    }
    if (d.length >= MIN_STAMMAR) { varde[g] = median(d); vikt[g] = perRuta[g].length; }
  }

  // 2. Gränsen.
  const punkter: { v: number; w: number }[] = [];
  for (let g = 0; g < gn; g++) if (!Number.isNaN(varde[g]) && vikt[g] > 0) punkter.push({ v: varde[g], w: vikt[g] });
  const grans = otsuGrans(punkter);
  if (grans === null) return null;

  const etikett = new Uint8Array(gn); // 0 okänd, 1 första, 2 andra
  for (let g = 0; g < gn; g++) if (!Number.isNaN(varde[g])) etikett[g] = varde[g] < grans ? 1 : 2;

  // Rutor med gallrad mark men utan värde: närmaste ruta med värde (bredden först).
  fyllNarmaste(etikett, harYta, gb, gh);

  // 3. Små bitar byter grupp.
  const finHa = rutaM ** 2 / 10000;
  for (let varv = 0; varv < 3; varv++) {
    let bytt = false;
    for (const komp of komponenter(etikett, gb, gh)) {
      if (komp.rutor.reduce((t, g) => t + finaPer[g], 0) * finHa >= MIN_BIT_HA) continue;
      const annan = komp.etikett === 1 ? 2 : 1;
      if (!komp.granne.has(annan)) continue; // en ensam ö utan granne behåller sin grupp
      for (const g of komp.rutor) etikett[g] = annan;
      bytt = true;
    }
    if (!bytt) break;
  }

  // Det fina rutnätet och stammarna efter förslaget.
  const rut = new Uint8Array(bredd * hojd);
  const antal = [0, 0, 0];
  for (let y = 0; y < hojd; y++) for (let x = 0; x < bredd; x++) {
    const i = y * bredd + x;
    if (!gallrad(fina[i])) continue;
    const e = etikett[grov(x, y)];
    if (!e) continue;
    rut[i] = e;
    antal[e]++;
  }
  const stamDel = new Map<StamPos['id'], 1 | 2>();
  const dia: number[][] = [[], [], []];
  for (const s of stammar) {
    const g = stamGrov.get(s.id);
    if (g === undefined) continue;
    const e = etikett[g] as 0 | 1 | 2;
    if (!e) continue;
    stamDel.set(s.id, e);
    const d = Number(s.dbhMm);
    if (Number.isFinite(d) && d > 0) dia[e].push(d);
  }
  const totalt = antal[1] + antal[2];
  if (!antal[1] || !antal[2] || !dia[1].length || !dia[2].length) return { rut, stamDel, giltig: false };

  // 4. Är det två gallringar?
  const andel1 = antal[1] / totalt, andel2 = antal[2] / totalt;
  const giltig = Math.abs(median(dia[2]) - median(dia[1])) >= MIN_SKILLNAD_MM
    && andel1 >= MIN_DEL_ANDEL && andel2 >= MIN_DEL_ANDEL
    && andel1 * yta.gallradHa >= MIN_DEL_HA && andel2 * yta.gallradHa >= MIN_DEL_HA;
  return { rut, stamDel, giltig };
}

function fyllNarmaste(etikett: Uint8Array, harYta: Uint8Array, gb: number, gh: number) {
  const ko: number[] = [];
  for (let g = 0; g < etikett.length; g++) if (etikett[g]) ko.push(g);
  for (let k = 0; k < ko.length; k++) {
    const g = ko[k];
    const gx = g % gb, gy = (g - gx) / gb;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = gx + dx, y = gy + dy;
      if (x < 0 || y < 0 || x >= gb || y >= gh) continue;
      const j = y * gb + x;
      if (etikett[j]) continue;
      etikett[j] = etikett[g];
      ko.push(j);
    }
  }
  // Rutor utan gallrad mark behåller ingen etikett — de används bara som väg för fyllningen.
  for (let g = 0; g < etikett.length; g++) if (!harYta[g]) etikett[g] = 0;
}

function komponenter(etikett: Uint8Array, gb: number, gh: number): { etikett: number; rutor: number[]; granne: Set<number> }[] {
  const sett = new Uint8Array(etikett.length);
  const ut: { etikett: number; rutor: number[]; granne: Set<number> }[] = [];
  for (let start = 0; start < etikett.length; start++) {
    if (sett[start] || !etikett[start]) continue;
    const e = etikett[start];
    const rutor: number[] = [];
    const granne = new Set<number>();
    const ko = [start];
    sett[start] = 1;
    while (ko.length) {
      const g = ko.pop()!;
      rutor.push(g);
      const gx = g % gb, gy = (g - gx) / gb;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const x = gx + dx, y = gy + dy;
        if (x < 0 || y < 0 || x >= gb || y >= gh) continue;
        const j = y * gb + x;
        if (!etikett[j]) continue;
        if (etikett[j] !== e) { granne.add(etikett[j]); continue; }
        if (!sett[j]) { sett[j] = 1; ko.push(j); }
      }
    }
    ut.push({ etikett: e, rutor, granne });
  }
  return ut;
}
