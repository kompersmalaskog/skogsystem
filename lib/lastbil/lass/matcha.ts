// Har föraren redan registrerat flytten? Då ska lasset kopplas till den — aldrig en dubblett.
//
// Förarflödet skapar maskin_flytt vid "Lassat" och stänger den vid "Lämnat", så en pågående eller avslutad flytt som överlappar
// lasset i tid är samma flytt. Tre sorters rader:
//   • avslutad eller pågående, ej avbruten  → MATCH: lasset kopplas, saknad odometer/Från fylls i (fyll_flytt_ur_lass).
//   • avbruten                              → PÅBÖRJAD: föraren började en flytt och gav upp. Ingen match (den ska inte fakturera),
//                                              men maskinen i den är ett bra förslag — och lasset skapar sin egen flytt.
// Varje flytt kan höra till ETT lass (`upptagna`).

import { tidMs } from './detektera';

export interface ManuellFlytt {
  id: string;
  maskin_id: string | null;
  extern_maskin: string | null;
  starttid: string;
  hamtad_tid: string | null;
  sluttid: string | null;
  avbruten: boolean;
}

export interface LassTider {
  /** Tidigast kända lastning (sista tomma punkten före, annars första lastade). */
  fran: string;
  /** Senast kända lossning (första tomma punkten efter, annars bedömd lossningstid). */
  till: string;
  /** Första lastade punkten. */
  lastad: string;
}

/** Marginal runt lasset: loggen är gles (upp till 70 min mellan punkter) och förarens tryck kommer före/efter bilens rörelse. */
export const MATCH_MARGINAL_MIN = 45;
/** En flytt utan sluttid anses pågå så här länge (och aldrig längre än till nu). */
export const OPPEN_FLYTT_MAX_TIM = 12;

const MIN = 60_000;

function spann(f: ManuellFlytt, nu: number): [number, number] | null {
  const start = tidMs(f.hamtad_tid ?? f.starttid);
  if (!Number.isFinite(start)) return null;
  const slutRaw = f.sluttid ? tidMs(f.sluttid) : Math.min(nu, start + OPPEN_FLYTT_MAX_TIM * 60 * MIN);
  const slut = Number.isFinite(slutRaw) ? Math.max(slutRaw, start) : start;
  return [Math.min(start, tidMs(f.starttid) || start), slut];
}

export type ManuellTraff =
  | { typ: 'match'; flytt: ManuellFlytt }
  | { typ: 'paborjad'; flytt: ManuellFlytt }
  | null;

export function hittaManuellFlytt(lass: LassTider, flyttar: readonly ManuellFlytt[], upptagna: ReadonlySet<string>, nu: number = Date.now()): ManuellTraff {
  const lFran = tidMs(lass.fran) - MATCH_MARGINAL_MIN * MIN;
  const lTill = tidMs(lass.till) + MATCH_MARGINAL_MIN * MIN;
  const lastad = tidMs(lass.lastad);

  let basta: { f: ManuellFlytt; overlapp: number; avstand: number } | null = null;
  let paborjad: { f: ManuellFlytt; avstand: number } | null = null;
  for (const f of flyttar) {
    if (upptagna.has(f.id)) continue;
    const s = spann(f, nu);
    if (!s) continue;
    const overlapp = Math.min(s[1], lTill) - Math.max(s[0], lFran);
    if (overlapp < 0) continue;
    const avstand = Math.abs(tidMs(f.hamtad_tid ?? f.starttid) - lastad);
    if (f.avbruten) {
      if (!paborjad || avstand < paborjad.avstand) paborjad = { f, avstand };
      continue;
    }
    if (!basta || overlapp > basta.overlapp || (overlapp === basta.overlapp && avstand < basta.avstand)) basta = { f, overlapp, avstand };
  }
  if (basta) return { typ: 'match', flytt: basta.f };
  if (paborjad) return { typ: 'paborjad', flytt: paborjad.f };
  return null;
}

// ── Historiska lass: tid OCH plats ───────────────────────────────────────────────────────────────────────────────────────────
// Cron-jobbet (hittaManuellFlytt ovan) kopplar på tid ensam: ett lass blir en flytt i förarens ögon om tiderna överlappar. För den
// ENGÅNGSKÖRNING som för in lassen 3 aug–15 okt (historik.ts) räcker inte det — då är en "samma tid, annan plats" ett skäl att FRÅGA,
// inte att koppla (två lass kan ligga tätt, och föraren kan ha registrerat en annan flytt). Reglerna:
//   registrerad  = ej avbruten, tiden överlappar (samma marginal och spann som ovan) OCH platsen är densamma i minst en ände.
//   samma plats  = samma objekt/plats-id i Från eller Till, eller flyttens koordinat inom PLATS_SAMMA_M från lassets punkt.
//   samtidig     = tiden överlappar men platsen är en annan (eller flytten är avbruten): lasset blir en fråga, och frågan SÄGER att
//                  flytten finns, så den som svarar kan avvisa i stället för att dubblera.

import { haversine } from '@/utils/geo';
import type { FunnenPlats } from './plats';

/** Flyttens koordinat inom så här långt från lassets punkt räknas som samma plats. */
export const PLATS_SAMMA_M = 2_000;

export interface RegistreradFlytt extends ManuellFlytt {
  fran_objekt_id: string | null;
  fran_plats_id: string | null;
  fran_lat: number | null;
  fran_lng: number | null;
  till_objekt_id: string | null;
  till_plats_id: string | null;
  till_lat: number | null;
  till_lng: number | null;
  fran_odometer_m: number | null;
  till_odometer_m: number | null;
}

export interface LassPlatser {
  fran: FunnenPlats | null;
  till: FunnenPlats | null;
  lassning: { lat: number | null; lng: number | null };
  lossning: { lat: number | null; lng: number | null };
}

const idLika = (objektId: string | null, platsId: string | null, p: FunnenPlats | null): boolean =>
  !!p && (p.typ === 'objekt' ? objektId === p.id : platsId === p.id);

const narPunkt = (lat: number | null, lng: number | null, p: { lat: number | null; lng: number | null }): boolean =>
  lat != null && lng != null && p.lat != null && p.lng != null && haversine(lat, lng, p.lat, p.lng) * 1000 <= PLATS_SAMMA_M;

/** Vilka ändar av flytten ligger på lassets platser. */
export function platsSamma(f: RegistreradFlytt, p: LassPlatser): { fran: boolean; till: boolean } {
  return {
    fran: idLika(f.fran_objekt_id, f.fran_plats_id, p.fran) || narPunkt(f.fran_lat, f.fran_lng, p.lassning),
    till: idLika(f.till_objekt_id, f.till_plats_id, p.till) || narPunkt(f.till_lat, f.till_lng, p.lossning),
  };
}

export interface FlyttSokning {
  /** Förarens flytt: samma tid och samma plats. Lasset ska kopplas dit, inte bli en fråga. */
  registrerad: RegistreradFlytt | null;
  /** Flyttar som överlappar i tid men inte räknas som samma (annan plats, eller avbruten). Det frågan ska nämna. */
  samtidiga: { flytt: RegistreradFlytt; skal: 'annan_plats' | 'avbruten' }[];
}

export function sokRegistreradeFlyttar(lass: LassTider, platser: LassPlatser, flyttar: readonly RegistreradFlytt[], upptagna: ReadonlySet<string>, nu: number = Date.now()): FlyttSokning {
  const lFran = tidMs(lass.fran) - MATCH_MARGINAL_MIN * MIN;
  const lTill = tidMs(lass.till) + MATCH_MARGINAL_MIN * MIN;
  const lastad = tidMs(lass.lastad);

  let basta: { f: RegistreradFlytt; overlapp: number; avstand: number } | null = null;
  const samtidiga: FlyttSokning['samtidiga'] = [];
  for (const f of flyttar) {
    const s = spann(f, nu);
    if (!s) continue;
    const overlapp = Math.min(s[1], lTill) - Math.max(s[0], lFran);
    if (overlapp < 0) continue;
    if (f.avbruten) { samtidiga.push({ flytt: f, skal: 'avbruten' }); continue; }
    const ps = platsSamma(f, platser);
    if (!(ps.fran || ps.till) || upptagna.has(f.id)) {
      // En flytt som redan hör till ett annat lass är ändå samtidig: den som svarar ska få veta att den finns.
      samtidiga.push({ flytt: f, skal: 'annan_plats' });
      continue;
    }
    const avstand = Math.abs(tidMs(f.hamtad_tid ?? f.starttid) - lastad);
    if (!basta || overlapp > basta.overlapp || (overlapp === basta.overlapp && avstand < basta.avstand)) basta = { f, overlapp, avstand };
  }
  return { registrerad: basta?.f ?? null, samtidiga };
}
