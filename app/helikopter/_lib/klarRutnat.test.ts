import { describe, expect, it } from 'vitest'
import fixtur from './__fixtures__/klar_2026-10-17.json'
import { lasKlar, raknaAlla } from './klar'
import { arHelgEllerRod, maskinSegment, rutnatDagar, rutnatRader } from './klarRutnat'

const prod = () => lasKlar(structuredClone(fixtur))

describe('rutnätet', () => {
  it('Elefant 26 (ledig 26–30 okt): blocket bryts vid ledigheten och delen efter månaden är orange', () => {
    const d = prod()
    const m = d.maskiner.find(x => x.namn === 'Elefant 26')!
    const seg = maskinSegment(m, raknaAlla(d)[m.maskin_id], d.sista_arbetsdag)
    expect(seg.map(s => [s.fran, s.till, s.ton, s.text])).toEqual([
      ['2026-10-19', '2026-10-23', 'normal', 'Skälviken RP J-Hus'],
      ['2026-11-02', '2026-11-12', 'orange', undefined],
    ])
  })

  it('Giant: ett sammanhängande block 19–29 okt, helgen ligger inuti', () => {
    const d = prod()
    const m = d.maskiner.find(x => x.namn === 'Giant')!
    const seg = maskinSegment(m, raknaAlla(d)[m.maskin_id], d.sista_arbetsdag)
    expect(seg.map(s => [s.fran, s.till, s.ton])).toEqual([['2026-10-19', '2026-10-29', 'normal']])
  })

  it('maskiner utan trakt får inga block; dagarna börjar på `start` och slutar på sista klar-datum', () => {
    const d = prod()
    const planer = raknaAlla(d)
    const rader = rutnatRader(d, planer)
    expect(rader.find(r => r.namn === 'Wisent')!.segment).toEqual([])
    const dagar = rutnatDagar(d, planer)
    expect(dagar[0]).toBe('2026-10-17')
    expect(dagar[dagar.length - 1]).toBe('2026-11-12')
  })

  it('helg och röd dag toneras (1 nov 2026 = söndag, 6 jun = nationaldagen)', () => {
    expect(arHelgEllerRod('2026-11-01')).toBe(true)
    expect(arHelgEllerRod('2026-06-06')).toBe(true)
    expect(arHelgEllerRod('2026-11-02')).toBe(false)
  })
})
