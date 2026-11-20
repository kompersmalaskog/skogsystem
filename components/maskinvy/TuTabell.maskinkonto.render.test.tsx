// @vitest-environment jsdom
/**
 * TU-tabellen (Jämförelse) som MASKINKONTO: arbetsdag (timmar per person) är spärrad för maskinkontot, så tabellen får aldrig läsa den
 * eller visa ett falskt "0 avvikelser". Maskindatan (TU per maskin ur fakt_tid) fungerar som förut. Som förare/admin läses arbetsdag som förut.
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const st = vi.hoisted(() => ({ lage: 'last' as string, lasta: [] as string[] }))

vi.mock('@/components/maskinkonto/MaskinKontoProvider', () => ({ useMaskinKonto: () => ({ lage: st.lage }) }))
vi.mock('@/app/maskinvy/useMaskinvyMaskiner', () => ({
  useMaskinvyMaskiner: (slag: string) => ({ laddar: false, maskiner: slag === 'skordare' ? [{ id: 'R64428', namn: 'H8E -26' }] : [] }),
}))
vi.mock('@/app/maskinvy/OversiktShared', async orig => ({
  ...(await orig<any>()),
  fetchAll: async (tabell: string) => {
    st.lasta.push(tabell)
    return tabell === 'fakt_tid' ? [{ datum: '2026-11-10', maskin_id: 'R64428', processing_sek: 36000, terrain_sek: 0, other_work_sek: 0, kort_stopp_sek: 0, engine_time_sek: 40000 }] : []
  },
}))
vi.mock('@/lib/supabase', () => {
  const from = (t: string) => {
    st.lasta.push(t)
    const q: any = {}
    for (const m of ['select', 'gte', 'lte', 'not', 'order', 'range']) q[m] = () => q
    q.then = (res: any) => Promise.resolve({ data: [], error: null }).then(res)
    return q
  }
  return { supabase: { from } }
})

import TuTabell from './TuTabell'

let rot: HTMLDivElement; let r: ReturnType<typeof createRoot>
beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  st.lasta = []
  rot = document.createElement('div'); document.body.appendChild(rot); r = createRoot(rot)
})
afterEach(() => { act(() => r.unmount()); rot.remove() })
const lugn = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve() }) }

describe('TuTabell som maskinkonto', () => {
  it('läser aldrig arbetsdag, visar TU ur maskindatan och ingen "Kontrollerar dagarna…" som hänger kvar', async () => {
    st.lage = 'last'
    await act(async () => { r.render(<TuTabell />) }); await lugn()
    expect(st.lasta).not.toContain('arbetsdag')
    expect(st.lasta).toContain('fakt_tid')
    expect(rot.textContent).toContain('H8E -26')
    expect(rot.textContent).toContain('1 maskindagar')
    expect(rot.textContent).not.toMatch(/Kontrollerar dagarna|förardagar/)
  })
  it('förare/admin (vanligt läge): arbetsdag läses som förut', async () => {
    st.lage = 'vanlig'
    await act(async () => { r.render(<TuTabell />) }); await lugn()
    expect(st.lasta).toContain('arbetsdag')
  })
})
