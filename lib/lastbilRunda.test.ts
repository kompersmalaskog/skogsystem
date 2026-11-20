// Rund-state-maskinen mot en minnes-databas. Fallen är de verkliga ur lastbil_logg
// och flyttdag (augusti–september 2026):
//   • dubbelrundorna 20 aug, 28 aug och 1 sep: "Framme på LBC" tryckt medan bilen
//     fortfarande var ute → cron:en öppnade en ny runda vid ursprungsavfärden;
//   • 514d88e1 (12 aug): säkerhetsnätet gav en runda sluttid ÄLDRE än dess start.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { koraRundlogik } from './lastbilRunda'

type Row = Record<string, any>
const BAS = { lat: 56.4591, lng: 14.7011 }
const VIN = 'YS2R6X40002175652'

const pt = (tid: string, distM: number, odoM: number, kmh = 0, bransleMl: number | null = null): Row => ({
  vin: VIN, tidpunkt: tid, lat: BAS.lat + distM / 111320, lng: BAS.lng,
  hastighet: kmh, odometer_m: odoM, bransle_ml: bransleMl,
})

/** Minimal kedjebar PostgREST-fake: bara de anrop lastbilRunda gör. */
function fakeDb(tables: Record<string, Row[]>, opts: { gtFel?: boolean } = {}) {
  const inserts: Row[] = []
  const updates: { id: string; patch: Row }[] = []
  let nyId = 0
  const ms = (v: any) => Date.parse(v)

  class Q {
    private filters: ((r: Row) => boolean)[] = []
    private sort: { col: string; asc: boolean } | null = null
    private lim: number | null = null
    private mode: 'select' | 'insert' | 'update' = 'select'
    private patch: Row | null = null
    private ny: Row | null = null
    private head = false
    private enda = false
    private harGt = false
    constructor(private t: string) {}
    select(_c?: string, o?: { head?: boolean }) { this.head = !!o?.head; return this }
    insert(r: Row) { this.mode = 'insert'; this.ny = r; return this }
    update(p: Row) { this.mode = 'update'; this.patch = p; return this }
    is(c: string, v: null) { this.filters.push(r => (r[c] ?? null) === v); return this }
    not(c: string, _op: string, _v: null) { this.filters.push(r => r[c] != null); return this }
    eq(c: string, v: any) { this.filters.push(r => r[c] === v); return this }
    gte(c: string, v: any) { this.filters.push(r => r[c] != null && ms(r[c]) >= ms(v)); return this }
    gt(c: string, v: any) { this.harGt = true; this.filters.push(r => r[c] != null && ms(r[c]) > ms(v)); return this }
    or(s: string) {
      const delar = s.split(',').map(d => d.split('.'))   // ['vin','eq','X'] | ['vin','is','null']
      this.filters.push(r => delar.some(([c, op, v]) => op === 'eq' ? r[c] === v : (r[c] ?? null) === null))
      return this
    }
    order(c: string, o?: { ascending?: boolean }) { this.sort = { col: c, asc: o?.ascending !== false }; return this }
    limit(n: number) { this.lim = n; return this }
    maybeSingle() { this.enda = true; return this }
    private kor(): { data: any; error: any; count?: number } {
      const rader = tables[this.t] ?? (tables[this.t] = [])
      if (this.mode === 'insert') {
        const rad = { id: `ny${++nyId}`, sluttid: null, ...this.ny }
        rader.push(rad); inserts.push(rad)
        return { data: [{ id: rad.id }], error: null }
      }
      let t = rader.filter(r => this.filters.every(f => f(r)))
      if (this.mode === 'update') {
        t.forEach(r => { Object.assign(r, this.patch); updates.push({ id: r.id, patch: this.patch! }) })
        return { data: null, error: null }
      }
      if (this.t === 'flyttdag' && this.harGt && opts.gtFel) return { data: null, error: { message: 'boom' } }
      if (this.sort) {
        const { col, asc } = this.sort
        t = [...t].sort((a, b) => (ms(a[col]) - ms(b[col])) * (asc ? 1 : -1))
      }
      if (this.lim != null) t = t.slice(0, this.lim)
      if (this.head) return { data: null, error: null, count: t.length }
      return { data: this.enda ? (t[0] ?? null) : t, error: null }
    }
    then(res: (v: any) => any, rej?: (e: any) => any) {
      try { return Promise.resolve(this.kor()).then(res, rej) } catch (e) { return Promise.reject(e).then(res, rej) }
    }
  }
  return { db: { from: (t: string) => new Q(t) }, tables, inserts, updates }
}

const bil = { vin: VIN, aktiv: true, hemmabas_lat: BAS.lat, hemmabas_lng: BAS.lng, hemmabas_radie_m: 300 }
const nu = (iso: string) => vi.setSystemTime(new Date(iso))

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('auto-öppning: kedjeregeln (dubbelrundorna aug–sep 2026)', () => {
  // 28 aug: avfärd 08:00:06, förarens "Framme" 10:14:15 med bilen 13,8 km från basen.
  const punkter = () => [
    pt('2026-08-28T07:59:00Z', 40, 298_764_000),
    pt('2026-08-28T08:00:06Z', 250, 298_764_380),          // avfärd: sista punkten i radien
    pt('2026-08-28T08:45:00Z', 5000, 298_800_000, 60),
    pt('2026-08-28T10:09:13Z', 13784, 298_835_160, 4),
    pt('2026-08-28T10:10:31Z', 13794, 298_835_240, 0, 100_000),
    pt('2026-08-28T10:15:30Z', 12000, 298_838_000, 70),    // rör sig efter stängningen
  ]
  const stangd = () => ({
    id: 'manuell', vin: VIN, auto_skapad: false, starttid: '2026-08-28T08:00:06Z', sluttid: '2026-08-28T10:14:15Z', status: 'avslutad',
  })

  it('fortsättningen börjar vid förra rundans slut, inte vid ursprungsavfärden', async () => {
    const f = fakeDb({ lastbil: [bil], flyttdag: [stangd()], lastbil_logg: punkter(), maskin_flytt: [] })
    nu('2026-08-28T10:20:00Z')
    const r = await koraRundlogik(f.db)
    expect(r.atgard).toBe('oppnade')
    expect(f.inserts).toHaveLength(1)
    expect(Date.parse(f.inserts[0].starttid)).toBe(Date.parse('2026-08-28T10:14:15Z'))
    expect(f.inserts[0].start_odometer_m).toBe(298_835_240)         // senaste punkten vid/före sluttiden
    expect(f.inserts[0].start_odometer_tid).toBe('2026-08-28T10:10:31Z')
    expect(f.inserts[0].odometer_stale).toBe(false)
  })

  it('kilometerna läggs ihop utan dubbelräkning och rundorna överlappar aldrig', async () => {
    const f = fakeDb({ lastbil: [bil], flyttdag: [stangd()], lastbil_logg: punkter(), maskin_flytt: [] })
    nu('2026-08-28T10:20:00Z')
    await koraRundlogik(f.db)
    // Bilen ankommer och står still 35+ min
    f.tables.lastbil_logg.push(pt('2026-08-28T10:32:13Z', 84, 298_854_510, 0, 108_000))
    nu('2026-08-28T11:10:00Z')
    const r = await koraRundlogik(f.db)
    expect(r.atgard).toBe('stangde')
    const [a, b] = f.tables.flyttdag
    expect(b.matare_km).toBe(19.3)                                  // 298 854 510 − 298 835 240 m, inte 90,1
    expect(b.bransle_l).toBe(8)
    expect(b.status).toBe('ovrig_korning')
    expect(Date.parse(b.starttid)).toBeGreaterThanOrEqual(Date.parse(a.sluttid))
    expect(Date.parse(b.sluttid)).toBeGreaterThanOrEqual(Date.parse(b.starttid))
  })

  it('1 sep: två "Framme" mitt i utekörningen ger kedja, inte tre överlappande rundor', async () => {
    const logg = [
      pt('2026-09-01T03:49:00Z', 40, 298_942_000),
      pt('2026-09-01T03:50:03Z', 100, 298_942_160),
      pt('2026-09-01T03:51:46Z', 250, 298_942_410),
      pt('2026-09-01T05:00:00Z', 30000, 298_990_000, 80),
      pt('2026-09-01T06:56:56Z', 39945, 299_034_550, 7),
      pt('2026-09-01T07:11:50Z', 40374, 299_035_210, 0),
    ]
    const f = fakeDb({
      lastbil: [bil], lastbil_logg: logg, maskin_flytt: [],
      flyttdag: [{ id: 'a', vin: VIN, auto_skapad: false, starttid: '2026-09-01T03:50:03Z', sluttid: '2026-09-01T07:06:20.703Z' }],
    })
    nu('2026-09-01T07:12:00Z')
    const r = await koraRundlogik(f.db)
    expect(r.atgard).toBe('oppnade')
    expect(Date.parse(f.inserts[0].starttid)).toBe(Date.parse('2026-09-01T07:06:20.703Z'))
  })

  it('bilen stilla utanför radien sedan "Framme" → ingen ny runda (inget att räkna)', async () => {
    const logg = [
      pt('2026-08-20T04:04:46Z', 250, 298_241_850),
      pt('2026-08-20T05:00:17Z', 9499, 298_265_020),
      pt('2026-08-20T05:42:01Z', 604, 298_283_340),            // 600 m ute, utanför 300 m
    ]
    const f = fakeDb({
      lastbil: [bil], lastbil_logg: logg, maskin_flytt: [],
      flyttdag: [{ id: 'a', vin: VIN, auto_skapad: false, starttid: '2026-08-20T04:04:46Z', sluttid: '2026-08-20T05:44:30.470Z' }],
    })
    nu('2026-08-20T05:50:00Z')
    const r = await koraRundlogik(f.db)
    expect(r.atgard).toBe('inget')
    expect(f.inserts).toHaveLength(0)
  })

  it('ingen tidigare runda → start = avfärd, som förut', async () => {
    const f = fakeDb({ lastbil: [bil], flyttdag: [], lastbil_logg: punkter(), maskin_flytt: [] })
    nu('2026-08-28T10:20:00Z')
    await koraRundlogik(f.db)
    expect(Date.parse(f.inserts[0].starttid)).toBe(Date.parse('2026-08-28T08:00:06Z'))
    expect(f.inserts[0].start_odometer_m).toBe(298_764_380)
  })

  it('förra rundan slutade FÖRE avfärden (bilen var hemma emellan) → start = avfärd', async () => {
    const gammal = { id: 'g', vin: VIN, auto_skapad: true, starttid: '2026-08-28T03:00:00Z', sluttid: '2026-08-28T06:00:00Z' }
    const f = fakeDb({ lastbil: [bil], flyttdag: [gammal], lastbil_logg: punkter(), maskin_flytt: [] })
    nu('2026-08-28T10:20:00Z')
    await koraRundlogik(f.db)
    expect(Date.parse(f.inserts[0].starttid)).toBe(Date.parse('2026-08-28T08:00:06Z'))
  })

  it('kan de stängda rundorna inte läsas öppnas ingen runda (hellre inget än en dubblett)', async () => {
    const f = fakeDb({ lastbil: [bil], flyttdag: [stangd()], lastbil_logg: punkter(), maskin_flytt: [] }, { gtFel: true })
    nu('2026-08-28T10:20:00Z')
    const r = await koraRundlogik(f.db)
    expect(r.atgard).toBe('fel')
    expect(f.inserts).toHaveLength(0)
  })

  it('en annan bils runda räknas inte som täckning', async () => {
    const annan = { ...stangd(), vin: 'ANNAN-VIN' }
    const f = fakeDb({ lastbil: [bil], flyttdag: [annan], lastbil_logg: punkter(), maskin_flytt: [] })
    nu('2026-08-28T10:20:00Z')
    await koraRundlogik(f.db)
    expect(Date.parse(f.inserts[0].starttid)).toBe(Date.parse('2026-08-28T08:00:06Z'))
  })
})

describe('säkerhetsnätet: sluttid aldrig före start (514d88e1, 12 aug 2026)', () => {
  // Bilen står parkerad sedan 11 aug (en fryst punkt). Föraren startar en runda
  // på basen 12 aug 18:33 och rör sig aldrig.
  const frusen = () => [
    pt('2026-08-11T10:43:30Z', 80, 297_926_400, 0, 5_000_000),
    pt('2026-08-11T11:15:43Z', 80, 297_926_400, 0, 5_000_100),
  ]
  const manuell = () => ({
    id: 'dag', vin: VIN, auto_skapad: false, starttid: '2026-08-12T18:33:09.684Z', sluttid: null,
    start_odometer_m: 297_926_400, start_odometer_tid: '2026-08-11T11:15:43Z',
    hemresa_start_tid: null, hemresa_start_odometer_m: null, status: 'pagaende',
  })

  it('stänger med sluttid = starttid, 0 km, ingen påhittad hemresa och ingen negativ förbrukning', async () => {
    const f = fakeDb({ lastbil: [bil], flyttdag: [manuell()], lastbil_logg: frusen(), maskin_flytt: [] })
    nu('2026-08-12T21:00:00Z')                                      // 147 min efter start
    const r = await koraRundlogik(f.db)
    expect(r.atgard).toBe('stangde')
    const d = f.tables.flyttdag[0]
    expect(Date.parse(d.sluttid)).toBeGreaterThanOrEqual(Date.parse(d.starttid))
    expect(Date.parse(d.sluttid)).toBe(Date.parse('2026-08-12T18:33:09.684Z'))
    expect(d.matare_km).toBe(0)
    expect(d.bransle_l).toBeNull()                                  // −0,1 l är mätarbrus, inte förbrukning
    expect(d.hem_km).toBeNull()                                     // hemresan byggde på punkter från 11 aug
    expect(d.total_tid_min).toBe(0)
    expect(d.auto_avslutad_av).toBe('cron_sakerhetsnat')
  })

  it('väntar 2 h från RUNDANS START, inte från den gamla ankomsten', async () => {
    const f = fakeDb({ lastbil: [bil], flyttdag: [manuell()], lastbil_logg: frusen(), maskin_flytt: [] })
    nu('2026-08-12T19:00:00Z')                                      // 27 min efter start
    const r = await koraRundlogik(f.db)
    expect(r.atgard).toBe('manuell_orord')
    expect(f.updates).toHaveLength(0)
  })

  it('regression: en runda som verkligen körde stängs fortfarande vid ankomsten', async () => {
    const logg = [
      pt('2026-08-12T07:59:00Z', 40, 100_000_000),
      pt('2026-08-12T09:00:00Z', 20000, 100_040_000, 70),
      pt('2026-08-12T10:00:00Z', 90, 100_080_000, 0, 9_000_000),
    ]
    const dag = { id: 'dag', vin: VIN, auto_skapad: false, starttid: '2026-08-12T08:00:00Z', sluttid: null,
      start_odometer_m: 100_000_000, start_odometer_tid: '2026-08-12T07:59:00Z', hemresa_start_tid: null, hemresa_start_odometer_m: null }
    const f = fakeDb({ lastbil: [bil], flyttdag: [dag], lastbil_logg: logg, maskin_flytt: [] })
    nu('2026-08-12T12:30:00Z')
    const r = await koraRundlogik(f.db)
    expect(r.atgard).toBe('stangde')
    expect(Date.parse(f.tables.flyttdag[0].sluttid)).toBe(Date.parse('2026-08-12T10:00:00Z'))
    expect(f.tables.flyttdag[0].matare_km).toBe(80)
    expect(f.tables.flyttdag[0].hem_km).toBe(40)                    // sista benet in i radien är fortfarande mätt
  })
})
