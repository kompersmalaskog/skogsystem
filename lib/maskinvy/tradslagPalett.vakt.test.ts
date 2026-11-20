import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { tradslagFarg, TRADSLAG_STIL } from '@/lib/tradslag'

// Beslut Martin 2026-10-21: trädslagen har EN palett i hela appen, lib/tradslag.ts TRADSLAG_STIL
// (Gran grön, Tall orange, Björk vit, Övrigt löv grå) — samma i maskinvyn som i Mätning, Gallring och
// Uppföljning. Maskinvyn har ingen egen skala (den neutrala skalan med cyan/beige är borttagen).
const kod = (fil: string) => readFileSync(join(process.cwd(), fil), 'utf-8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
const VYER = ['app/maskinvy/TradslagKort.tsx', 'app/maskinvy/VolymDeepView.tsx']

describe('trädslagsfärger i maskinvyn', () => {
  it('de fyra vanliga arterna har appens färger', () => {
    expect(tradslagFarg('Gran')).toBe('#30D158')
    expect(tradslagFarg('Tall')).toBe('#FF9F0A')
    expect(tradslagFarg('Björk')).toBe('#FFFFFF')
    expect(tradslagFarg('Övrigt löv')).toBe('#8E8E93')
    expect(TRADSLAG_STIL.Gran.fyll).toBe(tradslagFarg('Gran'))
  })

  it.each(VYER)('%s färgar via tradslagFarg, aldrig en egen skala', fil => {
    const k = kod(fil)
    expect(k).toMatch(/tradslagFarg\(namn, i\)/)
    expect(k).not.toMatch(/Neutral/)
    expect(k).not.toMatch(/DELFARG/)
  })

  it('lib/tradslag.ts har ingen neutral skala kvar', () => {
    expect(kod('lib/tradslag.ts')).not.toMatch(/Neutral|NEUTRAL/)
  })
})
