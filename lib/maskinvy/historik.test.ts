// @vitest-environment jsdom
// Maskinvyns historik: URL:en är källan, nya ställen är push och justeringar är replace. Körs mot jsdoms riktiga history
// (pushState, back() och popstate), inte mot en fejkad.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  beslutaSkrivning, byggSok, DJUP_MARKOR, gammalAdressAndring, nivaUr, NIVA_NYCKEL, skrivNavigering, stadaGammalAdress,
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

describe('gamla bokmärken (den gamla maskinvyn är borta)', () => {
  it('en ren adress ger ingenting att städa', () => {
    expect(gammalAdressAndring('')).toBeNull()
    expect(gammalAdressAndring('?vy=produktion')).toBeNull()
    expect(gammalAdressAndring('?lage=skotare&vy=jamforelse&skotare=A130743')).toBeNull()
    expect(gammalAdressAndring('?lage=jamforelse')).toBeNull()
  })
  it('?ny=1, per och off tas bort', () => {
    expect(gammalAdressAndring('?ny=1')).toEqual({ ny: null })
    expect(gammalAdressAndring('?ny=1&per=K&off=-2&vy=avbrott')).toEqual({ ny: null, per: null, off: null })
  })
  it('vy=oversikt och vy=analys blir Översikt (ingen vy), vy=jamfor blir Jämförelse-läget', () => {
    expect(gammalAdressAndring('?vy=oversikt')).toEqual({ vy: null })
    expect(gammalAdressAndring('?vy=analys')).toEqual({ vy: null })
    expect(gammalAdressAndring('?ny=1&vy=analys&lage=skotare')).toEqual({ ny: null, vy: null })
    expect(gammalAdressAndring('?vy=jamfor')).toEqual({ vy: null, lage: 'jamforelse' })
  })
  it('en flik som läget saknar tas bort (kapacitet finns bara hos skördaren, jamforelse bara hos skotaren)', () => {
    expect(gammalAdressAndring('?vy=kapacitet')).toBeNull()
    expect(gammalAdressAndring('?lage=skotare&vy=kapacitet')).toEqual({ vy: null })
    expect(gammalAdressAndring('?vy=jamforelse')).toEqual({ vy: null })
  })
  it('stadaGammalAdress skriver om på plats (replace) och lägger ingen post', async () => {
    await nollstall('/maskinvy?ny=1&vy=analys&per=M&skordare=R64428')
    const langd = window.history.length
    stadaGammalAdress()
    expect(window.location.search).toBe('?skordare=R64428')
    expect(window.history.length).toBe(langd)
    stadaGammalAdress() // en ren adress rörs inte
    expect(window.location.search).toBe('?skordare=R64428')
  })
})
