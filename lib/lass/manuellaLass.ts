// Manuella lass i fakt_lass — för maskiner utan automatisk källa (dim_maskin.datakalla =
// 'manuell', JD810E). Raderna ligger i fakt_lass som alla andras, så helikopter, uppföljning
// och ekonomi räknar med dem utan särfall: filnamn 'manuell', lass_nummer 1..N per
// dag + maskin + objekt, volym_m3sub = m³fub per lass.
//
// Idempotent: spara om samma dag + maskin + objekt ERSÄTTER dagens manuella rader (delete på
// exakt den nyckeln inkl. filnamn = 'manuell', sedan insert). Rader med annat filnamn
// (maskinfiler) rörs aldrig — filtret bär filnamnet, och RLS (20260924100100) släpper
// bara igenom filnamn 'manuell'. Redigerbart de senaste 7 dagarna, admin alltid.
//
// Ren logik + en liten port (LassPort) så sparflödet kan testas utan Supabase
// (manuellaLass.test.ts). Adaptern supabaseLassPort ligger längst ner.
import type { SupabaseClient } from '@supabase/supabase-js'

export const MANUELL_FILNAMN = 'manuell'
/** Föraren kan ändra dagens och de senaste 7 dagarnas lass; äldre är låsta (admin alltid). Samma tal som RLS-policyn. */
export const REDIGERBAR_DAGAR = 7
/** m³fub per lass när maskinen saknar tidigare värde. */
export const STANDARD_M3_PER_LASS = 12
export const MAX_LASS_PER_DAG = 60
export const MAX_M3_PER_LASS = 40

export type LassRad = {
  datum: string
  maskin_id: string
  objekt_id: string
  lass_nummer: number
  volym_m3sub: number
  volym_m3sob: number
  operator_id: string | null
  filnamn: string
}

export type ManuellNyckel = { datum: string; maskinId: string; objektId: string }

export type LassPort = {
  /** DELETE där alla nycklar matchar exakt (eq). 0 rader är inte ett fel (första sparningen). */
  radera(match: Record<string, string>): Promise<{ antal: number } | { fel: string }>
  /** INSERT av raderna; returnerar antal insatta. */
  laggTill(rader: LassRad[]): Promise<{ antal: number } | { fel: string }>
}

export type SparaLassResultat = { ok: true; antal: number } | { ok: false; fel: string }

export const LAST_TEXT = `Låst – bara de senaste ${REDIGERBAR_DAGAR} dagarna kan ändras`
export const SPARA_LASS_FEL = 'Kunde inte spara lassen – försök igen'

/** Kalenderdagar från datum till idag (positivt = datum ligger bakåt). ISO-datum, UTC-räkning. */
export function dagarSedan(datum: string, idag: string): number {
  return Math.round((Date.parse(idag) - Date.parse(datum)) / 86400000)
}

/** Förare: i dag och de senaste REDIGERBAR_DAGAR dagarna, aldrig framåt. Admin: alltid. */
export function farRedigera(datum: string, idag: string, arAdmin: boolean): boolean {
  if (arAdmin) return true
  const d = dagarSedan(datum, idag)
  return Number.isFinite(d) && d >= 0 && d <= REDIGERBAR_DAGAR
}

/** Filtret för "dagens manuella rader" — bär alltid filnamnet så maskinfilernas rader aldrig träffas. */
export function manuellMatch(n: ManuellNyckel): Record<string, string> {
  return { filnamn: MANUELL_FILNAMN, datum: n.datum, maskin_id: n.maskinId, objekt_id: n.objektId }
}

export function valideraLass(antal: number, m3PerLass: number): string | null {
  if (!Number.isInteger(antal) || antal < 1 || antal > MAX_LASS_PER_DAG) return `Antal lass ska vara 1–${MAX_LASS_PER_DAG}`
  if (!Number.isFinite(m3PerLass) || m3PerLass <= 0 || m3PerLass > MAX_M3_PER_LASS) return `m³fub per lass ska vara 1–${MAX_M3_PER_LASS}`
  return null
}

export function byggLassRader(n: ManuellNyckel, antal: number, m3PerLass: number, operatorId: string | null): LassRad[] {
  return Array.from({ length: antal }, (_, i) => ({
    datum: n.datum,
    maskin_id: n.maskinId,
    objekt_id: n.objektId,
    lass_nummer: i + 1,
    volym_m3sub: m3PerLass,
    volym_m3sob: 0,
    operator_id: operatorId,
    filnamn: MANUELL_FILNAMN,
  }))
}

/** "6 lass · 72 m³fub" — summan är antal × per lass, avrundad som den visas. */
export function summaText(antal: number, m3PerLass: number): string {
  return `${antal} ${antal === 1 ? 'lass' : 'lass'} · ${Math.round(antal * m3PerLass).toLocaleString('sv-SE')} m³fub`
}

/**
 * Spara dagens lass för ett objekt: ersätter maskinens manuella rader för dag + objekt.
 * Skriver aldrig när dagen är låst för föraren (samma regel som RLS, men med ärligt fel
 * i stället för en tyst 0-raders-delete).
 */
export async function sparaManuellaLass(
  port: LassPort,
  n: ManuellNyckel,
  antal: number,
  m3PerLass: number,
  operatorId: string | null,
  ratt: { idag: string; arAdmin: boolean },
): Promise<SparaLassResultat> {
  if (!farRedigera(n.datum, ratt.idag, ratt.arAdmin)) return { ok: false, fel: LAST_TEXT }
  const v = valideraLass(antal, m3PerLass)
  if (v) return { ok: false, fel: v }
  const bort = await port.radera(manuellMatch(n))
  if ('fel' in bort) return { ok: false, fel: bort.fel }
  const rader = byggLassRader(n, antal, m3PerLass, operatorId)
  const in_ = await port.laggTill(rader)
  if ('fel' in in_) return { ok: false, fel: in_.fel }
  if (in_.antal !== rader.length) return { ok: false, fel: SPARA_LASS_FEL }
  return { ok: true, antal: in_.antal }
}

/** Ta bort dagens manuella rader för ett objekt. 0 rader = redan borta, inte ett fel. */
export async function taBortManuellaLass(port: LassPort, n: ManuellNyckel, ratt: { idag: string; arAdmin: boolean }): Promise<SparaLassResultat> {
  if (!farRedigera(n.datum, ratt.idag, ratt.arAdmin)) return { ok: false, fel: LAST_TEXT }
  const bort = await port.radera(manuellMatch(n))
  if ('fel' in bort) return { ok: false, fel: bort.fel }
  return { ok: true, antal: bort.antal }
}

/** Sparade manuella rader för en dag + maskin, grupperade per objekt: antal och m³fub per lass. */
export type SparatBlock = { objektId: string; antal: number; m3PerLass: number }
export function grupperaPerObjekt(rader: { objekt_id: string; lass_nummer: number; volym_m3sub: number | null }[]): SparatBlock[] {
  const per = new Map<string, { antal: number; m3: number }>()
  for (const r of rader) {
    const g = per.get(r.objekt_id) ?? { antal: 0, m3: r.volym_m3sub ?? STANDARD_M3_PER_LASS }
    g.antal += 1
    per.set(r.objekt_id, g)
  }
  return Array.from(per.entries()).map(([objektId, g]) => ({ objektId, antal: g.antal, m3PerLass: g.m3 }))
}

/** Maskinens senaste manuella värden (default i formuläret): antal lass och m³fub per lass från senaste dagen. */
export function senasteVarden(rader: { datum: string; objekt_id: string; lass_nummer: number; volym_m3sub: number | null }[]): { antal: number; m3PerLass: number } | null {
  if (rader.length === 0) return null
  const senasteDatum = rader.reduce((s, r) => (r.datum > s ? r.datum : s), rader[0].datum)
  const dagens = rader.filter(r => r.datum === senasteDatum)
  const objekt = dagens[0].objekt_id
  const egna = dagens.filter(r => r.objekt_id === objekt)
  return { antal: Math.max(1, egna.length), m3PerLass: egna[0].volym_m3sub ?? STANDARD_M3_PER_LASS }
}

// ── Adapter mot Supabase ────────────────────────────────────────────────────
/** Delete med kedjade eq-filter + select('id') så antalet raderade rader är känt; insert med select('id'). */
export function supabaseLassPort(klient: SupabaseClient): LassPort {
  return {
    async radera(match) {
      try {
        let q: any = klient.from('fakt_lass').delete()
        for (const [kol, v] of Object.entries(match)) q = q.eq(kol, v)
        const { data, error } = await q.select('id')
        if (error) { console.error('[lass] delete-fel', error); return { fel: SPARA_LASS_FEL } }
        return { antal: (data ?? []).length }
      } catch (e) { console.error('[lass] delete kastade', e); return { fel: SPARA_LASS_FEL } }
    },
    async laggTill(rader) {
      try {
        const { data, error } = await klient.from('fakt_lass').insert(rader).select('id')
        if (error) { console.error('[lass] insert-fel', error); return { fel: SPARA_LASS_FEL } }
        return { antal: (data ?? []).length }
      } catch (e) { console.error('[lass] insert kastade', e); return { fel: SPARA_LASS_FEL } }
    },
  }
}
