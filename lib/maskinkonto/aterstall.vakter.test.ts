/**
 * Källvakter för "tillbaka dit maskinen var" (Martin 2026-11-22). Planeringsvyn är för stor för att monteras i ett test, så det den ska göra
 * vaktas här: skriva sitt läge, läsa ?maskinmeny=1 SYNKRONT (ingen helskärm ens en kort stund) och rita lådan så fort begäran finns.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const page = readFileSync('app/planering/page.tsx', 'utf8')
const klient = readFileSync('lib/maskinkonto/klient.ts', 'utf8')
const provider = readFileSync('components/maskinkonto/MaskinKontoProvider.tsx', 'utf8')

describe('planeringsvyn', () => {
  it('?maskinmeny=1 läses i useState-initieraren (första renderingen), inte bara i en effekt', () => {
    expect(page).toMatch(/useState\(\(\) => \{[^}]*searchParams\.get\('maskinmeny'\) === '1'/)
  })
  it('lådan ritas redan när begäran finns (samma bild som kartan), inte först efter en effekt', () => {
    expect(page).toContain('{maskinlage && (maskinMenyOppen || maskinMenyBegard) && (')
  })
  it('skriver sitt läge vid varje ändring och glömmer det när vyn lämnas', () => {
    expect(page).toMatch(/if \(maskinlage\) sattPlaneringLage\(maskinMenyOppen \|\| maskinMenyBegard\)/)
    expect(page).toMatch(/addEventListener\('pagehide', glom\)/)
    expect(page).toMatch(/sattPlaneringLage\(null\)/)
  })
})

describe('låsningen', () => {
  it('varje väg till "Vem är du?" minns läget först', () => {
    expect(provider).toContain('minnsLageForeUpplasning(); setVem({ href })')
    expect(provider).not.toMatch(/setVem\(\{ href: pathname \}\)/)          // ingen väg förbi minnet
    expect(provider).toContain('oppnaVemArDu: (href = \'/\') => oppnaVem(href)')
  })
  it('lasMaskinen går till kartaEfterLasning(minnet) och sessionsbytet (aterMaskin) ligger FÖRE adressvalet', () => {
    const f = klient.slice(klient.indexOf('export async function lasMaskinen'))
    expect(f.indexOf('await aterMaskin()')).toBeGreaterThan(-1)
    expect(f.indexOf('await aterMaskin()')).toBeLessThan(f.indexOf('tagAtervand()'))
    expect(f).toMatch(/window\.location\.assign\(kartaEfterLasning\(atervand\)\)/)
  })
  it('minnet glöms när enheten blir maskin automatiskt, när upplåsningen misslyckas och när maskinen loggas ut', () => {
    expect((klient.match(/glomAtervand\(\)/g) ?? []).length).toBeGreaterThanOrEqual(3)
  })
})
