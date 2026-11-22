// @vitest-environment jsdom
// Knappen uppe till vänster i maskinvyn (båda vyerna): hem-ikonen på ingången, en blå tillbaka-knapp som backar ETT steg — samma steg
// som systemets backa — så fort vyn lagt ett steg i historiken (flik, maskin, läge, djupvy eller panel). Toppfältet och sidan renderas
// ihop mot riktig history; bara de tunga vyerna är utbytta mot stumpar.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('next/navigation', () => ({ usePathname: () => '/maskinvy' }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }))
vi.mock('./useMaskinvyMaskiner', () => ({
  useMaskinvyMaskiner: () => ({ maskiner: [{ id: 'A110148', namn: 'Elefant 26' }, { id: 'A030353', namn: 'Wisent' }], laddar: false }),
}))
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
vi.mock('./Sidolista', () => ({ default: () => null }))

import MaskinvyPage from './page'
import TopBar from '@/components/TopBar'

const vanta = () => new Promise(r => setTimeout(r, 20))
let rot: Root
let el: HTMLElement

async function montera(url: string) {
  window.history.replaceState(null, '', url)
  el = document.createElement('div'); document.body.appendChild(el); rot = createRoot(el)
  await act(async () => { rot.render(<><TopBar /><MaskinvyPage /></>); await vanta() })
  await vanta()
}
const hem = () => Array.from(el.querySelectorAll('header a')).find(a => a.getAttribute('href') === '/') as HTMLElement | undefined
const tillbaka = () => el.querySelector('header button[aria-label="Tillbaka"]') as HTMLElement | null
const vy = () => el.querySelector('[data-vy]')?.getAttribute('data-vy')
const flik = (namn: string) => Array.from(el.querySelectorAll('.mv-vy-btn')).find(b => b.textContent === namn) as HTMLElement
const lage = (namn: string) => Array.from(el.querySelectorAll('.mv-seg-btn')).find(b => b.textContent === namn) as HTMLElement
const klicka = async (n: Element | null | undefined) => { await act(async () => { (n as HTMLElement).click(); await vanta() }); await vanta() }
const backa = async () => { await act(async () => { window.history.back(); await vanta() }); await vanta() }

beforeEach(() => {
  ;(window as any).matchMedia = (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })
})
afterEach(() => { act(() => rot.unmount()); el.remove(); document.body.removeAttribute('data-topbar-tillbaka') })

describe.each([
  ['nya vyn (?ny=1)', '/maskinvy?ny=1', 'Översikt', 'Produktion'],
  ['gamla vyn', '/maskinvy', 'GamlaSkördare', null],
])('Knappen uppe till vänster — %s', (_namn, url, startVy, flikNamn) => {
  it('vid ingången: hem-ikonen (samma som övriga vyer), ingen tillbaka-knapp', async () => {
    await montera(url)
    expect(vy()).toBe(startVy)
    expect(hem()).toBeTruthy()
    expect(hem()!.querySelector('img')?.getAttribute('alt')).toBe('Hem')
    expect(tillbaka()).toBeNull()
  })

  it('efter navigering inne i vyn: blå tillbaka-knapp som backar ETT steg, och hem-ikonen är tillbaka på ingången', async () => {
    await montera(url)
    if (flikNamn) await klicka(flik(flikNamn)); else await klicka(lage('Skotare'))
    expect(tillbaka()).toBeTruthy()
    expect(hem()).toBeUndefined()
    expect(tillbaka()!.style.color).toBe('rgb(10, 132, 255)')
    const efterNavigering = window.location.search

    await klicka(tillbaka())
    expect(window.location.search).not.toBe(efterNavigering)
    expect(vy()).toBe(startVy)
    expect(hem()).toBeTruthy()
    expect(tillbaka()).toBeNull()
  })

  it('knappen och systemets backa gör SAMMA sak (samma adress, samma historikpost, samma knappläge)', async () => {
    const stalle = async (anv: 'knapp' | 'system') => {
      await montera(url)
      if (flikNamn) { await klicka(flik(flikNamn)); await klicka(flik('Avbrott')) } else { await klicka(lage('Skotare')); await klicka(lage('Skördare')) }
      if (anv === 'knapp') await klicka(tillbaka()); else await backa()
      const r = { sok: window.location.search, niva: (window.history.state as any)?.mvNiva ?? 0, knapp: !!tillbaka(), hem: !!hem(), vy: vy() }
      act(() => rot.unmount()); el.remove()
      return r
    }
    const k = await stalle('knapp')
    const s = await stalle('system')
    expect(k).toEqual(s)
  })

  it('djupvy öppen: tillbaka-knappen STÄNGER djupvyn (ett steg), vyn står kvar och hem-ikonen kommer tillbaka', async () => {
    await montera(url)
    await klicka(el.querySelector('[data-djup-knapp]'))
    expect(el.querySelector('[data-djupvy]')).toBeTruthy()
    expect(tillbaka()).toBeTruthy()
    const sok = window.location.search

    await klicka(tillbaka())
    expect(el.querySelector('[data-djupvy]')).toBeNull()
    expect(window.location.search).toBe(sok)
    expect(vy()).toBe(startVy)
    expect(hem()).toBeTruthy()
  })

  it('går man ut ur vyn tas knapplägesmärket bort (andra vyer får sin vanliga hem-knapp)', async () => {
    await montera(url)
    if (flikNamn) await klicka(flik(flikNamn)); else await klicka(lage('Skotare'))
    expect(document.body.hasAttribute('data-topbar-tillbaka')).toBe(true)
    act(() => rot.unmount())
    expect(document.body.hasAttribute('data-topbar-tillbaka')).toBe(false)
    rot = createRoot(el) // så att afterEach kan städa
  })
})
