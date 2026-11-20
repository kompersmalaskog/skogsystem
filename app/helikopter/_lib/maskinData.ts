// Ren normalisering av takt- och stopprader ur SQL (helikopter_ny_takt, helikopter_ny_stopp). Egen fil utan Supabase-import: veckoläget, onsdags- och
// månadsnotisen läser samma rader ur sina payloads på servern (app/api/notis/flush).
import type { MaskinStopp, MaskinTakt } from './queries'

const tal = (v: unknown): number => (v == null ? 0 : Number(v))
const talEllerNull = (v: unknown): number | null => (v == null ? null : Number(v))

export function normTakt(r: any): MaskinTakt {
  return {
    typ: r.typ, bas: r.bas === 'totalt' ? 'totalt' : 'bestallt', maskin_id: String(r.maskin_id), roll: r.roll === 'skordare' ? 'skordare' : 'skotare',
    takt: talEllerNull(r.takt), takt_dagar: tal(r.takt_dagar), kvar: tal(r.kvar), kvar_datum: r.kvar_datum ?? [], volym_manad: tal(r.volym_manad),
  }
}
export function normStopp(r: any): MaskinStopp {
  return {
    maskin_id: String(r.maskin_id), namn: String(r.namn ?? r.maskin_id), roll: r.roll === 'skordare' ? 'skordare' : 'skotare',
    stopp_fran: r.stopp_fran ?? null, stopp_till: r.stopp_till ?? null, stopp_orsak: r.stopp_orsak ?? null,
    stopp_status: r.stopp_status === 'pagar' || r.stopp_status === 'kommande' || r.stopp_status === 'varit' ? r.stopp_status : null,
    stopp_kor_igen: r.stopp_kor_igen ?? null, stopp_dagar: talEllerNull(r.stopp_dagar), stopp_dagar_gangna: talEllerNull(r.stopp_dagar_gangna),
    stopp_dagar_manad: tal(r.stopp_dagar_manad), stopp_orsaker_manad: Array.isArray(r.stopp_orsaker_manad) ? r.stopp_orsaker_manad : [],
    oforklarade_datum: Array.isArray(r.oforklarade_datum) ? r.oforklarade_datum : [], takt_fran: r.takt_fran ?? null,
  }
}
