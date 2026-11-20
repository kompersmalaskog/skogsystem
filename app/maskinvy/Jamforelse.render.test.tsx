// @vitest-environment jsdom
/**
 * Toppfliken Jämförelse (Elephant King mot Wisent), renderad mot data i facitets storlek
 * (produktion, oktober 2026):
 *   A130743 (Elefant 26): 139 lass · 3 028 m³ · 105,0 G15h → 28,8 m³/G15h
 *   A030353 (Wisent): 109 lass · 1 547 m³ rått, 1 501 efter manuell korrigering, 112,2 G15h → 13,4
 * Felet som rättas: vyn läste den gamla maskinen (A110148), räknade skördarens produktion som
 * skotarvolym och visade EK 322,1 / Wisent 0,9 / "+36 553,5 % bättre".
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', async () => (await import('./jamforelseFacit.fixtur')).byggSupabaseMock())
vi.mock('@/components/maskinvy/TuTabell', () => ({ default: () => null }))
// Chart.js ur paketet ersätts av en som antecknar vad som ritas (jsdom har ingen canvas).
const ritade = vi.hoisted(() => [] as any[])
vi.mock('chart.js', () => {
  class Chart {
    static register() {}
    destroy() {}
    constructor(_canvas: unknown, config: any) { ritade.push(config) }
  }
  return { Chart, registerables: [] }
})

import Jamforelse from './Jamforelse'
import { JAMFORELSE_FARG } from '@/lib/maskinvy/jamforelse'

let rot: HTMLDivElement; let r: ReturnType<typeof createRoot>
beforeEach(() => {
  ritade.length = 0
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-21T12:00:00'))
  rot = document.createElement('div'); document.body.appendChild(rot); r = createRoot(rot)
})
afterEach(() => { act(() => r.unmount()); document.body.innerHTML = ''; vi.useRealTimers() })

const text = () => document.body.textContent || ''
const klicka = async (etikett: string) => {
  const knapp = Array.from(document.body.querySelectorAll('button')).find(b => b.textContent === etikett)!
  await act(async () => { knapp.click() })
}
const vanta = async (villkor: () => boolean) => {
  for (let i = 0; i < 80 && !villkor(); i++) await act(async () => { await new Promise(res => setTimeout(res, 5)) })
  expect(villkor(), text()).toBe(true)
}

describe('Jämförelse (toppfliken) mot facit', () => {
  it('oktober: EK 28,8 mot Wisent 13,4 — inte 322,1 mot 0,9', async () => {
    await act(async () => { r.render(<Jamforelse />) })
    await vanta(() => text().includes('m³ data'))
    const t = text()
    expect(t).toContain('28,8')
    expect(t).toContain('13,4')
    expect(t).not.toContain('322')
    expect(t).not.toMatch(/36\s?553/)
    // volymen på korten: EK:s egna lass, Wisent efter manuell korrigering
    expect(t).toContain('3 028 m³ data')
    expect(t).toContain('1 501 m³ data')
    // skillnaden är ungefär en fördubbling, med svenskt decimaltecken
    expect(t).toMatch(/\+11\d,\d\s%\sbättre/)
  })

  it('flyttobjektet utan lass (4,4 h G15) ingår i totalen: 28,8, inte 30,1', async () => {
    await act(async () => { r.render(<Jamforelse />) })
    await vanta(() => text().includes('m³ data'))
    // totalkortet: hela maskinens timmar. (Klassraden 300–400 m visar 30,1 med rätta — flytten har ingen klass.)
    expect(text()).toMatch(/Elephant King \(bred\)28,8/)
    expect(text()).not.toMatch(/Elephant King \(bred\)30,1/)
    expect(document.body.querySelector('[data-utan-klass]')!.textContent).toContain('EK 4,4 h G15')
  })

  it('"Produktion per avståndsklass" ritar riktiga staplar och är aldrig ett tomt kort', async () => {
    await act(async () => { r.render(<Jamforelse />) })
    await vanta(() => ritade.length > 0)
    const cfg = ritade[ritade.length - 1]
    expect(cfg.data.labels).toHaveLength(5)                       // bara de fem klasserna, inte "utan klass"
    const [ek, wi] = cfg.data.datasets.map((d: any) => d.data)
    expect(ek[2]).toBeCloseTo(3028 / 100.6, 1)                    // klass 300–400 m
    expect(wi[2]).toBeGreaterThan(0)
    // en maskin = samma färg överallt: Wisent blå, Elephant King lila (som Skotare › Jämförelse)
    expect(cfg.data.datasets[0].backgroundColor).toBe(JAMFORELSE_FARG.ek)
    expect(cfg.data.datasets[1].backgroundColor).toBe(JAMFORELSE_FARG.wisent)
    expect(document.body.querySelector('canvas')).not.toBeNull()
    expect(document.body.querySelector('[data-graf-tom]')).toBeNull()
  })

  it('inget att rita i perioden: kortet säger det i stället för att stå tomt', async () => {
    vi.setSystemTime(new Date('2026-07-20T12:00:00'))
    await act(async () => { r.render(<Jamforelse />) })
    await vanta(() => !!document.body.querySelector('[data-graf-tom]'))
    expect(document.body.querySelector('canvas')).toBeNull()
    expect(ritade).toHaveLength(0)
  })

  it('tabellhuvudets prickar har maskinernas färg (lila EK, blå Wisent) — inte vitt/grönt', async () => {
    await act(async () => { r.render(<Jamforelse />) })
    await vanta(() => text().includes('m³ data'))
    const huvud = Array.from(document.body.querySelectorAll('th span')).map(sp => (sp as HTMLElement).style.background)
    expect(huvud).toEqual(['rgb(94, 92, 230)', 'rgb(10, 132, 255)'])   // #5e5ce6, #0a84ff
  })

  it('talformat: svenskt decimaltecken överallt, aldrig punkt', async () => {
    await act(async () => { r.render(<Jamforelse />) })
    await vanta(() => text().includes('m³ data'))
    expect(text()).not.toMatch(/\d\.\d+\s?(m³|%)/)
  })

  it('juli (gamla Elephant King slutade 8 juli, ingen G15 i datan): "–" med orsak, ingen division', async () => {
    vi.setSystemTime(new Date('2026-07-20T12:00:00'))
    await act(async () => { r.render(<Jamforelse />) })
    await vanta(() => text().includes('Ingen G15-tid registrerad i perioden'))
    expect(text()).not.toContain('Infinity')
    expect(text()).not.toContain('NaN')
  })

  it('period utan Wisent (2023): orsaken säger att maskinen inte var aktiv', async () => {
    await act(async () => { r.render(<Jamforelse />) })
    await vanta(() => text().includes('m³ data'))
    await klicka('Å')
    for (let i = 0; i < 3; i++) await klicka('‹')
    await vanta(() => text().includes('Ingen maskin av den här sorten är aktiv i perioden'))
    expect(text()).not.toContain('NaN')
  })
})
