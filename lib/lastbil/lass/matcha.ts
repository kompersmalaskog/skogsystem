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
