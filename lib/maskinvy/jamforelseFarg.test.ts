import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { JAMFORELSE_FARG } from './jamforelse'

const kod = (fil: string) => readFileSync(join(process.cwd(), fil), 'utf-8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

describe('maskinfärger i Jämförelse', () => {
  it('Wisent blå, Elephant King lila — samma som Skotare › Jämförelse alltid haft (C.blue, C.purple)', () => {
    expect(JAMFORELSE_FARG).toEqual({ wisent: '#0a84ff', ek: '#5e5ce6' })
  })
  it('båda vyerna hämtar färgerna ur en källa; Chart.js-defaults (vitt/grönt) är borta', () => {
    for (const fil of ['app/maskinvy/Jamforelse.tsx', 'app/maskinvy/SkotareJamforelseNy.tsx']) {
      const k = kod(fil)
      expect(k).toContain('JAMFORELSE_FARG')
      expect(k).not.toMatch(/COLOR_EK_(BRED|SMAL)/)
      expect(k).not.toContain('rgba(48,209,88,0.7)')
    }
  })
})
