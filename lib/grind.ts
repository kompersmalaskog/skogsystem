// GRIND MED KOD: planeraren skriver hänglåskoden (bara siffror) när grinden sätts. Inom ~50 m visas koden själv i ett kort högst upp i körvyn
// ("Grind · Stäng efter dig", koden stort till höger). Kortet försvinner när man passerat. Inget ljud, ingen kvittering — det är ingen varning.
// Koden hör till kartan och körvyn, ALDRIG till A4-rapporten (lib/egenkontrollRapport* läser den inte; vakt i lib/grind.test.ts).
// Rena funktioner: ingen koppling till lib/larm (en grind larmar aldrig, den hör till gruppen Info).

import { avstandPunktM, type LatLon } from './larm/geo';

export const GRIND_TYP = 'gate';
/** Kortet visas inom 50 m och släpps först vid 60 m (hysteres, så GPS-brus vid kanten inte får kortet att flimra). */
export const GRIND_NARA_M = 50;
export const GRIND_UT_M = 60;
/** "Passerat": man har varit nära (≤ 25 m) och avståndet har sedan vuxit 15 m från det närmaste. Då är grinden bakom en. */
export const GRIND_NARMAST_M = 25;
export const GRIND_PASSERAT_M = 15;
export const GRIND_KOD_MAX = 12;

/** Bara siffror, högst 12. Allt annat tas bort (hänglåskoder är siffror). */
export const rensaGrindKod = (v: string | null | undefined): string => String(v ?? '').replace(/\D+/g, '').slice(0, GRIND_KOD_MAX);

export interface GrindIn { id: string; kod: string; lat: number; lon: number }
export interface GrindState {
  /** Närmaste avstånd under det här närmandet. */
  narmast: Readonly<Record<string, number>>;
  /** Grindar man passerat: visas inte igen förrän man lämnat 60 m. */
  passerad: Readonly<Record<string, true>>;
}
export const TOMT_GRIND: GrindState = { narmast: {}, passerad: {} };

export interface GrindKort { id: string; kod: string; avstandM: number }

/** Grindar ur sidans markeringar (typ gate, med kod). En grind utan kod har inget att visa. */
export function grindarUrMarkeringar(markers: readonly any[], svgToLatLon: (x: number, y: number) => LatLon): GrindIn[] {
  const ut: GrindIn[] = [];
  for (const m of markers) {
    if (!m?.isMarker || m.type !== GRIND_TYP || typeof m.x !== 'number' || typeof m.y !== 'number') continue;
    const kod = rensaGrindKod(m.kod);
    if (!kod) continue;
    const ll = svgToLatLon(m.x, m.y);
    ut.push({ id: String(m.id), kod, lat: ll.lat, lon: ll.lon });
  }
  return ut;
}

export function stegaGrind(inp: { grindar: readonly GrindIn[]; pos: LatLon | null; state: GrindState }): { state: GrindState; kort: GrindKort | null } {
  if (!inp.pos) return { state: TOMT_GRIND, kort: null };
  const narmast: Record<string, number> = {};
  const passerad: Record<string, true> = {};
  let kort: GrindKort | null = null;
  for (const g of inp.grindar) {
    const d = avstandPunktM(inp.pos, { lat: g.lat, lon: g.lon });
    const tidigareNarmast = inp.state.narmast[g.id];
    const varInne = tidigareNarmast !== undefined;
    if (d > GRIND_UT_M) continue;                       // utanför: närmande och "passerad" glöms
    if (inp.state.passerad[g.id]) { passerad[g.id] = true; continue; }
    if (!varInne && d > GRIND_NARA_M) continue;        // ännu inte inne
    const min = Math.min(tidigareNarmast ?? Infinity, d);
    narmast[g.id] = min;
    if (min <= GRIND_NARMAST_M && d - min >= GRIND_PASSERAT_M) { passerad[g.id] = true; delete narmast[g.id]; continue; }
    if (!kort || d < kort.avstandM) kort = { id: g.id, kod: g.kod, avstandM: Math.round(d) };
  }
  return { state: { narmast, passerad }, kort };
}
