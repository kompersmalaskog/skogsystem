// Delad hjälpmodul för manuell volym-korrigering i skotarvyerna.
//
// Alla fyra skotarflikar (Översikt, Produktion, Idag, Jämförelse) importerar
// härifrån. Ingen vy uppfinner sin egen fördelningslogik.
//
// Noll-diff mot fordelaSkotadVolymFrånDB (lib/ekonomi/acord.ts) garanteras
// matematiskt — samma kodväg. Verifierat i verify-kronordiff.ts (PR #334).

import { supabase } from '@/lib/supabase'
import { fordelaSkotadVolymFrånDB, type SkotareManuellRad } from '@/lib/ekonomi/acord'

// ── Typer ──────────────────────────────────────────────────────

export type ManuellRad = {
  objekt_id: string
  maskin_id: string | null
  volym_m3: number | null
}

export type LassRad = {
  datum: string
  maskin_id: string
  volym_m3sub: number | null
  objekt_id: string | null | undefined
}

export type TidRad = {
  datum: string
  maskin_id: string
  processing_sek: number | null
  terrain_sek: number | null
  other_work_sek: number | null
  objekt_id: string | null | undefined
}

export type VolymPerDagResult = {
  perDag:     Map<string, number>   // datum → manuell-korrigerad volym
  totalLass:  Map<string, number>   // datum → lass-antal (alltid raw)
  harManuell: boolean               // minst ett objekt i perioden hade manuell data
}

// ── Paginering ─────────────────────────────────────────────────
// PostgREST 1000-raders standardgräns kräver manuell paginering.
async function rpcPaginerat(rpcNamn: string, params: object): Promise<any[]> {
  const sid = 1000
  let alla: any[] = []
  let fran = 0
  while (true) {
    const { data, error } = await (supabase.rpc(rpcNamn, params) as any).range(fran, fran + sid - 1)
    if (error || !data || data.length === 0) break
    alla = alla.concat(data)
    if (data.length < sid) break
    fran += sid
  }
  return alla
}

// ── Datahämtning ───────────────────────────────────────────────

// Hämtar manuell-rader för en maskin: maskin-specifika rader för maskinId
// plus NULL-maskin-rader (objektnivå).
export async function hämtaManuellRader(maskinId: string): Promise<ManuellRad[]> {
  const { data } = await supabase
    .from('skotare_objekt_manuell')
    .select('objekt_id, maskin_id, volym_m3')
  return ((data ?? []) as ManuellRad[]).filter(
    r => r.maskin_id === null || r.maskin_id === maskinId,
  )
}

export function harManuellData(rader: ManuellRad[]): boolean {
  return rader.some(r => (r.volym_m3 ?? 0) > 0)
}

// Hämtar all-time lass (med objekt_id, kräver 20260804_maskindata_lass_objekt_id.sql)
// och tid för en eller flera maskiner utan datumfilter.
export async function fetchAllTimeLassTid(maskinIds: string[]): Promise<{
  lassRows: LassRad[]
  tidRows:  TidRad[]
}> {
  const params = { p_maskin_ids: maskinIds }
  const [lassRows, tidRes] = await Promise.all([
    rpcPaginerat('maskindata_lass', params) as Promise<LassRad[]>,
    supabase.rpc('maskindata_tid', params),
  ])
  return {
    lassRows,
    tidRows: (tidRes.data ?? []) as TidRad[],
  }
}

// ── Fördelning ─────────────────────────────────────────────────
//
// Fördelar volymer per dag med manuell-korrigering per objekt.
//
// SEMANTIK:
//   • Objekt MED manuell: all-time totalvolym distribueras proportionellt via
//     fordelaSkotadVolymFrånDB (G15-tid + lass som vikter). Delar filtreras
//     till maskinId + [start, end] ger periodens andel av manuell-totalen.
//   • Objekt UTAN manuell: raw lass-volym summeras per dag inom perioden.
//   • Lass-antal (totalLass): alltid raw FPR-data, manuell ändrar aldrig lass-count.
//
// Kräver att allTimeLassRows har objekt_id (från uppdaterad maskindata_lass-RPC).
// Om objekt_id saknas (migration ej körd): alla lass → __null → raw lass används.
export function byggVolymPerDag(
  allTimeLassRows: LassRad[],
  manuellRader:    ManuellRad[],
  allTimeTidRows:  TidRad[],
  maskinId:        string,
  start:           string,
  end:             string,
): VolymPerDagResult {
  // Grupp lass per objekt_id (null/undefined → '__null')
  const lassByObjekt = new Map<string, LassRad[]>()
  for (const r of allTimeLassRows) {
    const oid = (r.objekt_id ?? null) !== null ? (r.objekt_id as string) : '__null'
    const arr = lassByObjekt.get(oid) ?? []
    arr.push(r)
    lassByObjekt.set(oid, arr)
  }

  // Grupp tid per objekt_id — KRITISKT: måste vara per-objekt, inte all-time maskin.
  // fordelaSkotadVolymFrånDB beräknar dag_sek/tidSum som viktfaktor; om tidSum
  // innehåller hela maskinhistoriken smetas manuellvolymen ut mot fel period.
  const tidByObjekt = new Map<string, TidRad[]>()
  for (const r of allTimeTidRows) {
    const oid = (r.objekt_id ?? null) !== null ? (r.objekt_id as string) : '__null'
    const arr = tidByObjekt.get(oid) ?? []
    arr.push(r)
    tidByObjekt.set(oid, arr)
  }

  // Grupp manuell per objekt_id
  const manuellByObjekt = new Map<string, SkotareManuellRad[]>()
  for (const r of manuellRader) {
    const arr = manuellByObjekt.get(r.objekt_id) ?? []
    arr.push({ maskin_id: r.maskin_id, volym_m3: r.volym_m3 })
    manuellByObjekt.set(r.objekt_id, arr)
  }

  const perDag    = new Map<string, number>()
  const totalLass = new Map<string, number>()
  let harManuell  = false

  const addV = (d: string, v: number) => perDag.set(d, (perDag.get(d) ?? 0) + v)
  const addL = (d: string, n: number) => totalLass.set(d, (totalLass.get(d) ?? 0) + n)

  for (const [oid, objLass] of Array.from(lassByObjekt.entries())) {
    // Lass-count alltid raw, filtrat till perioden
    for (const r of objLass) {
      if (!r.datum || r.datum < start || r.datum > end) continue
      addL(r.datum, 1)
    }

    const manuell       = oid !== '__null' ? manuellByObjekt.get(oid) : undefined
    const hasManuellVol = manuell && manuell.some(r => (r.volym_m3 ?? 0) > 0)

    if (hasManuellVol) {
      // Skicka OBJEKTETS egna tid- och lass-rader som vikter (ej maskinens all-time).
      const objTid = tidByObjekt.get(oid) ?? []
      const { delar, kundeInteFordela } = fordelaSkotadVolymFrånDB(manuell!, objLass, objTid)

      // Sanity-guard: sum(delar) ≈ objektets manuella totalvolym.
      // Avvikelse > 0.1 % indikerar att viktunderlaget är fel (t.ex. objekt_id saknas i tid-RPC).
      const manuellTotal = manuell!.reduce((s, r) => s + (r.volym_m3 ?? 0), 0)
      const delarTotal   = delar.reduce((s, d) => s + d.volym, 0)
      if (manuellTotal > 0 && !kundeInteFordela) {
        const relAvvikelse = Math.abs(delarTotal - manuellTotal) / manuellTotal
        if (relAvvikelse > 0.001) {
          console.warn(
            `[skotarvolym] sanity: objekt ${oid} delar=${delarTotal.toFixed(1)} manuell=${manuellTotal.toFixed(1)} avv=${(relAvvikelse * 100).toFixed(2)}%`,
          )
        }
      }

      for (const del of delar) {
        if (del.maskin_id !== maskinId) continue
        if (del.datum < start || del.datum > end) continue
        addV(del.datum, del.volym)
        harManuell = true
      }
    } else {
      // Ingen manuell — summera raw lass-volym
      for (const r of objLass) {
        if (!r.datum || r.datum < start || r.datum > end) continue
        addV(r.datum, r.volym_m3sub ?? 0)
      }
    }
  }

  return { perDag, totalLass, harManuell }
}

// Summera perDag-map till en total.
export function sumPerDag(perDag: Map<string, number>): number {
  let s = 0
  for (const v of Array.from(perDag.values())) s += v
  return s
}
