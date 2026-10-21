// @vitest-environment jsdom
/**
 * Skotare › Översikt › Operatörer: Max Karlsson har två operator_id på Wisent (A030353_1 och _3) och visades som
 * TVÅ rader (15,7 och 11,7 m³/G15h). En rad per person: summerade dagar och volym, vägd produktivitet.
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

const db = vi.hoisted(() => {
  const dag = (n: number) => `2026-10-${String(n).padStart(2, '0')}`
  const lass = (op: string, datum: string, v: number) => ({ datum, maskin_id: 'A030353', operator_id: op, volym_m3sub: v, korstracka_m: 640, objekt_id: 'O1', lossnings_tid: null })
  const tid = (op: string, datum: string, h: number) => ({ datum, maskin_id: 'A030353', operator_id: op, objekt_id: 'O1', processing_sek: h * 3600, terrain_sek: 0, other_work_sek: 0, kort_stopp_sek: 0, rast_sek: 0, bransle_liter: 5, tomgang_sek: 0, engine_time_sek: 0 })
  return {
    lass: [
      lass('A030353_1', dag(1), 157), lass('A030353_1', dag(2), 157),        // Max, första id: 314 m³ på 20 h = 15,7
      lass('A030353_3', dag(5), 234), lass('A030353_3', dag(6), 234), lass('A030353_3', dag(7), 234), // Max, andra id: 702 m³ på 60 h = 11,7
      lass('A030353_2', dag(3), 150),                                         // Martin: 150 m³ på 10 h = 15,0
    ],
    tid: [
      tid('A030353_1', dag(1), 10), tid('A030353_1', dag(2), 10),
      tid('A030353_3', dag(5), 20), tid('A030353_3', dag(6), 20), tid('A030353_3', dag(7), 20),
      tid('A030353_2', dag(3), 10),
    ],
    tabeller: {
      dim_maskin: [{ maskin_id: 'A030353', visningsnamn: 'Wisent', modell: 'Wisent2015', maskin_typ: 'Forwarder', aktiv_fran: '2024-07-01', aktiv_till: null, bekraftad: true }],
      dim_operator: [
        { operator_id: 'A030353_1', operator_namn: 'Max Karlsson', maskin_id: 'A030353' },
        { operator_id: 'A030353_3', operator_namn: 'Max Karlsson', maskin_id: 'A030353' },
        { operator_id: 'A030353_2', operator_namn: 'Martin Lindqvist', maskin_id: 'A030353' },
      ],
      operator_medarbetare: [
        { operator_id: 'A030353_1', medarbetare_id: 'med-max' },
        { operator_id: 'A030353_3', medarbetare_id: 'med-max' },
        { operator_id: 'A030353_2', medarbetare_id: 'med-martin' },
      ],
      skotare_objekt_manuell: [], fakt_tid: [{ maskin_id: 'A030353' }],
    } as Record<string, any[]>,
  }
})

vi.mock('@/lib/supabase', () => {
  const from = (t: string) => {
    const q: any = { select: () => q, eq: () => q, in: () => q, limit: () => q, order: () => q, gte: () => q, lte: () => q,
      then: (res: any) => Promise.resolve({ data: db.tabeller[t] ?? [], error: null }).then(res) }
    return q
  }
  const rpc = (namn: string, p: any) => {
    const kalla = namn === 'maskindata_lass' ? db.lass : namn === 'maskindata_tid' ? db.tid : []
    const rader = kalla.filter((r: any) => p.p_maskin_ids.includes(r.maskin_id)
      && (!p.p_datum_start || r.datum >= p.p_datum_start) && (!p.p_datum_slut || r.datum <= p.p_datum_slut))
    const pr: any = Promise.resolve({ data: rader, error: null })
    pr.range = (a: number, b: number) => Promise.resolve({ data: rader.slice(a, b + 1), error: null })
    return pr
  }
  return { supabase: { from, rpc } }
})

import SkotareOversiktNy from './SkotareOversiktNy'

let rot: HTMLDivElement; let r: ReturnType<typeof createRoot>
beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  ;(globalThis as any).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} }
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-21T12:00:00'))
  rot = document.createElement('div'); document.body.appendChild(rot); r = createRoot(rot)
})
afterEach(() => { act(() => r.unmount()); document.body.innerHTML = ''; vi.useRealTimers() })

const text = () => document.body.textContent || ''
const vanta = async (villkor: () => boolean) => {
  for (let i = 0; i < 100 && !villkor(); i++) await act(async () => { await new Promise(res => setTimeout(res, 5)) })
  expect(villkor(), text().slice(0, 400)).toBe(true)
}

describe('Skotare Översikt — Operatörer', () => {
  it('Max Karlsson är EN rad: 5 dagar, 1 016 m³, vägd produktivitet 12,7 (inte 15,7 och 11,7)', async () => {
    await act(async () => { r.render(<SkotareOversiktNy maskin={{ id: 'A030353', namn: 'Wisent' }} onMaskinChange={() => {}} />) })
    await vanta(() => text().includes('Martin Lindqvist'))
    const knappar = Array.from(document.body.querySelectorAll('button')).filter(b => /Karlsson|Lindqvist/.test(b.textContent || ''))
    expect(knappar.filter(b => (b.textContent || '').includes('Max Karlsson'))).toHaveLength(1)
    const max = knappar.find(b => (b.textContent || '').includes('Max Karlsson'))!.textContent!
    expect(max).toContain('5 dagar')
    expect(max).toContain('1 016 m³')
    expect(max).toContain('12,7')
    expect(max).not.toContain('15,7')
    expect(max).not.toContain('11,7')
    expect(knappar.find(b => (b.textContent || '').includes('Martin Lindqvist'))!.textContent).toContain('15,0')
  })
})
