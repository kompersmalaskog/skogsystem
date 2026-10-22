// @vitest-environment jsdom
/**
 * Avbrott-vyerna (skördare och skotare): kategorifärgerna är semantiska, en kategori utan stopp visas inte, och noll skrivs på ett sätt.
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

const svar = vi.hoisted(() => ({ rader: [] as any[] }))
vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: () => ({ range: () => Promise.resolve({ data: svar.rader, error: null }) }) },
}))
vi.mock('./useMaskinvyMaskiner', () => ({ useMaskinvyMaskiner: () => ({ maskiner: [{ id: 'A030353', namn: 'Wisent' }], laddar: false }) }))

import AvbrottNy from './AvbrottNy'
import SkotareAvbrottNy from './SkotareAvbrottNy'
import { FARG } from '@/lib/design/tokens'

let rot: HTMLDivElement; let r: ReturnType<typeof createRoot>
beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-21T12:00:00'))
  rot = document.createElement('div'); document.body.appendChild(rot); r = createRoot(rot)
})
afterEach(() => { act(() => r.unmount()); document.body.innerHTML = ''; vi.useRealTimers() })

const text = () => document.body.textContent || ''
const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})` }
const rad = (namn: string) => Array.from(document.querySelectorAll('div')).find(d => d.children.length === 5 && d.children[1]?.textContent === namn) as HTMLElement | undefined
const prick = (namn: string) => (rad(namn)?.children[0] as HTMLElement | undefined)?.style.background
const VYER = [
  ['skördare', () => <AvbrottNy maskin={{ id: 'PONS20SDJAA270231', namn: 'Scorpion' }} onMaskinChange={() => {}} />],
  ['skotare', () => <SkotareAvbrottNy maskin={{ id: 'A030353', namn: 'Wisent' }} onMaskinChange={() => {}} />],
] as const

async function montera(vy: () => React.ReactElement) {
  await act(async () => { r.render(vy()) })
  for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve() })
}

describe.each(VYER)('Avbrott %s', (_namn, vy) => {
  it('färgerna är semantiska: Underhåll grå, Störning orange, Reparation mörkare orange — aldrig grön eller blå', async () => {
    svar.rader = [
      { datum: '2026-10-05', kategori_kod: 'Service', typ: 'Underhåll', langd_sek: 1800 },
      { datum: '2026-10-06', kategori_kod: 'Other', typ: 'Störning', langd_sek: 1200 },
      { datum: '2026-10-07', kategori_kod: 'Hydraulics', typ: 'Reparation', langd_sek: 3600 },
      { datum: '2026-10-08', kategori_kod: 'Other', typ: 'Övrigt', langd_sek: 1000 },
    ]
    await montera(vy)
    expect(prick('Underhåll')).toBe(rgb(FARG.text2))
    expect(prick('Störning')).toBe(rgb(FARG.orange))
    expect(prick('Reparation')).toBe(rgb(FARG.orangeMork))
    const alla = ['Underhåll', 'Störning', 'Reparation', 'Övrigt'].map(prick)
    for (const f of [FARG.gron, FARG.bla]) expect(alla).not.toContain(rgb(f))
  })

  it('en kategori utan stopp visas inte — inga rader med "0 ggr" och streck', async () => {
    svar.rader = [{ datum: '2026-10-05', kategori_kod: 'Service', typ: 'Underhåll', langd_sek: 1800 }]
    await montera(vy)
    expect(rad('Underhåll')).toBeDefined()
    for (const t of ['Störning', 'Övrigt', 'Reparation']) expect(rad(t)).toBeUndefined()
    expect(text()).not.toContain('0 ggr')
  })

  it('inga stopp alls: EN rad som säger det, och noll skrivs "0" — aldrig både streck och "0 ggr"', async () => {
    svar.rader = []
    await montera(vy)
    expect(text()).toContain('Inga stopp under perioden')
    expect(rad('Underhåll')).toBeUndefined()
    expect(text()).toContain('0 min')
    expect(text()).toContain('0ggr')                      // kortet "Tillfällen": 0 + enheten
    expect(text()).not.toContain('–')                     // ingen annan nolla i form av streck
  })
})
