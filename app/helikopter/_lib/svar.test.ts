import { describe, it, expect } from 'vitest'
import { atgardForMaskin, belaggning, flodesText, lageSvar, motBestallningRad, planeratPerTyp, planeringSvar, raknaSpar, valjBas, type PlaneratResultat } from './berakningar'
import type { Arbetsdagar, Maskin, PlaneringObjekt, SparRad, Typ } from './queries'

const dagar: Arbetsdagar = { maskin_id: null, totalt: 22, gangna: 6, kvar: 16, gangna_datum: [], kvar_datum: [] }
const rad = (typ: Typ, x: Partial<SparRad>): SparRad => ({
  typ, bas: 'bestallt', bestallt: 5000, bolag: ['Vida'], skordat: 1985, skotat: 718, takt_skordat: 366.4, takt_skotat: 114.3,
  takt_dagar: 5, takt_fonster: [], oskotat_forandring_per_dag: 252.1, ingaende_oskotat: 912, oskotat_objekt: [], ...x,
})
// September 2026 ur prod-RPC:n 2026-09-09
const slut = raknaSpar(rad('slutavverkning', {}), dagar)
const gall = raknaSpar(rad('gallring', { bestallt: 1000, skordat: 187, skotat: 356, takt_skordat: 28.3, takt_skotat: 62.8, oskotat_forandring_per_dag: -34.5, ingaende_oskotat: 902 }), dagar)

describe('Läge svarsrad', () => {
  it('september 2026: slutavverkning efter, skotaren flaskhals', () => {
    const s = lageSvar([gall, slut], { gallring: 0, slutavverkning: 5 }, 'pagaende', dagar, 'september')
    expect(s).toEqual({ rubrik: 'Slutavverkning 6 dagar efter', rad: `Skotaren är flaskhals · ${(1267).toLocaleString('sv-SE')} m³fub efter skördaren i september`, avvikelse: true })
  })
  it('flödestexten: flaskhals / tar igen / skotar ut föregående månad', () => {
    expect(flodesText(slut, 'september')).toBe(`Skotaren är flaskhals · ${(1267).toLocaleString('sv-SE')} m³fub efter skördaren i september`)
    const tarIgen = raknaSpar(rad('slutavverkning', { oskotat_forandring_per_dag: -40 }), dagar)
    expect(flodesText(tarIgen, 'september')).toBe(`Skotaren tar igen · ${(1267).toLocaleString('sv-SE')} m³fub efter skördaren`)
    expect(flodesText(gall, 'september')).toBe(`Skotar ut föregående månad · ${(169).toLocaleString('sv-SE')} m³fub före skördaren`)
    expect(flodesText(raknaSpar(rad('gallring', { skordat: 100, skotat: 100 }), dagar), 'september')).toBeNull()
    expect(JSON.stringify([slut, gall, tarIgen].map(x => flodesText(x, 'september')))).not.toContain('ligger i skogen')
  })
  it('spår utan objekt när det andra är på plan', () => {
    const ok = raknaSpar(rad('slutavverkning', { skotat: 1400, takt_skotat: 260, oskotat_forandring_per_dag: 0 }), dagar)
    const s = lageSvar([gall, ok], { gallring: 0, slutavverkning: 5 }, 'pagaende', dagar, 'september')
    expect(s.rubrik).toBe('Gallring: inga objekt planerade')
    expect(s.rad).toBe('Slutavverkning på plan')
    expect(s.avvikelse).toBe(false)
  })
  it('allt på plan', () => {
    const ok = raknaSpar(rad('slutavverkning', { skotat: 1400, takt_skotat: 260, oskotat_forandring_per_dag: 0 }), dagar)
    const okG = raknaSpar(rad('gallring', { bestallt: 1000, skotat: 280, takt_skotat: 60, skordat: 300, oskotat_forandring_per_dag: 2 }), dagar)
    expect(lageSvar([okG, ok], { gallring: 2, slutavverkning: 5 }, 'pagaende', dagar, 'september')).toEqual({ rubrik: 'På plan · båda spåren', rad: null, avvikelse: false })
  })
  it('ingen beställning', () => {
    const a = raknaSpar(rad('slutavverkning', { bestallt: 0, skotat: 718 }), dagar)
    const b = raknaSpar(rad('gallring', { bestallt: 0, skotat: 0 }), dagar)
    expect(lageSvar([b, a], { gallring: 0, slutavverkning: 0 }, 'pagaende', dagar, 'september').rubrik).toBe('Ingen beställning inlagd')
  })
  it('underraden mot beställning', () => {
    expect(motBestallningRad(slut, 5, 'pagaende', 'september').text).toBe(`Kör ${(114).toLocaleString('sv-SE')}/dag · behöver ${(268).toLocaleString('sv-SE')} · oskotat växer ${(252).toLocaleString('sv-SE')}/dag`)
    expect(motBestallningRad(gall, 0, 'pagaende', 'september')).toEqual({ text: 'Inga objekt planerade · skotar ut föregående månad', muted: true })
    expect(motBestallningRad(raknaSpar(rad('gallring', { bestallt: 0 }), dagar), 0, 'pagaende', 'september')).toEqual({ text: 'Ingen beställning inlagd', muted: true })
  })
})

describe('Planering svarsrad', () => {
  const maskiner: Maskin[] = [
    { maskin_id: 'SCORP', modell: 'Scorpion', maskin_typ: 'Harvester', klarar_typ: 'bada', extramaskin: false, aktiv_till: null },
    { maskin_id: 'H8E', modell: 'H8E-1', maskin_typ: 'Harvester', klarar_typ: 'bada', extramaskin: false, aktiv_till: null },
    { maskin_id: 'WIS', modell: 'Wisent', maskin_typ: 'Forwarder', klarar_typ: 'bada', extramaskin: false, aktiv_till: null },
  ]
  const ad: Arbetsdagar[] = [dagar, { ...dagar, maskin_id: 'SCORP' }, { ...dagar, maskin_id: 'H8E' }, { ...dagar, maskin_id: 'WIS' }]
  const o = (n: string, typ: string, sk: string | null, hs: number | null, volym = 300): PlaneringObjekt => ({
    objekt_id: n, namn: n, vo_nummer: null, typ, bolag: 'Vida', volym, status: 'planerad',
    skordare_maskin_id: sk, skotare_maskin_id: 'WIS', skordare_utforare: null, skotare_utforare: null,
    prognos_skordare_h: hs, prognos_skotare_h: 10, klar_skordare: false, klar_skotare: false,
  })
  const tomPlan: PlaneratResultat = { planerat: 0, korrigerat: 0, antalObjekt: 0, justeringProcent: null, utanVolym: 0, utanBolag: 0, gap: 0, grans: 0, saknas: 0 }

  it('maskin kort går före kubik saknas; åtgärd = minsta objekt flyttas', () => {
    const objekt = [o('Ekeberga', 'slutavverkning', 'SCORP', 40), o('Stor', 'slutavverkning', 'SCORP', 110)]
    const bel = belaggning(objekt, maskiner, ad, '2026-09-09', true) // Scorpion 150 h av 128
    const s = planeringSvar(bel, { gallring: { ...tomPlan, saknas: 150 }, slutavverkning: tomPlan }, 16)
    expect(s.rubrik).toBe('Scorpion 22 h kort')
    expect(s.rad).toBe(`Ekeberga kan flyttas till H8E-1 · gallring saknar ${(150).toLocaleString('sv-SE')} m³fub`)
    expect(s.avvikelse).toBe(true)
  })
  it('ingen maskin med luft → övertid; för många dagar → bolaget', () => {
    const objekt = [o('A', 'slutavverkning', 'SCORP', 140), o('B', 'slutavverkning', 'H8E', 125)]
    const bel = belaggning(objekt, maskiner, ad, '2026-09-09', true)
    expect(atgardForMaskin(bel[0], bel, 16)).toBe('2 dagar övertid')
    expect(atgardForMaskin(bel[0], bel, 1)).toBe('Prata med bolaget')
  })
  it('kubik saknas när maskinerna räcker; allt ok annars', () => {
    const bel = belaggning([], maskiner, ad, '2026-09-09', true)
    const s = planeringSvar(bel, { gallring: { ...tomPlan, saknas: 1000 }, slutavverkning: { ...tomPlan, saknas: 2091 } }, 16)
    expect(s.rubrik).toBe(`Slutavverkning saknar ${(2091).toLocaleString('sv-SE')} m³fub`)
    expect(s.rad).toBe(`Planera in fler objekt · gallring saknar ${(1000).toLocaleString('sv-SE')} m³fub`)
    expect(planeringSvar(bel, { gallring: tomPlan, slutavverkning: tomPlan }, 16)).toEqual({ rubrik: `Allt planerat får plats · ${(384).toLocaleString('sv-SE')} h luft`, rad: null, avvikelse: false })
  })
  it('september 2026 ur prod: kubik saknas, ingen maskin kort', () => {
    const objekt: PlaneringObjekt[] = [
      o('Hallaslätt AU 2026', 'slutavverkning', null, null, 269),
      { ...o('Kämpamåla AU 2026', 'slutavverkning', 'SCORP', 10, 347), status: 'pagaende' },
      o('Kroksjömåla 1:23 A-A -25', 'slutavverkning', null, null, 860),
      o('Östra-Hoka 1:7 A-C -25', 'slutavverkning', 'SCORP', 26, 844),
      o('Vällust RP M-R -25', 'slutavverkning', null, null, 456),
    ]
    const hist = [{ bolag: 'Vida', typ: 'slutavverkning' as Typ, antal: 12, medel_kvot: 1.048, std_kvot: 0.347 }]
    const plan = { gallring: planeratPerTyp(objekt, 'gallring', 1000, hist), slutavverkning: planeratPerTyp(objekt, 'slutavverkning', 5000, hist) }
    const bel = belaggning(objekt, maskiner, ad, '2026-09-09', true)
    const s = planeringSvar(bel, plan, 16)
    expect(s.rubrik).toBe(`Slutavverkning saknar ${(2091).toLocaleString('sv-SE')} m³fub`)
    expect(s.rad).toBe(`Planera in fler objekt · gallring saknar ${(1000).toLocaleString('sv-SE')} m³fub`)
  })
})

describe('valjBas oförändrad', () => {
  it('bestallt före totalt', () => {
    expect(valjBas([rad('gallring', { bas: 'totalt', bestallt: 0, skordat: 9 }), rad('gallring', { bas: 'bestallt', bestallt: 10, skordat: 3 })], 'gallring')?.skordat).toBe(3)
  })
})
