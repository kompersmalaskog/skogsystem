// Hur säker är en plats? Lassets Från/Till väljs som NÄRMASTE trakt inom 8 km (plats.ts) — men "närmaste" är bara ett namn, inte ett
// bevis: 3 aug låg Intaget 608 m, Åbogen 673 m och Sandåsen 1 km från lossningen, och rätt var Åbogen. Den som svarar på "Vilken
// maskin?" ska se när platsen är en gissning, och vilka andra som kommer i fråga.
//
// BARA VISNING. Flytten som skapas får fortfarande den närmaste trakten (narmastePlats), och admin rättar Till i "Flytten" om den är fel.
// Ren modul: kandidaterna läses av anroparen.

import { haversine } from '@/utils/geo';
import { PLATS_MAX_M } from './plats';

/** Närmaste trakt inom så här nära OCH nästa minst så här mycket längre bort = säker. */
export const PLATS_SAKER_M = 300;
/** De andra som visas under en osäker plats: högst så här många, inom så här långt från punkten. */
export const PLATS_ANDRA_MAX = 2;
export const PLATS_ANDRA_INOM_M = 1_500;

export interface PlatsPunkt { namn: string; lat: number | null; lng: number | null }
export interface PlatsAvstand { namn: string; avstandM: number }

export type PlatsBedomning =
  | { typ: 'okand' }
  | { typ: 'saker'; namn: string }
  | { typ: 'osaker'; namn: string; andra: PlatsAvstand[] };

/** Alla platser inom räckvidden, närmast först. Samma namn två gånger (en trakt och en flyttplats på samma ställe) är EN plats. */
function inomRackvidd(lat: number, lng: number, kandidater: readonly PlatsPunkt[]): PlatsAvstand[] {
  const nara = new Map<string, PlatsAvstand>();
  for (const k of kandidater) {
    if (k.lat == null || k.lng == null || !Number.isFinite(k.lat) || !Number.isFinite(k.lng)) continue;
    const namn = (k.namn ?? '').trim();
    if (!namn) continue;
    const avstandM = Math.round(haversine(lat, lng, k.lat, k.lng) * 1000);
    if (avstandM > PLATS_MAX_M) continue;
    const nyckel = namn.toLowerCase();
    const finns = nara.get(nyckel);
    if (!finns || avstandM < finns.avstandM) nara.set(nyckel, { namn, avstandM });
  }
  return [...nara.values()].sort((a, b) => a.avstandM - b.avstandM);
}

/**
 * Säker: närmaste ≤ 300 m OCH nästa minst 300 m längre bort. Osäker: närmaste över 300 m bort, eller en annan inom 300 m av
 * närmastes avstånd — då står "nära <närmaste>" och de andra inom 1,5 km (högst två) under. Inget inom 8 km: okänd.
 * Saknas positionen går platsen inte att bedöma (null) — anroparen visar då det sparade namnet som förut.
 */
export function bedomPlats(lat: number | null, lng: number | null, kandidater: readonly PlatsPunkt[]): PlatsBedomning | null {
  if (lat == null || lng == null) return null;
  const alla = inomRackvidd(lat, lng, kandidater);
  const [narmast, ...ovriga] = alla;
  if (!narmast) return { typ: 'okand' };
  const nasta = ovriga[0];
  const saker = narmast.avstandM <= PLATS_SAKER_M && (!nasta || nasta.avstandM - narmast.avstandM >= PLATS_SAKER_M);
  if (saker) return { typ: 'saker', namn: narmast.namn };
  return {
    typ: 'osaker',
    namn: narmast.namn,
    andra: ovriga.filter(o => o.avstandM <= PLATS_ANDRA_INOM_M).slice(0, PLATS_ANDRA_MAX),
  };
}

/** "673 m", "1 km", "1,3 km". */
export function fmtPlatsAvstand(m: number): string {
  if (m < 1000) return `${m} m`;
  return `${(Math.round(m / 100) / 10).toString().replace('.', ',')} km`;
}
