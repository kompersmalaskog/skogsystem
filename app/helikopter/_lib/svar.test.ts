import { describe, it, expect } from 'vitest'
import { atgardForMaskin, belaggning, landarRoller, lageSvar, motBestallningRad, planeratPerTyp, planeringSvar, raknaSpar, registreringsVarning, rollHogerText, valjBas, type PlaneratResultat } from './berakningar'
import type { Arbetsdagar, Maskin, PlaneringObjekt, SparRad, Typ } from './queries'

const dagar: Arbetsdagar = { maskin_id: null, totalt: 22, gangna: 6, kvar: 16, gangna_datum: [], kvar_datum: [] }
const rad = (typ: Typ, x: Partial<SparRad>): SparRad => ({
  typ, bas: 'bestallt', bestallt: 5000, bolag: ['Vida'], skordat: 1985, skotat: 718, takt_skordat: 366.4, takt_skotat: 114.3,
  takt_dagar: 5, takt_fonster: [], oskotat_forandring_per_dag: 252.1, ingaende_oskotat: 912, oskotat_objekt: [], ...x,
})
// September 2026 ur prod-RPC:n 2026-09-09
const slut = raknaSpar(rad('slutavverkning', {}), dagar)
const gall = raknaSpar(rad('gallring', { bestallt: 1000, skordat: 187, skotat: 356, takt_skordat: 28.3, takt_skotat: 62.8, oskotat_forandring_per_dag: -34.5, ingaende_oskotat: 902 }), dagar)

const n = (x: number) => x.toLocaleString('sv-SE')

// Oktober 2026 ur prod (helikopter_ny_spar/_arbetsdagar för 2026-10-17: 12 arbetsdagar gångna, 10 kvar).
const okt: Arbetsdagar = {
  maskin_id: null, totalt: 22, gangna: 12, kvar: 10,
  gangna_datum: ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'],
  kvar_datum: ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'],
}
const gallOkt = raknaSpar(rad('gallring', { bestallt: 1000, skordat: 665.1485, skotat: 714, takt_skordat: 55.9, takt_skotat: 0, oskotat_forandring_per_dag: 55.9, ingaende_oskotat: 0 }), okt)
const slutOkt = raknaSpar(rad('slutavverkning', { bestallt: 5000, skordat: 2498.7337, skotat: 3235.5, takt_skordat: 160.4, takt_skotat: 374.6, oskotat_forandring_per_dag: -214.2, ingaende_oskotat: 0 }), okt)
const bada = { gallring: 3, slutavverkning: 3 }
// Spår som landar på beställningen: skördat 900 + 20 × 10 = 1 100, skotat 800 + 30 × 10 = 1 100 (kapas vid skördat 1 100).
const gallOk = raknaSpar(rad('gallring', { bestallt: 1000, skordat: 900, skotat: 800, takt_skordat: 20, takt_skotat: 30, ingaende_oskotat: 0 }), okt)
const slutOk = raknaSpar(rad('slutavverkning', { bestallt: 5000, skordat: 4500, skotat: 4000, takt_skordat: 100, takt_skotat: 120, ingaende_oskotat: 0 }), okt)

describe('Läge svarsrad — styrs av prognos mot beställt, per roll och spår', () => {
  it('prognos per roll: oktober 2026 ur prod', () => {
    const [sk, st] = landarRoller(gallOkt)!
    // Skördat 665 + 55,9 × 10 = 1 224 (≥ 1 000, kapas aldrig). Skotat 714 + 0 × 10 = 714, kapat vid 0 + 1 224.
    expect([sk.landar, sk.under, sk.naDatum]).toEqual([665.1485 + 559, false, '2026-10-26'])
    expect([st.landar, st.under, st.naDatum]).toEqual([714, true, null])
    const [skS, stS] = landarRoller(slutOkt)!
    // Skördat 2 499 + 160,4 × 10 = 4 103 < 5 000. Skotat 3 236 + 375 × 10 = 6 982 kapas vid skördat-prognosen 4 103.
    expect(Math.round(skS.landar)).toBe(4103)
    expect(Math.round(stS.landar)).toBe(4103)
    expect([skS.under, stS.under]).toEqual([true, true])
  })
  it('ingen prognos före arbetsdag 4 och ingen beställning → null (inget påhittat tal)', () => {
    expect(landarRoller(raknaSpar(rad('gallring', { takt_dagar: 2 }), okt))).toBeNull()
    expect(landarRoller(raknaSpar(rad('gallring', { bestallt: 0 }), okt))).toBeNull()
  })
  it('1. allt når: "Landar på beställningen", ingen avvikelse', () => {
    expect(lageSvar([gallOk, slutOk], bada, 'pagaende', okt, 'oktober')).toEqual({
      rubrik: 'Landar på beställningen', rad: 'Slutavverkning och gallring · skördat och skotat', avvikelse: false,
    })
  })
  it('2. ett spår under (en roll): spåret i rubriken, rollen med behöver och kör i raden', () => {
    // Skördat 4 800 + 100 × 10 = 5 800 ✓. Skotat 3 000 + 100 × 10 = 4 000 < 5 000 (kapas inte: skördat-prognosen är 5 800).
    const slutSkotarUnder = raknaSpar(rad('slutavverkning', { bestallt: 5000, skordat: 4800, skotat: 3000, takt_skordat: 100, takt_skotat: 100, ingaende_oskotat: 0 }), okt)
    expect(lageSvar([gallOk, slutSkotarUnder], bada, 'pagaende', okt, 'oktober')).toEqual({
      rubrik: 'Slutavverkning landar under beställt',
      rad: `Skotat ${n(4000)} av ${n(5000)} · behöver ${n(200)}/dag, kör ${n(100)}`,
      avvikelse: true,
    })
  })
  it('3. båda roller under: båda talen, en gång "av beställt"', () => {
    // Skördat 2 499 + 160,4 × 10 = 4 103, skotat kapas vid samma 4 103.
    expect(lageSvar([gallOk, slutOkt], bada, 'pagaende', okt, 'oktober')).toEqual({
      rubrik: 'Slutavverkning landar under beställt',
      rad: `Skördat ${n(4103)} · skotat ${n(4103)} av ${n(5000)}`,
      avvikelse: true,
    })
  })
  it('oktober 2026 idag: båda spåren under — rubriken nämner båda, raden det sämsta (gallring: skotat)', () => {
    // Gallring saknar 28,6 % av beställt (skotat 714 av 1 000), slutavverkning 17,9 % (4 103 av 5 000): sämst = gallring, bara skotat under.
    expect(lageSvar([gallOkt, slutOkt], bada, 'pagaende', okt, 'oktober')).toEqual({
      rubrik: 'Gallring och slutavverkning landar under beställt',
      rad: `Skotat ${n(714)} av ${n(1000)} · behöver ${n(29)}/dag, kör 0`,
      avvikelse: true,
    })
  })
  it('4. spår utan objekt: "inga objekt planerade" som förut, raden säger hur det andra landar', () => {
    const s = lageSvar([gallOk, slutOk], { gallring: 0, slutavverkning: 3 }, 'pagaende', okt, 'oktober')
    expect(s).toEqual({ rubrik: 'Gallring: inga objekt planerade', rad: 'Slutavverkning landar på beställningen', avvikelse: false })
  })
  it('ett spår under går före spår utan objekt (avvikelsen först)', () => {
    const s = lageSvar([gallOk, slutOkt], { gallring: 0, slutavverkning: 3 }, 'pagaende', okt, 'oktober')
    expect(s.rubrik).toBe('Slutavverkning landar under beställt')
  })
  it('före arbetsdag 4: ingen prognos att döma efter', () => {
    const tidig = raknaSpar(rad('gallring', { bestallt: 1000, takt_dagar: 2 }), { ...okt, gangna: 2, kvar: 20 })
    expect(lageSvar([tidig], { gallring: 3, slutavverkning: 0 }, 'pagaende', { ...okt, gangna: 2, kvar: 20 }, 'oktober').rubrik).toBe('Prognos från dag 4')
  })
  it('landar exakt på beställt är inte under; en m³fub under är det', () => {
    const exakt = raknaSpar(rad('gallring', { bestallt: 1000, skordat: 900, skotat: 900, takt_skordat: 10, takt_skotat: 10, ingaende_oskotat: 0 }), okt) // 1 000 / 1 000
    expect(lageSvar([exakt], { gallring: 3, slutavverkning: 0 }, 'pagaende', okt, 'oktober').rubrik).toBe('Landar på beställningen')
    const under = raknaSpar(rad('gallring', { bestallt: 1000, skordat: 900, skotat: 900, takt_skordat: 10, takt_skotat: 9.9, ingaende_oskotat: 0 }), okt) // skotat 999
    expect(lageSvar([under], { gallring: 3, slutavverkning: 0 }, 'pagaende', okt, 'oktober').rubrik).toBe('Gallring landar under beställt')
  })
  it('inga arbetsdagar kvar: säger det i stället för ett påhittat behov', () => {
    const slut0 = raknaSpar(rad('gallring', { bestallt: 1000, skordat: 900, skotat: 700, takt_skordat: 10, takt_skotat: 10, ingaende_oskotat: 0 }), { ...okt, gangna: 22, kvar: 0, kvar_datum: [] })
    expect(lageSvar([slut0], { gallring: 3, slutavverkning: 0 }, 'pagaende', { ...okt, gangna: 22, kvar: 0 }, 'oktober').rad).toBe(`Skördat ${n(900)} · skotat ${n(700)} av ${n(1000)}`)
    const bara = raknaSpar(rad('gallring', { bestallt: 1000, skordat: 1200, skotat: 700, takt_skordat: 10, takt_skotat: 10, ingaende_oskotat: 0 }), { ...okt, gangna: 22, kvar: 0, kvar_datum: [] })
    expect(lageSvar([bara], { gallring: 3, slutavverkning: 0 }, 'pagaende', { ...okt, gangna: 22, kvar: 0 }, 'oktober').rad).toBe(`Skotat ${n(700)} av ${n(1000)} · inga arbetsdagar kvar`)
  })
  it('ingen beställning', () => {
    const a = raknaSpar(rad('slutavverkning', { bestallt: 0, skotat: 718 }), dagar)
    const b = raknaSpar(rad('gallring', { bestallt: 0, skotat: 0 }), dagar)
    expect(lageSvar([b, a], { gallring: 0, slutavverkning: 0 }, 'pagaende', dagar, 'september').rubrik).toBe('Ingen beställning inlagd')
  })
  it('underraden mot beställning: "landar N" sist', () => {
    expect(motBestallningRad(slut, 5, 'pagaende', 'september').text).toBe(`Kör ${n(114)}/dag · behöver ${n(268)} · oskotat växer ${n(252)}/dag · landar ${n(2547)}`)
    expect(motBestallningRad(gallOkt, 3, 'pagaende', 'oktober').text).toBe(`Kör 0/dag · behöver ${n(29)} · oskotat växer ${n(56)}/dag · landar ${n(714)}`)
    expect(motBestallningRad(gall, 0, 'pagaende', 'september')).toEqual({ text: 'Inga objekt planerade · skotar ut föregående månad', muted: true })
    expect(motBestallningRad(raknaSpar(rad('gallring', { bestallt: 0 }), dagar), 0, 'pagaende', 'september')).toEqual({ text: 'Ingen beställning inlagd', muted: true })
  })
})

describe('Uppföljning: texten under staplarna (höger)', () => {
  it('når beställt: datum; under: behöver och kör — oktober 2026 ur prod', () => {
    const [sk, st] = landarRoller(gallOkt)!
    expect(rollHogerText(sk)).toBe('når beställt 26 okt')
    expect(rollHogerText(st)).toBe(`behöver ${n(29)}/dag · kör 0`)
    const [skS, stS] = landarRoller(slutOkt)!
    expect(rollHogerText(skS)).toBe(`behöver ${n(250)}/dag · kör ${n(160)}`)
    expect(rollHogerText(stS)).toBe(`behöver ${n(176)}/dag · kör ${n(375)}`)
  })
  it('redan framme: "beställt nått", inget datum', () => {
    const klar = raknaSpar(rad('gallring', { bestallt: 1000, skordat: 1100, skotat: 1000, takt_skordat: 10, takt_skotat: 10 }), okt)
    const [sk, st] = landarRoller(klar)!
    expect([rollHogerText(sk), rollHogerText(st)]).toEqual(['beställt nått', 'beställt nått'])
  })
  it('datumet är första arbetsdagen då hittills + takt × n når beställt', () => {
    // 665,1 + 55,9 × n ≥ 1 000 → n = 6 (6 × 55,9 = 335,4 ≥ 334,85) → sjätte kvarvarande arbetsdagen = 26 okt.
    expect(landarRoller(gallOkt)![0].naDatum).toBe('2026-10-26')
    // Ett lass mindre och det blir den sjunde: 27 okt.
    const lite = raknaSpar(rad('gallring', { bestallt: 1000, skordat: 660, skotat: 714, takt_skordat: 55.9, takt_skotat: 0, ingaende_oskotat: 0 }), okt)
    expect(landarRoller(lite)![0].naDatum).toBe('2026-10-27')
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

describe('registreringsVarning — manuell datakälla utan registrerade lass', () => {
  const jd: Maskin = { maskin_id: 'JD810E', modell: '810E', visningsnamn: 'John Deere 810E', maskin_typ: 'Forwarder', klarar_typ: null, extramaskin: false, aktiv_till: null, datakalla: 'manuell' }
  const sept = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24']
  const dagarRader: Arbetsdagar[] = [
    { maskin_id: null, totalt: 22, gangna: 3, kvar: 19, gangna_datum: sept.slice(0, 3), kvar_datum: ['2026-09-24', '2026-09-25'] },
    { maskin_id: 'JD810E', totalt: 22, gangna: 3, kvar: 19, gangna_datum: sept.slice(0, 3), kvar_datum: ['2026-09-24', '2026-09-25'] },
  ]
  it('inga lass tisdag + onsdag (senast måndag) → varning med veckodag', () => {
    expect(registreringsVarning([jd], { JD810E: '2026-09-21' }, dagarRader, '2026-09-23', 'september')).toBe('John Deere 810E · inga lass registrerade sedan måndag')
  })
  it('lass i går räcker → ingen varning; inga lass alls → "i september"', () => {
    expect(registreringsVarning([jd], { JD810E: '2026-09-22' }, dagarRader, '2026-09-23', 'september')).toBeNull()
    expect(registreringsVarning([jd], { JD810E: null }, dagarRader, '2026-09-23', 'september')).toBe('John Deere 810E · inga lass registrerade i september')
  })
  it('utan manuella maskiner eller såld maskin → null', () => {
    expect(registreringsVarning([], {}, dagarRader, '2026-09-23', 'september')).toBeNull()
    expect(registreringsVarning([{ ...jd, aktiv_till: '2026-08-31' }], { JD810E: null }, dagarRader, '2026-09-23', 'september')).toBeNull()
  })
})
