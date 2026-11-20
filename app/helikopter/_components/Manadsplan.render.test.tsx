// @vitest-environment jsdom
/**
 * /helikopter/manadsplan monteras på riktigt (jsdom, queries utbytta mot prod-fixturen) genom lägena laddar → klar och fel → Försök igen → klar.
 * Fångar hook-ordning och att sidan säger samma sak som Klar-kortet: ett datum per maskin, "ca" bara på G15-förslag, aldrig en tom plan vid fel.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import klarOkt from '../_lib/__fixtures__/klar_2026-10-17.json'
import { lasKlar } from '../_lib/klar'

const q = vi.hoisted(() => ({ hamtaKlar: vi.fn(), hamtaPrognosUtfall: vi.fn(), params: '' }))
vi.mock('../_lib/queries', () => ({ hamtaKlar: q.hamtaKlar, hamtaPrognosUtfall: q.hamtaPrognosUtfall }))
vi.mock('../_lib/manadsplanDela', () => ({ skapaManadsplanPdf: vi.fn(), delaManadsplan: vi.fn() }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(q.params) }))
// Sidan ska gå genom SAMMA steg som HelikopterVy (medUppskattadPrognos → medFoljandePrognos). Spionen märker Giants trakter som G15-förslag
// när utfallet bär markören, så testet ser att vyn verkligen matar modellen med resultatet — inte med rådatan.
vi.mock('../_lib/klar', async (orig) => {
  const m = await orig<typeof import('../_lib/klar')>()
  return {
    ...m,
    medUppskattadPrognos: (d: import('../_lib/klar').KlarData, utfall: unknown[] | null) => {
      if (!utfall || utfall.length === 0) return d
      const giant = d.maskiner.find(x => x.namn === 'Giant')!
      return { ...d, trakter: d.trakter.map(t => (t.maskin_id === giant.maskin_id ? { ...t, uppskattad: true } : t)) }
    },
  }
})

import ManadsplanVy from './ManadsplanVy'

let root: Root | null = null
let cont: HTMLDivElement
async function monter() {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  cont = document.createElement('div'); document.body.appendChild(cont)
  root = createRoot(cont)
  await act(async () => { root!.render(<ManadsplanVy />) })
  await act(async () => { await Promise.resolve() })
}
beforeEach(() => {
  q.hamtaKlar.mockReset(); q.hamtaPrognosUtfall.mockReset()
  q.params = 'ar=2026&manad=10'
  q.hamtaPrognosUtfall.mockResolvedValue({ data: [], error: null })
})
afterEach(async () => { await act(async () => { root?.unmount() }); cont?.remove(); root = null })
const text = () => cont.textContent ?? ''

describe('ManadsplanVy', () => {
  it('visar rubriken, mot beställning, maskinerna med datum och att göra — samma tal som Klar-kortet', async () => {
    q.hamtaKlar.mockResolvedValue({ data: lasKlar(structuredClone(klarOkt)), error: null })
    await monter()
    expect(text()).toContain('Oktober 2026')
    expect(text()).toContain('Kompersmåla Skog')
    expect(text()).toContain('Mot beställning')
    expect(text()).toContain('Slutavverkning')
    expect(text()).toContain('Gallring')
    // Maskinerna: ett datum per maskin, orange efter månaden, "–" utan trakt
    expect(text()).toContain('Giant')
    expect(text()).toContain('29 okt')
    expect(text()).toContain('12 nov')
    expect(text()).toContain('Att göra')
    // Tillbaka går till helikoptern på samma månad
    const tillbaka = cont.querySelector('a[aria-label="Tillbaka till helikoptern"]')
    expect(tillbaka?.getAttribute('href')).toBe('/helikopter?ar=2026&manad=10')
    // Dela-knappen är aktiv när modellen finns
    const dela = cont.querySelector('button[aria-label="Dela månadsplan"]') as HTMLButtonElement
    expect(dela.disabled).toBe(false)
  })

  it('ett läsfel är ett fel med Försök igen — aldrig en tom plan; efter nytt försök visas planen', async () => {
    q.hamtaKlar.mockResolvedValueOnce({ data: null, error: 'nät' }).mockResolvedValueOnce({ data: lasKlar(structuredClone(klarOkt)), error: null })
    await monter()
    expect(text()).not.toContain('Mot beställning')
    const knapp = Array.from(cont.querySelectorAll('button')).find(b => /försök igen/i.test(b.textContent ?? ''))
    expect(knapp).toBeDefined()
    await act(async () => { knapp!.click() })
    await act(async () => { await Promise.resolve() })
    expect(text()).toContain('Mot beställning')
    expect(text()).toContain('Giant')
  })

  it('G15-förslaget går in i planen: utan utfall inget "ca", med utfall blir Giants datum "ca 29 okt" och sidfoten förklarar', async () => {
    q.hamtaKlar.mockResolvedValue({ data: lasKlar(structuredClone(klarOkt)), error: null })
    await monter()
    expect(text()).toContain('29 okt')
    expect(text()).not.toContain('ca 29 okt')
    await act(async () => { root?.unmount() })
    q.hamtaPrognosUtfall.mockResolvedValue({ data: [{ markor: true }], error: null })
    await monter()
    expect(text()).toContain('ca 29 okt')
    expect(text()).toContain('ca = räknat på liknande trakter')
  })

  it('kan utfallet inte läsas visas planen ändå, utan "ca" (samma som sidan: "?" gäller som förut)', async () => {
    q.hamtaKlar.mockResolvedValue({ data: lasKlar(structuredClone(klarOkt)), error: null })
    q.hamtaPrognosUtfall.mockResolvedValue({ data: null, error: 'nät' })
    const tyst = vi.spyOn(console, 'error').mockImplementation(() => {})
    await monter()
    tyst.mockRestore()
    expect(text()).toContain('Mot beställning')
    expect(text()).not.toContain('ca ')
  })
})
