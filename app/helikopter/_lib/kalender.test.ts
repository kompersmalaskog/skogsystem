import { describe, expect, it } from 'vitest'
import { mattSegment } from './kalender'
import type { KalenderMatt } from './queries'

const m = (maskin_id: string, datum: string, objekt_id: string, namn: string, volym: number): KalenderMatt => ({ maskin_id, datum, objekt_id, namn, volym })

describe('mattSegment — bara det som skett', () => {
  it('samma trakt på följande arbetsdagar är ett block, helgen ligger inuti', () => {
    // fre 20 nov, mån 23 nov, tis 24 nov
    const s = mattSegment('EK', [m('EK', '2026-11-20', 'a', 'Bondeskog AU 2026', 100), m('EK', '2026-11-23', 'a', 'Bondeskog AU 2026', 90), m('EK', '2026-11-24', 'a', 'Bondeskog AU 2026', 80)], '2026-11-25')
    expect(s).toHaveLength(1)
    expect([s[0].fran, s[0].till]).toEqual(['2026-11-20', '2026-11-24'])
    expect(s[0].ton).toBe('normal')
  })
  it('en arbetsdag utan arbete bryter blocket — ingen påhittad dag', () => {
    const s = mattSegment('EK', [m('EK', '2026-11-18', 'a', 'A', 50), m('EK', '2026-11-20', 'a', 'A', 50)], '2026-11-25')
    expect(s).toHaveLength(2)
  })
  it('byte av trakt är ett nytt block; två trakter samma dag ger den med mest volym', () => {
    const s = mattSegment('EK', [m('EK', '2026-11-18', 'a', 'A', 50), m('EK', '2026-11-19', 'a', 'A', 10), m('EK', '2026-11-19', 'b', 'B', 90)], '2026-11-25')
    expect(s.map(x => [x.fran, x.till, x.text])).toEqual([['2026-11-18', '2026-11-18', 'A'], ['2026-11-19', '2026-11-19', 'B']])
  })
  it('framtida dagar och andra maskiner räknas inte', () => {
    const s = mattSegment('EK', [m('EK', '2026-11-26', 'a', 'A', 50), m('X', '2026-11-20', 'a', 'A', 50)], '2026-11-25')
    expect(s).toEqual([])
  })
  it('saknat namn är "Okänt objekt", aldrig ett id', () => {
    const s = mattSegment('EK', [{ maskin_id: 'EK', datum: '2026-11-20', objekt_id: '123', namn: null, volym: 5 }], '2026-11-25')
    expect(s[0].text).toBe('Okänt objekt')
  })
})
