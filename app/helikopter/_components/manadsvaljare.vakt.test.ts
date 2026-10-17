// Månadsväljaren överst: mellan pilarna står ALLTID månaden man tittar på. "Idag" är en egen liten länk (KNAPP.tertiar)
// som bara finns när vald månad inte är innevarande — den står aldrig mellan pilarna (förr gjorde den det på stor skärm).
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

  it('Idag renderas bara när vald månad inte är innevarande, på alla bredder', () => {
    const anrop = kalla.split('\n').filter(r => r.includes('idagKnapp') && !r.includes('const idagKnapp'))
    expect(anrop.length).toBe(2) // telefon/iPad + stor
    for (const r of anrop) expect(r, r).toMatch(/!arNu\s*&&/)
  })

  it('stor skärm: månaden står mellan pilarna och Idag hänger utanför gruppen', () => {
    const stor = kalla.slice(kalla.indexOf('// Stor: pilar och månad'), kalla.indexOf(') : ('))
    const forsta = stor.indexOf('pil(-1)'), mellan = stor.indexOf('manadRubrik(ar, manad)'), andra = stor.indexOf('pil(1)'), idag = stor.indexOf('idagKnapp')
    expect(forsta).toBeGreaterThan(-1)
    expect(mellan).toBeGreaterThan(forsta)
    expect(andra).toBeGreaterThan(mellan)
    expect(stor.slice(forsta, andra)).toMatch(/>\{manadRubrik\(ar, manad\)\}</) // alltid, aldrig villkorad
    expect(idag).toBeGreaterThan(andra) // till höger om pilarna, aldrig emellan
    expect(stor).toMatch(/position: 'absolute', left: '100%'/) // flyttar inte gruppen
  })

  it('telefon och iPad: månaden är kvar mellan pilarna (rubriken är oförändrad)', () => {
    const huvud = kalla.slice(kalla.indexOf('const manadsHuvud'), kalla.indexOf('const historikHuvud'))
    expect(huvud.indexOf('pil(-1)')).toBeLessThan(huvud.indexOf('manadRubrik(ar, manad)'))
    expect(huvud.indexOf('manadRubrik(ar, manad)')).toBeLessThan(huvud.indexOf('pil(1)'))
  })
})
