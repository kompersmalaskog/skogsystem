// Datalager för /helikopter. Alla beräkningar ligger i SQL-funktionerna
// helikopter_ny_* (migration 20260908100000). Här: typade anrop, felkontroll
// på VARJE svar, och sidvis hämtning där listor kan växa.
//
// Ett fel returneras alltid som { data: null, error } — aldrig som en tom lista.
import { supabase } from '@/lib/supabase'
import { medAbortRetry } from '@/lib/supabaseRetry'
import { hamtaAlla } from '@/lib/supabaseAlla'

export type Typ = 'slutavverkning' | 'gallring'

export type SparRad = {
  typ: Typ
  bas: 'bestallt' | 'totalt'
  bestallt: number
  bolag: string[]
  skordat: number
  skotat: number
  takt_skordat: number | null
  takt_skotat: number | null
  takt_dagar: number
  takt_fonster: string[]
  oskotat_forandring_per_dag: number | null
}

export type Arbetsdagar = {
  maskin_id: string | null
  totalt: number
  gangna: number
  kvar: number
  gangna_datum: string[]
  kvar_datum: string[]
}

export type BolagRad = {
  typ: Typ
  bolag: string | null
  lovat: number
  skordat: number
  skotat: number
  takt_skordat: number | null
  takt_skotat: number | null
  takt_dagar: number
}

export type Avvikelse = { bolag: string; typ: Typ; antal: number; medel_kvot: number; std_kvot: number | null }

export type PlaneringObjekt = {
  objekt_id: string
  namn: string | null
  vo_nummer: string | null
  typ: string
  bolag: string | null
  volym: number | null
  status: string | null
  skordare_maskin_id: string | null
  skotare_maskin_id: string | null
  skordare_utforare: string | null
  skotare_utforare: string | null
  prognos_skordare_h: number | null
  prognos_skotare_h: number | null
  klar_skordare: boolean
  klar_skotare: boolean
}

export type Maskin = {
  maskin_id: string
  modell: string | null
  maskin_typ: string | null
  klarar_typ: string | null
  extramaskin: boolean | null
  aktiv_till: string | null
}

export type MaskinLage = {
  roll: 'skordare' | 'skotare'
  objekt_id: string
  namn: string | null
  volym: number | null
  gjort: number
  kvar: number
  takt_per_dag: number | null
  takt_dagar: number
  nasta_namn: string | null
}

export type Svar<T> = { data: T; error: null } | { data: null; error: string }

const tal = (v: unknown): number => (v == null ? 0 : Number(v))
const talEllerNull = (v: unknown): number | null => (v == null ? null : Number(v))

function felText(e: any): string {
  return e?.message || e?.details || (typeof e === 'string' ? e : 'Kunde inte läsa data')
}

async function rpc<T>(namn: string, args: Record<string, unknown>): Promise<Svar<T>> {
  try {
    const { data, error } = await medAbortRetry(() => supabase.rpc(namn, args))
    if (error) {
      console.error(`[helikopter] ${namn} misslyckades`, error)
      return { data: null, error: felText(error) }
    }
    return { data: data as T, error: null }
  } catch (e) {
    console.error(`[helikopter] ${namn} kastade`, e)
    return { data: null, error: felText(e) }
  }
}

function normSpar(r: any): SparRad {
  return {
    typ: r.typ, bas: r.bas, bestallt: tal(r.bestallt), bolag: r.bolag ?? [],
    skordat: tal(r.skordat), skotat: tal(r.skotat),
    takt_skordat: talEllerNull(r.takt_skordat), takt_skotat: talEllerNull(r.takt_skotat),
    takt_dagar: tal(r.takt_dagar), takt_fonster: r.takt_fonster ?? [],
    oskotat_forandring_per_dag: talEllerNull(r.oskotat_forandring_per_dag),
  }
}
function normDagar(r: any): Arbetsdagar {
  return { maskin_id: r.maskin_id ?? null, totalt: tal(r.totalt), gangna: tal(r.gangna), kvar: tal(r.kvar), gangna_datum: r.gangna_datum ?? [], kvar_datum: r.kvar_datum ?? [] }
}
function normBolag(r: any): BolagRad {
  return { typ: r.typ, bolag: r.bolag ?? null, lovat: tal(r.lovat), skordat: tal(r.skordat), skotat: tal(r.skotat), takt_skordat: talEllerNull(r.takt_skordat), takt_skotat: talEllerNull(r.takt_skotat), takt_dagar: tal(r.takt_dagar) }
}
function normPlanering(r: any): PlaneringObjekt {
  return {
    objekt_id: r.objekt_id, namn: r.namn ?? null, vo_nummer: r.vo_nummer ?? null, typ: r.typ ?? '', bolag: r.bolag ?? null,
    volym: talEllerNull(r.volym), status: r.status ?? null,
    skordare_maskin_id: r.skordare_maskin_id ?? null, skotare_maskin_id: r.skotare_maskin_id ?? null,
    skordare_utforare: r.skordare_utforare ?? null, skotare_utforare: r.skotare_utforare ?? null,
    prognos_skordare_h: talEllerNull(r.prognos_skordare_h), prognos_skotare_h: talEllerNull(r.prognos_skotare_h),
    klar_skordare: !!r.klar_skordare, klar_skotare: !!r.klar_skotare,
  }
}
function normAvvikelse(r: any): Avvikelse {
  return { bolag: r.bolag, typ: r.typ, antal: tal(r.antal), medel_kvot: tal(r.medel_kvot), std_kvot: talEllerNull(r.std_kvot) }
}
function normMaskinLage(r: any): MaskinLage {
  return { roll: r.roll, objekt_id: r.objekt_id, namn: r.namn ?? null, volym: talEllerNull(r.volym), gjort: tal(r.gjort), kvar: tal(r.kvar), takt_per_dag: talEllerNull(r.takt_per_dag), takt_dagar: tal(r.takt_dagar), nasta_namn: r.nasta_namn ?? null }
}

export type Manadsdata = { spar: SparRad[]; arbetsdagar: Arbetsdagar[]; planering: PlaneringObjekt[] }

/** Månadsberoende: spår, arbetsdagar, månadens objekt. Hämtas om vid månadsbyte. */
export async function hamtaManadsdata(ar: number, manad: number, idag: string): Promise<Svar<Manadsdata>> {
  const [spar, dagar, plan] = await Promise.all([
    rpc<any[]>('helikopter_ny_spar', { p_ar: ar, p_manad: manad, p_idag: idag }),
    rpc<any[]>('helikopter_ny_arbetsdagar', { p_ar: ar, p_manad: manad, p_idag: idag }),
    rpc<any[]>('helikopter_ny_planering', { p_ar: ar, p_manad: manad }),
  ])
  const fel = spar.error ?? dagar.error ?? plan.error
  if (fel) return { data: null, error: fel }
  return {
    data: {
      spar: (spar.data ?? []).map(normSpar),
      arbetsdagar: (dagar.data ?? []).map(normDagar),
      planering: (plan.data ?? []).map(normPlanering),
    },
    error: null,
  }
}

export type FastData = { maskiner: Maskin[]; senasteData: string | null; avvikelse: Avvikelse[] }

/** Månadsoberoende: maskiner, senaste importtid, bolagens historiska avvikelse. Hämtas en gång. */
export async function hamtaFast(): Promise<Svar<FastData>> {
  try {
    const [maskiner, senaste, avvikelse] = await Promise.all([
      hamtaAlla<Maskin>(() => supabase.from('dim_maskin').select('maskin_id,modell,maskin_typ,klarar_typ,extramaskin,aktiv_till'), 'maskin_id'),
      rpc<string | null>('helikopter_ny_senaste_data', {}),
      hamtaAlla<any>(() => supabase.from('helikopter_ny_bolag_avvikelse').select('bolag,typ,antal,medel_kvot,std_kvot'), ['bolag', 'typ']),
    ])
    if (maskiner.error) { console.error('[helikopter] dim_maskin', maskiner.error); return { data: null, error: felText(maskiner.error) } }
    if (senaste.error) return { data: null, error: senaste.error }
    if (avvikelse.error) { console.error('[helikopter] bolag_avvikelse', avvikelse.error); return { data: null, error: felText(avvikelse.error) } }
    return { data: { maskiner: maskiner.data, senasteData: senaste.data ?? null, avvikelse: avvikelse.data.map(normAvvikelse) }, error: null }
  } catch (e) {
    return { data: null, error: felText(e) }
  }
}

/** Per bolag för Uppföljning — hämtas först när fliken öppnas. */
export async function hamtaBolag(ar: number, manad: number, idag: string): Promise<Svar<BolagRad[]>> {
  const r = await rpc<any[]>('helikopter_ny_bolag', { p_ar: ar, p_manad: manad, p_idag: idag })
  if (r.error) return { data: null, error: r.error }
  return { data: (r.data ?? []).map(normBolag), error: null }
}

/** Inloggad förares maskin: pågående objekt, kvar och takt. null = inget pågående objekt. */
export async function hamtaMaskinLage(maskinId: string, idag: string): Promise<Svar<MaskinLage | null>> {
  const r = await rpc<any[]>('helikopter_ny_maskin', { p_maskin_id: maskinId, p_idag: idag })
  if (r.error) return { data: null, error: r.error }
  const rad = (r.data ?? [])[0]
  return { data: rad ? normMaskinLage(rad) : null, error: null }
}
