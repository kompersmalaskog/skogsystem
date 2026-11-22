// @vitest-environment jsdom
// Maskinvyns backa (bugg 2026-11-22): flik, maskin och läge är steg i historiken, perioden är replace, och en omladdning landar på
// samma flik och maskin. Hela sidan renderas med riktig history; bara de tunga vyerna är utbytta mot stumpar.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('./useMaskinvyMaskiner', () => ({
  useMaskinvyMaskiner: () => ({ maskiner: [{ id: 'A110148', namn: 'Elefant 26' }, { id: 'A030353', namn: 'Wisent' }], laddar: false }),
}))
vi.mock('next/link', () => ({ default: (p: any) => <a href={p.href}>{p.children}</a> }))

// Varje vy blir en stump (historik.stumpar.tsx) som visar sitt namn och vilken maskin den fick.
const st = vi.hoisted(() => async (namn: string, lista?: 'SK' | 'SKO') => {
  const m = await import('./historik.stumpar')
  return { default: m.stump(namn, lista === 'SK' ? m.SK : lista === 'SKO' ? m.SKO : undefined) }
})
vi.mock('./OversiktNy', () => st('Översikt', 'SK'))
vi.mock('./IdagNy', () => st('Idag'))
vi.mock('./ProduktionNy', () => st('Produktion'))
vi.mock('./AvbrottNy', () => st('Avbrott'))
vi.mock('./KapacitetNy', () => st('Kapacitet'))
vi.mock('./SkotareOversiktNy', () => st('SkotarÖversikt', 'SKO'))
vi.mock('./SkotareProduktionNy', () => st('SkotarProduktion'))
vi.mock('./SkotareAvbrottNy', () => st('SkotarAvbrott'))
vi.mock('./SkotareIdagNy', () => st('SkotarIdag'))
vi.mock('./SkotareJamforelseNy', () => st('SkotarJämförelse'))
vi.mock('./Jamforelse', () => st('Jämförelse'))
vi.mock('./MaskinLogg', () => ({ default: () => null }))
vi.mock('../../maskinvy', () => st('GamlaSkördare'))
vi.mock('../../skotare', () => st('GamlaSkotare'))
vi.mock('./Sidolista', () => ({
  default: ({ onVal }: any) => <button data-sido onClick={() => onVal('skotare', 'A030353')}>sido</button>,
}))

import MaskinvyPage from './page'

const vanta = () => new Promise(r => setTimeout(r, 15))
let rot: Root
let el: HTMLElement

async function montera(url: string) {
  window.history.replaceState(null, '', url)
  el = document.createElement('div'); document.body.appendChild(el); rot = createRoot(el)
  await act(async () => { rot.render(<MaskinvyPage />); await vanta() })
}
const vy = () => el.querySelector('[data-vy]')
const flik = (namn: string) => Array.from(el.querySelectorAll('.mv-vy-btn')).find(b => b.textContent === namn) as HTMLElement
const lage = (namn: string) => Array.from(el.querySelectorAll('.mv-seg-btn')).find(b => b.textContent === namn) as HTMLElement
const klicka = async (n: Element | null | undefined) => { await act(async () => { (n as HTMLElement).click(); await vanta() }) }
const niv = () => ((window.history.state as any)?.mvNiva ?? 0) as number
const backa = async () => { await act(async () => { window.history.back(); await vanta() }) }

beforeEach(() => {
  ;(window as any).matchMedia = (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })
})
afterEach(() => { act(() => rot.unmount()); el.remove() })

describe('Maskinvyn: backa ett steg i taget', () => {
  it('Översikt → Produktion → Avbrott: backa går tillbaka flik för flik och lämnar först sist', async () => {
    await montera('/maskinvy?ny=1')
    expect(vy()?.getAttribute('data-vy')).toBe('Översikt')
    await klicka(flik('Produktion'))
    await klicka(flik('Avbrott'))
    expect(vy()?.getAttribute('data-vy')).toBe('Avbrott')

    await backa()
    expect(vy()?.getAttribute('data-vy')).toBe('Produktion')
    await backa()
    expect(vy()?.getAttribute('data-vy')).toBe('Översikt')
    expect(window.location.pathname).toBe('/maskinvy') // vi är kvar i vyn, på ingången
  })

  it('tryck på redan vald flik lägger ingen post (backa blir inte ett tomt steg)', async () => {
    await montera('/maskinvy?ny=1&vy=produktion')
    const niva = niv()
    await klicka(flik('Produktion'))
    expect(niv()).toBe(niva)
  })

  it('maskinbyte är ett steg: backa = föregående maskin', async () => {
    await montera('/maskinvy?ny=1')
    expect(vy()?.getAttribute('data-maskin')).toBe('PONS20SDJAA270231')
    await klicka(el.querySelector('[data-byt="Översikt"]'))
    expect(vy()?.getAttribute('data-maskin')).toBe('R64428')
    await backa()
    expect(vy()?.getAttribute('data-maskin')).toBe('PONS20SDJAA270231')
  })

  it('läge: Skotare → backa = Skördare, och varje läge minns sin egen maskin i adressen', async () => {
    await montera('/maskinvy?ny=1&vy=produktion')
    await klicka(lage('Skotare'))
    expect(vy()?.getAttribute('data-vy')).toBe('SkotarProduktion')
    expect(vy()?.getAttribute('data-maskin')).toBe('A110148')
    await backa()
    expect(vy()?.getAttribute('data-vy')).toBe('Produktion')
  })

  it('byte till ett läge som saknar fliken (Kapacitet → Skotare) är ETT steg, inte två', async () => {
    await montera('/maskinvy?ny=1&vy=kapacitet')
    expect(vy()?.getAttribute('data-vy')).toBe('Kapacitet')
    const niva = niv()
    await klicka(lage('Skotare'))
    expect(niv()).toBe(niva + 1)
    expect(vy()?.getAttribute('data-vy')).toBe('SkotarÖversikt')
    await backa()
    expect(vy()?.getAttribute('data-vy')).toBe('Kapacitet')
  })

  it('sidolistan: maskin + läge i ETT steg', async () => {
    ;(window as any).matchMedia = (q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })
    await montera('/maskinvy?ny=1')
    const niva = niv()
    await klicka(el.querySelector('[data-sido]'))
    expect(niv()).toBe(niva + 1)
    expect(vy()?.getAttribute('data-maskin')).toBe('A030353')
    await backa()
    expect(vy()?.getAttribute('data-vy')).toBe('Översikt')
  })

  it('omladdning: flik, läge och maskin kommer ur adressen', async () => {
    await montera('/maskinvy?ny=1&lage=skotare&vy=avbrott&skotare=A030353')
    expect(vy()?.getAttribute('data-vy')).toBe('SkotarAvbrott')
    expect(vy()?.getAttribute('data-maskin')).toBe('A030353')
  })

  it('okänt läge/maskin i adressen faller tillbaka på standard', async () => {
    await montera('/maskinvy?ny=1&lage=nonsens&skordare=finnsinte')
    expect(vy()?.getAttribute('data-vy')).toBe('Översikt')
    expect(vy()?.getAttribute('data-maskin')).toBe('PONS20SDJAA270231')
  })

  it('den gamla vyn (utan ny=1) byter läge i historiken på samma sätt', async () => {
    await montera('/maskinvy')
    expect(vy()?.getAttribute('data-vy')).toBe('GamlaSkördare')
    await klicka(lage('Skotare'))
    expect(vy()?.getAttribute('data-vy')).toBe('GamlaSkotare')
    await backa()
    expect(vy()?.getAttribute('data-vy')).toBe('GamlaSkördare')
  })
})
