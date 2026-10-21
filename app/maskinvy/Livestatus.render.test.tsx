// @vitest-environment jsdom
/**
 * Livestatus (när maskinen senast SA något) och maskinhälsa (när senaste FIL importerades) — Översiktens övre kort
 * och Idags rad. Samma regler i båda flikarna: grön < 20 min, gul 20–60 min, grå > 60 min; färgen bär aldrig ensam.
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

const NU = new Date('2026-10-21T14:00:00Z')
const fore = (min: number) => new Date(NU.getTime() - min * 60000).toISOString()

const db = vi.hoisted(() => ({
  signal: { data: [] as any[], error: null as any },
  fil: { data: [] as any[], error: null as any },
  rpc: [] as Array<{ namn: string; p: any }>,
}))

vi.mock('@/lib/supabase', () => {
  const rpc = (namn: string, p: any) => { db.rpc.push({ namn, p }); return Promise.resolve(db.signal) }
  const from = () => {
    const q: any = { select: () => q, in: () => q, order: () => q, limit: () => Promise.resolve(db.fil) }
    return q
  }
  return { supabase: { rpc, from } }
})

import { FARG } from '@/lib/design/tokens'
import { LivestatusKort, LivestatusRad } from './Livestatus'

let rot: HTMLDivElement; let r: ReturnType<typeof createRoot>
beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NU)
  db.signal = { data: [], error: null }; db.fil = { data: [], error: null }; db.rpc = []
  rot = document.createElement('div'); document.body.appendChild(rot); r = createRoot(rot)
})
afterEach(() => { act(() => r.unmount()); document.body.innerHTML = ''; vi.useRealTimers() })

const text = () => document.body.textContent || ''
const vanta = async (villkor: () => boolean) => {
  for (let i = 0; i < 100 && !villkor(); i++) await act(async () => { await new Promise(res => setTimeout(res, 5)) })
  expect(villkor(), text().slice(0, 300)).toBe(true)
}
// jsdom skriver färger som rgb(…); jämför mot tokens, inte mot en hexliteral
const rgb = (hex: string) => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`
const prickFarg = (valj: string) => (document.querySelector(`${valj} [aria-hidden]`) as HTMLElement | null)?.style.background ?? ''

describe('LivestatusKort — skördare', () => {
  it('signal för 4 min sedan och fil för 6 min sedan: båda gröna, med ord', async () => {
    db.signal = { data: [{ datum: '2026-10-21', skapad_tid: fore(4) }], error: null }
    db.fil = { data: [{ importerad_tid: fore(6), status: 'OK' }], error: null }
    await act(async () => { r.render(<LivestatusKort maskin={{ id: 'PONS20SDJAA270231' }} roll="skordare" />) })
    await vanta(() => text().includes('Filer in'))
    expect(text()).toContain('Aktiv nu · senaste signal för 4 min sedan')
    expect(text()).toContain('Filer in · senaste för 6 min sedan')
    expect(db.rpc[0]).toEqual({ namn: 'maskindata_produktion_senaste', p: { p_maskin_ids: ['PONS20SDJAA270231'] } })
    expect(prickFarg('[data-livestatus]')).toBe(rgb(FARG.gron))
  })

  it('signalen är gammal men filen färsk: livestatus grå, maskinhälsa grön — de är två olika saker', async () => {
    db.signal = { data: [{ datum: '2026-10-21', skapad_tid: fore(180) }], error: null }
    db.fil = { data: [{ importerad_tid: fore(3), status: 'OK' }], error: null }
    await act(async () => { r.render(<LivestatusKort maskin={{ id: 'PONS20SDJAA270231' }} roll="skordare" />) })
    await vanta(() => text().includes('Filer in'))
    expect(text()).toContain('Inget sedan 13:00')
    expect(prickFarg('[data-livestatus]')).toBe(rgb(FARG.text3))
    expect(prickFarg('[data-importhalsa]')).toBe(rgb(FARG.gron))
  })

  it('senast en annan dag: "Senaste körning: 20 okt · igår", ingen grön prick', async () => {
    db.signal = { data: [{ datum: '2026-10-20', skapad_tid: fore(1500) }], error: null }
    db.fil = { data: [{ importerad_tid: fore(5), status: 'OK' }], error: null }
    await act(async () => { r.render(<LivestatusKort maskin={{ id: 'PONS20SDJAA270231' }} roll="skordare" />) })
    await vanta(() => text().includes('Senaste körning'))
    expect(text()).toContain('Senaste körning: 20 okt · igår')
  })

  it('en misslyckad import är ett fel som sägs, i rött', async () => {
    db.signal = { data: [{ datum: '2026-10-21', skapad_tid: fore(4) }], error: null }
    db.fil = { data: [{ importerad_tid: fore(2), status: 'FEL' }], error: null }
    await act(async () => { r.render(<LivestatusKort maskin={{ id: 'R64428' }} roll="skordare" />) })
    await vanta(() => text().includes('importfel'))
    expect(text()).toContain('Senaste filen gav importfel · 15:58')
    expect(prickFarg('[data-importhalsa]')).toBe(rgb(FARG.rod))
  })

  it('läsfel är ett fel — aldrig en grå prick som ser ut som "inget hände"', async () => {
    db.signal = { data: null as any, error: { message: 'x' } }
    db.fil = { data: null as any, error: { message: 'x' } }
    await act(async () => { r.render(<LivestatusKort maskin={{ id: 'R64428' }} roll="skordare" />) })
    await vanta(() => text().includes('Kunde inte läsa filimporten.'))
    expect(text()).toContain('Kunde inte läsa maskinens status.')
  })

  it('kombinationen R64101+R64428 frågar båda maskinerna', async () => {
    db.signal = { data: [{ datum: '2026-10-21', skapad_tid: fore(4) }], error: null }
    db.fil = { data: [{ importerad_tid: fore(6), status: 'OK' }], error: null }
    await act(async () => { r.render(<LivestatusKort maskin={{ id: 'R64101+R64428' }} roll="skordare" />) })
    await vanta(() => text().includes('Filer in'))
    expect(db.rpc[0].p).toEqual({ p_maskin_ids: ['R64101', 'R64428'] })
  })
})

describe('LivestatusKort — skotare läser lossningstiden', () => {
  it('maskindata_lass_senaste → lossnings_tid', async () => {
    db.signal = { data: [{ datum: '2026-10-21', lossnings_tid: fore(30) }], error: null }
    db.fil = { data: [{ importerad_tid: fore(10), status: 'OK' }], error: null }
    await act(async () => { r.render(<LivestatusKort maskin={{ id: 'A030353' }} roll="skotare" />) })
    await vanta(() => text().includes('Filer in'))
    expect(db.rpc[0].namn).toBe('maskindata_lass_senaste')
    expect(text()).toContain('Senaste signal för 30 min sedan')
    expect(prickFarg('[data-livestatus]')).toBe(rgb(FARG.gul))
  })
})

describe('LivestatusRad ram — Idag', () => {
  it('samma rad som Översikten, i eget kort; inte idag får orange ram', async () => {
    await act(async () => { r.render(<LivestatusRad ram loading={false} fresh={{ senasteDatum: '2026-10-19', signalIso: fore(3000), daysDiff: 2 }} />) })
    expect(text()).toBe('Senaste körning: 19 okt · 2 dagar sedan')
    expect((document.querySelector('[data-livestatus]') as HTMLElement).style.border).toContain('0.5px solid')
  })
})
