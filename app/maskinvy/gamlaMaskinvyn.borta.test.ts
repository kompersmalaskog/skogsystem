// Den gamla maskinvyn (maskinvy.tsx + skotare.tsx, "Maskinvy 2" som eget kort) är borttagen 2026-11-22.
// Vakten håller den borta: inga filer, ingen import, inget kort, ingen publik källkodskopia, och gamla adresser landar rätt.
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { VYER } from '@/lib/vyer'

const rot = process.cwd()
const las = (p: string) => readFileSync(`${rot}/${p}`, 'utf8')

describe('gamla maskinvyn är borta', () => {
  it.each([
    'maskinvy.tsx', 'skotare.tsx', 'maskinvy.backup.tsx',
    'lib/hooks/useGammalMaskinvyNav.ts',
    // källkodskopior: public/ serveras till vem som helst
    'public/maskinvy_export.txt', 'docs/maskinvy_export.txt', 'docs/maskinvy_all.txt',
  ])('%s finns inte', f => {
    expect(existsSync(`${rot}/${f}`)).toBe(false)
  })

  it('inget i public/ är en kopia av maskinvyns källkod', () => {
    const traffar = execFileSync('git', ['ls-files', 'public'], { cwd: rot, encoding: 'utf8' })
      .split('\n').filter(f => /maskinvy/i.test(f))
    expect(traffar).toEqual([])
  })

  it('sidan importerar inte den gamla vyn och har ingen ?ny=1-gren', () => {
    const s = las('app/maskinvy/page.tsx')
    expect(s).not.toMatch(/from '\.\.\/\.\.\/(maskinvy|skotare)'/)
    expect(s).not.toMatch(/navParam\(sok, 'ny'\)/)
  })

  it('ett kort, Maskinvy, till /maskinvy — "Maskinvy 2" finns inte', () => {
    expect(VYER.filter(v => /maskinvy/i.test(v.id) || /maskinvy/i.test(v.href)).map(v => [v.id, v.href])).toEqual([['maskinvy', '/maskinvy']])
  })

  it('de döda sidorna omdirigeras till /maskinvy, men ?ny=1 omdirigeras INTE av Next (frågeparametrarna följer med → loop)', () => {
    const cfg = las('next.config.js')
    expect(cfg).toMatch(/source: '\/maskinvy2', destination: '\/maskinvy', permanent: true/)
    expect(cfg).toMatch(/source: '\/maskinvy-ny', destination: '\/maskinvy', permanent: true/)
    expect(cfg).not.toMatch(/source: '\/maskinvy',/)
  })
})
