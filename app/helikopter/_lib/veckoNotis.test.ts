// Onsdagsnotisen — fyra fall: efter plan, på plan, inga objekt, maskin utan data.
// Fixtur: september 2026 ur prod-RPC:erna 2026-09-12, flyttad till onsdag 2026-09-16
// (vecka 38, arbetsdag 12 av 22: 11 gångna, 11 kvar, tre veckodagar t.o.m. onsdag).
import { describe, it, expect } from 'vitest'
import { bolagText, ca, formateraVeckoNotis, saknarData, sedanText, type VeckoNotisData, type VeckoNotisMaskin } from './veckoNotis'
import type { SparRad, VeckaRad } from './queries'

const n = (x: number) => x.toLocaleString('sv-SE')

const sept = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-14', '2026-09-15', '2026-09-16']
const spar = (typ: SparRad['typ'], x: Partial<SparRad>): SparRad => ({
  typ, bas: 'bestallt', bestallt: 5000, bolag: ['Vida'], skordat: 2675.4, skotat: 1264.5, takt_skordat: 277.4, takt_skotat: 183.9,
  takt_dagar: 5, takt_fonster: [], oskotat_forandring_per_dag: 93.5, ingaende_oskotat: 912.3, oskotat_objekt: [], ...x,
})
const vecka = (x: Partial<VeckaRad>): VeckaRad => ({
  isovecka: 38, iso_ar: 2026, fran: '2026-09-14', till: '2026-09-20', arbetsdagar: 5, arbetsdagar_kvar: 3,
  plan: 1136, skordat: 697, skotat: 374, status: 'pagar', orsak: null, maskiner: [], ...x,
})
const maskin = (x: Partial<VeckoNotisMaskin>): VeckoNotisMaskin => ({
  maskin_id: 'x', modell: null, namn: 'Maskin', roll: 'skotare', volym_manad: 100, objekt_namn: null, takt_per_dag: null, takt_dagar: 0,
  oskotat_objekt: null, senast_datum: '2026-09-16', objekt_typ: null, dagar_tom_idag: sept, ...x,
})
const scorpion = maskin({ maskin_id: 'PONS20SDJAA270231', namn: 'Ponsse Scorpion', roll: 'skordare', volym_manad: 2675.4, objekt_namn: 'Hallaslätt AU 2026', takt_per_dag: 277.4, takt_dagar: 5, objekt_typ: 'slutavverkning' })
const rottne = maskin({ maskin_id: 'R64428', namn: 'Rottne H8E -26', roll: 'skordare', volym_manad: 239, objekt_namn: 'Betet gallring 2026', takt_per_dag: 27.3, takt_dagar: 5, objekt_typ: 'gallring' })
const elephant = maskin({ maskin_id: 'A130743', namn: 'Elephant King 2026', roll: 'skotare', volym_manad: 1227.5, objekt_namn: 'Rövemåla AU 2026', takt_per_dag: 183.9, takt_dagar: 5, oskotat_objekt: 13.7, objekt_typ: 'slutavverkning' })
const wisent = maskin({ maskin_id: 'A030353', namn: 'Wisent', roll: 'skotare', volym_manad: 523.5, objekt_namn: 'Rössmåla Ga 2026', takt_per_dag: 53.3, takt_dagar: 5, oskotat_objekt: 240, objekt_typ: 'gallring' })

const bas: VeckoNotisData = {
  idag: '2026-09-16', ar: 2026, manad: 9, isovecka: 38,
  dagar: { maskin_id: null, totalt: 22, gangna: 11, kvar: 11, gangna_datum: sept.slice(0, 11), kvar_datum: [] },
  dagar_tom_idag: sept,
  vecka_gangna: 3,
  spar: [
    spar('slutavverkning', {}),
    spar('gallring', { bestallt: 1000, skordat: 239, skotat: 486.5, takt_skordat: 27.3, takt_skotat: 53.3, oskotat_forandring_per_dag: -26, ingaende_oskotat: 901.5 }),
  ],
  veckor: { slutavverkning: vecka({}), gallring: vecka({ plan: 227, skordat: 88, skotat: 171 }) },
  planerade: { slutavverkning: 5, gallring: 1 },
  maskiner: [scorpion, rottne, elephant, wisent],
}

describe('formateraVeckoNotis', () => {
  it('efter plan: fem rader, skotaren är flaskhals med alla skotare som har takt', () => {
    const text = formateraVeckoNotis(bas)
    const [slut] = text.split('\n\n')
    // plan idag 2 500, (2 500 − 1 265) / 183,9 = 6,7 → 7 dagar efter. Veckoplan 1 136 × 3/5 = 682.
    // behöver (5 000 − 1 265) / 11 = 340. Landar min(1 265 + 183,9 × 11, 912 + 2 675 + 277 × 11) = 3 288 → ca 3 300.
    expect(slut.split('\n')).toEqual([
      `Vecka 38 · Slutavverkning · ${n(5000)} till Vida`,
      `Skördat ${n(2675)} · skotat ${n(1265)} · 7 dagar efter plan`,
      `Veckan hittills: plan 682, skördat 697, skotat 374`,
      `Kör 184/dag · behöver 340 · landar ca ${n(3300)}`,
      `Skotaren är flaskhals: Elephant King 2026 184/dag på Rövemåla AU · Wisent 53/dag på Rössmåla Ga`,
    ])
  })

  it('på plan: rad 2 slutar "på plan", ingen flaskhalsrad', () => {
    const text = formateraVeckoNotis(bas)
    const [, gall] = text.split('\n\n')
    // gallring: plan idag 500, (500 − 487) / 53,3 = 0,2 → på plan. behöver (1 000 − 487) / 11 = 47.
    // landar min(487 + 53,3 × 11 = 1 073, 902 + 239 + 27,3 × 11) = 1 073 → ca 1 100.
    expect(gall.split('\n')).toEqual([
      `Vecka 38 · Gallring · ${n(1000)} till Vida`,
      'Skördat 239 · skotat 487 · på plan',
      'Veckan hittills: plan 136, skördat 88, skotat 171',
      `Kör 53/dag · behöver 47 · landar ca ${n(1100)}`,
    ])
    expect(gall).not.toContain('flaskhals')
  })

  it('inga objekt planerade: bara rubrikrad och "Inga objekt planerade"', () => {
    const text = formateraVeckoNotis({ ...bas, planerade: { slutavverkning: 5, gallring: 0 } })
    const [, gall] = text.split('\n\n')
    expect(gall).toBe(`Vecka 38 · Gallring · ${n(1000)} till Vida\nInga objekt planerade`)
  })

  it('maskin utan data de två senaste arbetsdagarna: egen rad i spårets block', () => {
    const utan = { ...wisent, senast_datum: '2026-09-14' } // måndag; tisdag + onsdag utan lass
    const text = formateraVeckoNotis({ ...bas, maskiner: [scorpion, rottne, elephant, utan] })
    const [slut, gall] = text.split('\n\n')
    expect(gall.split('\n').at(-1)).toBe('Wisent · inga lass sedan måndag')
    expect(slut).not.toContain('inga lass')
    // Skördare utan data alls i månaden: "ingen produktion i september", okänd typ → första blocket.
    const tyst = maskin({ namn: 'Rottne H8E', roll: 'skordare', senast_datum: null, volym_manad: 0 })
    const t2 = formateraVeckoNotis({ ...bas, maskiner: [scorpion, elephant, wisent, tyst] })
    expect(t2.split('\n\n')[0].split('\n').at(-1)).toBe('Rottne H8E · ingen produktion i september')
    // Data i går räcker: ingen rad.
    expect(formateraVeckoNotis({ ...bas, maskiner: [{ ...wisent, senast_datum: '2026-09-15' }] })).not.toContain('inga lass')
  })

  it('två spår = två block med en tom rad emellan, ingen inledning eller avslutning', () => {
    const text = formateraVeckoNotis(bas)
    expect(text.startsWith('Vecka 38 · Slutavverkning')).toBe(true)
    expect(text.split('\n\n')).toHaveLength(2)
    expect(text.endsWith('\n')).toBe(false)
    expect(text).not.toMatch(/ligger i skogen|dra ner|byt trakt/)
  })

  it('spår utan beställning hoppas över; helt utan beställning en rad', () => {
    const utanGall = formateraVeckoNotis({ ...bas, spar: [spar('slutavverkning', {}), spar('gallring', { bestallt: 0, bas: 'totalt' })] })
    expect(utanGall.split('\n\n')).toHaveLength(1)
    expect(formateraVeckoNotis({ ...bas, spar: bas.spar.map(s => ({ ...s, bestallt: 0 })) })).toBe('Ingen beställning inlagd i september')
  })

  it('före prognosdag 4: rad 2 säger det, ingen takt-rad', () => {
    const tidigt: VeckoNotisData = {
      ...bas, idag: '2026-09-02', isovecka: 36, vecka_gangna: 2, dagar_tom_idag: sept.slice(0, 2),
      dagar: { maskin_id: null, totalt: 22, gangna: 1, kvar: 21, gangna_datum: sept.slice(0, 1), kvar_datum: [] },
      spar: bas.spar.map(s => ({ ...s, takt_dagar: 1 })),
    }
    const [slut] = formateraVeckoNotis(tidigt).split('\n\n')
    expect(slut.split('\n')[1]).toBe(`Skördat ${n(2675)} · skotat ${n(1265)} · prognos från arbetsdag 4`)
    expect(slut).not.toContain('Kör ')
  })
})

describe('hjälpfunktioner', () => {
  it('bolagText', () => {
    expect(bolagText([])).toBe('')
    expect(bolagText(['Vida'])).toBe(' till Vida')
    expect(bolagText(['Vida', 'Södra'])).toBe(' till Vida och Södra')
    expect(bolagText(['Vida', 'Södra', 'Privat'])).toBe(' till Vida, Södra och Privat')
  })
  it('ca avrundar till hundratal', () => {
    expect(ca(2437)).toBe(n(2400))
    expect(ca(2450)).toBe(n(2500))
  })
  it('sedanText: veckodag inom en vecka, annars datum', () => {
    expect(sedanText('2026-09-14', '2026-09-16', 'september')).toBe('sedan måndag')
    expect(sedanText('2026-09-03', '2026-09-16', 'september')).toBe('sedan 3 sep')
    expect(sedanText(null, '2026-09-16', 'september')).toBe('i september')
  })
  it('saknarData: maskinens egna arbetsdagar, färre än två dagar avgör inget', () => {
    expect(saknarData({ senast_datum: '2026-09-14', dagar_tom_idag: sept }, sept)).toBe(true)
    expect(saknarData({ senast_datum: '2026-09-15', dagar_tom_idag: sept }, sept)).toBe(false)
    // Maskin i stopp 15–16 sep: dess egna dagar slutar 14 sep → data 11 sep räcker.
    expect(saknarData({ senast_datum: '2026-09-11', dagar_tom_idag: sept.slice(0, 10) }, sept)).toBe(false)
    expect(saknarData({ senast_datum: null, dagar_tom_idag: ['2026-09-01'] }, ['2026-09-01'])).toBe(false)
  })
})
