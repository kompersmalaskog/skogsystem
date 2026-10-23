import { describe, expect, it } from 'vitest'
import { raknaSpar, planeratPerTyp, type PlaneratResultat } from './berakningar'
import { fmt } from './format'
import { behoverDig, klarRader, manuellaUtanLass, sidSvar, sparKort, type BehovIndata } from './kort'
import { lasKlar } from './klar'
import fixtur from './__fixtures__/klar_2026-10-17.json'
import type { Arbetsdagar, Maskin, MaskinStopp, PlaneringObjekt, SparRad, Typ } from './queries'

// Oktober 2026 ur prod (helikopter_ny_spar/_arbetsdagar för 2026-10-17: 12 arbetsdagar gångna, 10 kvar). Samma tal som svar.test.ts.
const okt: Arbetsdagar = {
  maskin_id: null, totalt: 22, gangna: 12, kvar: 10,
  gangna_datum: ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'],
  kvar_datum: ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'],
}
const rad = (typ: Typ, x: Partial<SparRad>): SparRad => ({
  typ, bas: 'bestallt', bestallt: 5000, bolag: ['Vida'], skordat: 1985, skotat: 718, takt_skordat: 366.4, takt_skotat: 114.3,
  takt_dagar: 5, takt_fonster: [], oskotat_forandring_per_dag: 252.1, ingaende_oskotat: 912, oskotat_objekt: [], ...x,
})
const gallOkt = raknaSpar(rad('gallring', { bestallt: 1000, skordat: 665.1485, skotat: 714, takt_skordat: 55.9, takt_skotat: 0, ingaende_oskotat: 0 }), okt)
const slutOkt = raknaSpar(rad('slutavverkning', { bestallt: 5000, skordat: 2498.7337, skotat: 3235.5, takt_skordat: 160.4, takt_skotat: 374.6, ingaende_oskotat: 0 }), okt)
// Landar på beställningen: skördat 900 + 12 × 10 = 1 020, skotat 800 + 22 × 10 = 1 020 (kapas vid skördat) — 2 % över, inom ±5 %.
const gallOk = raknaSpar(rad('gallring', { bestallt: 1000, skordat: 900, skotat: 800, takt_skordat: 12, takt_skotat: 22, ingaende_oskotat: 0 }), okt)
// Över: skördat 900 + 20 × 10 = 1 100, skotat 800 + 30 × 10 = 1 100 — 10 % över.
const gallOver = raknaSpar(rad('gallring', { bestallt: 1000, skordat: 900, skotat: 800, takt_skordat: 20, takt_skotat: 30, ingaende_oskotat: 0 }), okt)

describe('sparKort — ett tal per spår: var skotat landar', () => {
  it('under: oktober 2026 ur prod (gallring skotat 714 av 1 000, skotaren står still)', () => {
    const k = sparKort(gallOkt, 'pagaende', 3)
    expect(k).toMatchObject({ namn: 'Gallring', ord: 'Under', ton: 'orange', tal: 714, av: 1000 })
    expect(k.andel).toBeCloseTo(0.714, 3)
    // plan idag = 12/22 av beställt
    expect(k.planAndel).toBeCloseTo(12 / 22, 6)
    expect(k.under).toBe(`Skördat landar ${fmt(1224)}`)
  })
  it('landar: grön, talet är prognosen (inte hittills)', () => {
    expect(sparKort(gallOk, 'pagaende', 3)).toMatchObject({ ord: 'Landar', ton: 'gron', tal: 1020, av: 1000 })
  })
  it('över beställt (> 5 %) är dämpat, inte grönt', () => {
    expect(sparKort(gallOver, 'pagaende', 3)).toMatchObject({ ord: 'Över', ton: 'dampad', tal: 1100 })
  })
  it('nått: skotat hittills ≥ beställt', () => {
    const framme = raknaSpar(rad('gallring', { bestallt: 1000, skordat: 1100, skotat: 1000, takt_skordat: 10, takt_skotat: 10, ingaende_oskotat: 0 }), okt)
    expect(sparKort(framme, 'pagaende', 3)).toMatchObject({ ord: 'Nått', ton: 'gron' })
  })
  it('ingen prognos före arbetsdag 4: "Hittills", talet är skotat hittills, raden säger när prognosen kommer', () => {
    const tidig = raknaSpar(rad('gallring', { bestallt: 1000, skotat: 120, takt_dagar: 2 }), okt)
    expect(sparKort(tidig, 'pagaende', 3)).toMatchObject({ ord: 'Hittills', ton: 'dampad', tal: 120, av: 1000, under: 'Prognos från dag 4' })
  })
  it('inga trakter planerade: dämpat, ingen stapelplan — aldrig grönt utan plan', () => {
    expect(sparKort(gallOk, 'pagaende', 0)).toMatchObject({ ord: 'Inga trakter', ton: 'dampad', tal: 800, planAndel: null })
  })
  it('ingen beställning: inget "av", ingen stapel', () => {
    const utan = raknaSpar(rad('gallring', { bestallt: 0, skotat: 356 }), okt)
    expect(sparKort(utan, 'pagaende', 3)).toMatchObject({ ord: 'Ingen beställning', ton: 'dampad', tal: 356, av: null, andel: null })
  })
  it('kommande månad: Inte startad, 0 av beställt', () => {
    expect(sparKort(gallOk, 'kommande', 0)).toMatchObject({ ord: 'Inte startad', ton: 'dampad', tal: 0, av: 1000, andel: 0 })
  })
  it('avslutad månad: Nått eller Under på skotat hittills, inget planstreck', () => {
    expect(sparKort(gallOkt, 'avslutad', 3)).toMatchObject({ ord: 'Under', ton: 'orange', tal: 714, planAndel: null, under: 'Skördat 665' })
    const natt = raknaSpar(rad('gallring', { bestallt: 1000, skordat: 1100, skotat: 1004.6 }), okt)
    expect(sparKort(natt, 'avslutad', 3)).toMatchObject({ ord: 'Nått', ton: 'gron', tal: 1005 })
  })
})

describe('sidSvar — EN mening överst', () => {
  const k = (spar: typeof gallOk[], status: 'pagaende' | 'avslutad' | 'kommande' = 'pagaende', n = 3) => spar.map(s => sparKort(s, status, n))
  it('under går först, med varningsikon', () => {
    expect(sidSvar(k([gallOkt, slutOkt]), 'pagaende')).toEqual({ rubrik: 'Landar under beställt', avvikelse: true })
    expect(sidSvar(k([gallOk, slutOkt]), 'pagaende')).toEqual({ rubrik: 'Landar under beställt', avvikelse: true })
  })
  it('allt landar: "Landar på beställningen", ingen avvikelse', () => {
    expect(sidSvar(k([gallOk]), 'pagaende')).toEqual({ rubrik: 'Landar på beställningen', avvikelse: false })
  })
  it('över är inte en avvikelse och inte "på beställningen"', () => {
    expect(sidSvar(k([gallOver]), 'pagaende')).toEqual({ rubrik: 'Landar över beställt', avvikelse: false })
  })
  it('inga trakter planerade nämns med spårets namn', () => {
    expect(sidSvar(k([gallOk], 'pagaende', 0), 'pagaende')).toEqual({ rubrik: 'Gallring: inga trakter planerade', avvikelse: false })
  })
  it('ingen prognos än', () => {
    const tidig = raknaSpar(rad('gallring', { bestallt: 1000, takt_dagar: 2 }), okt)
    expect(sidSvar(k([tidig]), 'pagaende')).toEqual({ rubrik: 'Prognos från dag 4', avvikelse: false })
  })
  it('ingen beställning alls · kommande · avslutad', () => {
    const utan = raknaSpar(rad('gallring', { bestallt: 0 }), okt)
    expect(sidSvar(k([utan]), 'pagaende').rubrik).toBe('Ingen beställning inlagd')
    expect(sidSvar(k([gallOk], 'kommande'), 'kommande').rubrik).toBe('Inte startad')
    expect(sidSvar(k([gallOkt], 'avslutad'), 'avslutad')).toEqual({ rubrik: 'Under beställt', avvikelse: true })
    const natt = raknaSpar(rad('gallring', { bestallt: 1000, skotat: 1000 }), okt)
    expect(sidSvar(k([natt], 'avslutad'), 'avslutad')).toEqual({ rubrik: 'Beställningen nådd', avvikelse: false })
  })
})

// ── Behöver dig ──
const giant: Maskin = { maskin_id: 'PONS', modell: 'Scorpion', visningsnamn: 'Giant', maskin_typ: 'Harvester', klarar_typ: 'slutavverkning', extramaskin: false, aktiv_till: null }
const jd: Maskin = { maskin_id: 'JD810E', modell: '810E', visningsnamn: '810E', maskin_typ: 'Forwarder', klarar_typ: 'bada', extramaskin: false, aktiv_till: null }
const stopp = (x: Partial<MaskinStopp>): MaskinStopp => ({
  maskin_id: 'PONS', namn: 'Giant', roll: 'skordare', stopp_fran: null, stopp_till: null, stopp_orsak: null, stopp_status: null, stopp_kor_igen: null,
  stopp_dagar: null, stopp_dagar_gangna: null, stopp_dagar_manad: 0, stopp_orsaker_manad: [], oforklarade_datum: [], takt_fran: null, ...x,
})
const objekt = (x: Partial<PlaneringObjekt>): PlaneringObjekt => ({
  objekt_id: 'o1', namn: '400763 Vällust -26', vo_nummer: '400763', typ: 'gallring', bolag: 'Vida', volym: 500, status: 'planerad',
  skordare_maskin_id: 'R64428', skotare_maskin_id: 'A030353', skordare_utforare: null, skotare_utforare: null, prognos_skordare_h: 10, prognos_skotare_h: 10,
  klar_skordare: false, klar_skotare: false, ...x,
})
const planOk: Record<Typ, PlaneratResultat> = {
  gallring: planeratPerTyp([objekt({ volym: 1000 })], 'gallring', 1000, []),
  slutavverkning: planeratPerTyp([objekt({ objekt_id: 'o2', typ: 'slutavverkning', volym: 5000 })], 'slutavverkning', 5000, []),
}
const bas: BehovIndata = {
  status: 'pagaende', maskinStopp: [], manuella: new Set(), maskiner: [giant, jd], senasteLass: {}, arbetsdagar: [okt], rapportdagar: null,
  idag: '2026-10-17', manadNamn: 'oktober', utanTyp: [], planering: [objekt({ volym: 1000 }), objekt({ objekt_id: 'o2', typ: 'slutavverkning', volym: 5000 })], plan: planOk, klar: null,
}

describe('behoverDig — en rad per sak som kräver en människa', () => {
  it('inget att göra = inga rader (inget kort)', () => {
    expect(behoverDig(bas)).toEqual([])
  })
  it('oförklarat stopp: maskinen körde inte och ingen ledighet var registrerad → öppnar Maskiner', () => {
    const r = behoverDig({ ...bas, maskinStopp: [stopp({ oforklarade_datum: ['2026-10-14', '2026-10-15', '2026-10-16'] })] })
    expect(r).toEqual([{ id: 'stod:PONS', text: 'Giant körde inte ons–fre', under: 'Ingen ledighet registrerad', oppnar: 'maskiner' }])
  })
  it('manuell maskin (810E) utan lass är "inga lass", aldrig "körde inte" — ett larm, inte två', () => {
    const r = behoverDig({
      ...bas, manuella: new Set(['JD810E']), senasteLass: { JD810E: '2026-10-12' },
      maskinStopp: [stopp({ maskin_id: 'JD810E', namn: '810E', oforklarade_datum: ['2026-10-15', '2026-10-16'] })],
      rapportdagar: { JD810E: okt.gangna_datum },
    })
    expect(r).toEqual([{ id: 'lass:JD810E', text: '810E har inga lass sedan måndag', under: 'Lassen registreras för hand', oppnar: 'maskiner' }])
  })
  it('lass finns en av de två senaste rapportdagarna: inget larm', () => {
    expect(manuellaUtanLass([jd], { JD810E: '2026-10-15' }, [okt], '2026-10-17', 'oktober', { JD810E: okt.gangna_datum })).toEqual([])
  })
  it('trakter utan maskin: en rad med namnet, flera med antalet → öppnar Ej tilldelade', () => {
    const en = behoverDig({ ...bas, planering: [objekt({ volym: 1000, skordare_maskin_id: null }), objekt({ objekt_id: 'o2', typ: 'slutavverkning', volym: 5000 })] })
    expect(en.map(r => [r.id, r.text, r.oppnar])).toEqual([['ej', 'Vällust har ingen maskin', 'ej']])
    const tva = behoverDig({ ...bas, planering: [objekt({ volym: 1000, skordare_maskin_id: null }), objekt({ objekt_id: 'o2', typ: 'slutavverkning', volym: 5000, skotare_maskin_id: null })] })
    expect(tva[0]).toMatchObject({ id: 'ej', text: '2 trakter har ingen maskin' })
  })
  it('beställt utan trakter → "saknar N m³fub trakter", öppnar Mot beställning', () => {
    const plan = { ...planOk, gallring: planeratPerTyp([objekt({ volym: 600 })], 'gallring', 1000, []) }
    const r = behoverDig({ ...bas, plan })
    expect(r).toEqual([{ id: 'saknas:gallring', text: 'Gallring saknar 400 m³fub trakter', under: null, oppnar: 'best' }])
  })
  it('objekt utan typ eller bolag: summan, och ett läsfel är ett fel (ladda om)', () => {
    const r = behoverDig({ ...bas, utanTyp: [{ objekt_id: 'x', namn: 'X', vo_nummer: null, huvudtyp: null, bolag: null, skordat: 100, skotat: 50, volym: 150.4, senast_datum: null, objekt_uuid: null }] })
    expect(r).toEqual([{ id: 'utan', text: '150 m³fub saknar typ eller bolag', under: 'Räknas inte mot beställningen', oppnar: 'utan' }])
    expect(behoverDig({ ...bas, utanTyp: null })[0]).toMatchObject({ id: 'utan', oppnar: 'ladda_om' })
  })
  it('maskin klar efter månadens slut (helikopter_ny_klar) står först', () => {
    const klar = lasKlar(structuredClone(fixtur))
    const sena = klar.maskiner.filter(m => m.efter_manad && m.klar_datum)
    expect(sena.length).toBeGreaterThan(0)
    const r = behoverDig({ ...bas, klar })
    expect(r[0]).toMatchObject({ id: `klar:${sena[0].maskin_id}`, under: 'Efter månadens slut', oppnar: 'maskiner' })
    expect(r[0].text).toMatch(/^.+ blir klar \d+ \w+$/)
  })
  it('avslutad månad: inga stopp-, lass-, trakt- eller klar-rader (bara utan typ)', () => {
    const r = behoverDig({ ...bas, status: 'avslutad', maskinStopp: [stopp({ oforklarade_datum: ['2026-10-14'] })], klar: lasKlar(structuredClone(fixtur)), planering: [objekt({ skordare_maskin_id: null })] })
    expect(r).toEqual([])
  })
})

describe('klarRader — ett datum per maskin', () => {
  const klar = lasKlar(structuredClone(fixtur))
  it('samma maskiner som RPC:n, i samma ordning, med datum, – eller ?', () => {
    const r = klarRader(klar, null)
    expect(r.map(x => x.maskin_id)).toEqual(klar.maskiner.map(m => m.maskin_id))
    for (const [i, x] of r.entries()) {
      const m = klar.maskiner[i]
      if (m.saknar_prognos) expect(x).toMatchObject({ hoger: '?', dampad: true, orange: false })
      else if (!m.klar_datum) expect(x).toMatchObject({ hoger: '–', dampad: true })
      else expect(x).toMatchObject({ dampad: false, orange: m.efter_manad })
    }
  })
  it('under: trakterna i ordning, högst tre, sedan +N; stoppet först när maskinen står', () => {
    const m = klar.maskiner.find(x => x.trakter.length > 0)!
    const r = klarRader(klar, [stopp({ maskin_id: m.maskin_id, namn: m.namn, stopp_fran: '2026-10-19', stopp_till: '2026-10-20', stopp_status: 'kommande', stopp_orsak: 'ledig:Stefan', stopp_kor_igen: '2026-10-21' })])
    const rad = r.find(x => x.maskin_id === m.maskin_id)!
    expect(rad.under).toMatch(/^Står 19–20 okt · Stefan ledig · kör igen 21 okt · /)
    const utanStopp = klarRader(klar, null).find(x => x.maskin_id === m.maskin_id)!
    expect(utanStopp.under!.split(' · ').length).toBeLessThanOrEqual(m.trakter.length <= 3 ? m.trakter.length : 4)
  })
})
