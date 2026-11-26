import { describe, it, expect } from 'vitest'
import {
  tomLassSumma, laggTillLass, adderaLassSumma, appMark, snittAvstandM, avstandNot, g15PerDag, kvotUnderlag, kvotVolymUrDagar, tidNot,
  kvotPerTimme, RPC_LASS, RPC_LASS_SENASTE, type SkotarLassRad,
} from './skotarlass'

const opti = (v: number, kor: number | null = 640): Pick<SkotarLassRad, 'volym_m3sub' | 'korstracka_m' | 'kalla' | 'skalad'> =>
  ({ volym_m3sub: v, korstracka_m: kor, kalla: 'opti', skalad: false })
const app = (v: number, skalad = false): Pick<SkotarLassRad, 'volym_m3sub' | 'korstracka_m' | 'kalla' | 'skalad'> =>
  ({ volym_m3sub: v, korstracka_m: null, kalla: 'app', skalad })

describe('RPC:erna', () => {
  it('maskinvyn läser lass ur maskindata_lass_alla (Opti + appen), aldrig de gamla som bara ser Opti', () => {
    expect(RPC_LASS).toBe('maskindata_lass_alla')
    expect(RPC_LASS_SENASTE).toBe('maskindata_lass_senaste_alla')
  })
})

describe('laggTillLass — summor över Opti- och app-lass', () => {
  it('Opti-lass: volym, lass och körsträcka; inget app-märke', () => {
    const s = tomLassSumma()
    laggTillLass(s, opti(20)); laggTillLass(s, opti(10, 400))
    expect(s).toEqual({ volym: 30, lass: 2, distSum: 1040, distN: 2, appLass: 0, appOskalade: 0 })
  })

  it('app-lass räknas i volym och lass men har inget mått (distN räknas inte upp)', () => {
    const s = tomLassSumma()
    laggTillLass(s, opti(20)); laggTillLass(s, app(20)); laggTillLass(s, app(20, true))
    expect(s.lass).toBe(3)
    expect(s.volym).toBe(60)
    expect(s.distN).toBe(1)
    expect(s.appLass).toBe(2)
    expect(s.appOskalade).toBe(1)
  })

  it('ett mått på 0 m är ett mått (inte "saknas") — null är det som saknas', () => {
    const s = tomLassSumma()
    laggTillLass(s, opti(5, 0))
    expect(s.distN).toBe(1)
  })

  it('adderaLassSumma lägger ihop dagar till vecka/månad', () => {
    const a = tomLassSumma(); laggTillLass(a, opti(10)); laggTillLass(a, app(5))
    const b = tomLassSumma(); laggTillLass(b, app(7, true))
    const t = tomLassSumma(); adderaLassSumma(t, a); adderaLassSumma(t, b)
    expect(t).toEqual({ volym: 22, lass: 3, distSum: 640, distN: 1, appLass: 2, appOskalade: 1 })
  })
})

describe('appMark — "uppskattad" och "skalad"', () => {
  it('rent Opti: inget märke', () => expect(appMark({ appLass: 0, appOskalade: 0 })).toBeNull())
  it('app-lass som inte är skalade: "uppskattad"', () => expect(appMark({ appLass: 3, appOskalade: 3 })).toBe('uppskattad'))
  it('alla app-lass skalade (Färdigskotad): "skalad"', () => expect(appMark({ appLass: 3, appOskalade: 0 })).toBe('skalad'))
  it('blandat skalat och oskalat: "uppskattad" (en del är förarens egen siffra rakt av)', () => expect(appMark({ appLass: 3, appOskalade: 1 })).toBe('uppskattad'))
})

describe('avstånd — bara över lass med mått', () => {
  it('Elefant 26 (alla lass i appen): inget mått → streck, "mäts inte för appens lass"', () => {
    const s = tomLassSumma(); for (let i = 0; i < 13; i++) laggTillLass(s, app(23))
    expect(snittAvstandM(s)).toBeNull()
    expect(avstandNot(s)).toBe('mäts inte för appens lass')
  })

  it('blandat: 2 lass med 640 m (tur och retur) + 12 app-lass = 320 m enkel väg över de två, "2 av 14 lass" — inte 46 m', () => {
    const s = tomLassSumma(); laggTillLass(s, opti(20)); laggTillLass(s, opti(20)); for (let i = 0; i < 12; i++) laggTillLass(s, app(20))
    expect(snittAvstandM(s)).toBe(320)
    expect(avstandNot(s)).toBe('2 av 14 lass')
  })

  it('alla lass har mått: ingen not', () => {
    const s = tomLassSumma(); laggTillLass(s, opti(20)); laggTillLass(s, opti(20))
    expect(avstandNot(s)).toBeNull()
    expect(snittAvstandM(s)).toBe(320)
  })

  it('inga lass alls: ingen not och inget snitt (aldrig 0)', () => {
    const s = tomLassSumma()
    expect(avstandNot(s)).toBeNull()
    expect(snittAvstandM(s)).toBeNull()
  })
})

describe('kvoter per G15-timme — bara dagar med G15-tid', () => {
  const dag = (d: number) => `2026-11-${String(d).padStart(2, '0')}`
  const tid = (d: number, h: number) => ({ datum: dag(d), processing_sek: h * 3600, terrain_sek: 0, other_work_sek: 0 })

  it('g15PerDag summerar processing + terräng + övrigt arbete per dag (g15Sek)', () => {
    const m = g15PerDag([{ datum: dag(2), processing_sek: 3600, terrain_sek: 1800, other_work_sek: 900 }, { datum: dag(2), processing_sek: 900 }])
    expect(m.get(dag(2))).toBe(3600 + 1800 + 900 + 900)
  })

  it('Elefant efter filstoppet: 40 m³ med tid + 240 m³ utan → täljaren är 40, inte 280', () => {
    const lass = [
      { datum: dag(2), volym_m3sub: 20 }, { datum: dag(2), volym_m3sub: 20 },
      ...[23, 24, 25, 26].flatMap(d => [1, 2, 3].map(() => ({ datum: dag(d), volym_m3sub: 20 }))),
    ]
    const u = kvotUnderlag(lass, g15PerDag([tid(2, 10)]))
    expect(u.volym).toBe(40)
    expect(u.lass).toBe(2)
    expect(u.dagarMedTid).toBe(1)
    expect(u.dagarUtanTid).toBe(4)
    expect(kvotPerTimme(u.volym, 10 * 3600)).toBe(4)          // 4,0 m³/G15h — inte 28,0
    expect(tidNot(u)).toBe('räknat på 1 av 5 dagar (resten saknar maskintid)')
  })

  it('ingen maskintid alls: täljaren 0, förklaring "ingen maskintid för de här dagarna", ingen kvot', () => {
    const u = kvotUnderlag([{ datum: dag(26), volym_m3sub: 300 }], new Map())
    expect(u).toEqual({ volym: 0, lass: 0, dagarMedTid: 0, dagarUtanTid: 1 })
    expect(tidNot(u)).toBe('ingen maskintid för de här dagarna')
    expect(kvotPerTimme(u.volym, 0)).toBeNull()
  })

  it('alla dagar har tid: ingen not', () => {
    const u = kvotUnderlag([{ datum: dag(2), volym_m3sub: 10 }], g15PerDag([tid(2, 5)]))
    expect(tidNot(u)).toBeNull()
    expect(u.volym).toBe(10)
  })

  it('en dag med 0 sekunder tid räknas som utan tid', () => {
    const u = kvotUnderlag([{ datum: dag(2), volym_m3sub: 10 }], g15PerDag([tid(2, 0)]))
    expect(u.dagarUtanTid).toBe(1)
    expect(u.volym).toBe(0)
  })

  it('rader utan datum räknas aldrig (kan inte kopplas till en dag)', () => {
    const u = kvotUnderlag([{ datum: null, volym_m3sub: 99 }], g15PerDag([tid(2, 5)]))
    expect(u).toEqual({ volym: 0, lass: 0, dagarMedTid: 0, dagarUtanTid: 0 })
  })

  it('kvotVolymUrDagar: operatörskortets per-dag-kartor följer samma regel', () => {
    expect(kvotVolymUrDagar({ a: 40, b: 240 }, { a: 36000 })).toBe(40)
    expect(kvotVolymUrDagar({ a: 40 }, { a: 0 })).toBe(0)
  })

  it('kvotPerTimme: aldrig division med 0 eller oändligt', () => {
    expect(kvotPerTimme(10, 0)).toBeNull()
    expect(kvotPerTimme(0, 3600)).toBe(0)
    expect(kvotPerTimme(36, 3600 * 2)).toBe(18)
  })
})
