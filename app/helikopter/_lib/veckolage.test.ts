// Veckoläget (sidan, PDF:en, bilden): vymodellen ur payloaden. Fem fall — efter plan
// (skotaren), på plan, inga objekt, maskin utan data, skördaren efter i stället för skotaren.
// Fixtur: september 2026 ur prod-RPC:erna 2026-09-12, flyttad till onsdag 2026-09-16
// (vecka 38, arbetsdag 12 av 22: 11 gångna, 11 kvar, tre veckodagar t.o.m. onsdag).
import { describe, it, expect } from 'vitest'
import { FLASKHALS_RAD_MAX_TECKEN, veckolageModell, type VeckolageData, type VeckolageMaskin } from './veckolage'
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

  it('efter plan: skotaren är flaskhals — orange stort tal, saknar-rubrik, maskinerna en per rad när de inte får plats', () => {
    const [s] = veckolageModell(bas).spar
    // plan idag 2 500, (2 500 − 1 265) / 183,9 = 6,7 → 7 dagar efter. Skördat 2 675 mot 2 500 → på plan.
    expect(s.rubrik).toEqual({ typNamn: 'Slutavverkning', volym: `${n(5000)} m³fub`, bolag: ' till Vida' })
    expect(s.stort).toEqual({ text: '7 dagar efter', ton: 'orange', liten: false })
    expect(s.mening).toBe(`Landar ca ${n(3300)} av ${n(5000)}`)
    expect(s.skordat).toEqual({ tal: n(2675), under: `av ${n(5000)} · på plan`, ton: 'neutral' })
    expect(s.skotat).toEqual({ tal: n(1265), under: `av ${n(5000)} · 7 dagar efter`, ton: 'orange' })
    // behöver (5 000 − 1 265) / 11 = 340, kör 184 → saknar 156.
    expect(s.flaskhals?.rubrik).toBe('Skotarna saknar 156 m³fub/dag')
    expect(s.flaskhals?.rader).toEqual(['Elephant King 2026 184 på Rövemåla AU', 'Wisent 53 på Rössmåla Ga'])
    expect('Elephant King 2026 184 på Rövemåla AU · Wisent 53 på Rössmåla Ga'.length).toBeGreaterThan(FLASKHALS_RAD_MAX_TECKEN)
    expect(s.veckan).toBe('Veckan hittills: plan 682 · skördat 697 · skotat 374')
  })

  it('på plan: grönt, ingen flaskhalsruta — även när skördat-rutan ligger efter', () => {
    const [, g] = veckolageModell(bas).spar
    // gallring: plan idag 500, (500 − 487) / 53,3 = 0,2 → på plan. Landar min(487 + 53,3 × 11, 902 + 239 + 27 × 11) = 1 073.
    expect(g.stort).toEqual({ text: 'På plan', ton: 'gron', liten: false })
    expect(g.mening).toBe(`Landar ca ${n(1100)} av ${n(1000)}`)
    expect(g.skotat).toEqual({ tal: '487', under: `av ${n(1000)} · på plan`, ton: 'neutral' })
    // Skördaren: (500 − 239) / 27,3 = 9,6 → 10 dagar efter — står i rutan, men spåret är på plan: ingen ruta.
    expect(g.skordat).toEqual({ tal: '239', under: `av ${n(1000)} · 10 dagar efter`, ton: 'orange' })
    expect(g.flaskhals).toBeNull()
    expect(g.veckan).toBe('Veckan hittills: plan 136 · skördat 88 · skotat 171')
  })

  it('före plan: grönt "N dagar före"', () => {
    const d: VeckolageData = { ...bas, spar: [spar('slutavverkning', { skotat: 3200, takt_skotat: 300, ingaende_oskotat: 2000 })] }
    const [s] = veckolageModell(d).spar
    // (2 500 − 3 200) / 300 = −2,3 → 2 dagar före.
    expect(s.stort).toEqual({ text: '2 dagar före', ton: 'gron', liten: false })
    expect(s.skotat.under).toBe(`av ${n(5000)} · 2 dagar före`)
  })

  it('inga objekt: dämpat stort tal, meningen säger varför, inga lägen i rutorna, ingen flaskhals', () => {
    const [, g] = veckolageModell({ ...bas, planerade: { slutavverkning: 5, gallring: 0 } }).spar
    expect(g.stort).toEqual({ text: 'Inga objekt', ton: 'dampad', liten: false })
    expect(g.mening).toBe('Skotat 487 · skotar ut föregående månad · skördaren har inget planerat')
    expect(g.skordat).toEqual({ tal: '239', under: `av ${n(1000)}`, ton: 'neutral' })
    expect(g.skotat).toEqual({ tal: '487', under: `av ${n(1000)}`, ton: 'neutral' })
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

  it('skördaren efter i stället för skotaren: oskotat under en dags skotning → Skördarna, skördat-rutan orange', () => {
    // skördat 1 300, skotat 1 265: oskotat 35 < 184 → skotaren har inget att hämta, skördaren ligger efter.
    const d: VeckolageData = { ...bas, spar: [spar('slutavverkning', { skordat: 1300 })] }
    const [s] = veckolageModell(d).spar
    expect(s.stort.text).toBe('7 dagar efter')
    // (2 500 − 1 300) / 277,4 = 4,3 → 4 dagar efter för skördaren.
    expect(s.skordat).toEqual({ tal: n(1300), under: `av ${n(5000)} · 4 dagar efter`, ton: 'orange' })
    // behöver (5 000 − 1 300) / 11 = 336, kör 277 → saknar 59.
    expect(s.flaskhals?.rubrik).toBe('Skördarna saknar 59 m³fub/dag')
    expect(s.flaskhals?.rader).toEqual(['Ponsse Scorpion 277 på Hallaslätt AU', 'Rottne H8E -26 27 på Betet gallring'])
    // Landar begränsas av vad som finns att skota: 912 + 1 300 + 277 × 11 = 5 264 → min(1 265 + 184 × 11 = 3 288, 5 264).
    expect(s.mening).toBe(`Landar ca ${n(3300)} av ${n(5000)}`)
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

  it('takten räcker fast spåret ligger efter: "kör … · behöver …" i stället för "saknar"', () => {
    const d: VeckolageData = { ...bas, spar: [spar('slutavverkning', { skotat: 1800, takt_skotat: 320, ingaende_oskotat: 2000 })] }
    const [s] = veckolageModell(d).spar
    // (2 500 − 1 800) / 320 = 2,2 → efter; behöver (5 000 − 1 800) / 11 = 291 < 320.
    expect(s.stort.text).toBe('2 dagar efter')
    expect(s.flaskhals?.rubrik).toBe('Skotarna kör 320/dag · behöver 291')
  })

  it('utan beställning men med produktion: bara talen; utan både → spåret visas inte', () => {
    const d: VeckolageData = { ...bas, spar: [spar('slutavverkning', {}), spar('gallring', { bas: 'totalt', bestallt: 0, skordat: 239, skotat: 486.5 })] }
    const [, g] = veckolageModell(d).spar
    expect(g.rubrik).toEqual({ typNamn: 'Gallring', volym: null, bolag: ' · ingen beställning' })
    expect(g.stort).toEqual({ text: 'Ingen beställning', ton: 'dampad', liten: true })
    expect(g.mening).toBe('Skördat 239 · skotat 487')
    expect(g.skordat.under).toBeNull()
    expect(g.skotat.under).toBeNull()
    expect(g.flaskhals).toBeNull()
    expect(g.veckan).toBe('Veckan hittills: skördat 88 · skotat 171')
    const tom: VeckolageData = { ...bas, spar: [spar('slutavverkning', {}), spar('gallring', { bas: 'totalt', bestallt: 0, skordat: 0, skotat: 0 })] }
    expect(veckolageModell(tom).spar.map(s => s.typ)).toEqual(['slutavverkning'])
  })

  it('före prognosdag 4: dämpad text, inga lägen, ingen flaskhals', () => {
    const d: VeckolageData = {
      ...bas, idag: '2026-09-02', isovecka: 36, vecka_gangna: 2, dagar_tom_idag: sept.slice(0, 2),
      dagar: { maskin_id: null, totalt: 22, gangna: 1, kvar: 21, gangna_datum: sept.slice(0, 1), kvar_datum: [] },
      spar: bas.spar.map(s => ({ ...s, takt_dagar: 1 })),
    }
    const m = veckolageModell(d)
    expect(m.datumRad).toBe('Onsdag 2 sep · vecka 36 · 21 arbetsdagar kvar')
    expect(m.spar[0].stort).toEqual({ text: 'Prognos från dag 4', ton: 'dampad', liten: true })
    expect(m.spar[0].mening).toBe(`Skotat ${n(1265)} av ${n(5000)}`)
    expect(m.spar[0].skotat.under).toBe(`av ${n(5000)}`)
    expect(m.spar[0].flaskhals).toBeNull()
  })
})
