// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
import RotkapVy, { valbaraKaplangder, type SimRad } from './RotkapVy'

vi.mock('next/link', () => ({ default: (p: any) => <a {...p} /> }))

// Bågskyttebanan RP J-Hus- 25, sim_rotkap i prod 2026-10-23 (timmer per kaplängd).
const TIMMER: Record<number, number> = { 300: 96.0, 320: 93.4, 340: 91.4, 360: 89.1, 380: 86.3 }
const rad = (k: number): SimRad => ({
  objekt_id: '11271849', kaplangd_cm: k, objekt_namn: 'Bågskyttebanan RP J-Hus- 25', maskiner: ['PONS20SDJAA270231'],
  stammar_objekt: 1614, stammar: 156, grupp1_stammar: 120, grupp2_stammar: 36, utan_sagstock: 9, utan_kurva: 0,
  timmer_m3: TIMMER[k], kubb_m3: 10, massa_m3: 20, rest_m3: 0, grupp1_timmer_m3: TIMMER[k] - 10, grupp2_timmer_m3: 10,
  grupp2_kedja_fast: 0, validering: null, anmarkning: null, stockar_antal: 0, serier_antal: 0, beraknad: '2026-10-20',
})
const rader = [300, 320, 340, 360, 380].map(rad)
// Traktens prislista för massaved (BmavFall_V3): 3,0 / 3,05 / 3,4 / 3,7 / 4,0 … — 3,2, 3,6 och 3,8 m finns inte.
const BAGSKYTTE = [300, 305, 340, 370, 400, 430, 460, 490, 520]

let root: Root | null = null
let el: HTMLDivElement
afterEach(() => { act(() => root?.unmount()); root = null; el?.remove() })
const vy = (tillatna: number[] | null | undefined, kaplangd = 340) => {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el)
  act(() => root!.render(<RotkapVy rader={rader} valt="11271849" kaplangd={kaplangd} onKaplangd={() => {}} tillatna={tillatna}
    objektHref="/x" rotkapHref="/x/rotkap" />))
}
const valen = () => [...(el.querySelector('select[aria-label="Kaplängd"]')?.querySelectorAll('option') ?? [])].map(o => o.textContent)
const text = () => el.textContent ?? ''

describe('rotkapets kaplängder följer traktens prislista för massaved', () => {
  it('Bågskyttebanan: bara 3,4 m går att välja', () => {
    expect(valbaraKaplangder(BAGSKYTTE)).toEqual([340])
    vy(BAGSKYTTE)
    expect(valen()).toEqual(['3,4 m i stället för 3,0'])
  })
  it('3,4 m i stället för 3,0 m kostar 4,6 m³ timmer', () => {
    vy(BAGSKYTTE)
    expect(text()).toContain('−4,60')
  })
  it('en längd som inte finns i prislistan visas aldrig som ett tal', () => {
    vy(BAGSKYTTE, 320)
    expect(text()).not.toContain('−2,60')
  })
  it('ingen simulerad längd i prislistan: inget tal, sidan säger varför', () => {
    vy([300, 370, 400])
    expect(valen()).toEqual([])
    expect(text()).toMatch(/finns i traktens prislista för massaved/)
    expect(text()).not.toContain('−4,60')
  })
  it('prislistan gick inte att läsa: alla längder och det sägs', () => {
    vy(null)
    expect(valen()).toHaveLength(4)
    expect(text()).toMatch(/prislista kunde inte läsas/)
  })
})
