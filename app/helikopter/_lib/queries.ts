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
  /** Oskotat vid månadens start på objekt som inte är skotningsavslutade (aldrig < 0 per objekt). */
  ingaende_oskotat: number
  /** De två öppna objekten med mest oskotat just nu. */
  oskotat_objekt: { namn: string | null; oskotat: number }[]
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
  /** Admin-satt visningsnamn — visas före modell överallt (maskinNamn). */
  visningsnamn?: string | null
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
  /** null = skördare utan planerad volym (inget att räkna kvar mot). */
  kvar: number | null
  takt_per_dag: number | null
  takt_dagar: number
  nasta_namn: string | null
  /** Tilldelat pågående objekt när det är ett annat än där maskinen senast jobbade. */
  planerad_namn: string | null
  senast_datum: string | null
}

export type StoppRad = { id: string; fran_datum: string; till_datum: string; orsak: string; maskiner: string[] }

export type BestallningRad = { typ: Typ; bolag: string; volym: number }

/** Uppföljningens MASKINER-sektion: en rad per aktiv maskin (helikopter_ny_maskiner). */
export type MaskinManad = {
  maskin_id: string
  modell: string | null
  /** COALESCE(visningsnamn, modell, maskin_id) ur RPC:n — det namn användaren ser. */
  namn: string
  roll: 'skordare' | 'skotare'
  volym_manad: number
  objekt_namn: string | null
  takt_per_dag: number | null
  takt_dagar: number
  oskotat_objekt: number | null
  senast_datum: string | null
}

export type OskotatObjekt = { typ: Typ; objekt_id: string; namn: string | null; bolag: string | null; skordat: number; skotat: number; oskotat: number; senast_datum: string | null }

export type VeckaRad = {
  isovecka: number
  iso_ar: number
  fran: string
  till: string
  arbetsdagar: number
  arbetsdagar_kvar: number
  plan: number | null
  skordat: number
  skotat: number
  status: 'last' | 'pagar' | 'kommande'
  orsak: string | null
  maskiner: { maskin_id: string; modell: string | null; namn: string; roll: 'skordare' | 'skotare'; volym: number }[]
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
    ingaende_oskotat: tal(r.ingaende_oskotat),
    oskotat_objekt: Array.isArray(r.oskotat_objekt) ? r.oskotat_objekt.map((o: any) => ({ namn: o?.namn ?? null, oskotat: tal(o?.oskotat) })) : [],
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
  return {
    roll: r.roll, objekt_id: String(r.objekt_id), namn: r.namn ?? null, volym: talEllerNull(r.volym), gjort: tal(r.gjort),
    kvar: talEllerNull(r.kvar), takt_per_dag: talEllerNull(r.takt_per_dag), takt_dagar: tal(r.takt_dagar),
    nasta_namn: r.nasta_namn ?? null, planerad_namn: r.planerad_namn ?? null, senast_datum: r.senast_datum ?? null,
  }
}
function normVecka(r: any): VeckaRad {
  return {
    isovecka: tal(r.isovecka), iso_ar: tal(r.iso_ar), fran: r.fran, till: r.till,
    arbetsdagar: tal(r.arbetsdagar), arbetsdagar_kvar: tal(r.arbetsdagar_kvar), plan: talEllerNull(r.plan),
    skordat: tal(r.skordat), skotat: tal(r.skotat), status: r.status, orsak: r.orsak ?? null,
    maskiner: Array.isArray(r.maskiner) ? r.maskiner.map((m: any) => ({ maskin_id: String(m?.maskin_id ?? ''), modell: m?.modell ?? null, namn: String(m?.namn ?? m?.modell ?? m?.maskin_id ?? ''), roll: m?.roll, volym: tal(m?.volym) })) : [],
  }
}

export type Manadsdata = { spar: SparRad[]; arbetsdagar: Arbetsdagar[]; planering: PlaneringObjekt[]; stopp: StoppRad[]; bestallningar: BestallningRad[] }

/** Månadsberoende: spår, arbetsdagar, månadens objekt. Hämtas om vid månadsbyte. */
export async function hamtaManadsdata(ar: number, manad: number, idag: string): Promise<Svar<Manadsdata>> {
  const forsta = `${ar}-${String(manad).padStart(2, '0')}-01`
  const sista = new Date(ar, manad, 0)
  const sistaIso = `${sista.getFullYear()}-${String(sista.getMonth() + 1).padStart(2, '0')}-${String(sista.getDate()).padStart(2, '0')}`
  const [spar, dagar, plan, stopp, stoppMaskin, best] = await Promise.all([
    rpc<any[]>('helikopter_ny_spar', { p_ar: ar, p_manad: manad, p_idag: idag }),
    rpc<any[]>('helikopter_ny_arbetsdagar', { p_ar: ar, p_manad: manad, p_idag: idag }),
    rpc<any[]>('helikopter_ny_planering', { p_ar: ar, p_manad: manad }),
    hamtaAlla<any>(() => supabase.from('stopp').select('id,fran_datum,till_datum,orsak').gte('till_datum', forsta).lte('fran_datum', sistaIso), 'id'),
    hamtaAlla<any>(() => supabase.from('stopp_maskin').select('stopp_id,maskin_id'), ['stopp_id', 'maskin_id']),
    hamtaAlla<any>(() => supabase.from('bestallningar').select('id,typ,bolag,volym').eq('ar', ar).eq('manad', manad), 'id'),
  ])
  const fel = spar.error ?? dagar.error ?? plan.error ?? (stopp.error ? felText(stopp.error) : null) ?? (stoppMaskin.error ? felText(stoppMaskin.error) : null) ?? (best.error ? felText(best.error) : null)
  if (fel) { if (stopp.error || stoppMaskin.error || best.error) console.error('[helikopter] stopp/bestallningar', stopp.error ?? stoppMaskin.error ?? best.error); return { data: null, error: fel } }
  const maskinerPerStopp = new Map<string, string[]>()
  for (const sm of stoppMaskin.data ?? []) maskinerPerStopp.set(sm.stopp_id, [...(maskinerPerStopp.get(sm.stopp_id) ?? []), sm.maskin_id])
  return {
    data: {
      spar: (spar.data ?? []).map(normSpar),
      arbetsdagar: (dagar.data ?? []).map(normDagar),
      planering: (plan.data ?? []).map(normPlanering),
      stopp: (stopp.data ?? []).map((s: any): StoppRad => ({ id: s.id, fran_datum: s.fran_datum, till_datum: s.till_datum, orsak: s.orsak ?? '', maskiner: maskinerPerStopp.get(s.id) ?? [] })),
      bestallningar: (best.data ?? [])
        .filter((b: any) => b.typ === 'gallring' || b.typ === 'slutavverkning')
        .map((b: any): BestallningRad => ({ typ: b.typ, bolag: String(b.bolag ?? '').trim(), volym: tal(b.volym) })),
    },
    error: null,
  }
}

export type FastData = { maskiner: Maskin[]; senasteData: string | null; avvikelse: Avvikelse[] }

/** Månadsoberoende: maskiner, senaste importtid, bolagens historiska avvikelse. Hämtas en gång. */
export async function hamtaFast(): Promise<Svar<FastData>> {
  try {
    const [maskiner, senaste, avvikelse] = await Promise.all([
      hamtaAlla<Maskin>(() => supabase.from('dim_maskin').select('maskin_id,visningsnamn,modell,maskin_typ,klarar_typ,extramaskin,aktiv_till'), 'maskin_id'),
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

/** Uppföljningens maskinsektion — alla aktiva maskiner i ett anrop. Lazy när fliken öppnas. */
export async function hamtaMaskiner(ar: number, manad: number, idag: string): Promise<Svar<MaskinManad[]>> {
  const r = await rpc<any[]>('helikopter_ny_maskiner', { p_ar: ar, p_manad: manad, p_idag: idag })
  if (r.error) return { data: null, error: r.error }
  return {
    data: (r.data ?? []).map((m: any): MaskinManad => ({
      maskin_id: String(m.maskin_id), modell: m.modell ?? null, namn: String(m.namn ?? m.modell ?? m.maskin_id), roll: m.roll === 'skordare' ? 'skordare' : 'skotare',
      volym_manad: tal(m.volym_manad), objekt_namn: m.objekt_namn ?? null, takt_per_dag: talEllerNull(m.takt_per_dag),
      takt_dagar: tal(m.takt_dagar), oskotat_objekt: talEllerNull(m.oskotat_objekt), senast_datum: m.senast_datum ?? null,
    })),
    error: null,
  }
}

/** Var virket ligger: alla öppna objekt med oskotat, per typ. Lazy när sheeten öppnas. */
export async function hamtaOskotatObjekt(ar: number, manad: number): Promise<Svar<OskotatObjekt[]>> {
  const r = await rpc<any[]>('helikopter_ny_oskotat_objekt', { p_ar: ar, p_manad: manad })
  if (r.error) return { data: null, error: r.error }
  return {
    data: (r.data ?? []).map((o: any): OskotatObjekt => ({
      typ: o.typ, objekt_id: String(o.objekt_id), namn: o.namn ?? null, bolag: o.bolag ?? null,
      skordat: tal(o.skordat), skotat: tal(o.skotat), oskotat: tal(o.oskotat), senast_datum: o.senast_datum ?? null,
    })),
    error: null,
  }
}

/** Takt per aktiv maskin (senaste 5 arbetsdagarna) — Läge-sheeten "Skördare och skotare". */
export async function hamtaMaskinTakter(maskinIds: string[], idag: string): Promise<Svar<Record<string, MaskinLage | null>>> {
  const svar = await Promise.all(maskinIds.map(id => hamtaMaskinLage(id, idag)))
  const fel = svar.find(s => s.error != null)?.error
  if (fel != null) return { data: null, error: fel }
  const ut: Record<string, MaskinLage | null> = {}
  maskinIds.forEach((id, i) => { ut[id] = svar[i].data })
  return { data: ut, error: null }
}

/** Veckor för ett spår i en månad — /helikopter/veckor. */
export async function hamtaVeckor(ar: number, manad: number, typ: Typ, idag: string): Promise<Svar<VeckaRad[]>> {
  const r = await rpc<any[]>('helikopter_ny_veckor', { p_ar: ar, p_manad: manad, p_typ: typ, p_idag: idag })
  if (r.error) return { data: null, error: r.error }
  return { data: (r.data ?? []).map(normVecka), error: null }
}

/** Veckoorsak: tom text raderar raden. Skrivning kräver admin (RLS). */
export async function sparaOrsak(ar: number, manad: number, typ: Typ, isovecka: number, orsak: string): Promise<{ error: string | null }> {
  try {
    const text = orsak.trim().slice(0, 60)
    if (text === '') {
      const { error } = await supabase.from('helikopter_veckoorsak').delete().match({ ar, manad, typ, isovecka })
      return { error: error ? felText(error) : null }
    }
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('helikopter_veckoorsak')
      .upsert({ ar, manad, typ, isovecka, orsak: text, uppdaterad: new Date().toISOString(), av: user?.id ?? null }, { onConflict: 'ar,manad,typ,isovecka' })
    return { error: error ? felText(error) : null }
  } catch (e) {
    return { error: felText(e) }
  }
}

/** Inloggad förares maskin: var den senast jobbade, kvar och takt. null = ingen fakt-rad alls. */
export async function hamtaMaskinLage(maskinId: string, idag: string): Promise<Svar<MaskinLage | null>> {
  const r = await rpc<any[]>('helikopter_ny_maskin', { p_maskin_id: maskinId, p_idag: idag })
  if (r.error) return { data: null, error: r.error }
  const rad = (r.data ?? [])[0]
  return { data: rad ? normMaskinLage(rad) : null, error: null }
}
