// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
import RotkapVy, { simuleradeLangder, type SimRad } from './RotkapVy'

vi.mock('next/link', () => ({ default: (p: any) => <a {...p} /> }))

// Bågskyttebanan RP J-Hus- 25, sim_rotkap i prod 2026-10-23 (timmer per kaplängd).
const TIMMER: Record<number, number> = { 300: 96.0, 320: 93.4, 340: 91.4, 360: 89.1, 380: 86.3 }
const rad = (k: number): SimRad => ({
  objekt_id: '11271849', kaplangd_cm: k, objekt_namn: 'Bågskyttebanan RP J-Hus- 25', maskiner: ['PONS20SDJAA270231'],
  stammar_objekt: 1614, stammar: 156, grupp1_stammar: 144, grupp2_stammar: 12, utan_sagstock: 9, utan_kurva: 0,
  timmer_m3: TIMMER[k], kubb_m3: 10, massa_m3: 20, rest_m3: 0, grupp1_timmer_m3: TIMMER[k] - 10, grupp2_timmer_m3: 10,
  grupp2_kedja_fast: 0, validering: null, anmarkning: null, stockar_antal: 0, serier_antal: 0, beraknad: '2026-10-20',
})
const rader = [300, 320, 340, 360, 380].map(rad)

let root: Root | null = null
let el: HTMLDivElement
afterEach(() => { act(() => root?.unmount()); root = null; el?.remove() })
const vy = (r: SimRad[], kaplangd = 340, onKaplangd = (_: number) => {}) => {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el)
  act(() => root!.render(<RotkapVy rader={r} valt="11271849" kaplangd={kaplangd} onKaplangd={onKaplangd}
    objektHref="/x" rotkapHref="/x/rotkap" />))
}
const text = () => el.textContent ?? ''
const radText = () => [...el.querySelectorAll('section[aria-label="Förlorat timmer per längd"] button')].map(b => b.textContent)

describe('rotkapet visar varje simulerad längd mot 3,0 m', () => {
  it('längderna läses ur raderna, kortast först, utan referensen', () => {
    expect(simuleradeLangder(rader, '11271849')).toEqual([320, 340, 360, 380])
    expect(simuleradeLangder(rader, 'annat')).toEqual([])
  })
  it('en rad per längd med förlusten', () => {
    vy(rader)
    const r = radText()
    expect(r).toHaveLength(4)
    expect(r[0]).toContain('3,2 m'); expect(r[0]).toContain('−2,6 m³')
    expect(r[1]).toContain('3,4 m'); expect(r[1]).toContain('−4,6 m³')
    expect(r[3]).toContain('3,8 m'); expect(r[3]).toContain('−9,7 m³')
  })
  it('rubriken är frågan och bilden visar vald längd', () => {
    vy(rader, 360)
    expect(text()).toContain('Timmer du förlorar')
    expect(text()).toContain('om rotbiten kapas längre än 3,0 m')
    expect(text()).toContain('Om rotbiten är 3,6 m')
    expect(text()).toContain('Biten som var timmer'); expect(text()).toContain('blir massaved')
    const vald = el.querySelector('button[aria-pressed="true"]')
    expect(vald?.textContent).toContain('3,6 m')
  })
  it('kubb och toppen står inte på huvudskärmen', () => {
    vy(rader)
    expect(text()).not.toContain('Kubb')
    expect(text()).not.toContain('Var förlusten sitter')
  })
  it('ett tryck på en rad väljer längden', () => {
    const valda: number[] = []
    vy(rader, 340, k => valda.push(k))
    const knapp = [...el.querySelectorAll('section[aria-label="Förlorat timmer per längd"] button')].find(b => b.textContent?.startsWith('3,8 m'))!
    act(() => (knapp as HTMLButtonElement).click())
    expect(valda).toContain(380)
  })
  it('nya steg (3,1–3,7 m) dyker upp när simuleringen räknat dem', () => {
    const fler = [300, 310, 320, 330, 340, 350, 360, 370, 380].map(k => ({ ...rad(k in TIMMER ? k : 300), kaplangd_cm: k }))
    vy(fler)
    expect(radText()).toHaveLength(8)
  })
})
