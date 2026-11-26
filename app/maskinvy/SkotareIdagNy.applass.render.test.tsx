// @vitest-environment jsdom
/**
 * Skotare › Idag med appens egna lass. Facit ur prod 2026-11-26: Elefant 26 hade 13 lass / 300 m³ (senaste lossning 17:21 svensk
 * tid) och 810E 9 lass / 71 m³ (16:06) — vyn läste bara Opti-filerna och visade "Senast 2 nov / 10 okt".
 * Idag måste:
 *   · visa dagens lass och volym ur appen, med märket "uppskattad";
 *   · lägga lassen i rätt timme (svensk tid) i leveransstaplarna;
 *   · visa skotningsavstånd som streck med förklaring (appens lass har inget mått) — aldrig 0 m;
 *   · visa m³/G15h som streck med förklaring när maskintid saknas — aldrig en gissning.
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

const db = vi.hoisted(() => {
  // 13 lass à ca 23 m³ = 300 m³; lossningstiderna i UTC (svensk tid = +1 h i november), sista kl 16:21:50 UTC = 17:21 svensk tid.
  const tider = ['06:37', '07:30', '08:15', '08:50', '09:20', '10:05', '10:40', '11:30', '12:10', '13:00', '14:20', '15:30', '16:21']
  const vol = [20, 25, 25, 20, 25, 20, 25, 25, 20, 25, 25, 20, 25]
  const lass = tider.map((t, i) => ({
    datum: '2026-11-26', maskin_id: 'A130743', operator_id: null, lossnings_tid: `2026-11-26T${t}:30Z`, volym_m3sub: vol[i], korstracka_m: null,
    objekt_id: 'O1', kalla: 'app', lass_id: `l${i}`, medarbetare_id: 'med-daniel', volym_forare: vol[i], skalad: false,
  }))
  return { lass, tid: [] as any[], sista: '2026-11-26T16:21:50.626Z' }
})

vi.mock('@/lib/supabase', () => {
  const from = (t: string) => {
    const rader = t === 'dim_objekt' ? [{ objekt_id: 'O1', object_name: 'Skälviken RP J-Hus -25' }]
      : t === 'dim_maskin' ? [{ maskin_id: 'A130743', visningsnamn: 'Elefant 26', modell: 'Elephant King AF', maskin_typ: 'Forwarder', aktiv_fran: '2026-08-13', aktiv_till: null, bekraftad: true }]
      : []
    const q: any = { select: () => q, eq: () => q, in: () => q, gte: () => q, lt: () => q, lte: () => q, order: () => q, limit: () => q,
      then: (res: any) => Promise.resolve({ data: rader, error: null }).then(res) }
    return q
  }
  const rpc = (namn: string) => {
    const data = namn === 'maskindata_lass_senaste_alla' ? [{ datum: '2026-11-26', lossnings_tid: db.sista, kalla: 'app' }]
      : namn === 'maskindata_lass_alla' ? db.lass
      : namn === 'maskindata_tid' ? db.tid : []
    const pr: any = Promise.resolve({ data, error: null })
    pr.range = () => Promise.resolve({ data, error: null })
    return pr
  }
  return { supabase: { from, rpc } }
})

import SkotareIdagNy from './SkotareIdagNy'

let rot: HTMLDivElement; let r: ReturnType<typeof createRoot>
beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  ;(globalThis as any).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} }
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-26T18:30:00Z'))
  rot = document.createElement('div'); document.body.appendChild(rot); r = createRoot(rot)
})
afterEach(() => { act(() => r.unmount()); document.body.innerHTML = ''; vi.useRealTimers() })

const text = () => document.body.textContent || ''
const vanta = async (villkor: () => boolean) => {
  for (let i = 0; i < 100 && !villkor(); i++) await act(async () => { await new Promise(res => setTimeout(res, 5)) })
  expect(villkor(), text().slice(0, 500)).toBe(true)
}
const kort = (etikett: string): string => {
  const el = Array.from(document.body.querySelectorAll('div')).find(d => d.children.length >= 3 && (d.children[0].textContent || '') === etikett)
  return el?.textContent || ''
}
const visa = async () => {
  await act(async () => { r.render(<SkotareIdagNy maskin={{ id: 'A130743', namn: 'Elefant 26' }} onMaskinChange={() => {}} />) })
  await vanta(() => text().includes('Utkört'))
  await vanta(() => kort('Utkört').includes('300'))
}

describe('Skotare Idag med appens lass (Elefant 26, 26 nov)', () => {
  it('dagens siffror ur appen: 300 m³ och 13 lass, märkt "uppskattad"', async () => {
    await visa()
    expect(kort('Utkört')).toContain('300')
    expect(kort('Lass')).toContain('13')
    expect(document.querySelector('[data-volym-mark="uppskattad"]')).not.toBeNull()
  })

  it('skotningsavstånd: streck + "mäts inte för appens lass" — aldrig 0 m', async () => {
    await visa()
    const av = kort('Skotningsavstånd')
    expect(av).toContain('—')
    expect(av).toContain('mäts inte för appens lass')
    expect(av).not.toMatch(/\b0\s*m\b/)
  })

  it('m³/G15h: streck med förklaring när maskintid saknas — aldrig en gissning', async () => {
    await visa()
    const k = kort('m³/G15h')
    expect(k).toContain('—')
    expect(k).toContain('ingen maskintid för de här dagarna')
    expect(text()).not.toMatch(/NaN|Infinity/)
  })

  it('senaste lossning 17:21 (svensk tid) syns i färskhetsraden — inte "Senast 2 nov"', async () => {
    await visa()
    expect(text()).not.toContain('2 nov')
    expect(text()).toMatch(/17[:.]21/)
  })
})
