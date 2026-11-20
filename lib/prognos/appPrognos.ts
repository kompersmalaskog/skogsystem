// APPENS PROGNOS FRYSES EN GÅNG, INNAN MASKINEN BÖRJAT (2026-10-24; migration 20261024093713_app_prognos_och_facit.sql).
//
// Martin vill se utfallet mot TVÅ prognoser: planerarens (objekt.manuell_prognos) och appens. Men appens G15-förslag ligger i samma fält tills
// planeraren trycker Stämmer — efteråt går det inte att veta vems talet var. Därför skrivs appens förslag EN gång till objekt.app_prognos:
//   · vid importen av Vidas leverans (/api/import-trakt) och av engångsfyllningen (/api/prognos/frys);
//   · bara när kolumnen är NULL — den rörs aldrig igen (ett bättre förslag senare är en annan prognos, inte den som ska mätas);
//   · bara när INGEN G15-tid finns på trakten (fakt_tid under dess dim_objekt-rader): en prognos satt när maskinen redan kört är ingen prognos.
// Räkningen är exakt G15-förslaget i Klar med trakten (lib/g15Forslag.beraknaG15Forslag) på samma underlag (prognos_utfall), med traktens
// typ, volym, medelstam och basvägstimmar. Saknas förslag för en roll (för få jämförbara trakter) skrivs rollen inte; saknas båda skrivs inget
// och skälet sägs. Ett läsfel är ett fel — aldrig en tyst "ingen prognos".

import type { SupabaseClient } from '@supabase/supabase-js'
import { beraknaG15Forslag, type Metod, type UtfallRad } from '@/lib/g15Forslag'

export type AppPrognos = {
  skordare?: number
  skotare?: number
  /** Hur varje roll räknades (medelstam = jämförbara trakter, annars snitt över typen). */
  metod: Partial<Record<'skordare' | 'skotare', Metod>>
  /** Antal trakter bakom talet, per roll. */
  antal: Partial<Record<'skordare' | 'skotare', number>>
  raknad: string
  kalla: 'import' | 'frys'
}

export type FrysIndata = { typ: string | null; volym: number | null; medelstam: number | null; basvagTimmar?: number | null }

/** Ren: appens prognos ur utfallet, eller null när ingen roll får ett förslag. */
export function beraknaAppPrognos(o: FrysIndata, utfall: UtfallRad[], nu: Date, kalla: AppPrognos['kalla']): AppPrognos | null {
  const f = beraknaG15Forslag({ typ: o.typ, volym: o.volym, medelstam: o.medelstam, basvagTimmar: o.basvagTimmar ?? null }, utfall)
  const ut: AppPrognos = { metod: {}, antal: {}, raknad: nu.toISOString(), kalla }
  for (const roll of ['skordare', 'skotare'] as const) {
    const r = f[roll]
    if (!r.ok) continue
    ut[roll] = r.forslag.g15
    ut.metod[roll] = r.forslag.metod
    ut.antal[roll] = r.forslag.antal
  }
  return ut.skordare == null && ut.skotare == null ? null : ut
}

/** Läser objekt.app_prognos (vilken form det än har) till timmar per roll. */
export function lasAppPrognos(raw: unknown): Partial<Record<'skordare' | 'skotare', number>> {
  const ut: Partial<Record<'skordare' | 'skotare', number>> = {}
  if (!raw || typeof raw !== 'object') return ut
  for (const r of ['skordare', 'skotare'] as const) {
    const v = Number((raw as Record<string, unknown>)[r])
    if (Number.isFinite(v) && v > 0) ut[r] = v
  }
  return ut
}

export type FrysUtfall =
  | { status: 'fryst'; prognos: AppPrognos }
  | { status: 'hoppad'; skal: 'redan_fryst' | 'inte_virke' | 'ingen_volym' | 'maskinen_har_borjat' | 'inget_forslag' }
  | { status: 'fel'; fel: string }

/** Utfallet ur RPC:n prognos_utfall, i formen beraknaG15Forslag vill ha. */
export async function hamtaUtfall(sb: SupabaseClient): Promise<{ data: UtfallRad[] | null; error: string | null }> {
  const r = await sb.rpc('prognos_utfall')
  if (r.error) return { data: null, error: r.error.message }
  if (!Array.isArray(r.data)) return { data: null, error: 'prognos_utfall gav ett oväntat svar' }
  const tal = (v: unknown) => { const n = Number(v); return v == null || !Number.isFinite(n) ? null : n }
  return {
    data: r.data.map((x: any): UtfallRad => ({
      typ: x.typ ?? null, volymObjekt: tal(x.volym_objekt), skordadM3: tal(x.skordad_m3), stammar: tal(x.stammar),
      skordareG15: tal(x.skordare_g15), skotareG15: tal(x.skotare_g15),
    })),
    error: null,
  }
}

/** Finns G15-tid på trakten (fakt_tid under dess dim_objekt-rader: samma koppling som helikopter_ny_klar)? Ett läsfel kastar. */
async function maskinenHarBorjat(sb: SupabaseClient, o: { vo_nummer: string | null; dim_objekt_id: string | null }): Promise<boolean> {
  const villkor: string[] = []
  if (o.dim_objekt_id) villkor.push(`objekt_id.eq.${o.dim_objekt_id}`)
  if (o.vo_nummer?.trim()) villkor.push(`vo_nummer.eq.${o.vo_nummer.trim()}`)
  if (villkor.length === 0) return false
  const dim = await sb.from('dim_objekt').select('objekt_id').or(villkor.join(','))
  if (dim.error) throw new Error(`dim_objekt: ${dim.error.message}`)
  const ids = (dim.data ?? []).map((d: any) => String(d.objekt_id)).filter(Boolean)
  if (ids.length === 0) return false
  const tid = await sb.from('fakt_tid').select('id').in('objekt_id', ids).limit(1)
  if (tid.error) throw new Error(`fakt_tid: ${tid.error.message}`)
  return (tid.data ?? []).length > 0
}

/**
 * Fryser appens prognos på ett objekt. Skriver bara när app_prognos är NULL (vakt i UPDATE:n också) och maskinen inte börjat. `utfall` kan
 * skickas in (engångsfyllningen läser det en gång för alla objekt), annars läses det här.
 */
export async function frysAppPrognos(sb: SupabaseClient, objektId: string, opts: { utfall?: UtfallRad[]; kalla: AppPrognos['kalla']; nu?: Date }): Promise<FrysUtfall> {
  const o = await sb.from('objekt').select('id, typ, volym, medelstam, basvag_timmar, app_prognos, vo_nummer, dim_objekt_id').eq('id', objektId).maybeSingle()
  if (o.error) return { status: 'fel', fel: `objekt: ${o.error.message}` }
  if (!o.data) return { status: 'fel', fel: 'objektet finns inte' }
  const rad: any = o.data
  if (rad.app_prognos != null) return { status: 'hoppad', skal: 'redan_fryst' }
  const typ = String(rad.typ ?? '').toLowerCase()
  if (typ !== 'slutavverkning' && typ !== 'gallring') return { status: 'hoppad', skal: 'inte_virke' }
  const volym = Number(rad.volym)
  if (!Number.isFinite(volym) || volym <= 0) return { status: 'hoppad', skal: 'ingen_volym' }
  try {
    if (await maskinenHarBorjat(sb, { vo_nummer: rad.vo_nummer ?? null, dim_objekt_id: rad.dim_objekt_id ?? null })) return { status: 'hoppad', skal: 'maskinen_har_borjat' }
  } catch (e: any) {
    return { status: 'fel', fel: e?.message ?? String(e) }
  }
  let utfall = opts.utfall
  if (!utfall) {
    const u = await hamtaUtfall(sb)
    if (u.error || !u.data) return { status: 'fel', fel: u.error ?? 'utfallet kunde inte läsas' }
    utfall = u.data
  }
  const medelstam = Number(rad.medelstam)
  const basvag = Number(rad.basvag_timmar)
  const prognos = beraknaAppPrognos({ typ, volym, medelstam: Number.isFinite(medelstam) && medelstam > 0 ? medelstam : null, basvagTimmar: Number.isFinite(basvag) ? basvag : null }, utfall, opts.nu ?? new Date(), opts.kalla)
  if (!prognos) return { status: 'hoppad', skal: 'inget_forslag' }
  const w = await sb.from('objekt').update({ app_prognos: prognos }).eq('id', objektId).is('app_prognos', null).select('app_prognos')
  if (w.error) return { status: 'fel', fel: `skrivning: ${w.error.message}` }
  if (!w.data || w.data.length === 0) return { status: 'hoppad', skal: 'redan_fryst' }
  return { status: 'fryst', prognos }
}

/** "Appens prognos: skördare 42 tim · skotare 38 tim" — raden i importsvaret. */
export function appPrognosText(p: AppPrognos): string {
  const delar = (['skordare', 'skotare'] as const).filter(r => p[r] != null).map(r => `${r === 'skordare' ? 'skördare' : 'skotare'} ${p[r]} tim`)
  return `Appens prognos fryst: ${delar.join(' · ')} (G15)`
}
