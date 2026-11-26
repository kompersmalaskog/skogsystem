// Skotarens lass i maskinvyn: Opti-filerna OCH appens egna lass, räknade på ETT sätt.
//
// Källan är RPC:erna `maskindata_lass_alla` / `maskindata_lass_senaste_alla` (migration 20261126163405). Där avgörs dubbelräkningen
// (Martin 2026-11-26): per maskin + objekt + dag räknas den källa som har mest volym, aldrig summan — samma regel som helikoptern
// (`helikopter_lass`) och fakturan. Vyerna får därför enskilda lass ur den källa som vann och räknar bara på dem.
//
// Tre saker som en app-rad gör annorlunda än en Opti-rad, och som alla vyer måste klara:
//   1. VOLYMEN är förarens egen uppgift (`m3_forare`), eventuellt skalad mot skördat (Färdigskotad). Den visas med märket
//      "uppskattad" respektive "skalad"; Opti-lass har inget märke (maskinen mätte).
//   2. AVSTÅNDET saknas: app-lassen har ingen `korstracka_m` (körsträckan ur deras spår kommer i en egen ändring). Snittet delas
//      därför på lassen som HAR ett mått ("N av M lass"), aldrig på alla — ett snitt över alla skulle dras ned av nollor.
//   3. TIDEN saknas ibland: Elefant 26 och 810E har ingen maskintid (fakt_tid) efter att filerna slutade. Kvoter per G15-timme
//      (m³/G15h, lass/G15h) räknas bara på dagar som HAR G15-tid — annars hamnar app-volym i täljaren utan tid i nämnaren och
//      kvoten blåses upp. Saknas tid helt visas ett streck med förklaring, aldrig en gissning.

import type { LassRad } from './skotarvolym'
import { snittSkotningsavstandM } from '../skotningsavstand'
import { g15Sek } from '../g15'

/** RPC:erna som alla skotarvyer läser lass ur. Ingen vy får anropa de gamla `maskindata_lass*` (de ser bara Opti). */
export const RPC_LASS = 'maskindata_lass_alla'
export const RPC_LASS_SENASTE = 'maskindata_lass_senaste_alla'

export type LassKalla = 'opti' | 'app'

/** En lassrad ur `maskindata_lass_alla`. Fälten efter `objekt_id` finns bara i den nya RPC:n. */
export type SkotarLassRad = LassRad & {
  operator_id?: string | null
  lossnings_tid?: string | null
  korstracka_m?: number | null
  kalla?: LassKalla | null
  lass_id?: string | null
  medarbetare_id?: string | null
  /** Det föraren själv skrev (appens lass); för Opti-lass samma som volym_m3sub. */
  volym_forare?: number | null
  /** true = volymen är skalad mot skördat (Färdigskotad) och skiljer sig från förarens egen. */
  skalad?: boolean | null
}

// ── Summor över lass ─────────────────────────────────────────────

export type LassSumma = {
  volym: number
  lass: number
  /** Summa körsträcka (tur och retur) över lassen som HAR ett mått. */
  distSum: number
  /** Antal lass som har ett mått. */
  distN: number
  /** Antal app-lass (förarens egen registrering). */
  appLass: number
  /** Av dem: antal som inte är skalade (förarens egen siffra rakt av). */
  appOskalade: number
}

export const tomLassSumma = (): LassSumma => ({ volym: 0, lass: 0, distSum: 0, distN: 0, appLass: 0, appOskalade: 0 })

/** Lägger ett lass till summan. */
export function laggTillLass(s: LassSumma, r: Pick<SkotarLassRad, 'volym_m3sub' | 'korstracka_m' | 'kalla' | 'skalad'>): void {
  s.volym += r.volym_m3sub || 0
  s.lass += 1
  if (r.korstracka_m != null) { s.distSum += Number(r.korstracka_m) || 0; s.distN += 1 }
  if (r.kalla === 'app') { s.appLass += 1; if (!r.skalad) s.appOskalade += 1 }
}

/** Adderar `b` till `a` (veckor och månader byggs av dagar). */
export function adderaLassSumma(a: LassSumma, b: Partial<LassSumma>): void {
  a.volym += b.volym || 0
  a.lass += b.lass || 0
  a.distSum += b.distSum || 0
  a.distN += b.distN || 0
  a.appLass += b.appLass || 0
  a.appOskalade += b.appOskalade || 0
}

// ── Märke på volymen ─────────────────────────────────────────────

/** Märket på en volymsiffra: 'uppskattad' = förarens egen siffra, 'skalad' = skalad mot skördat, null = rent Opti. */
export type AppMark = 'uppskattad' | 'skalad' | null

/**
 * Finns app-lass i summan: "uppskattad" så fort något av dem är förarens egen siffra rakt av, "skalad" först när ALLA app-lassen är
 * skalade. Rent Opti ger inget märke. Blandade perioder (Opti-dagar och app-dagar) märks som app — märket säger att en del av
 * siffran är förarens egen uppgift.
 */
export function appMark(s: Pick<LassSumma, 'appLass' | 'appOskalade'>): AppMark {
  if (s.appLass <= 0) return null
  return s.appOskalade > 0 ? 'uppskattad' : 'skalad'
}

// ── Avstånd ──────────────────────────────────────────────────────

/** Skotningsavstånd (enkel väg) över lassen som har ett mått. Null när inget lass har det — aldrig 0. */
export function snittAvstandM(s: Pick<LassSumma, 'distSum' | 'distN'>): number | null {
  return snittSkotningsavstandM(s.distSum, s.distN)
}

/**
 * Raden under avståndet när det inte gäller alla lass: "3 av 5 lass" eller (när inget lass har mått) "mäts inte för appens lass".
 * Null när alla lass har mått eller det inte finns några lass.
 */
export function avstandNot(s: Pick<LassSumma, 'lass' | 'distN'>): string | null {
  if (s.lass <= 0) return null
  if (s.distN <= 0) return 'mäts inte för appens lass'
  if (s.distN < s.lass) return `${s.distN} av ${s.lass} lass`
  return null
}

// ── Kvoter per G15-timme ─────────────────────────────────────────

/** G15-sekunder per dag ur tidsraderna (`maskindata_tid`). Dagar utan tid saknas i mappen. */
export function g15PerDag(
  tid: { datum?: string | null; processing_sek?: number | null; terrain_sek?: number | null; other_work_sek?: number | null }[],
): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of tid) {
    if (!r.datum) continue
    m.set(r.datum, (m.get(r.datum) ?? 0) + g15Sek(r.processing_sek, r.terrain_sek, r.other_work_sek))
  }
  return m
}

export type KvotUnderlag = {
  /** Volym på dagar som har G15-tid — det som får stå i täljaren. */
  volym: number
  /** Lass på dagar som har G15-tid. */
  lass: number
  /** Dagar med lass där G15-tid finns respektive saknas. */
  dagarMedTid: number
  dagarUtanTid: number
}

/**
 * Det av lassen som får stå i täljaren för en kvot per G15-timme: bara lass på dagar där maskinen har G15-tid (> 0 s).
 * `g15SekPerDag` kommer ur `maskindata_tid` (separat hämtning, aldrig join i SQL).
 */
export function kvotUnderlag(
  rader: { datum?: string | null; volym_m3sub?: number | null }[],
  g15SekPerDag: ReadonlyMap<string, number>,
): KvotUnderlag {
  const medTid = new Set<string>()
  const utanTid = new Set<string>()
  let volym = 0
  let lass = 0
  for (const r of rader) {
    if (!r.datum) continue
    if ((g15SekPerDag.get(r.datum) ?? 0) > 0) {
      volym += r.volym_m3sub || 0
      lass += 1
      medTid.add(r.datum)
    } else {
      utanTid.add(r.datum)
    }
  }
  return { volym, lass, dagarMedTid: medTid.size, dagarUtanTid: utanTid.size }
}

/**
 * Samma regel som `kvotUnderlag`, för summor per dag (operatörskorten bygger volym och G15-tid per dag innan personerna slås ihop):
 * volymen på dagar där G15-tid finns (> 0 s).
 */
export function kvotVolymUrDagar(volymPerDag: Readonly<Record<string, number>>, g15SekPerDag: Readonly<Record<string, number>>): number {
  let v = 0
  for (const d of Object.keys(volymPerDag)) if ((g15SekPerDag[d] ?? 0) > 0) v += volymPerDag[d]
  return v
}

/** Förklaringen under ett streck eller en kvot som inte gäller alla dagar. Null när alla dagar med lass har G15-tid. */
export function tidNot(u: Pick<KvotUnderlag, 'dagarMedTid' | 'dagarUtanTid'>): string | null {
  if (u.dagarUtanTid <= 0) return null
  if (u.dagarMedTid <= 0) return 'ingen maskintid för de här dagarna'
  return `räknat på ${u.dagarMedTid} av ${u.dagarMedTid + u.dagarUtanTid} dagar (resten saknar maskintid)`
}

/** Kvot = täljare / G15-timmar, eller null när nämnaren saknas — aldrig 0 och aldrig oändligt. */
export function kvotPerTimme(taljare: number, g15Sekunder: number): number | null {
  return g15Sekunder > 0 ? taljare / (g15Sekunder / 3600) : null
}
