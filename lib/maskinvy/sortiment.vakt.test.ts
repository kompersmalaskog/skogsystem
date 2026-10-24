import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Sortimentgruppen läses ALLTID ur vyn vy_sortiment_klass. dim_sortiment_grupp saknar rad för varje nytt sortiment
// (40 av 300 den 2026-10-21; Scorpion oktober: 228,6 m³ som såg "okända" ut) — den som läser tabellen direkt får tillbaka felet.
const FILER = ['lib/maskinvy/sortiment.ts', 'app/maskinvy/SortimentKort.tsx']
const kod = (fil: string) => readFileSync(join(process.cwd(), fil), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('källvakt — sortimentgruppen kommer ur vyn', () => {
  for (const fil of FILER) {
    it(`${fil} läser inte dim_sortiment_grupp`, () => {
      expect(kod(fil)).not.toContain('dim_sortiment_grupp')
    })
  }
  it('kortet läser vy_sortiment_klass och felar högt om vyn inte går att läsa', () => {
    const k = kod('app/maskinvy/SortimentKort.tsx')
    expect(k).toContain("from('vy_sortiment_klass')")
    expect(k).toMatch(/if \(grupper\.error\) throw grupper\.error/)
    expect(k).toMatch(/if \(rader\.error\) throw rader\.error/)
  })
  it('kortet pagineras (hamtaAlla) — PostgREST kapar tyst vid 1 000 rader', () => {
    expect(kod('app/maskinvy/SortimentKort.tsx')).toContain('hamtaAlla')
  })
  it('ingen beräkningsmodul som joinar produktion och tid nämner sortimentkortet', () => {
    // fakt_produktion och fakt_tid joinas aldrig — kortet läser varken eller tid.
    const k = kod('app/maskinvy/SortimentKort.tsx')
    expect(k).not.toContain('fakt_tid')
    expect(k).not.toContain('fakt_produktion')
  })
})
