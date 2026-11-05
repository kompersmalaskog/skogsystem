// VAR STÅR MASKINEN? — EN regel för Översikten och Planeringens maskinprickar (Martin 2026-11-05: en maskin får aldrig stå på
// olika ställen i två vyer).
//
// Två källor slås ihop, ingen av dem ny:
//   plats  senastePlats (app/maskinflytt): lastbilens flytt, GPS-fixen vid flytt (maskin_position) och produktionsdagen (fakt_tid).
//          Täcker maskiner utan appen igång i hytten (810E, H8E med datorn avstängd under transport).
//   gps    appens GPS i hytten, sista punkten (RPC maskin_senaste_position). Levande — men bara där appen är igång.
// Nyast vinner, som i lastbilens "Hämta en maskin" (app/lastbil/_components/hamta/maskinPos.ts). Jämförelsen sker på DAG först:
// en senare dag vinner alltid. Samma dag vinner GPS:en, utom när platsen har ett klockslag som är senare (en flytt som avslutats
// efter maskinens sista GPS-punkt — då står maskinen där lastbilen lämnade den). En produktionsdag har inget klockslag.
//
// Ren logik — ingen läsning, inget app/-beroende (lib får inte importera app/).

import type { MaskinPosRad } from './maskinerNu';

/** Det som behövs av senastePlats' PlatsForslag (strukturellt — samma fält). */
export interface PlatsLik {
  namn: string;
  koordinat: { lat: number; lng: number } | null;
  objektId: string | null;
  platsId: string | null;
  tidpunkt: string | null;
  kalla: string;
  osaker: string | null;
}

const SV = 'Europe/Stockholm';
const dagAv = (t: string): string => (t.length <= 10 ? t : new Date(t).toLocaleDateString('sv-SE', { timeZone: SV }));
const msAv = (t: string): number | null => { if (t.length <= 10) return null; const ms = Date.parse(t); return Number.isNaN(ms) ? null : ms; };

/** Grovsållning: null-ön och punkter utanför Norden är trasiga fixar, inte platser (samma gränser som rimligGpsPunkt). */
export function rimligPunkt(lat: number | null | undefined, lng: number | null | undefined): lat is number {
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return lat >= 54 && lat <= 71 && lng >= 4 && lng <= 32;
}

/** Vinner GPS-punkten över platsen? */
export function gpsVinner(gpsTid: string, plats: PlatsLik | undefined): boolean {
  if (!plats || !plats.koordinat || !plats.tidpunkt) return true;
  const gDag = dagAv(gpsTid); const pDag = dagAv(plats.tidpunkt);
  if (gDag !== pDag) return gDag > pDag;
  const g = msAv(gpsTid); const p = msAv(plats.tidpunkt);
  return !(g != null && p != null && p > g); // samma dag: GPS:en, utom en plats med senare klockslag
}

/** platser (per maskin) + GPS-raderna → en plats per maskin. En GPS-punkt som vinner blir kalla 'position' med objektet appen
 *  hade valt i hytten och tiden till minuten. Maskiner som bara finns i GPS:en kommer med. */
export function slaIhopMedGps<P extends PlatsLik>(platser: ReadonlyMap<string, P>, gps: readonly MaskinPosRad[]): Map<string, P | PlatsLik> {
  const ut = new Map<string, P | PlatsLik>(platser);
  for (const r of gps) {
    if (!r.maskin_id || !rimligPunkt(r.lat, r.lng)) continue;
    const tid = r.tid ?? r.datum;
    if (!tid) continue;
    if (!gpsVinner(tid, platser.get(r.maskin_id))) continue;
    ut.set(r.maskin_id, {
      namn: r.objekt_namn?.trim() || 'Senast uppmätt läge',
      koordinat: { lat: r.lat as number, lng: r.lng as number },
      objektId: r.objekt_id ?? null,
      platsId: null,
      tidpunkt: tid,
      kalla: 'position',
      osaker: null,
    });
  }
  return ut;
}
