// @vitest-environment jsdom
/**
 * Skotare › Produktion med appens lass: m³ totalt och arbetsdagar räknar app-lassen, volymen märks "uppskattad" (eller "skalad" när
 * alla app-lass är skalade mot skördat), och dagsdetaljens skotningsavstånd delas bara på lassen som har ett mått.
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

const db = vi.hoisted(() => {
  const dag = (n: number) => `2026-11-${String(n).padStart(2, '0')}`
  const app = (datum: string, v: number, skalad: boolean) => ({
    datum, maskin_id: 'JD810E', operator_id: null, lossnings_tid: `${datum}T10:00:00Z`, volym_m3sub: v, korstracka_m: null, objekt_id: 'O1',
    kalla: 'app', lass_id: `${datum}-${v}`, medarbetare_id: 'med-x', volym_forare: skalad ? v - 2 : v, skalad,
  })
  return { skalade: false, dag, app, lass: [] as any[] }
})

vi.mock('@/lib/supabase', () => {
  const from = (t: string) => {
    const rader = t === 'dim_maskin'
      ? [{ maskin_id: 'JD810E', visningsnamn: '810E', modell: '810E', maskin_typ: 'Forwarder', aktiv_fran: '2024-01-01', aktiv_till: null, bekraftad: true }]
      : []
    const q: any = { select: () => q, eq: () => q, in: () => q, limit: () => q, order: () => q, gte: () => q, lte: () => q,
      then: (res: any) => Promise.resolve({ data: rader, error: null }).then(res) }
    return q
  }
  const rpc = (namn: string, p: any) => {
    const kalla = namn === 'maskindata_lass_alla'
      ? [db.app(db.dag(19), 20, db.skalade), db.app(db.dag(19), 20, db.skalade), db.app(db.dag(20), 20, db.skalade)] : []
    const rader = kalla.filter((r: any) => (p.p_maskin_ids ?? []).includes(r.maskin_id))
    const pr: any = Promise.resolve({ data: rader, error: null })
    pr.range = (a: number, b: number) => Promise.resolve({ data: rader.slice(a, b + 1), error: null })
    return pr
  }
  return { supabase: { from, rpc } }
})

import SkotareProduktionNy from './SkotareProduktionNy'

let rot: HTMLDivElement; let r: ReturnType<typeof createRoot>
beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  ;(globalThis as any).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} }
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-26T12:00:00'))
  db.skalade = false
  rot = document.createElement('div'); document.body.appendChild(rot); r = createRoot(rot)
})
afterEach(() => { act(() => r.unmount()); document.body.innerHTML = ''; vi.useRealTimers() })

const text = () => document.body.textContent || ''
const vanta = async (villkor: () => boolean) => {
  for (let i = 0; i < 100 && !villkor(); i++) await act(async () => { await new Promise(res => setTimeout(res, 5)) })
  expect(villkor(), text().slice(0, 500)).toBe(true)
}
const visa = async () => {
  await act(async () => { r.render(<SkotareProduktionNy maskin={{ id: 'JD810E', namn: '810E' }} onMaskinChange={() => {}} />) })
  await vanta(() => text().includes('Volym:'))
}

describe('Skotare Produktion med appens lass (810E)', () => {
  it('volymen märks "uppskattad": app-lass som inte är skalade är förarens egen siffra', async () => {
    await visa()
    expect(document.querySelector('[data-volym-mark="uppskattad"]')).not.toBeNull()
    expect(document.querySelector('[data-volym-mark="skalad"]')).toBeNull()
    expect(text()).toContain('60')                  // m³ totalt: 3 lass × 20 m³
  })

  it('alla app-lass skalade mot skördat (Färdigskotad): märkt "skalad"', async () => {
    db.skalade = true
    await visa()
    expect(document.querySelector('[data-volym-mark="skalad"]')).not.toBeNull()
    expect(document.querySelector('[data-volym-mark="uppskattad"]')).toBeNull()
  })
})
