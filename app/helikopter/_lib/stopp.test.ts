// Planerat stopp härlett ur ledighet + filer — det appen gör med det SQL:en (helikopter_ny_takt/_stopp) levererar.
// Själva härledningen (fil / ledig förare / oförklarat per dag) provas i SQL: supabase/tests/helikopter_planerat_stopp.sql.
// Fixtur: oktober 2026 ur prod (helikopter_ny_spar/_takt/_stopp för 2026-10-17): Stefan semester 14–16 okt (Giant stod), Daniel 26–30 okt (Elefant 26).
import { describe, it, expect } from 'vitest'
import {
  klartDatumMaskiner, lageSvar, landarRoller, motBestallningRad, oforklaratVarning, orsakText, planeringStoppText, raknaSpar, sparStoppText,
  stoppNotisText, stoppSynligt, tillkommerRoll,
} from './berakningar'
import { fmtVeckodagar } from './format'
import { formateraVeckoNotis, type VeckoNotisData } from './veckoNotis'
import { formateraManadNotis } from './manadsfacit'
import type { Arbetsdagar, MaskinStopp, MaskinTakt, SparRad, Typ } from './queries'

const n = (x: number) => x.toLocaleString('sv-SE')

const okt: Arbetsdagar = {
  maskin_id: null, totalt: 22, gangna: 12, kvar: 10,
  gangna_datum: ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'],
  kvar_datum: ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'],
}
const KVAR_ALLA = okt.kvar_datum
const KVAR_UTAN_26_30 = okt.kvar_datum.slice(0, 5)

const rad = (typ: Typ, x: Partial<SparRad>): SparRad => ({
  typ, bas: 'bestallt', bestallt: 5000, bolag: ['Vida'], skordat: 0, skotat: 0, takt_skordat: 0, takt_skotat: 0,
  takt_dagar: 5, takt_fonster: [], oskotat_forandring_per_dag: 0, ingaende_oskotat: 0, oskotat_objekt: [], ...x,
})
const takt = (typ: Typ, maskin_id: string, roll: MaskinTakt['roll'], t: number | null, kvar_datum: string[], volym = 100): MaskinTakt => ({
  typ, bas: 'bestallt', maskin_id, roll, takt: t, takt_dagar: t == null ? 0 : 5, kvar: kvar_datum.length, kvar_datum, volym_manad: volym,
})
const stopp = (x: Partial<MaskinStopp> & { maskin_id: string; namn: string }): MaskinStopp => ({
  roll: 'skordare', stopp_fran: null, stopp_till: null, stopp_orsak: null, stopp_status: null, stopp_kor_igen: null, stopp_dagar: null,
  stopp_dagar_gangna: null, stopp_dagar_manad: 0, stopp_orsaker_manad: [], oforklarade_datum: [], takt_fran: '2026-10-12', ...x,
})

// Oktober ur prod
const GIANT = 'PONS20SDJAA270231'
const slutTakt: MaskinTakt[] = [
  takt('slutavverkning', GIANT, 'skordare', 366.8039, KVAR_ALLA, 2498.7337),
  takt('slutavverkning', 'A030353', 'skotare', 110.6, KVAR_ALLA, 867.5),
  takt('slutavverkning', 'A130743', 'skotare', 264.0, KVAR_UTAN_26_30, 2368),
]
const gallTakt: MaskinTakt[] = [
  takt('gallring', 'R64428', 'skordare', 55.9141, KVAR_ALLA, 665.1485),
  takt('gallring', 'A030353', 'skotare', 0, KVAR_ALLA, 153),
  takt('gallring', 'JD810E', 'skotare', 0, KVAR_ALLA, 561),
]
const alla = [...slutTakt, ...gallTakt]
const slutRad = rad('slutavverkning', { bestallt: 5000, skordat: 2498.7337, skotat: 3235.5, takt_skordat: 366.8, takt_skotat: 374.6 })
const gallRad = rad('gallring', { bestallt: 1000, skordat: 665.1485, skotat: 714, takt_skordat: 55.9, takt_skotat: 0 })
const slut = raknaSpar(slutRad, okt, alla)
const gall = raknaSpar(gallRad, okt, alla)

const giantStod = stopp({
  maskin_id: GIANT, namn: 'Giant', stopp_fran: '2026-10-14', stopp_till: '2026-10-16', stopp_orsak: 'ledig:Stefan', stopp_status: 'varit',
  stopp_kor_igen: '2026-10-19', stopp_dagar: 3, stopp_dagar_gangna: 3, stopp_dagar_manad: 3, stopp_orsaker_manad: ['ledig:Stefan'], takt_fran: '2026-10-07',
})
const elefant26 = stopp({
  maskin_id: 'A130743', namn: 'Elefant 26', roll: 'skotare', stopp_fran: '2026-10-26', stopp_till: '2026-10-30', stopp_orsak: 'ledig:Daniel',
  stopp_status: 'kommande', stopp_kor_igen: '2026-11-02', stopp_dagar: 5, stopp_dagar_gangna: 0,
})
const ingen = (id: string, namn: string, roll: MaskinStopp['roll'] = 'skotare') => stopp({ maskin_id: id, namn, roll })
const oktStopp = [giantStod, ingen('R64428', 'H8E -26', 'skordare'), ingen('JD810E', '810E'), elefant26, ingen('A030353', 'Wisent')]

describe('prognos per maskin: takt × maskinens EGNA arbetsdagar kvar', () => {
  it('summan över maskinerna i rollen — Elefant 26 räknas på 5 dagar, inte 10', () => {
    expect(tillkommerRoll(slutTakt, 'skordare')).toBeCloseTo(3668.039, 2)
    expect(tillkommerRoll(slutTakt, 'skotare')).toBeCloseTo(110.6 * 10 + 264 * 5, 6) // 2 426
  })
  it('oktober: slutavverkning landar 5 662 (hittills + takt × kvar per maskin), inte under 5 000', () => {
    // Skördat 2 499 + 3 668 = 6 167. Skotat 3 236 + 1 106 + 1 320 = 5 662 (kapas vid skördat 6 167: ingen kapning).
    const [sk, st] = landarRoller(slut)!
    expect(Math.round(sk.landar)).toBe(6167)
    expect(Math.round(st.landar)).toBe(5662)
    expect([sk.under, st.under]).toEqual([false, false])
  })
  it('förut (spårets takt över ALLA dagar, Giants tre planerade dagar räknade som 0) landade samma spår under: 4 103', () => {
    const forut = raknaSpar({ ...slutRad, takt_skordat: 160.4 }, okt)
    expect(Math.round(landarRoller(forut)![0].landar)).toBe(4103)
  })
  it('utan maskinernas takt (kunde inte läsas) räknas som förut — spårets takt × globala dagar kvar', () => {
    expect(raknaSpar(slutRad, okt, null).prognosSkordat).toBeCloseTo(2498.7337 + 366.8 * 10, 4)
    expect(raknaSpar(slutRad, okt, []).prognosSkordat).toBeCloseTo(2498.7337 + 366.8 * 10, 4)
  })
  it('bara maskinerna i spårets typ och bas räknas', () => {
    const fel = [takt('gallring', 'R64428', 'skordare', 999, KVAR_ALLA), { ...takt('slutavverkning', GIANT, 'skordare', 999, KVAR_ALLA), bas: 'totalt' as const }]
    expect(raknaSpar(slutRad, okt, fel).prognosSkordat).toBeCloseTo(2498.7337 + 366.8 * 10, 4) // inga rader för typ+bas → reserven
  })
  it('skotat kapas vid skördat-prognos + ingående oskotat', () => {
    const s = raknaSpar(rad('slutavverkning', { skordat: 1000, skotat: 900, ingaende_oskotat: 100 }), okt, [
      takt('slutavverkning', GIANT, 'skordare', 10, KVAR_ALLA), takt('slutavverkning', 'A030353', 'skotare', 500, KVAR_ALLA),
    ])
    expect(s.prognosSkordat).toBe(1100)
    expect(s.prognosSkotat).toBe(1200) // kapat vid 100 + 1 100
  })
  it('maskin utan takt (inga gångna dagar) bidrar 0, inte NaN', () => {
    const s = raknaSpar(slutRad, okt, [takt('slutavverkning', GIANT, 'skordare', null, KVAR_ALLA), takt('slutavverkning', 'A030353', 'skotare', 100, KVAR_ALLA)])
    expect(s.prognosSkordat).toBe(2498.7337)
    expect(Number.isFinite(s.prognosSkotat as number)).toBe(true)
  })
  it('klart-datum: kumulerat per dag — Elefant 26 slutar bidra den 26 okt', () => {
    // Behöver 5 000 − 3 235,5 = 1 764,5. Dag 1–5 (19–23 okt): 374,6/dag → 1 873 efter fem dagar = 23 okt.
    expect(klartDatumMaskiner(5000, 3235.5, slutTakt.filter(t => t.roll === 'skotare'))).toBe('2026-10-23')
    expect(slut.klartDatumSkotat).toBe('2026-10-23')
    // Behöver 2 300: 1 873 efter 23 okt, sedan bara Wisent (110,6/dag, Elefant 26 har semester): 1 873 + 4 × 110,6 = 2 315 → 29 okt.
    expect(klartDatumMaskiner(2300 + 3235.5, 3235.5, slutTakt.filter(t => t.roll === 'skotare'))).toBe('2026-10-29')
    // Mer än maskinerna hinner i månaden: null.
    expect(klartDatumMaskiner(2500 + 3235.5, 3235.5, slutTakt.filter(t => t.roll === 'skotare'))).toBeNull()
  })
  it('redan framme: första arbetsdagen kvar; ingen maskin med dagar kvar: null', () => {
    expect(klartDatumMaskiner(100, 200, slutTakt)).toBe('2026-10-19')
    expect(klartDatumMaskiner(100, 0, [takt('slutavverkning', GIANT, 'skordare', 50, [])])).toBeNull()
  })
  it('maskinIds = maskinerna som kört i spåret i månaden', () => {
    expect(slut.maskinIds).toEqual([GIANT, 'A030353', 'A130743'])
    expect(gall.maskinIds).toEqual(['R64428', 'A030353', 'JD810E'])
  })
})

describe('Läge svarsrad — över beställt är dämpat och neutralt, inte grönt', () => {
  const bada = { gallring: 3, slutavverkning: 3 }
  const over = (bestallt: number, skordat: number, skotat: number, skotatTakt: number, kvar = KVAR_ALLA) =>
    raknaSpar(rad('slutavverkning', { bestallt, skordat, skotat }), okt, [
      takt('slutavverkning', GIANT, 'skordare', 0, kvar), takt('slutavverkning', 'A030353', 'skotare', skotatTakt, kvar),
    ])
  it('exakt på beställt och ≤ 5 % över: "Landar på beställningen" som förut', () => {
    // 4 000 + 10 × 100 = 5 000; 4 000 + 10 × 125 = 5 250 (5 %: inte över).
    expect(lageSvar([over(5000, 5000, 4000, 100)], bada, 'pagaende', okt, 'oktober').rubrik).toBe('Landar på beställningen')
    const femProcent = lageSvar([over(5000, 6000, 4000, 125)], { gallring: 0, slutavverkning: 3 }, 'pagaende', okt, 'oktober')
    expect(femProcent.rubrik).toBe('Landar på beställningen')
    expect(femProcent.avvikelse).toBe(false)
  })
  it('> 5 % över: rubriken säger hur mycket, raden när beställt räcker och att resten går på nästa månad', () => {
    // Spåret ur prod: skotat landar 5 662 av 5 000 → 662 över, räcker ca 23 okt.
    expect(lageSvar([slut], { gallring: 0, slutavverkning: 3 }, 'pagaende', okt, 'oktober')).toEqual({
      rubrik: `Slutavverkning landar ${n(662)} över beställt`,
      rad: 'Räcker ca 23 okt · resten går på november',
      avvikelse: false,
    })
  })
  it('över går efter under: ett spår under är orange, det över nämns inte', () => {
    // Prod oktober: gallring skotat 714 av 1 000 (under), slutavverkning 5 662 av 5 000 (över).
    const s = lageSvar([gall, slut], bada, 'pagaende', okt, 'oktober')
    expect(s).toEqual({
      rubrik: 'Gallring landar under beställt',
      rad: `Skotat ${n(714)} av ${n(1000)} · behöver ${n(29)}/dag, kör 0`,
      avvikelse: true,
    })
  })
  it('redan framme: "Beställt är nått", datumet vet vi inte', () => {
    const s = lageSvar([over(5000, 6500, 5200, 100)], { gallring: 0, slutavverkning: 3 }, 'pagaende', okt, 'oktober')
    expect(s.rubrik).toBe(`Slutavverkning landar ${n(1200)} över beställt`)
    expect(s.rad).toBe('Beställt är nått · resten går på november')
  })
  it('decemberspår: resten går på januari', () => {
    expect(lageSvar([over(5000, 6500, 5200, 100)], { gallring: 0, slutavverkning: 3 }, 'pagaende', okt, 'december').rad).toBe('Beställt är nått · resten går på januari')
  })
  it('båda spåren över: störst först, det andra som ett led i raden', () => {
    const gallOver = raknaSpar(rad('gallring', { bestallt: 1000, skordat: 900, skotat: 800 }), okt, [
      takt('gallring', 'R64428', 'skordare', 20, KVAR_ALLA), takt('gallring', 'A030353', 'skotare', 40, KVAR_ALLA),
    ])
    const s = lageSvar([gallOver, slut], bada, 'pagaende', okt, 'oktober')
    expect(s.rubrik).toBe(`Slutavverkning landar ${n(662)} över beställt`)
    expect(s.rad).toBe(`Räcker ca 23 okt · resten går på november · Gallring landar ${n(100)} över`)
    expect(s.avvikelse).toBe(false)
  })
  it('spår utan objekt nämner det andra spårets överskott', () => {
    expect(lageSvar([gall, slut], { gallring: 0, slutavverkning: 3 }, 'pagaende', okt, 'oktober')).toEqual({
      rubrik: 'Gallring: inga objekt planerade', rad: `Slutavverkning landar ${n(662)} över beställt`, avvikelse: false,
    })
  })
})

describe('varningsraden — bara OFÖRKLARAT stopp', () => {
  const manuella = new Set(['JD810E'])
  it('planerat stopp (ledig förare utan fil) → ingen varning', () => {
    expect(oforklaratVarning(oktStopp.filter(s => s.maskin_id !== 'JD810E'), manuella, 'pagaende')).toBeNull()
    // Giants tre dagar är planerade: de står som stopp, inte som oförklarade.
    expect(giantStod.oforklarade_datum).toEqual([])
  })
  it('ingen fil + ingen ledighet → varning med veckodagar', () => {
    const giant = stopp({ maskin_id: GIANT, namn: 'Giant', oforklarade_datum: ['2026-10-14', '2026-10-15', '2026-10-16'] })
    expect(oforklaratVarning([giant], manuella, 'pagaende')).toBe('Giant körde inte ons–fre · ingen ledighet registrerad')
  })
  it('flera maskiner: en rad, "ingen ledighet registrerad" en gång', () => {
    const a = stopp({ maskin_id: GIANT, namn: 'Giant', oforklarade_datum: ['2026-10-14', '2026-10-15'] })
    const b = stopp({ maskin_id: 'A030353', namn: 'Wisent', roll: 'skotare', oforklarade_datum: ['2026-10-16'] })
    expect(oforklaratVarning([a, b], manuella, 'pagaende')).toBe('Giant körde inte ons–tors, Wisent körde inte fre · ingen ledighet registrerad')
  })
  it('manuell datakälla (810E) lämnas åt "inga lass registrerade" — där är ingen fil inte ett stopp', () => {
    const e810 = stopp({ maskin_id: 'JD810E', namn: '810E', roll: 'skotare', oforklarade_datum: ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'] })
    expect(oforklaratVarning([e810], manuella, 'pagaende')).toBeNull()
  })
  it('bara pågående månad, och aldrig utan läsbara stopp', () => {
    const giant = stopp({ maskin_id: GIANT, namn: 'Giant', oforklarade_datum: ['2026-10-14'] })
    expect(oforklaratVarning([giant], manuella, 'avslutad')).toBeNull()
    expect(oforklaratVarning(null, manuella, 'pagaende')).toBeNull()
  })
  it('fmtVeckodagar: sammanhängande led, fredag → måndag hänger ihop', () => {
    expect(fmtVeckodagar(['2026-10-14'])).toBe('ons')
    expect(fmtVeckodagar(['2026-10-14', '2026-10-15', '2026-10-16'])).toBe('ons–fre')
    expect(fmtVeckodagar(['2026-10-15', '2026-10-16', '2026-10-19'])).toBe('tors–mån')
    expect(fmtVeckodagar(['2026-10-12', '2026-10-13', '2026-10-16'])).toBe('mån–tis, fre')
  })
})

describe('stopptexter: MOT BESTÄLLNING och Planering', () => {
  it('orsak i klartext', () => {
    expect(orsakText('ledig:Stefan')).toBe('Stefan ledig')
    expect(orsakText('registrerat:produktionsbegransning')).toBe('Produktionsbegränsning')
    expect(orsakText('registrerat:okänd_orsak')).toBe('okänd_orsak')
  })
  it('stopp som varit nämns bara om det ligger i maskinens takt-fönster', () => {
    expect(stoppSynligt(giantStod)).toBe(true) // 16 okt ≥ takt_fran 7 okt
    expect(stoppSynligt({ ...giantStod, takt_fran: '2026-10-19' })).toBe(false)
    expect(stoppSynligt(elefant26)).toBe(true)
    expect(stoppSynligt(ingen('X', 'X'))).toBe(false)
  })
  it('förklaringsraden i spåret: stoppet först, sedan kör/behöver', () => {
    expect(sparStoppText(slut, oktStopp)).toBe('Giant stod 14–16 okt · Stefan ledig · Elefant 26 står 26–30 okt · Daniel ledig')
    const r = motBestallningRad(slut, 3, 'pagaende', 'oktober', sparStoppText(slut, oktStopp))
    expect(r.text.startsWith('Giant stod 14–16 okt · Stefan ledig · Elefant 26 står 26–30 okt · Daniel ledig · Kör 375/dag · behöver ')).toBe(true)
    expect(r.muted).toBe(false)
  })
  it('pågående stopp: "står"; utan stopp i spåret: raden som förut', () => {
    const pagar = { ...giantStod, stopp_status: 'pagar' as const }
    expect(sparStoppText(slut, [pagar])).toBe('Giant står 14–16 okt · Stefan ledig')
    expect(sparStoppText(gall, oktStopp)).toBeNull() // gallringsmaskinerna står inte
    expect(motBestallningRad(gall, 3, 'pagaende', 'oktober', null).text.startsWith('Kör 0/dag')).toBe(true)
  })
  it('Planering: "Står 14–16 okt · Stefan ledig · kör igen 19 okt" — bara pågående och kommande', () => {
    expect(planeringStoppText({ ...giantStod, stopp_status: 'pagar' })).toBe('Står 14–16 okt · Stefan ledig · kör igen 19 okt')
    expect(planeringStoppText(elefant26)).toBe('Står 26–30 okt · Daniel ledig · kör igen 2 nov')
    expect(planeringStoppText(giantStod)).toBeNull() // har varit
    expect(planeringStoppText(undefined)).toBeNull()
  })
  it('registrerat stopp (stopp_maskin) fungerar som förut: orsaken ur stopp.orsak', () => {
    const reg = stopp({ maskin_id: GIANT, namn: 'Giant', stopp_fran: '2026-10-19', stopp_till: '2026-10-23', stopp_orsak: 'registrerat:semesterstopp', stopp_status: 'kommande', stopp_kor_igen: '2026-10-26' })
    expect(planeringStoppText(reg)).toBe('Står 19–23 okt · Semesterstopp · kör igen 26 okt')
  })
})

describe('notiserna: samma prognos, stopp som orsak i klartext', () => {
  it('stopp i klartext, ingen rankning', () => {
    expect(stoppNotisText(oktStopp)).toBe('Giant stod 3 dagar (Stefan ledig) · Elefant 26 står 26–30 okt (Daniel ledig)')
    expect(stoppNotisText(oktStopp, ['R64428'])).toBeNull()
    expect(stoppNotisText(null)).toBeNull()
  })
  it('flera orsaker: unika, i ordning', () => {
    const m = stopp({ maskin_id: GIANT, namn: 'Giant', stopp_dagar_manad: 4, stopp_orsaker_manad: ['ledig:Joacim', 'ledig:Stefan'] })
    expect(stoppNotisText([m])).toBe('Giant stod 4 dagar (Joacim ledig, Stefan ledig)')
  })
  const data: VeckoNotisData = {
    idag: '2026-10-14', ar: 2026, manad: 10, isovecka: 42, dagar: okt, dagar_tom_idag: okt.gangna_datum.slice(0, 10), vecka_gangna: 3,
    spar: [slutRad, gallRad].map(r => ({ ...r })),
    takt: alla, stopp: oktStopp,
    veckor: {}, planerade: { slutavverkning: 3, gallring: 3 }, maskiner: [],
  }
  it('onsdagsnotisen räknar landar med maskinernas takt och nämner stoppen under spåret', () => {
    const t = formateraVeckoNotis(data)
    const slutBlock = t.split('\n\n')[0].split('\n')
    expect(slutBlock[1]).toBe(`Skördat landar ${n(6167)} · skotat landar ${n(5662)} av ${n(5000)}`)
    expect(slutBlock).toContain('Giant stod 3 dagar (Stefan ledig) · Elefant 26 står 26–30 okt (Daniel ledig)')
    // Gallringens maskiner har inga stopp: inga stopprader i det blocket.
    expect(t.split('\n\n')[1]).not.toContain('stod')
  })
  it('äldre köad payload utan takt/stopp: räknas som förut, inga stopprader', () => {
    const { takt: _t, stopp: _s, ...gammal } = data
    const t = formateraVeckoNotis(gammal as VeckoNotisData)
    expect(t).not.toContain('stod')
    // Spårets takt × globala dagar kvar: skördat 2 499 + 366,8 × 10 = 6 167, skotat 3 236 + 374,6 × 10 kapas vid skördat-prognosen.
    expect(t.split('\n')[1]).toBe(`Skördat landar ${n(6167)} · skotat landar ${n(6167)} av ${n(5000)}`)
  })
  it('månadsnotisen: procenten som förut, stoppen som egen rad', () => {
    const payload = { ar: 2026, manad: 10, totalt: { procent: 102.4 }, stopp: oktStopp.map(s => ({ ...s })) }
    expect(formateraManadNotis(payload)).toBe('Månadsfacit oktober: 102 %\nGiant stod 3 dagar (Stefan ledig) · Elefant 26 står 26–30 okt (Daniel ledig)')
    expect(formateraManadNotis({ ar: 2026, manad: 10, totalt: { procent: 102.4 } })).toBe('Månadsfacit oktober: 102 %')
    expect(formateraManadNotis({ ar: 2026, manad: 10, totalt: { procent: 102.4 }, stopp: [] })).toBe('Månadsfacit oktober: 102 %')
  })
})
