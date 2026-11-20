// @vitest-environment jsdom
// Arket Träffsäkerhet monteras på riktigt: ett tal per källa, "vem låg närmast", trakterna, det ärliga tomma läget och att ett fel är ett fel.
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import type { FacitRad } from '../_lib/traffsakerhet'

vi.mock('../_lib/queries', () => ({ hamtaPrognosFacit: vi.fn(async () => ({ data: [], error: null })) }))

import TraffsakerhetSheet from './TraffsakerhetSheet'

let root: Root; let el: HTMLDivElement
beforeEach(() => { el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el) })
afterEach(() => { act(() => root.unmount()); el.remove() })

const vanta = () => act(async () => { await new Promise(r => setTimeout(r, 0)) })
async function montera(hamta: () => Promise<{ data: FacitRad[] | null; error: string | null }>) {
  await act(async () => { root.render(<TraffsakerhetSheet open onClose={() => {}} hamta={hamta} />) })
  await vanta()
}
const rad = (over: Partial<FacitRad>): FacitRad => ({
  objekt_id: 'o', namn: 'Jätsbygd au 2026', typ: 'slutavverkning', klart: '2026-08-21T10:00:00Z', skordare_g15: 48.8, skotare_g15: 107.3,
  manuell_prognos: { skordare: 56, skotare: 72 }, app_prognos: null, ...over,
})

describe('Träffsäkerhet', () => {
  it('bara planerarens prognoser (före första frysta trakten): planerarens tal, appen "–" med en ärlig rad, ingen "närmast"', async () => {
    await montera(async () => ({ data: [rad({ objekt_id: 'a' }), rad({ objekt_id: 'b', klart: '2026-09-01T00:00:00Z' })], error: null }))
    const t = el.textContent!
    expect(el.querySelector('[data-kalla="planeraren"]')!.textContent).toContain('inom')
    expect(el.querySelector('[data-kalla="appen"]')!.textContent).toContain('Inga trakter än')
    expect(t).toContain('Appens prognos fryses på varje ny trakt')
    expect(el.querySelector('[data-narmast]')).toBeNull()
    expect(el.querySelectorAll('[data-trakt]')).toHaveLength(2)
    expect(t).toContain('Skördaren blev 48,8 tim · planeraren 56 tim')
    expect(t).not.toContain('appen –')
  })
  it('med appens prognos: båda talen, vem som låg närmast, och störst skillnad först efter ett tryck', async () => {
    const rader = [
      rad({ objekt_id: 'a', namn: 'Liten', klart: '2026-10-05T00:00:00Z', skotare_g15: null, app_prognos: { skordare: 50 } }),
      rad({ objekt_id: 'b', namn: 'Stor', klart: '2026-10-01T00:00:00Z', skordare_g15: 30, skotare_g15: null, app_prognos: { skordare: 32 } }),
      rad({ objekt_id: 'c', namn: 'Mellan', klart: '2026-09-01T00:00:00Z', skotare_g15: null, app_prognos: { skordare: 60 } }),
    ]
    await montera(async () => ({ data: rader, error: null }))
    expect(el.querySelector('[data-narmast]')!.textContent).toBe('Appen låg närmast 2 av 3 gånger · planeraren 1')
    expect(el.querySelector('[data-kalla="appen"]')!.textContent).toContain('inom')
    const namn = () => Array.from(el.querySelectorAll('[data-trakt]')).map(x => x.textContent!.split('Sk')[0])
    expect(namn()[0]).toContain('Liten')
    const knapp = Array.from(el.querySelectorAll('button')).find(b => b.textContent === 'Störst skillnad')!
    await act(async () => { knapp.click() })
    expect(namn()[0]).toContain('Stor')   // 30 mot 56: 46 %
  })
  it('inga klara trakter alls: ärlig text, inga tal', async () => {
    await montera(async () => ({ data: [], error: null }))
    expect(el.textContent).toContain('Ingen klar trakt har en prognos att jämföra med än.')
    expect(el.querySelectorAll('[data-trakt]')).toHaveLength(0)
  })
  it('ett läsfel är ett fel med Försök igen, aldrig en tom lista', async () => {
    let n = 0
    await montera(async () => (n++ === 0 ? { data: null, error: 'nät' } : { data: [rad({})], error: null }))
    expect(el.textContent).toContain('Kunde inte läsa trakterna')
    expect(el.textContent).not.toContain('Ingen klar trakt')
    const knapp = Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes('Kunde inte läsa'))!
    await act(async () => { knapp.click() })
    await vanta()
    expect(el.querySelectorAll('[data-trakt]')).toHaveLength(1)
  })
})
