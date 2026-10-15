// @vitest-environment jsdom
/**
 * Historik och Månadsfacit monteras på riktigt (jsdom, queries utbytta mot prod-fixturerna) genom alla lägen:
 * laddar → klar, fel → Försök igen → klar, tomt. Fångar hook-ordning och att ett fel aldrig blir "0 %" eller en tom lista.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import facitSep from '../_lib/__fixtures__/manadsfacit_2026-09.json'
import historikOkt from '../_lib/__fixtures__/historik_2026-10-15.json'
import { lasHistorik, lasManadsfacit } from '../_lib/manadsfacit'

const q = vi.hoisted(() => ({ hamtaHistorik: vi.fn(), hamtaManadsfacit: vi.fn(), skapaPdf: vi.fn(), params: '' }))
vi.mock('../_lib/queries', () => ({ hamtaHistorik: q.hamtaHistorik, hamtaManadsfacit: q.hamtaManadsfacit }))
vi.mock('../_lib/manadsfacitDela', () => ({ skapaManadsfacitPdf: q.skapaPdf, delaManadsfacit: vi.fn() }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(q.params) }))

import HistorikInnehall from './HistorikInnehall'
import ManadsfacitVy from './ManadsfacitVy'

let root: Root | null = null
let cont: HTMLDivElement
async function monter(el: React.ReactElement) {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  cont = document.createElement('div'); document.body.appendChild(cont)
  root = createRoot(cont)
  await act(async () => { root!.render(el) })
  await act(async () => { await Promise.resolve() })
}
beforeEach(() => { q.hamtaHistorik.mockReset(); q.hamtaManadsfacit.mockReset(); q.skapaPdf.mockReset(); q.params = '' })
afterEach(async () => { await act(async () => { root?.unmount() }); cont?.remove(); root = null })
const text = () => cont.textContent ?? ''
const knapp = (t: string) => Array.from(cont.querySelectorAll('button')).find(b => b.textContent === t) as HTMLButtonElement | undefined

describe('HistorikInnehall', () => {
  it('visar snittet, staplarna och en rad per månad, nyast först, med länk till facit', async () => {
    q.hamtaHistorik.mockResolvedValue({ data: lasHistorik(historikOkt), error: null })
    await monter(<HistorikInnehall />)
    expect(text()).toContain('51 %')
    expect(text()).toContain('snitt senaste 5 månader · 0 av 5 månader inom ±5 %')
    const rader = Array.from(cont.querySelectorAll('a')).filter(a => a.getAttribute('href')?.startsWith('/helikopter/manad'))
    // 5 staplar + 5 rader, båda länkar till månadens facit.
    expect(rader).toHaveLength(10)
    const radLankar = rader.filter(a => /20\d\d$|\d %.*chevron/.test(a.textContent ?? '') || (a.textContent ?? '').includes('2026'))
    expect(radLankar.map(a => a.getAttribute('href'))).toEqual([
      '/helikopter/manad?ar=2026&manad=9', '/helikopter/manad?ar=2026&manad=8', '/helikopter/manad?ar=2026&manad=7', '/helikopter/manad?ar=2026&manad=6', '/helikopter/manad?ar=2026&manad=4',
    ])
    expect(text()).toContain('September 2026')
    expect(text()).toContain('109 %')
  })

  it('ett fel är ett fel med Försök igen — aldrig 0 % eller en tom lista', async () => {
    q.hamtaHistorik.mockResolvedValueOnce({ data: null, error: 'nätet' })
    q.hamtaHistorik.mockResolvedValueOnce({ data: lasHistorik(historikOkt), error: null })
    await monter(<HistorikInnehall />)
    expect(text()).toContain('Kunde inte läsa data')
    expect(text()).not.toContain('51 %')
    await act(async () => { knapp('Försök igen')!.click() })
    await act(async () => { await Promise.resolve() })
    expect(text()).toContain('51 %')
    expect(q.hamtaHistorik).toHaveBeenCalledTimes(2)
  })

  it('ingen månad med beställning: säger det', async () => {
    q.hamtaHistorik.mockResolvedValue({ data: { manader: [], snitt_6m: null, antal_6m: 0, inom_5_6m: 0 }, error: null })
    await monter(<HistorikInnehall />)
    expect(text()).toContain('Ingen historik än')
  })
})

describe('ManadsfacitVy', () => {
  it('september 2026: svaret, ett kort per spår och veckorna', async () => {
    q.params = 'ar=2026&manad=9'
    q.hamtaManadsfacit.mockResolvedValue({ data: lasManadsfacit(facitSep), error: null })
    await monter(<ManadsfacitVy />)
    expect(q.hamtaManadsfacit).toHaveBeenCalledWith(2026, 9)
    const t = text().replace(/[\u00a0\u202f]/g, ' ')
    expect(t).toContain('September 2026')
    expect(t).toContain('mot beställning')
    expect(t).toContain('109 %')
    expect(t).toContain('Levererat 6 532 av 6 000 m³fub')
    expect(t).toContain('Slutavverkning · 5 000 till Vida')
    expect(t).toContain('103 %')
    expect(t).toContain('Klart 30 sep · 2 835 skotat från augusti')
    expect(t).toContain('v36')
    expect(t).toContain('Skördat 5 918 · skotat 6 532 m³fub · 5 maskiner · 22 arbetsdagar')
    expect(cont.querySelector('button[aria-label="Dela månadsfacit"]')).toBeTruthy()
  })

  it('färgerna följer appen: stora talet och skotat-mätaren gröna ≥ beställt, skördat grått, veckostaplar som i Veckor', async () => {
    q.params = 'ar=2026&manad=9'
    q.hamtaManadsfacit.mockResolvedValue({ data: lasManadsfacit(facitSep), error: null })
    await monter(<ManadsfacitVy />)
    const GRON = 'rgb(48, 209, 88)', ORANGE = 'rgb(255, 159, 10)', GRA = 'rgb(142, 142, 147)'
    const stort = Array.from(cont.querySelectorAll('div')).find(d => d.textContent === '109 %') as HTMLElement
    expect(stort.style.color).toBe(GRON)
    // Mätare: skördat grå, skotat grön (båda spåren når beställt i september).
    const matare = Array.from(cont.querySelectorAll('section')).slice(1, 3).map(sec => Array.from(sec.querySelectorAll<HTMLElement>('div')).filter(d => d.style.height === '6px'))
    for (const [skordat, skotat] of matare) {
      expect((skordat.firstElementChild as HTMLElement).style.background).toBe(GRA)
      expect((skotat.firstElementChild as HTMLElement).style.background).toBe(GRON)
    }
    // Procenten efter skotat-talet i mätarens färg.
    const pct = Array.from(cont.querySelectorAll('span')).filter(sp => /^ ?\d+ %$/.test(sp.textContent ?? ''))
    expect(pct.map(sp => (sp as HTMLElement).style.color)).toEqual([GRON, GRON])
    // Veckostaplarna: Veckor-diagrammets färg — v36 skördat 1 392 ≥ plan 1 091 (grön), skotat 565 < 1 091 (orange).
    const veckorSektion = cont.querySelectorAll('section')[3]
    const staplar = Array.from(veckorSektion.querySelectorAll<HTMLElement>('div')).filter(d => d.style.position === 'absolute')
    expect(staplar[0].style.background).toBe(GRON)
    expect(staplar[1].style.background).toBe(ORANGE)
    // Förklaringen är Veckor-diagrammets (ikon + namn).
    expect(veckorSektion.textContent).toContain('Skördat')
    expect(veckorSektion.textContent).toContain('Skotat')
  })

  it('utan parametrar visas föregående månad', async () => {
    q.hamtaManadsfacit.mockResolvedValue({ data: lasManadsfacit(facitSep), error: null })
    await monter(<ManadsfacitVy />)
    const nu = new Date()
    const forra = new Date(nu.getFullYear(), nu.getMonth() - 1, 1)
    expect(q.hamtaManadsfacit).toHaveBeenCalledWith(forra.getFullYear(), forra.getMonth() + 1)
  })

  it('fel: Försök igen, delaknappen avstängd — aldrig 0 %', async () => {
    q.params = 'ar=2026&manad=9'
    q.hamtaManadsfacit.mockResolvedValueOnce({ data: null, error: 'nätet' })
    q.hamtaManadsfacit.mockResolvedValueOnce({ data: lasManadsfacit(facitSep), error: null })
    await monter(<ManadsfacitVy />)
    expect(text()).toContain('Kunde inte läsa data')
    expect(text()).not.toContain('0 %')
    expect((cont.querySelector('button[aria-label="Dela månadsfacit"]') as HTMLButtonElement).disabled).toBe(true)
    await act(async () => { knapp('Försök igen')!.click() })
    await act(async () => { await Promise.resolve() })
    expect(text()).toContain('109 %')
    expect((cont.querySelector('button[aria-label="Dela månadsfacit"]') as HTMLButtonElement).disabled).toBe(false)
  })

  it('månad utan beställning: säger det, ingen procent', async () => {
    q.params = 'ar=2026&manad=5'
    q.hamtaManadsfacit.mockResolvedValue({ data: lasManadsfacit({ ar: 2026, manad: 5, status: 'avslutad', spar: { slutavverkning: null, gallring: null }, totalt: null }), error: null })
    await monter(<ManadsfacitVy />)
    expect(text()).toContain('Ingen beställning i maj 2026')
    expect(text()).not.toContain('%')
  })

  it('delaarket: PDF och bild som val', async () => {
    q.params = 'ar=2026&manad=9'
    q.hamtaManadsfacit.mockResolvedValue({ data: lasManadsfacit(facitSep), error: null })
    await monter(<ManadsfacitVy />)
    await act(async () => { (cont.querySelector('button[aria-label="Dela månadsfacit"]') as HTMLButtonElement).click() })
    const alla = Array.from(document.body.querySelectorAll('button')).map(b => b.textContent ?? '')
    expect(alla.some(t => t.includes('Dela som PDF'))).toBe(true)
    expect(alla.some(t => t.includes('Dela som bild'))).toBe(true)
  })

  it('"Dela som PDF" öppnar förhandsvisningen (PDF skapas då) i stället för att dela direkt', async () => {
    q.params = 'ar=2026&manad=9'
    q.hamtaManadsfacit.mockResolvedValue({ data: lasManadsfacit(facitSep), error: null })
    q.skapaPdf.mockReturnValue(new Promise(() => {})) // aldrig klar: vi vill se laddar-läget
    await monter(<ManadsfacitVy />)
    await act(async () => { (cont.querySelector('button[aria-label="Dela månadsfacit"]') as HTMLButtonElement).click() })
    expect(q.skapaPdf).not.toHaveBeenCalled() // arket öppet, ingenting skapat än
    const pdfRad = Array.from(document.body.querySelectorAll('button')).find(b => (b.textContent ?? '').includes('Dela som PDF')) as HTMLButtonElement
    await act(async () => { pdfRad.click() })
    await act(async () => { await Promise.resolve() })
    expect(document.body.querySelector('[role=dialog][aria-label="Förhandsvisning av PDF"]')).toBeTruthy()
    expect(document.body.textContent).toContain('Skapar PDF…')
    expect(q.skapaPdf).toHaveBeenCalledTimes(1)
    // Delaarket är stängt.
    expect(Array.from(document.body.querySelectorAll('button')).some(b => (b.textContent ?? '').includes('Dela som bild'))).toBe(false)
  })
})
