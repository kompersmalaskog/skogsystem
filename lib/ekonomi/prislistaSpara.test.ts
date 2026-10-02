import { describe, it, expect } from 'vitest'
import {
  maskinRadFranDb, arMaskinSmutsig, sparaMaskinRad, sparaAllaSmutsiga, sparaSammanfattning,
  slaIhopEfterSpar, rebaseMaskin, timprisDel,
  terrangSnapshot, arTerrangSmutsig, sparaTerrangRad, ovrigtSnapshot, arOvrigtSmutsig,
  acordSnapshot, avstandSnapshot, type MaskinRad,
} from './prislistaSpara'

// Prislistan: "man ska aldrig tro att något är sparat som inte är det".
// Tester för de två buggarna (tyst dataförlust vid spar, förval som ser ut
// som sparat) mot en INSPELAD supabase-klient — ingen databas rörs.

let lid = 0
const nyLid = () => `t${++lid}`
const FORSLAG = { skordare: 400, skotare: 300 }
const rad = (id: string, dim: Record<string, unknown> = {}): MaskinRad => maskinRadFranDb(
  { id: `tp-${id}`, maskin_id: id, maskin_namn: id, timpris: 1000, giltig_fran: '2026-08-10' },
  { maskin_typ: 'Harvester', vardeminskning_kr_per_g15h: 400, sald: false, sald_datum: null, forestlink: true, ...dim } as any,
  nyLid, FORSLAG,
)

/** Inspelad klient; dimFel/dimTraff styr hur dim_maskin-skrivningen går. */
function mock(opt: { dimFel?: Record<string, string>; dimTraff?: (k: string) => boolean } = {}) {
  const logg: any[] = []
  const from = (tabell: string) => {
    const s: any = { tabell, op: null, data: null, filter: [] as any[] }
    const b: any = {
      update(d: any) { s.op = 'update'; s.data = d; return b },
      insert(d: any) { s.op = 'insert'; s.data = d; logg.push({ ...s }); return Promise.resolve({ error: null }) },
      eq(c: string, v: any) { s.filter.push([c, v]); return b },
      is(c: string, v: any) { s.filter.push([c, v]); return b },
      not() { return b },
      select() {
        logg.push({ ...s })
        const key = s.filter.find((f: any) => f[0] === 'maskin_id')?.[1]
        if (opt.dimFel?.[key]) return Promise.resolve({ data: null, error: { message: opt.dimFel[key] } })
        if (opt.dimTraff && !opt.dimTraff(key)) return Promise.resolve({ data: [], error: null })
        return Promise.resolve({ data: [{ maskin_id: key, ...s.data }], error: null })
      },
      then(res: any) { logg.push({ ...s }); return Promise.resolve({ error: null }).then(res) },
    }
    return b
  }
  return { klient: { from } as any, logg }
}
const ops = (logg: any[], t: string) => logg.filter(x => x.tabell === t)

describe('härledd smutsighet — aldrig en klibbig flagga', () => {
  it('orörd rad är inte smutsig; ändrad är det; tillbakasatt är det inte längre', () => {
    const m = rad('A')
    expect(arMaskinSmutsig(m)).toBe(false)
    expect(arMaskinSmutsig({ ...m, vardeminskning_kr_per_g15h: 401 })).toBe(true)
    expect(arMaskinSmutsig({ ...m, vardeminskning_kr_per_g15h: 400 })).toBe(false)
    expect(arMaskinSmutsig({ ...m, isNew: true })).toBe(true)
  })
  it('maskin som saknas i dim_maskin: dim-fälten räknas inte som ändring', () => {
    const m = maskinRadFranDb({ maskin_id: 'X', maskin_namn: 'X', timpris: 5, giltig_fran: null }, undefined, nyLid, FORSLAG)
    expect(arMaskinSmutsig({ ...m, forestlink: true })).toBe(false)
  })
  it('en BORTTAGEN rad i en hel uppsättning räknas som ändring (var osynlig förut)', () => {
    const rader = [
      { medelstam: 0.3, pris_total: 100, pris_skordare: 60, pris_skotare: 40 },
      { medelstam: 0.4, pris_total: 110, pris_skordare: 65, pris_skotare: 45 },
    ]
    expect(acordSnapshot(rader.slice(0, 1))).not.toBe(acordSnapshot(rader))
    expect(acordSnapshot([{ ...rader[0], pris_total: '100' as any }, rader[1]])).toBe(acordSnapshot(rader))
  })
  it('formel-config: tom (ej satt) skiljs från satt', () => {
    expect(avstandSnapshot({ grundavstand_m: '', kr_per_100m: '' })).not.toBe(avstandSnapshot({ grundavstand_m: 200, kr_per_100m: 4 }))
  })
})

describe('förval ser inte ut som sparat (bug 2)', () => {
  it('NULL i databasen blir ett TOMT fält, förslaget följer bara med som placeholder', () => {
    const h = rad('H', { vardeminskning_kr_per_g15h: null })
    const f = rad('F', { vardeminskning_kr_per_g15h: null, maskin_typ: 'Forwarder' })
    expect(h.vardeminskning_kr_per_g15h).toBe('')
    expect(f.vardeminskning_kr_per_g15h).toBe('')
    expect(h.forslagVm).toBe(400)
    expect(f.forslagVm).toBe(300)
  })
  it('ett satt värde visas som värde, och 0 är ett satt värde', () => {
    expect(rad('S', { vardeminskning_kr_per_g15h: 250 }).vardeminskning_kr_per_g15h).toBe(250)
    expect(rad('Z', { vardeminskning_kr_per_g15h: 0 }).vardeminskning_kr_per_g15h).toBe(0)
  })
  it('NULL och tomt fält ger samma ögonblicksbild — ingen falsk smutsighet', () => {
    expect(arMaskinSmutsig(rad('B', { vardeminskning_kr_per_g15h: null }))).toBe(false)
  })
  it('en Spara skriver ALDRIG in förvalet: bara timpris ändrat → dim_maskin rörs inte', async () => {
    const m = { ...rad('N', { vardeminskning_kr_per_g15h: null }), timpris: 1100 }
    const { klient, logg } = mock()
    expect((await sparaMaskinRad(klient, m, [m])).ok).toBe(true)
    expect(ops(logg, 'dim_maskin').some(x => x.op === 'update')).toBe(false)
  })
  it('FL ändrat men vm fortfarande NULL → skrivningen bär NULL, inte 400', async () => {
    const m = { ...rad('N2', { vardeminskning_kr_per_g15h: null }), forestlink: false }
    const { klient, logg } = mock()
    await sparaMaskinRad(klient, m, [m])
    const upd = ops(logg, 'dim_maskin').find(x => x.op === 'update')
    expect(upd.data.vardeminskning_kr_per_g15h).toBeNull()
    expect(upd.data.forestlink).toBe(false)
  })
})

describe('versionskontraktet för timpris är orört', () => {
  it('ändrat timpris: avslutar gamla raden FÖRE insert, ny version giltig_fran=idag', async () => {
    const m = { ...rad('V'), timpris: 1300 }
    const { klient, logg } = mock()
    await sparaMaskinRad(klient, m, [m])
    const tp = ops(logg, 'maskin_timpris')
    expect(tp[0].op).toBe('update')
    expect(tp[0].data.giltig_till).toBeTruthy()
    expect(tp[1].op).toBe('insert')
    expect(tp[1].data).toMatchObject({ timpris: 1300, giltig_till: null })
    expect(tp[1].data.giltig_fran).toMatch(/^\d{4}-\d\d-\d\d$/)
  })
  it('bara värdeminskning ändrad → INGEN ny timpris-version (förut skapades en med giltig_fran=idag)', async () => {
    const m = { ...rad('W'), vardeminskning_kr_per_g15h: 450 }
    const { klient, logg } = mock()
    await sparaMaskinRad(klient, m, [m])
    expect(ops(logg, 'maskin_timpris')).toHaveLength(0)
    expect(ops(logg, 'dim_maskin').some(x => x.op === 'update' && x.data.vardeminskning_kr_per_g15h === 450)).toBe(true)
  })
  it('dim_maskin träffar 0 rader (RLS) → fel med "Timpris sparat, men …" — delvis fel syns, aldrig tyst', async () => {
    const m = { ...rad('P'), timpris: 1400, vardeminskning_kr_per_g15h: 500 }
    const { klient } = mock({ dimTraff: () => false })
    const res = await sparaMaskinRad(klient, m, [m])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.fel).toMatch(/^Timpris sparat, men värdeminskning\/FL/)
  })
  it('ny rad med ett id som redan finns avvisas (inga dubbletter av öppna rader)', async () => {
    const dup = { ...rad('D'), isNew: true, basTp: '', basDim: '' }
    const { klient } = mock()
    const res = await sparaMaskinRad(klient, dup, [rad('D'), dup])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.fel).toMatch(/finns redan/)
  })
})

describe('spara alla smutsiga rader i ett svep (bug 1)', () => {
  it('tre ändrade maskiner sparas i ETT anrop; den orörda rörs inte', async () => {
    const a = { ...rad('A1'), vardeminskning_kr_per_g15h: 401 }
    const b = { ...rad('B1'), vardeminskning_kr_per_g15h: 402 }
    const c = { ...rad('C1'), forestlink: false }
    const alla = [a, b, c, rad('O1')]
    const { klient, logg } = mock()
    const res = await sparaAllaSmutsiga(alla, arMaskinSmutsig, r => sparaMaskinRad(klient, r, alla))
    expect(res).toMatchObject({ antalSmutsiga: 3 })
    expect(res.lyckade).toHaveLength(3)
    expect(res.misslyckade).toHaveLength(0)
    const skrivna = ops(logg, 'dim_maskin').filter(x => x.op === 'update').map(x => x.filter[0][1]).sort()
    expect(skrivna).toEqual(['A1', 'B1', 'C1'])
    expect(sparaSammanfattning(3, 0, 'maskin', 'maskiner').text).toBe('3 maskiner sparade')
    expect(sparaSammanfattning(1, 0, 'maskin', 'maskiner').text).toBe('1 maskin sparad')
  })
  it('ett fel i mitten avbryter inte resten — den misslyckade rapporteras', async () => {
    const mk = (id: string, v: number) => ({ ...rad(id), vardeminskning_kr_per_g15h: v })
    const alla = [mk('A2', 411), mk('B2', 412), mk('C2', 413)]
    const { klient } = mock({ dimFel: { B2: 'permission denied' } })
    const res = await sparaAllaSmutsiga(alla, arMaskinSmutsig, r => sparaMaskinRad(klient, r, alla))
    expect(res.lyckade.map(r => r.maskin_id)).toEqual(['A2', 'C2'])
    expect(res.misslyckade).toHaveLength(1)
    expect(res.misslyckade[0].rad.maskin_id).toBe('B2')
    expect(sparaSammanfattning(2, 1, 'maskin', 'maskiner')).toEqual({ text: '2 sparade, 1 misslyckades — se markerade rader', fel: true })
    expect(sparaSammanfattning(0, 2, 'maskin', 'maskiner').text).toMatch(/^Ingen sparades, 2 misslyckades/)
  })
  it('ett kastat undantag avbryter inte heller', async () => {
    const mk = (id: string) => ({ ...rad(id), vardeminskning_kr_per_g15h: 421 })
    const res = await sparaAllaSmutsiga([mk('A3'), mk('B3')], arMaskinSmutsig, async r => {
      if (r.maskin_id === 'A3') throw new Error('nätverk')
      return { ok: true as const }
    })
    expect(res.lyckade).toHaveLength(1)
    expect(res.misslyckade[0].fel).toBe('nätverk')
  })
})

describe('sammanslagning efter spar — ingen tyst dataförlust', () => {
  const nyckel = (r: MaskinRad) => r.maskin_id.trim()
  it('landade rader ersätts av databasen; MISSLYCKADE behåller sina osparade värden, smutsiga och felmarkerade', () => {
    const lokalA = { ...rad('A4'), vardeminskning_kr_per_g15h: 431 }
    const lokalC = { ...rad('C4'), vardeminskning_kr_per_g15h: 433 }
    const nyRad = { ...rad('N4'), isNew: true, basTp: '', basDim: '', maskin_namn: '', timpris: '' as const }
    const fresh = [rad('A4', { vardeminskning_kr_per_g15h: 431 }), rad('B4'), rad('C4')]
    const mis = new Map([[lokalC.lid, 'permission denied'], [nyRad.lid, 'Fyll i maskin-ID, namn och ett pris > 0']])
    const ut = slaIhopEfterSpar({ fresh, lokala: [lokalA, rad('B4'), lokalC, nyRad], misslyckade: mis, nyckel, rebase: rebaseMaskin })
    const C = ut.find(r => r.maskin_id === 'C4')!
    expect(arMaskinSmutsig(ut.find(r => r.maskin_id === 'A4')!)).toBe(false)
    expect(C.vardeminskning_kr_per_g15h).toBe(433)
    expect(arMaskinSmutsig(C)).toBe(true)
    expect(C.fel).toBe('permission denied')
    expect(ut.some(r => r.isNew && arMaskinSmutsig(r) && r.fel?.startsWith('Fyll i'))).toBe(true)
    expect(ut).toHaveLength(4)
  })
  it('omförsök efter delvis fel skriver INGEN ny timpris-version (stänger inte dagens egen rad med omvänt intervall)', async () => {
    const lokal = { ...rad('E4'), timpris: 1500, vardeminskning_kr_per_g15h: 450 }
    const fresh = rad('E4', { vardeminskning_kr_per_g15h: 400 })
    fresh.timpris = 1500
    fresh.basTp = timprisDel(fresh)                      // databasen har nu det nya timpriset
    const ut = slaIhopEfterSpar({ fresh: [fresh], lokala: [lokal], misslyckade: new Map([[lokal.lid, 'dim fel']]), nyckel, rebase: rebaseMaskin })
    const { klient, logg } = mock()
    await sparaMaskinRad(klient, ut[0], ut)
    expect(ops(logg, 'maskin_timpris')).toHaveLength(0)
    expect(ops(logg, 'dim_maskin').some(x => x.op === 'update' && x.data.vardeminskning_kr_per_g15h === 450)).toBe(true)
  })
})

describe('terräng och övrigt — samma mönster', () => {
  it('terräng: bara ändrad rad är smutsig och sparas (versionerad: update + insert)', async () => {
    const t = (namn: string, v: number) => { const r: any = { lid: nyLid(), namn, tillagg_kr_per_m3fub: v, giltig_fran: '2026-01-01', bas: '' }; r.bas = terrangSnapshot(r); return r }
    const a = t('Svår', 5), b = t('Lätt', 1)
    const andrad = { ...a, tillagg_kr_per_m3fub: 6 }
    expect(arTerrangSmutsig(andrad)).toBe(true)
    expect(arTerrangSmutsig(b)).toBe(false)
    const { klient, logg } = mock()
    const res = await sparaAllaSmutsiga([andrad, b], arTerrangSmutsig, r => sparaTerrangRad(klient, r, [andrad, b]))
    expect(res.lyckade).toHaveLength(1)
    expect(ops(logg, 'acord_terrang').map(x => x.op)).toEqual(['update', 'insert'])
  })
  it('övrigt: ändrat värde är smutsigt, tillbakasatt är det inte', () => {
    const o: any = { lid: nyLid(), nyckel: 'k', beskrivning: 'B', varde: 8, enhet: 'kr', giltig_fran: '2026-01-01', bas: '' }
    o.bas = ovrigtSnapshot(o)
    expect(arOvrigtSmutsig({ ...o, varde: 9 })).toBe(true)
    expect(arOvrigtSmutsig({ ...o, varde: 8 })).toBe(false)
  })
})
