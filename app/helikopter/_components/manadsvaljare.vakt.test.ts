// Månadsväljaren överst på /helikopter: mellan pilarna står ALLTID månaden man tittar på. "Idag" är en egen liten länk (KNAPP.tertiar)
// som bara finns när vald månad inte är innevarande — den står aldrig mellan pilarna. Sedan omtaget 2026-10-23 finns EN rubrik på alla bredder.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const kalla = readFileSync(join(__dirname, 'HelikopterVy.tsx'), 'utf8')

describe('månadsväljaren i HelikopterVy', () => {
  it('Idag är KNAPP.tertiar (grå, TYP.meta), inte blå länk', () => {
    const rad = kalla.slice(kalla.indexOf('const idagKnapp'), kalla.indexOf('// Månadsrubriken'))
    expect(rad).toContain('KNAPP.tertiar')
    expect(rad).not.toContain('KNAPP.lank')
    expect(rad).toContain('>Idag<')
  })

  it('Idag renderas bara när vald månad inte är innevarande — EN rubrik för alla bredder', () => {
    const anrop = kalla.split('\n').filter(r => r.includes('idagKnapp') && !r.includes('const idagKnapp'))
    expect(anrop.length).toBe(1)
    for (const r of anrop) expect(r, r).toMatch(/!arNu\s*&&/)
  })

  it('månaden står mellan pilarna', () => {
    const huvud = kalla.slice(kalla.indexOf('const manadsHuvud'), kalla.indexOf('const bolagTyp'))
    expect(huvud.indexOf('pil(-1)')).toBeGreaterThan(-1)
    expect(huvud.indexOf('pil(-1)')).toBeLessThan(huvud.indexOf('manadRubrik(ar, manad)'))
    expect(huvud.indexOf('manadRubrik(ar, manad)')).toBeLessThan(huvud.indexOf('pil(1)'))
  })

  it('inga flikar: sidan är EN sida (ingen Flikkontroll, inget ?flik= som styr något)', () => {
    expect(kalla).not.toContain('Flikkontroll')
    expect(kalla).not.toMatch(/sp\.get\('flik'\)/)
  })

  it('status visas som prick + ord, aldrig som färgat tal eller färgad stapel', () => {
    const skotat = readFileSync(join(__dirname, 'SkotatSektion.tsx'), 'utf8')
    expect(skotat).toContain('StatusOrd')
    expect(skotat).not.toMatch(/Matare[^/]*farg=/)
    expect(skotat).not.toMatch(/TYP\.tal[^}]*FARG\.(orange|gron)/)
  })

  it('sidan ritar inga traktlistor och inga maskinkort: trakterna ligger bakom trycket, maskinernas m³ bakom Mer', () => {
    expect(kalla).not.toContain('<MaskinSektion')
    const klar = readFileSync(join(__dirname, 'KlarSektion.tsx'), 'utf8')
    expect(klar).not.toContain('trakter.map')
  })
})
