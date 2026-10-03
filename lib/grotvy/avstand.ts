// Avstånd mellan GROT-objekt (GROT-arket i /oversikt-v2) — väg, aldrig fågelväg.
//
// Raden visar "N km från <närmaste andra GROT-objekt>". Vägavstånd kostar ett ORS-anrop per par
// (gratisplanen: 40/min, 2 000/dag), så vi slår inte upp alla par — fågelvägen får bara VÄLJA
// vilka par som är värda ett anrop: de K närmaste kandidaterna per objekt. Fågelvägen visas
// aldrig; siffran som visas är alltid ORS-vägavstånd eller '–'.
//
// Samma kandidatval körs i vyn och i förvärmningsskriptet (scripts/grot-forvarm-route-cache.ts),
// och paren ligger i KANONISK riktning (lägst id → högst id), så skriptet fyller exakt de
// route_cache-rader vyn sedan läser — och båda raderna i ett par visar samma siffra.

import { haversine } from '@/utils/geo';
import type { Koord } from './lista';

/** Antal närmaste (fågelväg) kandidater per objekt som slås upp som väg. */
export const K_KANDIDATER = 3;

export interface Punkt { id: string; lat: number; lng: number }
export interface Par { nyckel: string; fran: Punkt; till: Punkt }

/** Samma par ger samma nyckel oavsett riktning. */
export function parNyckel(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** De K närmaste ANDRA punkterna i fågelväg, närmast först. Bara för att välja par. */
export function valjKandidater(punkter: Punkt[], k: number = K_KANDIDATER): Map<string, string[]> {
  const ut = new Map<string, string[]>();
  punkter.forEach((p) => {
    const grannar = punkter
      .filter((q) => q.id !== p.id)
      .map((q) => ({ id: q.id, d: haversine(p.lat, p.lng, q.lat, q.lng) }))
      .sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : 1));
    ut.set(p.id, grannar.slice(0, k).map((g) => g.id));
  });
  return ut;
}

/** Unika par att slå upp som väg, i kanonisk riktning (lägst id först). */
export function kandidatPar(punkter: Punkt[], k: number = K_KANDIDATER): Par[] {
  const per = new Map<string, Punkt>();
  punkter.forEach((p) => per.set(p.id, p));
  const sedda = new Set<string>();
  const par: Par[] = [];
  valjKandidater(punkter, k).forEach((kand, id) => {
    kand.forEach((annan) => {
      const nyckel = parNyckel(id, annan);
      if (sedda.has(nyckel)) return;
      sedda.add(nyckel);
      const fran = id < annan ? id : annan;
      const till = id < annan ? annan : id;
      par.push({ nyckel, fran: per.get(fran) as Punkt, till: per.get(till) as Punkt });
    });
  });
  return par.sort((a, b) => (a.nyckel < b.nyckel ? -1 : a.nyckel > b.nyckel ? 1 : 0));
}

export interface Narmast { km: number; annanId: string }

/** Närmaste andra objekt efter VÄG bland objektets kandidater. `km` = parNyckel → vägkm (null/saknas
 *  = inte känt än). Inget känt avstånd → null (raden visar '–'). */
export function narmasteVag(
  id: string,
  kandidater: Map<string, string[]>,
  km: Record<string, number | null | undefined>,
): Narmast | null {
  let bast: Narmast | null = null;
  for (const annan of kandidater.get(id) ?? []) {
    const v = km[parNyckel(id, annan)];
    if (typeof v === 'number' && (bast == null || v < bast.km)) bast = { km: v, annanId: annan };
  }
  return bast;
}

/** ORS-vägavstånd via /api/routing (cache först, sedan ORS). Bara källa cache/ors räknas — svaret
 *  'fallback' är fågelväg × 1,4 och ska aldrig visas. Fel → null ('–'). */
export async function hamtaVagKm(fran: Koord, till: Koord): Promise<number | null> {
  try {
    const r = await fetch(`/api/routing?fromLat=${fran.lat}&fromLng=${fran.lng}&toLat=${till.lat}&toLng=${till.lng}`);
    const j = await r.json();
    return typeof j.km === 'number' && (j.source === 'cache' || j.source === 'ors') ? j.km : null;
  } catch {
    return null;
  }
}

/** Kör jobben med högst `max` samtidigt (skonar ORS:s kvot och telefonens nät). */
export async function korBegransat<T>(jobb: (() => Promise<T>)[], max: number, vidVarje?: (i: number, v: T) => void): Promise<void> {
  let nasta = 0;
  const arbetare = Array.from({ length: Math.min(max, jobb.length) }, async () => {
    while (nasta < jobb.length) {
      const i = nasta++;
      vidVarje?.(i, await jobb[i]());
    }
  });
  await Promise.all(arbetare);
}
