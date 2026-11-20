import { describe, it, expect } from 'vitest'
import { rotposter, skillnad } from './uppfoljning'
import type { Objekt } from '@/lib/medelstam/berakna'

const obj = (id: string, ms: number, timmer: number, forsta = '2026-05-01', rot20: number | null = 0.3): Objekt => ({
  id, namn: `Trakt ${id}`, typ: 'Slutavverkning', forsta, stammar: 1000, volym: 1000,
  timmer, kubb: 150, massa: 800 - timmer, medelstam: ms, rot20, stammar20: 500, lov: 10,
})

// Fyra vanliga trakter kring 0,60 med 55 % timmer, en rotpost med 70 %.
const alla = [obj('a', 0.58, 550), obj('b', 0.6, 550), obj('c', 0.62, 550), obj('d', 0.61, 550),
  obj('rp', 0.6, 700, '2026-09-01', 0.45), obj('rp-ensam', 1.5, 700, '2026-03-01', null)]

describe('rotposter', () => {
  const r = rotposter(alla, new Set(['rp', 'rp-ensam']))

  it('bara markerade trakter, nyast först', () => {
    expect(r.map(x => x.id)).toEqual(['rp', 'rp-ensam'])
  })
  it('det vanliga räknas på ANDRA trakter, aldrig på trakten själv', () => {
    expect(r[0].jamfordaTrakter).toBe(4)
    expect(r[0].vanligt!.timmer).toBe(55)
    expect(r[0].andel.timmer).toBe(70)
    expect(skillnad(r[0], 'timmer')).toBe(15)
  })
  it('för få trakter i närheten: ingen jämförelse, aldrig noll', () => {
    expect(r[1].vanligt).toBeNull()
    expect(skillnad(r[1], 'timmer')).toBeNull()
  })
  it('kubik per sortiment summerar till volymen', () => {
    expect(Object.values(r[0].m3).reduce((a, b) => a + b, 0)).toBe(1000)
  })
  it('röta som den är mätt, null när den saknas', () => {
    expect(r[0].rota).toBe(0.45)
    expect(r[1].rota).toBeNull()
  })
})

import { trakter, perManad } from './uppfoljning'

describe('trakter', () => {
  const g = (id: string, ms: number, forsta: string): Objekt => ({ ...obj(id, ms, 20, forsta), typ: 'Gallring' })
  const t = trakter([...alla, g('g1', 0.1, '2026-08-03'), g('g2', 0.1, '2026-08-04'), g('g3', 0.1, '2026-08-05'), g('g4', 0.1, '2026-07-01')], new Set(['rp']))
  it('alla trakter med, rotposten märkt', () => {
    expect(t).toHaveLength(10)
    expect(t.find(x => x.id === 'rp')!.rotpost).toBe(true)
    expect(t.find(x => x.id === 'a')!.rotpost).toBe(false)
  })
  it('gallring jämförs bara med gallring', () => {
    expect(t.find(x => x.id === 'g1')!.jamfordaTrakter).toBe(3)
  })
  it('per månad, nyast först', () => {
    expect(perManad(t).map(x => x.manad)).toEqual(['2026-09', '2026-08', '2026-07', '2026-05', '2026-03'])
  })
})

import { skordningsLage, grupperTrakter, traktSub, type Trakt as T2 } from './uppfoljning'

describe('skördningens läge', () => {
  it('datum = klar, utan datum = pågår, "inte klar än" går före datumet, ingen rad = okänt', () => {
    expect(skordningsLage({ skordning_avslutad: '2026-10-13', skordning_ej_klar: false })).toEqual({ lage: 'klar', datum: '2026-10-13' })
    expect(skordningsLage({ skordning_avslutad: null, skordning_ej_klar: false })).toEqual({ lage: 'pagar' })
    expect(skordningsLage({ skordning_avslutad: '2026-10-13', skordning_ej_klar: true })).toEqual({ lage: 'pagar' })
    expect(skordningsLage(undefined)).toEqual({ lage: 'okand' })
  })
  const tr = (id: string, forsta: string, s: T2['skordning']): T2 => ({
    id, namn: id, typ: 'Slutavverkning', forsta, volym: 1, stammar: 1, medelstam: 1, rotpost: true,
    andel: { timmer: 0, kubb: 0, massa: 0, ovrigt: 0 }, m3: { timmer: 0, kubb: 0, massa: 0, ovrigt: 0 }, vanligt: null, jamfordaTrakter: 0, rota: null, skordning: s,
  })
  it('de som skördas står överst under en egen rubrik, resten per månad', () => {
    const g = grupperTrakter([tr('mol', '2026-10-19', { lage: 'klar', datum: '2026-10-21' }), tr('ska', '2026-10-22', { lage: 'pagar' }), tr('bsk', '2026-09-30', { lage: 'okand' })])
    expect(g.map(x => [x.rubrik, x.trakter.map(t => t.id)])).toEqual([['pagar', ['ska']], ['2026-10', ['mol']], ['2026-09', ['bsk']]])
  })
  it('ingen pågående: ingen tom rubrik', () => {
    expect(grupperTrakter([tr('mol', '2026-10-19', { lage: 'klar', datum: '2026-10-21' })]).map(x => x.rubrik)).toEqual(['2026-10'])
  })
  it('raden under namnet', () => {
    expect(traktSub(tr('a', '2026-10-01', { lage: 'pagar' }))).toBe('Slutavverkning · Rotpost · Skördas')
    expect(traktSub(tr('a', '2026-10-01', { lage: 'klar', datum: '2026-10-21' }))).toBe('Slutavverkning · Rotpost · Klar 21 okt')
    expect(traktSub(tr('a', '2026-10-01', { lage: 'okand' }))).toBe('Slutavverkning · Rotpost')
  })
})
