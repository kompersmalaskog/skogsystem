// @vitest-environment jsdom
// Veckor monteras på riktigt: svaret i en mening, en rad per vecka med orden, och att ett tryck fäller ut maskinerna och orsaken.
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import type { VeckaRad } from '../_lib/queries'

const vecka = (x: Partial<VeckaRad>): VeckaRad => ({ isovecka: 47, iso_ar: 2026, fran: '2026-11-16', till: '2026-11-20', arbetsdagar: 5, arbetsdagar_kvar: 3, plan: 669, skordat: 612, skotat: 540, status: 'pagar', orsak: null,
  maskiner: [{ maskin_id: 'G', modell: null, namn: 'Giant', roll: 'skordare', volym: 612 }, { maskin_id: 'W', modell: null, namn: 'Wisent', roll: 'skotare', volym: 540 }], ...x })

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('typ=slutavverkning&ar=2026&manad=11'), useRouter: () => ({ replace: () => {} }) }))
vi.mock('../_lib/useFonsterBredd', () => ({ useFonsterBredd: () => 390 }))
vi.mock('../_lib/queries', () => ({
  hamtaManuellaMaskiner: vi.fn(async () => new Set<string>()),
  hamtaBolag: vi.fn(async () => ({ data: [{ typ: 'slutavverkning', bolag: 'Vida', lovat: 5000, skordat: 5012, skotat: 3403, takt_skordat: 300, takt_skotat: 310.8, takt_dagar: 5 }, { typ: 'slutavverkning', bolag: 'Privat', lovat: 0, skordat: 10, skotat: 5, takt_skordat: 0, takt_skotat: 0, takt_dagar: 5 }], error: null })),
  hamtaVeckor: vi.fn(async () => ({ data: [vecka({ isovecka: 45, status: 'last', fran: '2026-11-03', till: '2026-11-07', plan: 909, skordat: 870, skotat: 780, orsak: 'Regn' }), vecka({})], error: null })),
}))

import VeckorVy from './VeckorVy'

let root: Root; let el: HTMLDivElement
beforeEach(() => { el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el) })
afterEach(() => { act(() => root.unmount()); el.remove() })
const vanta = () => act(async () => { await new Promise(r => setTimeout(r, 0)) })

describe('Veckor — Hur gick veckorna?', () => {
  it('svaret först, nyast vecka överst, orden under varje vecka', async () => {
    await act(async () => { root.render(<VeckorVy />) }); await vanta()
    expect(el.textContent).toContain('Hur gick veckorna?')
    expect(el.querySelector('[data-svar]')!.textContent).toBe('Vecka 47 pågår3 dagar kvar av veckan')
    const rader = Array.from(el.querySelectorAll('[data-vecka]'))
    expect(rader.map(r => r.getAttribute('data-vecka'))).toEqual(['47', '45'])
    expect(rader[0].textContent).toContain('Skördat 612 av 669')
    expect(rader[0].textContent).toContain('57 kvar')
    expect(rader[0].textContent).toContain('129 kvar')
    expect(rader[1].textContent).toContain('3–7 nov')
    expect(rader[1].textContent).not.toContain('under')   // jämnt flöde: avslutad vecka säger inget om vad som saknas
    expect(rader[1].textContent).toContain('Skotat 780 av 909')
  })
  it('ett tryck fäller ut maskinerna och orsaken; ett till fäller ihop', async () => {
    await act(async () => { root.render(<VeckorVy />) }); await vanta()
    const knapp = () => el.querySelector('[data-vecka="45"] button') as HTMLButtonElement
    expect(el.textContent).not.toContain('Regn')
    await act(async () => { knapp().click() })
    expect(el.querySelector('[data-vecka="45"]')!.textContent).toContain('Regn')
    expect(el.textContent).toContain('Ändra orsak')
    await act(async () => { knapp().click() })
    expect(el.textContent).not.toContain('Regn')
  })
  it('egen skotning står som egen skotning under Skotat och som egen rad i maskinerna', async () => {
    const q = await import('../_lib/queries')
    const orig = (q.hamtaVeckor as any).getMockImplementation()
    ;(q.hamtaVeckor as any).mockImplementation(async () => ({ data: [vecka({ isovecka: 46, status: 'last', plan: 238, skordat: 192, skotat: 192, skotat_egen: 192, maskiner: [{ maskin_id: 'H', modell: null, namn: 'H8E', roll: 'skordare', volym: 192 }] })], error: null }))
    await act(async () => { root.render(<VeckorVy />) }); await vanta()
    expect(el.querySelector('[data-vecka="46"] [data-egen]')!.textContent).toBe('varav egen skotning 192')
    const rad = el.querySelector('[data-vecka="46"]')!
    await act(async () => { (rad.querySelector('[aria-expanded]') as HTMLElement).click() })
    expect(el.querySelector('[data-egen-maskin]')!.textContent).toContain('Egen skotning')
    expect(el.querySelector('[data-egen-maskin]')!.textContent).toContain('192')
    ;(q.hamtaVeckor as any).mockImplementation(orig)
  })
  it('rad med alla bolag under Skotat när bolag utan beställning har volym', async () => {
    const q = await import('../_lib/queries')
    const orig = (q.hamtaVeckor as any).getMockImplementation()
    ;(q.hamtaVeckor as any).mockImplementation(async () => ({ data: [vecka({ isovecka: 46, status: 'last', plan: 238, skordat: 192, skotat: 192, skordat_ovrigt: 47, skotat_ovrigt: 52 })], error: null }))
    await act(async () => { root.render(<VeckorVy />) }); await vanta()
    expect(el.querySelector('[data-vecka="46"] [data-alla]')!.textContent).toBe('Alla bolag: skördat 239 · skotat 244')
    ;(q.hamtaVeckor as any).mockImplementation(orig)
  })
  it('månadens läge står en gång överst med bolaget, utan Privat', async () => {
    await act(async () => { root.render(<VeckorVy />) }); await vanta()
    const m = el.querySelector('[data-manad]')!
    expect(m.textContent).toMatch(/^Vida · 3.403 av 5.000 skotat/)
    expect(m.textContent).not.toContain('Privat')
  })
})
