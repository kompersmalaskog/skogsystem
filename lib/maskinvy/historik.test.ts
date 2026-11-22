// @vitest-environment jsdom
// Maskinvyns historik: URL:en är källan, nya ställen är push och justeringar är replace. Körs mot jsdoms riktiga history
// (pushState, back() och popstate), inte mot en fejkad.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  beslutaSkrivning, byggSok, DJUP_MARKOR, lasOffset, lasPeriod, nivaUr, NIVA_NYCKEL, offsetAndring,
  periodAndring, skrivNavigering,
} from './historik'

const vanta = () => new Promise(r => setTimeout(r, 15))

async function nollstall(url = '/maskinvy?ny=1') {
  // jsdom har inget "töm historiken": gå till ingången genom att byta adress med replace på en ny post.
  window.history.replaceState(null, '', url)
}

describe('byggSok', () => {
  it('sätter, byter och tar bort — andra parametrar lämnas orörda', () => {
    expect(byggSok('?ny=1', { vy: 'produktion' })).toBe('?ny=1&vy=produktion')
    expect(byggSok('?ny=1&vy=produktion', { vy: 'avbrott' })).toBe('?ny=1&vy=avbrott')
    expect(byggSok('?ny=1&vy=produktion', { vy: null })).toBe('?ny=1')
    expect(byggSok('?vy=idag', { vy: null })).toBe('')
    expect(byggSok('?ny=1&x=å', { lage: 'skotare' })).toBe('?ny=1&x=%C3%A5&lage=skotare')
  })
  it('undefined rör inte parametern', () => {
    expect(byggSok('?vy=idag', { vy: undefined, lage: 'skotare' })).toBe('?vy=idag&lage=skotare')
  })
})

describe('beslutaSkrivning', () => {
  const nu = (state: unknown = null, search = '?ny=1') => ({ pathname: '/maskinvy', search, hash: '', state })
  it('samma adress → ingenting (inga tomma poster)', () => {
    expect(beslutaSkrivning(nu(null, '?ny=1&vy=idag'), { vy: 'idag' }, 'push')).toEqual({ atgard: 'ingen' })
  })
  it('push → ny post, en nivå upp', () => {
    const b = beslutaSkrivning(nu(), { vy: 'produktion' }, 'push')
    expect(b).toMatchObject({ atgard: 'skriv', metod: 'push', url: '/maskinvy?ny=1&vy=produktion', niva: 1 })
  })
  it('replace → samma nivå', () => {
    const b = beslutaSkrivning(nu({ [NIVA_NYCKEL]: 2 }), { per: 'K' }, 'replace')
    expect(b).toMatchObject({ metod: 'replace', niva: 2, ersattDjup: false })
  })
  it('push från en öppen djupvy ersätter djupvyns post (ingen död backa-post)', () => {
    const b = beslutaSkrivning(nu({ [DJUP_MARKOR]: 7, [NIVA_NYCKEL]: 2 }), { vy: 'avbrott' }, 'push')
    expect(b).toMatchObject({ metod: 'replace', niva: 2, ersattDjup: true })
  })
})

describe('period', () => {
  it('standardvärdena skrivs som ingen parameter', () => {
    expect(periodAndring('M')).toEqual({ per: null, off: null })
    expect(periodAndring('K')).toEqual({ per: 'K', off: null })
    expect(offsetAndring(0)).toEqual({ off: null })
    expect(offsetAndring(-3)).toEqual({ off: '-3' })
  })
  it('ogiltigt läses som standard', () => {
    expect(lasPeriod('?per=X')).toBe('M')
    expect(lasPeriod('?per=Å')).toBe('Å')
    expect(lasOffset('?off=abc')).toBe(0)
    expect(lasOffset('?off=2')).toBe(0)
    expect(lasOffset('?off=-2')).toBe(-2)
  })
})

describe('skrivNavigering mot riktig history', () => {
  beforeEach(() => nollstall())

  it('flikbyte är push: backa går ett steg i taget, och landar på ingången', async () => {
    skrivNavigering({ vy: 'produktion' }, 'push')
    skrivNavigering({ vy: 'analys' }, 'push')
    expect(window.location.search).toBe('?ny=1&vy=analys')
    expect(nivaUr(window.history.state)).toBe(2)
    expect(nivaUr(window.history.state)).toBe(2)

    window.history.back(); await vanta()
    expect(window.location.search).toBe('?ny=1&vy=produktion')
    window.history.back(); await vanta()
    expect(window.location.search).toBe('?ny=1')
    expect(nivaUr(window.history.state)).toBe(0)
  })

  it('period och månadspilar är replace: ingen ny post, backa hoppar inte över dem', async () => {
    skrivNavigering({ vy: 'produktion' }, 'push')
    skrivNavigering({ per: 'K' }, 'replace')
    for (let i = 1; i <= 5; i++) skrivNavigering({ off: String(-i) }, 'replace')
    expect(nivaUr(window.history.state)).toBe(1)
    expect(window.location.search).toBe('?ny=1&vy=produktion&per=K&off=-5')
    window.history.back(); await vanta()
    expect(window.location.search).toBe('?ny=1') // ETT backa = föregående flik, inte föregående månad
  })

  it('samma flik igen skriver ingen post', () => {
    skrivNavigering({ vy: 'produktion' }, 'push')
    skrivNavigering({ vy: 'produktion' }, 'push')
    expect(nivaUr(window.history.state)).toBe(1)
  })

  it('Nexts egna state-nycklar skickas inte med (Next kopierar dem själv och synkar då sin adress)', () => {
    window.history.replaceState({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: [1], annat: 'behålls' }, '', '/maskinvy?ny=1')
    skrivNavigering({ per: 'K' }, 'replace')
    const st = window.history.state as Record<string, unknown>
    expect(st.__NA).toBeUndefined()
    expect(st.__PRIVATE_NEXTJS_INTERNALS_TREE).toBeUndefined()
    expect(st.annat).toBe('behålls')
  })

  it('replace behåller en djupvys markör, push från djupvyn tar bort den', () => {
    window.history.pushState({ [DJUP_MARKOR]: 3, [NIVA_NYCKEL]: 1 }, '', window.location.href)
    skrivNavigering({ per: 'V' }, 'replace')
    expect((window.history.state as any)[DJUP_MARKOR]).toBe(3)
    skrivNavigering({ vy: 'avbrott' }, 'push')
    expect(nivaUr(window.history.state)).toBe(1) // ersatte djupvyns post, la ingen ny
    expect(arDjup()).toBe(false)
    expect(nivaUr(window.history.state)).toBe(1)
  })
})
const arDjup = () => (window.history.state as any)?.[DJUP_MARKOR] !== undefined
