// Närmaste trakt eller flyttplats till en punkt. Flytter pekar på objekt/platser — aldrig på råa koordinater — så en punkt i loggen
// blir ett namn att godkänna ("Östra-Hoka 1:7", inte "56,2033 / 14,8938").
//
// Ren modul: kandidaterna läses av anroparen (objekt + aktiva flyttplatser). Räckvidden är 8 km: objektens koordinater är grova
// (Kroksjömåla 1:23 och Karamåla 1:9 ligger ungefär 6 km från där maskinerna alltid står), men längre bort än så är en träff en gissning.
// Avståndet följer med — den som godkänner ser "ungefär" när det är långt, och automatiken kräver att båda ändarna ligger nära (se kor.ts).

import { haversine } from '@/utils/geo';

export interface PlatsKandidat {
  typ: 'objekt' | 'plats';
  id: string;
  namn: string;
  lat: number;
  lng: number;
  /** Bara objekt: VO-numret — nyckeln fakt_lass läser skotningen på. */
  vo?: string | null;
  /** Bara objekt: ger kunden (Privat → markägaren). */
  bolag?: string | null;
  markagare?: string | null;
  /** Bara flyttplatser: 'verkstad' gör flytten till service. */
  platsTyp?: string | null;
}

export interface FunnenPlats {
  typ: 'objekt' | 'plats';
  id: string;
  namn: string;
  avstandM: number;
  kandidat: PlatsKandidat;
}

export const PLATS_MAX_M = 8_000;
/** Inom så här nära en trakt är platsen säker nog för en automatisk flytt. */
export const PLATS_NARA_M = 2_000;

export function narmastePlats(lat: number | null, lng: number | null, kandidater: readonly PlatsKandidat[]): FunnenPlats | null {
  if (lat == null || lng == null) return null;
  let bast: FunnenPlats | null = null;
  for (const k of kandidater) {
    if (!Number.isFinite(k.lat) || !Number.isFinite(k.lng)) continue;
    const m = Math.round(haversine(lat, lng, k.lat, k.lng) * 1000);
    if (m > PLATS_MAX_M) continue;
    if (!bast || m < bast.avstandM) bast = { typ: k.typ, id: k.id, namn: k.namn, avstandM: m, kandidat: k };
  }
  return bast;
}

/** Avståndet i meter till närmaste kandidat, eller null — det detekteringen behöver för "bilen stod vid en trakt". */
export function narPlatsMeter(kandidater: readonly PlatsKandidat[]) {
  return (lat: number, lng: number): number | null => narmastePlats(lat, lng, kandidater)?.avstandM ?? null;
}
