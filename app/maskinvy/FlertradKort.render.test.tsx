// @vitest-environment jsdom
/**
 * Flerträd-kortet: 0 % med tom graf blir EN rad ("Flerträd: inget denna period"); kortet växer när det finns data.
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

const svar = vi.hoisted(() => ({ rader: [] as any[] }))
vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: () => Promise.resolve({ data: svar.rader, error: null }) },
}))

import FlertradKort from './FlertradKort'

let rot: HTMLDivElement; let r: ReturnType<typeof createRoot>
beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-21T12:00:00'))
  rot = document.createElement('div'); document.body.appendChild(rot); r = createRoot(rot)
})
afterEach(() => { act(() => r.unmount()); document.body.innerHTML = ''; vi.useRealTimers() })

const text = () => document.body.textContent || ''
const maskin = { id: 'PONS20SDJAA270231', namn: 'Ponsse Scorpion' }
async function montera() {
  await act(async () => { r.render(<FlertradKort maskin={maskin} period="M" offset={0} />) })
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve() })
}

describe('FlertradKort', () => {
  it('mätt men inga flerträd: en enda rad, ingen "0 %", ingen graf', async () => {
    svar.rader = [
      { dag: '2026-10-05', stammar_alla: 400, stammar_matta: 400, bunt_stammar: 0, grepp: 380 },
      { dag: '2026-10-06', stammar_alla: 300, stammar_matta: 300, bunt_stammar: 0, grepp: 290 },
    ]
    await montera()
    expect(document.body.querySelector('[data-flertrad-tomt]')).not.toBeNull()
    expect(text()).toContain('Flerträd: inget denna period')
    expect(text()).toContain('0 av 700 mätta stammar')
    expect(text()).not.toContain('0 %')
    expect(text()).not.toContain('Per dag')
  })

  it('finns flerträd: fullt kort med procent och staplar', async () => {
    svar.rader = [{ dag: '2026-10-05', stammar_alla: 400, stammar_matta: 400, bunt_stammar: 48, grepp: 380 }]
    await montera()
    expect(document.body.querySelector('[data-flertrad-tomt]')).toBeNull()
    expect(text()).toContain('12 %')
    expect(text()).toContain('Per dag')
  })

  it('stammar men inget mätt: "ej mätt" — aldrig påstått noll', async () => {
    svar.rader = [{ dag: '2026-10-05', stammar_alla: 400, stammar_matta: 0, bunt_stammar: 0, grepp: 0 }]
    await montera()
    expect(document.body.querySelector('[data-flertrad-tomt]')).toBeNull()
    expect(text()).toContain('ej mätt')
  })

  it('inga stammar alls: oförändrad text', async () => {
    svar.rader = []
    await montera()
    expect(text()).toContain('Inga stammar i perioden')
  })
})
