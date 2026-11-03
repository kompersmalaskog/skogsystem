// Diken i Ritad (Martin 2026-11-03): Naturvårdsverkets nationella dikeskarta "Diken Sverige" (CC0), byggd ur Skogsstyrelsens laserdata (1 m).
// Tabellen `dike` fylls en gång av .github/workflows/diken-import.yml; appen läser trakten + DIKE_MARGINAL_M via app/api/ritad-karta/diken.
// Rent och testbart.
//
//   • VÄGDIKEN RITAS INTE: de ligger längs vägarna och fick vägen att se dubbel ut (samma fel som två vägkällor).
//   • Sorterna (Typ i Naturvårdsverkets data): skogsdike, åkerdike, myrdike, vägdike, övrigt — läses på ordet, inte på exakt stavning.
//   • Kända svagheter i datan (Naturvårdsverkets PM): diken under tät skog missas ofta, en del små bäckar räknas som diken, trummor saknas.

import type { Bbox } from './vagar';

export type DikeSlag = 'skog' | 'aker' | 'myr' | 'vag' | 'ovrigt';
export type DikeFeature = { type: 'Feature'; properties: { s: DikeSlag }; geometry: { type: 'LineString'; coordinates: [number, number][] } };
export type DikeFC = { type: 'FeatureCollection'; features: DikeFeature[] };

/** Diken hämtas för trakten + så här många meter. */
export const DIKE_MARGINAL_M = 800;
/** Högst så här många diken per trakt (sidor om 1 000). */
export const DIKE_MAX = 20000;

/** Naturvårdsverkets Typ → sort. Okänt = övrigt (ritas som ett vanligt dike). */
export function dikeSlag(typ: unknown): DikeSlag {
  const t = String(typ ?? '').toLowerCase();
  if (t.includes('väg') || t.includes('vag')) return 'vag';
  if (t.includes('skog')) return 'skog';
  if (t.includes('åker') || t.includes('aker') || t.includes('jordbruk') || t.includes('odlad')) return 'aker';
  if (t.includes('myr') || t.includes('våtmark') || t.includes('vatmark')) return 'myr';
  return 'ovrigt';
}

/** Vägdiken ritas inte (de ligger längs vägen och dubblar den). */
export const visasDike = (s: DikeSlag) => s !== 'vag';

/** Tabellens rader → diken att rita. `coords` är linjer [[lng, lat], …]; rader utan giltig linje hoppas över. */
export function raderTillDiken(rader: { typ?: unknown; coords?: unknown }[]): DikeFC {
  const features: DikeFeature[] = [];
  for (const r of rader ?? []) {
    const s = dikeSlag(r?.typ);
    if (!visasDike(s)) continue;
    const linjer = Array.isArray(r?.coords) ? (r.coords as unknown[]) : [];
    for (const l of linjer) {
      if (!Array.isArray(l)) continue;
      const pts = (l as unknown[]).filter((p): p is [number, number] => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
      if (pts.length >= 2) features.push({ type: 'Feature', properties: { s }, geometry: { type: 'LineString', coordinates: pts } });
    }
  }
  return { type: 'FeatureCollection', features };
}

export function arDikeFC(v: unknown): v is DikeFC {
  return !!v && (v as any).type === 'FeatureCollection' && Array.isArray((v as any).features);
}

/** Argumenten till databasfunktionen `dike_i_ruta` (diken vars ruta överlappar `b`, via rutans GiST-index). */
export function rutaArgument(b: Bbox): { p_min_lng: number; p_min_lat: number; p_max_lng: number; p_max_lat: number } {
  return { p_min_lng: b.minLon, p_min_lat: b.minLat, p_max_lng: b.maxLon, p_max_lat: b.maxLat };
}
