// Skotarens tid per lass: lasta / köra / vid avlägget — ur hyttspåret och
// appens lass. Ren räkning, ingen läsning.
//
// SAMMA FÖNSTER SOM AVSTÅNDET (SQL-funktionen skotar_lass_cykel): ett lass
// cykel är hyttspårets punkter mellan förra lossningen (samma maskin) och
// lassets lossning, högst 3 timmar. Första lasset, ett för långt fönster och
// ett lass utan lossningsplats har ingen cykel — och då ingen tid. Aldrig 0.
//
// DELARNA ÄR EN UPPSKATTNING och ska visas med "ca":
//   vid avlägget = båda ändar av steget inom 60 m från lossningen (CYKEL.AVLAGG_ZON_M)
//   lasta        = utanför avlägget och långsammare än 0,5 m/s (kranarbete, flytt mellan högar)
//   köra         = utanför avlägget och fortare
//   paus         = över 6 minuter mellan två punkter (rast, samtal) — räknas inte in i delarna
// Hyttspåret släpper punkter närmare än 2 m från förra, så stillastående syns
// som ett långt steg i tid — därför räknas tiden per steg, inte per punkt.

import { CYKEL } from '@/lib/faktura/lassCykel';

export const TIDER = {
  LASTA_UNDER_M_PER_S: 0.5,
  PAUS_OVER_S: 360,
  MAX_FONSTER_MS: 3 * 3600 * 1000,
  /** Under så många lass med mätt tid visas inget snitt. */
  MIN_LASS: 3,
} as const;

export type TidLass = {
  id: string;
  maskinId: string;
  /** Lassets lossning (senaste delen). null = ingen cykel. */
  losstidMs: number | null;
  lat: number | null;
  lng: number | null;
  volym: number;
  breddat: boolean;
};
export type TidPunkt = { maskinId: string; tidMs: number; lat: number; lng: number };

export type LassTid = { id: string; lastaMin: number; koraMin: number; avlaggMin: number; pausMin: number };

function havM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371008.8, rad = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * rad / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin((lng2 - lng1) * rad / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Tiden per lass. Lass utan cykel (eller utan spårpunkter i fönstret) finns inte med. */
export function tidPerLass(lass: TidLass[], punkter: TidPunkt[]): LassTid[] {
  const perMaskin = new Map<string, TidPunkt[]>();
  for (const p of punkter) {
    if (!Number.isFinite(p.tidMs) || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    const arr = perMaskin.get(p.maskinId) ?? [];
    arr.push(p);
    perMaskin.set(p.maskinId, arr);
  }
  for (const arr of perMaskin.values()) arr.sort((a, b) => a.tidMs - b.tidMs);

  const lassPerMaskin = new Map<string, TidLass[]>();
  for (const l of lass) {
    const arr = lassPerMaskin.get(l.maskinId) ?? [];
    arr.push(l);
    lassPerMaskin.set(l.maskinId, arr);
  }

  const ut: LassTid[] = [];
  for (const [maskin, rader] of lassPerMaskin) {
    // Samma ordning som SQL: lossningstid, sedan id. Lass utan lossningstid sist
    // (NULLS LAST) — de har ingen cykel och ger nästa lass ett fönster utan början.
    const ordnade = [...rader].sort((a, b) =>
      (a.losstidMs ?? Infinity) - (b.losstidMs ?? Infinity) || a.id.localeCompare(b.id));
    const spar = perMaskin.get(maskin) ?? [];
    let fran: number | null = null;
    for (const l of ordnade) {
      const start = fran;
      fran = l.losstidMs;
      if (l.losstidMs == null || l.lat == null || l.lng == null || start == null) continue;
      if (l.losstidMs - start > TIDER.MAX_FONSTER_MS) continue;
      const fonster = spar.filter(p => p.tidMs > start && p.tidMs <= l.losstidMs!);
      if (fonster.length < 2) continue;
      let lasta = 0, kora = 0, avlagg = 0, paus = 0;
      for (let i = 1; i < fonster.length; i++) {
        const a = fonster[i - 1], b = fonster[i];
        const dt = (b.tidMs - a.tidMs) / 1000;
        if (!(dt > 0)) continue;
        if (dt > TIDER.PAUS_OVER_S) { paus += dt; continue; }
        const vidA = havM(a.lat, a.lng, l.lat, l.lng) <= CYKEL.AVLAGG_ZON_M;
        const vidB = havM(b.lat, b.lng, l.lat, l.lng) <= CYKEL.AVLAGG_ZON_M;
        if (vidA && vidB) avlagg += dt;
        else if (havM(a.lat, a.lng, b.lat, b.lng) / dt < TIDER.LASTA_UNDER_M_PER_S) lasta += dt;
        else kora += dt;
      }
      if (lasta + kora + avlagg <= 0) continue;
      ut.push({ id: l.id, lastaMin: lasta / 60, koraMin: kora / 60, avlaggMin: avlagg / 60, pausMin: paus / 60 });
    }
  }
  return ut;
}

/** Snitt per lass. totalMin = lasta + köra + avlägg + paus (raster, stopp över 6 min). */
export type TidSnitt = { lass: number; lastaMin: number; koraMin: number; avlaggMin: number; pausMin: number; totalMin: number };

/** Minuter per lass i snitt. null under MIN_LASS — ett par lass är inget snitt. */
export function tidSnitt(tider: LassTid[]): TidSnitt | null {
  if (tider.length < TIDER.MIN_LASS) return null;
  const snitt = (f: (t: LassTid) => number) => tider.reduce((s, t) => s + f(t), 0) / tider.length;
  return {
    lass: tider.length,
    lastaMin: snitt(t => t.lastaMin), koraMin: snitt(t => t.koraMin), avlaggMin: snitt(t => t.avlaggMin),
    pausMin: snitt(t => t.pausMin),
    totalMin: snitt(t => t.lastaMin + t.koraMin + t.avlaggMin + t.pausMin),
  };
}

export type LassSnitt = { lass: number; snittM3: number; breddade: number };

/** Snittlass och hur många som kördes breddade. null utan lass med volym. */
export function lassSnitt(lass: TidLass[]): LassSnitt | null {
  const med = lass.filter(l => l.volym > 0);
  if (!med.length) return null;
  return {
    lass: med.length,
    snittM3: med.reduce((s, l) => s + l.volym, 0) / med.length,
    breddade: med.filter(l => l.breddat).length,
  };
}
