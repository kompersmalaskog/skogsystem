import { describe, it, expect } from 'vitest'
import { dagensObjekt, OKANT_OBJEKT } from './dagensObjekt'

describe('dagensObjekt — vilka objekt maskinen arbetade på', () => {
  const namn = { A: 'Hålabäck RP 2026', B: 'Vällust gallring', C: 'Hålabäck RP 2026' }

  it('ett objekt: en rad med dagens volym', () => {
    const r = dagensObjekt([{ objekt_id: 'A', volym_m3sub: 100 }, { objekt_id: 'A', volym_m3sub: 12.5 }], namn)
    expect(r.objekt).toEqual([{ nyckel: 'Hålabäck RP 2026', namn: 'Hålabäck RP 2026', kand: true, ids: ['A'], volym: 112.5 }])
    expect(r.utanObjektVolym).toBe(0)
  })

  it('flera objekt: störst volym först, lika volym i namnordning', () => {
    // Det alfabetiskt SISTA objektet har mest volym — annars bevisar testet bara namnordningen.
    const r = dagensObjekt([
      { objekt_id: 'A', volym_m3sub: 38 }, { objekt_id: 'B', volym_m3sub: 412 },
    ], namn)
    expect(r.objekt.map(o => o.namn)).toEqual(['Vällust gallring', 'Hålabäck RP 2026'])
    const lika = dagensObjekt([{ objekt_id: 'B', volym_m3sub: 5 }, { objekt_id: 'A', volym_m3sub: 5 }], namn)
    expect(lika.objekt.map(o => o.namn)).toEqual(['Hålabäck RP 2026', 'Vällust gallring'])
  })

  it('två objekt_id med samma namn (en VO-grupp) blir EN rad med summerad volym', () => {
    const r = dagensObjekt([{ objekt_id: 'A', volym_m3sub: 10 }, { objekt_id: 'C', volym_m3sub: 7 }], namn)
    expect(r.objekt).toHaveLength(1)
    expect(r.objekt[0].ids).toEqual(['A', 'C'])
    expect(r.objekt[0].volym).toBe(17)
  })

  it('objekt_id som saknas i dim_objekt får inget påhittat namn: "Okänt objekt", och två okända hålls isär', () => {
    const r = dagensObjekt([{ objekt_id: 'X1', volym_m3sub: 3 }, { objekt_id: 'X2', volym_m3sub: 4 }, { objekt_id: 'A', volym_m3sub: 1 }], namn)
    const okanda = r.objekt.filter(o => !o.kand)
    expect(okanda.map(o => o.namn)).toEqual([OKANT_OBJEKT, OKANT_OBJEKT])
    expect(okanda.map(o => o.ids[0]).sort()).toEqual(['X1', 'X2'])
    expect(r.objekt.find(o => o.kand)!.namn).toBe('Hålabäck RP 2026')
  })

  it('tomt eller blankt namn räknas som okänt (inte som ett objekt utan namn)', () => {
    const r = dagensObjekt([{ objekt_id: 'Q', volym_m3sub: 2 }], { Q: '   ' })
    expect(r.objekt[0]).toMatchObject({ namn: OKANT_OBJEKT, kand: false })
  })

  it('rader utan objekt_id summeras för sig — de försvinner aldrig tyst', () => {
    const r = dagensObjekt([
      { objekt_id: null, volym_m3sub: 6 }, { objekt_id: undefined, volym_m3sub: 4 }, { objekt_id: 'A', volym_m3sub: 90 },
    ], namn)
    expect(r.utanObjektVolym).toBe(10)
    expect(r.objekt).toHaveLength(1)
  })

  it('null-volym räknas som 0 och objektet finns kvar; inga rader ger tom lista', () => {
    const r = dagensObjekt([{ objekt_id: 'A', volym_m3sub: null }], namn)
    expect(r.objekt[0].volym).toBe(0)
    expect(dagensObjekt([], namn)).toEqual({ objekt: [], utanObjektVolym: 0 })
  })
})
