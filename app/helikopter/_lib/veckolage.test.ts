// Veckoläget (sidan, PDF:en, bilden): vymodellen ur payloaden. Stort tal = skotat landar i procent av beställt; rutorna "Skördat landar"/"Skotat landar".
// Fall: skotat under, skördat under, når beställt, inga objekt, maskin utan data, båda roller under.
// Fixtur: september 2026 ur prod-RPC:erna 2026-09-12, flyttad till onsdag 2026-09-16
// (vecka 38, arbetsdag 12 av 22: 11 gångna, 11 kvar, tre veckodagar t.o.m. onsdag).
import { describe, it, expect } from 'vitest'
import { FLASKHALS_RAD_MAX_TECKEN, flaskRoll, veckolageModell, type VeckolageData, type VeckolageMaskin } from './veckolage'
import type { SparRad, VeckaRad } from './queries'
import { raknaSpar } from './berakningar'

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
const maskin = (x: Partial<VeckolageMaskin>): VeckolageMaskin => ({
  maskin_id: 'x', modell: null, namn: 'Maskin', roll: 'skotare', volym_manad: 100, objekt_namn: null, takt_per_dag: null, takt_dagar: 0,
  oskotat_objekt: null, senast_datum: '2026-09-16', objekt_typ: null, dagar_tom_idag: sept, ...x,
})
const scorpion = maskin({ maskin_id: 'PONS20SDJAA270231', namn: 'Ponsse Scorpion', roll: 'skordare', volym_manad: 2675.4, objekt_namn: 'Hallaslätt AU 2026', takt_per_dag: 277.4, takt_dagar: 5, objekt_typ: 'slutavverkning' })
const rottne = maskin({ maskin_id: 'R64428', namn: 'Rottne H8E -26', roll: 'skordare', volym_manad: 239, objekt_namn: 'Betet gallring 2026', takt_per_dag: 27.3, takt_dagar: 5, objekt_typ: 'gallring' })
const elephant = maskin({ maskin_id: 'A130743', namn: 'Elephant King 2026', roll: 'skotare', volym_manad: 1227.5, objekt_namn: 'Rövemåla AU 2026', takt_per_dag: 183.9, takt_dagar: 5, oskotat_objekt: 13.7, objekt_typ: 'slutavverkning' })
const wisent = maskin({ maskin_id: 'A030353', namn: 'Wisent', roll: 'skotare', volym_manad: 523.5, objekt_namn: 'Rössmåla Ga 2026', takt_per_dag: 53.3, takt_dagar: 5, oskotat_objekt: 240, objekt_typ: 'gallring' })

const bas: VeckolageData = {
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

describe('veckolageModell', () => {
  it('sidhuvud, sidfot och filnamn', () => {
    const m = veckolageModell(bas)
    expect(m.datumRad).toBe('Onsdag 16 sep · vecka 38 · 11 arbetsdagar kvar')
    expect(m.sidfot).toBe('Kompersmåla Skog · Veckoläge vecka 38 · 16 sep 2026')
    expect(m.filnamn).toBe('veckolage-2026-v38')
    expect(m.spar.map(s => s.typ)).toEqual(['slutavverkning', 'gallring'])
  })

  it('skotat landar under: orange procent, "Skotat landar under beställt", rutor med prognosen, flaskhalsruta för skotarna', () => {
    const [s] = veckolageModell(bas).spar
    // Skördat landar 2 675 + 277,4 × 11 = 5 727 (14 % över: dämpad, inte grön). Skotat landar 1 265 + 183,9 × 11 = 3 287 (orange) = 66 % av 5 000.
    expect(s.rubrik).toEqual({ typNamn: 'Slutavverkning', volym: `${n(5000)} m³fub`, bolag: ' till Vida' })
    expect(s.stort).toEqual({ text: '66 %', ton: 'orange', liten: false })
    expect(s.mening).toBe('Skotat landar under beställt')
    expect(s.skordat).toEqual({ etikett: 'Skördat landar', tal: n(5727), under: `av ${n(5000)}`, ton: 'dampad' })
    expect(s.skotat).toEqual({ etikett: 'Skotat landar', tal: n(3287), under: `av ${n(5000)}`, ton: 'orange' })
    // behöver (5 000 − 1 265) / 11 = 340, kör 184 → saknar 156.
    expect(s.flaskhals?.rubrik).toBe('Skotarna saknar 156 m³fub/dag')
    expect(s.flaskhals?.rader).toEqual(['Elephant King 2026 184 på Rövemåla AU', 'Wisent 53 på Rössmåla Ga'])
    expect('Elephant King 2026 184 på Rövemåla AU · Wisent 53 på Rössmåla Ga'.length).toBeGreaterThan(FLASKHALS_RAD_MAX_TECKEN)
    expect(s.veckan).toBe('Veckan hittills: plan 682 · skördat 697 · skotat 374')
  })

  it('skotat landar på beställt men skördat under: stort tal grönt, skördat-rutan orange, skördaren i flaskhalsrutan', () => {
    const d: VeckolageData = { ...bas, spar: [bas.spar[0], { ...bas.spar[1], takt_skotat: 48 }] }
    const [, g] = veckolageModell(d).spar
    // gallring: skotat landar 486,5 + 48 × 11 = 1 015 (≥ 1 000, 1,5 % över) = 101 %. Skördat landar 239 + 27,3 × 11 = 539 (< 1 000).
    expect(g.stort).toEqual({ text: '101 %', ton: 'gron', liten: false })
    expect(g.mening).toBe('Skördat landar under beställt')
    expect(g.skotat).toEqual({ etikett: 'Skotat landar', tal: n(1015), under: `av ${n(1000)}`, ton: 'gron' })
    expect(g.skordat).toEqual({ etikett: 'Skördat landar', tal: '539', under: `av ${n(1000)}`, ton: 'orange' })
    expect(g.flaskhals?.rubrik).toBe('Skördarna saknar 42 m³fub/dag')
    expect(g.veckan).toBe('Veckan hittills: plan 136 · skördat 88 · skotat 171')
  })

  it('båda roller når beställt: grönt, ingen flaskhalsruta — även om skotat ligger efter plan idag', () => {
    const d: VeckolageData = { ...bas, spar: [spar('slutavverkning', { skordat: 4600, skotat: 1800, takt_skordat: 60, takt_skotat: 300, ingaende_oskotat: 2000 })] }
    const [s] = veckolageModell(d).spar
    // Skotat landar 1 800 + 300 × 11 = 5 100 (≥ 5 000, 2 % över); skördat 4 600 + 660 = 5 260. Plan idag 2 500 → skotat ligger "efter plan", men det styr inte längre.
    expect(s.stort).toEqual({ text: '102 %', ton: 'gron', liten: false })
    expect(s.mening).toBe('Skördat och skotat landar på beställningen')
    expect(s.flaskhals).toBeNull()
  })

  it('landar mer än 5 % över beställt: dämpat, inte grönt — meningen säger hur mycket, ingen flaskhalsruta', () => {
    const d: VeckolageData = { ...bas, spar: [spar('slutavverkning', { skordat: 4600, skotat: 1800, takt_skordat: 100, takt_skotat: 320, ingaende_oskotat: 2000 })] }
    const [s] = veckolageModell(d).spar
    // Skotat landar 1 800 + 320 × 11 = 5 320 (6 % över), skördat 5 700.
    expect(s.stort).toEqual({ text: '106 %', ton: 'dampad', liten: false })
    expect(s.mening).toBe(`Skotat landar ${n(320)} över beställt`)
    expect(s.skotat.ton).toBe('dampad')
    expect(s.flaskhals).toBeNull()
  })

  it('under beställt visas aldrig som 100 %: 99,6 % blir 99', () => {
    const d: VeckolageData = { ...bas, spar: [spar('slutavverkning', { skordat: 4900, skotat: 4900, takt_skordat: 100, takt_skotat: 9.96, ingaende_oskotat: 2000 })] }
    const [s] = veckolageModell(d).spar
    // Skotat landar 4 900 + 9,96 × 11 = 5 009,6 → når. Ett steg lägre takt: 4 900 + 9,0 × 11 = 4 999 → under (99,98 % → 99).
    expect(s.stort.text).toBe('100 %')
    const u = veckolageModell({ ...bas, spar: [spar('slutavverkning', { skordat: 4900, skotat: 4900, takt_skordat: 100, takt_skotat: 9, ingaende_oskotat: 2000 })] }).spar[0]
    expect(u.stort).toEqual({ text: '99 %', ton: 'orange', liten: false })
    expect(u.skotat.tal).toBe(n(4999))
  })

  it('inga objekt: dämpat stort tal, meningen säger varför, inga lägen i rutorna, ingen flaskhals', () => {
    const [, g] = veckolageModell({ ...bas, planerade: { slutavverkning: 5, gallring: 0 } }).spar
    expect(g.stort).toEqual({ text: 'Inga objekt', ton: 'dampad', liten: false })
    expect(g.mening).toBe('Skotat 487 · skotar ut föregående månad · skördaren har inget planerat')
    expect(g.skordat).toEqual({ etikett: 'Skördat', tal: '239', under: `av ${n(1000)}`, ton: 'neutral' })
    expect(g.skotat).toEqual({ etikett: 'Skotat', tal: '487', under: `av ${n(1000)}`, ton: 'neutral' })
    expect(g.flaskhals).toBeNull()
  })

  it('maskin utan data de två senaste arbetsdagarna: egen rad i flaskhalsrutan, takten visas inte', () => {
    const utan = { ...wisent, senast_datum: '2026-09-14' } // måndag; tisdag + onsdag utan lass
    const [s] = veckolageModell({ ...bas, maskiner: [scorpion, rottne, elephant, utan] }).spar
    expect(s.flaskhals?.rader).toEqual(['Elephant King 2026 184 på Rövemåla AU', 'Wisent · inga lass sedan måndag'])
    // Skördare utan data alls i månaden, när skördaren är flaskhals: "ingen produktion i september".
    const tyst = maskin({ namn: 'Rottne H8E', roll: 'skordare', senast_datum: null, volym_manad: 0 })
    const d: VeckolageData = { ...bas, spar: [spar('slutavverkning', { skordat: 1300 })], maskiner: [scorpion, tyst] }
    expect(veckolageModell(d).spar[0].flaskhals?.rader).toEqual(['Ponsse Scorpion 277 på Hallaslätt AU', 'Rottne H8E · ingen produktion i september'])
  })

  it('båda roller under: oskotat under en dags skotning → Skördarna i flaskhalsrutan', () => {
    // skördat 1 300, skotat 1 265: skördat landar 1 300 + 3 051 = 4 351, skotat kapas vid 912 + 4 351 men tar bara 1 265 + 2 023 = 3 287. Båda under.
    const d: VeckolageData = { ...bas, spar: [spar('slutavverkning', { skordat: 1300 })] }
    const [s] = veckolageModell(d).spar
    expect(s.stort).toEqual({ text: '66 %', ton: 'orange', liten: false })
    expect(s.mening).toBe('Skördat och skotat landar under beställt')
    expect(s.skordat).toEqual({ etikett: 'Skördat landar', tal: n(4351), under: `av ${n(5000)}`, ton: 'orange' })
    // oskotat 35 < 184 → skotaren har inget att hämta, skördaren är flaskhals: behöver (5 000 − 1 300) / 11 = 336, kör 277 → saknar 59.
    expect(flaskRoll(raknaSpar(spar('slutavverkning', { skordat: 1300 }), { maskin_id: null, totalt: 22, gangna: 11, kvar: 11, gangna_datum: [], kvar_datum: [] }))).toBe('skordare')
    expect(s.flaskhals?.rubrik).toBe('Skördarna saknar 59 m³fub/dag')
    expect(s.flaskhals?.rader).toEqual(['Ponsse Scorpion 277 på Hallaslätt AU', 'Rottne H8E -26 27 på Betet gallring'])
  })

  it('korta maskinrader ryms på EN rad', () => {
    const d: VeckolageData = {
      ...bas,
      spar: [spar('slutavverkning', { skordat: 1300 })],
      maskiner: [maskin({ namn: 'Scorpion', roll: 'skordare', takt_per_dag: 277.4, objekt_namn: 'Hallaslätt AU 2026' })],
    }
    const [s] = veckolageModell(d).spar
    expect(s.flaskhals?.rubrik).toBe('Skördarna saknar 59 m³fub/dag')
    expect(s.flaskhals?.rader).toEqual(['Scorpion 277 på Hallaslätt AU'])
  })

  it('ingen flaskhalsruta när spåret landar på beställt, hur långt efter plan idag det än ligger', () => {
    const d: VeckolageData = { ...bas, spar: [spar('slutavverkning', { skotat: 1800, takt_skotat: 320, ingaende_oskotat: 2000 })] }
    const [s] = veckolageModell(d).spar
    // Skotat landar 1 800 + 320 × 11 = 5 320; skördat 2 675 + 277,4 × 11 = 5 727. Plan idag 2 500: "efter plan" i gamla ordval — nu är det inget att varna för.
    expect(s.stort.text).toBe('106 %')
    expect(s.flaskhals).toBeNull()
  })

  it('utan beställning men med produktion: bara talen; utan både → spåret visas inte', () => {
    const d: VeckolageData = { ...bas, spar: [spar('slutavverkning', {}), spar('gallring', { bas: 'totalt', bestallt: 0, skordat: 239, skotat: 486.5 })] }
    const [, g] = veckolageModell(d).spar
    expect(g.rubrik).toEqual({ typNamn: 'Gallring', volym: null, bolag: ' · ingen beställning' })
    expect(g.stort).toEqual({ text: 'Ingen beställning', ton: 'dampad', liten: true })
    expect(g.mening).toBe('Skördat 239 · skotat 487')
    expect(g.skordat.under).toBeNull()
    expect(g.skotat.under).toBeNull()
    expect(g.skordat.etikett).toBe('Skördat')
    expect(g.flaskhals).toBeNull()
    expect(g.veckan).toBe('Veckan hittills: skördat 88 · skotat 171')
    const tom: VeckolageData = { ...bas, spar: [spar('slutavverkning', {}), spar('gallring', { bas: 'totalt', bestallt: 0, skordat: 0, skotat: 0 })] }
    expect(veckolageModell(tom).spar.map(s => s.typ)).toEqual(['slutavverkning'])
  })

  it('före prognosdag 4: dämpad text, hittills i rutorna, ingen flaskhals', () => {
    const d: VeckolageData = {
      ...bas, idag: '2026-09-02', isovecka: 36, vecka_gangna: 2, dagar_tom_idag: sept.slice(0, 2),
      dagar: { maskin_id: null, totalt: 22, gangna: 1, kvar: 21, gangna_datum: sept.slice(0, 1), kvar_datum: [] },
      spar: bas.spar.map(s => ({ ...s, takt_dagar: 1 })),
    }
    const m = veckolageModell(d)
    expect(m.datumRad).toBe('Onsdag 2 sep · vecka 36 · 21 arbetsdagar kvar')
    expect(m.spar[0].stort).toEqual({ text: 'Prognos från dag 4', ton: 'dampad', liten: true })
    expect(m.spar[0].mening).toBe(`Skotat ${n(1265)} av ${n(5000)}`)
    expect(m.spar[0].skotat).toMatchObject({ etikett: 'Skotat', under: `av ${n(5000)}`, ton: 'neutral' })
    expect(m.spar[0].flaskhals).toBeNull()
  })
})
