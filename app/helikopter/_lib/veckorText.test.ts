import { describe, it, expect } from 'vitest'
import { veckoDatum, veckoRader, veckoSvar } from './veckorText'
import type { VeckaRad } from './queries'

const v = (x: Partial<VeckaRad>): VeckaRad => ({ isovecka: 47, iso_ar: 2026, fran: '2026-11-16', till: '2026-11-20', arbetsdagar: 5, arbetsdagar_kvar: 3, plan: 669, skordat: 612, skotat: 540, status: 'pagar', orsak: null, maskiner: [], ...x })

describe('Veckor — orden', () => {
  it('pågående: kvar till planen, per roll', () => {
    const r = veckoRader(v({}))
    expect(r.skordat).toEqual({ text: 'Skördat 612 av 669', ord: '57 kvar', klart: false })
    expect(r.skotat).toEqual({ text: 'Skotat 540 av 669', ord: '129 kvar', klart: false })
  })
  it('låst: Klart vid plan eller över, annars "under"', () => {
    const r = veckoRader(v({ status: 'last', plan: 909, skordat: 980, skotat: 780 }))
    expect(r.skordat.ord).toBe('Klart')
    expect(r.skotat).toMatchObject({ ord: '129 under', klart: false })
    expect(veckoRader(v({ status: 'last', plan: 909, skordat: 909 })).skordat.klart).toBe(true)   // exakt plan = nått
  })
  it('kommande: bara planen, inget ord; utan plan bara volymen — aldrig ett påhittat ord', () => {
    expect(veckoRader(v({ status: 'kommande', skordat: 0, skotat: 0 })).skotat).toEqual({ text: 'Skotat – av 669', ord: '', klart: false })
    expect(veckoRader(v({ status: 'last', plan: null })).skordat).toEqual({ text: 'Skördat 612', ord: '', klart: false })
  })
})

describe('veckoSvar och datum', () => {
  it('rubriken säger att dagarna gäller veckan, och finns bara när en vecka pågår', () => {
    expect(veckoSvar([v({})])).toEqual({ rubrik: 'Vecka 47 pågår', under: '3 dagar kvar av veckan' })
    expect(veckoSvar([v({ arbetsdagar_kvar: 1 })])!.under).toBe('1 dag kvar av veckan')
    expect(veckoSvar([v({ status: 'last' })])).toBeNull()
  })
  it('datum: samma månad kort, över månadsskifte båda', () => {
    expect(veckoDatum('2026-11-10', '2026-11-14')).toBe('10–14 nov')
    expect(veckoDatum('2026-10-27', '2026-10-31')).toBe('27–31 okt')
    expect(veckoDatum('2026-10-28', '2026-11-01')).toBe('28 okt–1 nov')
  })
})

describe('egen skotning', () => {
  it('står som egen rad under Skotat när den finns, annars inget', () => {
    expect(veckoRader(v({ skotat: 335, skotat_egen: 335.3 })).egen).toBe('varav egen skotning 335')
    expect(veckoRader(v({ skotat_egen: 0 })).egen).toBeNull()
    expect(veckoRader(v({})).egen).toBeNull()
  })
  it('skotat räknar med egen skotning (det är samma tal som RPC:n ger, inget läggs på här)', () => {
    const r = veckoRader(v({ plan: 238, skordat: 192, skotat: 192, skotat_egen: 192 }))
    expect(r.skotat.text).toBe('Skotat 192 av 238')
    expect(r.skotat.ord).toBe('46 kvar')
  })
})
