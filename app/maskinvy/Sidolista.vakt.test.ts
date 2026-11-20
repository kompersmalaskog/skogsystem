/**
 * Källvakt för sidolistan: den släcker rullgardinen och flyttar djupvyerna med CSS-klasser (page.tsx), så varje vy som har
 * en rullgardin eller en heltäckande djupvy måste bära klassen — annars ligger en vy under listan eller visar en klickbar ▾
 * bredvid listan. Läser hela filerna.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const DIR = __dirname
const filer = readdirSync(DIR).filter(f => f.endsWith('.tsx') && !f.includes('.test.'))
const las = (f: string) => readFileSync(path.join(DIR, f), 'utf8')

describe('sidolistans klasser', () => {
  it('varje fil med en maskin-rullgardin har knappen och pilen märkta', () => {
    const med = filer.filter(f => las(f).includes('setMaskinOpen(o => !o)'))
    expect(med.length).toBe(9)
    for (const f of med) {
      expect(las(f), f).toContain('className="mv-maskinval"')
      expect(las(f), f).toContain('className="mv-maskinval-pil"')
    }
  })

  it('varje heltäckande djupvy (role="dialog") bär mv-djup, så den flyttas höger om listan', () => {
    const med = filer.filter(f => las(f).includes('role="dialog"'))
    expect(med.length).toBeGreaterThanOrEqual(5)
    for (const f of med) expect(las(f), f).toContain('className="mv-djup"')
  })

  it('page.tsx flyttar innehållet och släcker rullgardinen bara medan listan står (attributet på body)', () => {
    const k = las('page.tsx')
    for (const sel of ['.mv-toggle-bar', '.mv-vy-bar', '.mv-wrapper > div', '.mv-djup', '.mv-maskinval', '.mv-maskinval-pil']) {
      expect(k, sel).toContain(`body[data-mv-sidolista] ${sel}`)
    }
    expect(k).toContain("setAttribute('data-mv-sidolista'")
    expect(k).toContain('removeAttribute(\'data-mv-sidolista\')')
  })

  it('listan hämtar ingenting på smal skärm: den renderas bara när matchMedia säger bred', () => {
    const k = las('page.tsx')
    expect(k).toMatch(/const visaSidolista = ny && bred && mode !== 'jamforelse'/)
    expect(k).toMatch(/\{visaSidolista && \(\s*<Sidolista/)
  })
})
