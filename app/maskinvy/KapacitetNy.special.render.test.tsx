// @vitest-environment jsdom
/**
 * Kapacitet (skördare): "Färdiga objekt i perioden" visar en Special-badge på special-objekt och ingen annanstans.
 * Flaggan är bara en markering — kvoten och uteslutningarna är de samma med och utan den.
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

const OBJ = (id: string, namn: string, vo: string, extra: any = {}) => ({
  objekt_id: id, vo_nummer: vo, object_name: namn, huvudtyp: 'Slutavverkning', atgard: null, avtalsform: null,
  risskotning: false, extern_skordning: false, ovrigt_info: null,
  skotning_avslutad: '2026-10-10', skotning_avslutad_auto: false, special: false, special_skal: null, ...extra,
})
const data = vi.hoisted(() => ({ ref: {} as Record<string, any[]>, specialFel: false }))

vi.mock('@/lib/supabase', () => {
  const bygg = (t: string) => {
    let rader = () => data.ref[t] ?? []
    const q: any = {
      select: () => q, order: () => q,
      eq: (k: string, v: unknown) => {
        if (t === 'dim_objekt' && k === 'special' && data.specialFel) {
          return Promise.resolve({ data: null, error: { code: '42703', message: 'column dim_objekt.special does not exist' } })
        }
        const prev = rader; rader = () => prev().filter((r: any) => r[k] === v); return q
      },
      range: (a: number, b: number) => Promise.resolve({ data: rader().slice(a, b + 1), error: null }),
      then: (res: any) => Promise.resolve({ data: rader(), error: null }).then(res),
    }
    return q
  }
  const rpc = (namn: string, p: any) => {
    const rader = (data.ref[namn] ?? []).filter((r: any) => p.p_maskin_ids.includes(r.maskin_id))
    const pr: any = Promise.resolve({ data: rader, error: null })
    pr.range = (a: number, b: number) => Promise.resolve({ data: rader.slice(a, b + 1), error: null })
    return pr
  }
  return { supabase: { from: bygg, rpc } }
})

import KapacitetNy from './KapacitetNy'

const tid = (maskin: string, objekt: string, timmar: number) =>
  ({ maskin_id: maskin, objekt_id: objekt, processing_sek: timmar * 3600, terrain_sek: 0, other_work_sek: 0 })

let rot: HTMLDivElement; let r: ReturnType<typeof createRoot>
beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  ;(globalThis as any).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} }
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-21T12:00:00'))
  data.specialFel = false
  data.ref = {
    dim_maskin: [{ maskin_id: 'PONS20SDJAA270231', maskin_typ: 'Harvester' }, { maskin_id: 'A110148', maskin_typ: 'Forwarder' }],
    dim_objekt: [
      OBJ('11177558', 'Hushållningssällskapet', '11177558', { special: true, special_skal: 'Vindfällor' }),
      OBJ('11213462', 'Vanligt objekt', '11213462'),
    ],
    skotare_objekt_manuell: [],
    maskindata_tid: [
      tid('PONS20SDJAA270231', '11177558', 100), tid('A110148', '11177558', 80),
      tid('PONS20SDJAA270231', '11213462', 100), tid('A110148', '11213462', 80),
    ],
    maskindata_produktion: [
      { maskin_id: 'PONS20SDJAA270231', objekt_id: '11177558', volym_m3sub: 3000 },
      { maskin_id: 'PONS20SDJAA270231', objekt_id: '11213462', volym_m3sub: 3000 },
    ],
  }
  rot = document.createElement('div'); document.body.appendChild(rot); r = createRoot(rot)
})
afterEach(() => { act(() => r.unmount()); document.body.innerHTML = ''; vi.useRealTimers(); vi.restoreAllMocks() })

const text = () => document.body.textContent || ''
const vanta = async (villkor: () => boolean) => {
  for (let i = 0; i < 80 && !villkor(); i++) await act(async () => { await new Promise(res => setTimeout(res, 5)) })
  expect(villkor(), text()).toBe(true)
}
const rad = (namn: string) => Array.from(document.body.querySelectorAll('div')).find(d => d.textContent?.startsWith(namn) && d.querySelector('span'))!
const renderaKapacitet = async () => {
  await act(async () => { r.render(<KapacitetNy maskin={{ id: 'PONS20SDJAA270231', namn: 'Ponsse Scorpion' }} onMaskinChange={() => {}} />) })
  await vanta(() => text().includes('Färdiga objekt i perioden'))
}

describe('Kapacitet › Färdiga objekt: Special-badge', () => {
  it('special-objektet har badge (med skäl), det vanliga objektet har ingen', async () => {
    await renderaKapacitet()
    expect(text()).toContain('Hushållningssällskapet')
    expect(text()).toContain('Vanligt objekt')
    const badges = Array.from(document.querySelectorAll('[data-special-badge]'))
    expect(badges).toHaveLength(1)
    expect(badges[0].getAttribute('title')).toBe('Special-objekt: Vindfällor')
    // badgen sitter på special-objektets rad, inte på det vanliga
    expect(rad('Hushållningssällskapet').querySelector('[data-special-badge]')).not.toBeNull()
    expect(rad('Vanligt objekt').querySelector('[data-special-badge]')).toBeNull()
  })

  it('FLAGGAN ÄNDRAR INGEN SIFFRA: samma kvot och samma objekt med och utan special', async () => {
    await renderaKapacitet()
    const med = text().replace(/Special/g, '')
    act(() => r.unmount()); document.body.innerHTML = ''
    data.ref.dim_objekt = data.ref.dim_objekt.map(o => ({ ...o, special: false, special_skal: null }))
    rot = document.createElement('div'); document.body.appendChild(rot); r = createRoot(rot)
    await renderaKapacitet()
    expect(document.querySelector('[data-special-badge]')).toBeNull()
    expect(text()).toBe(med)
  })

  it('kolumnen finns inte än (migrationen ej körd): vyn visar objekten som förut, utan badge', async () => {
    data.specialFel = true
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await renderaKapacitet()
    expect(text()).toContain('Hushållningssällskapet')
    expect(document.querySelector('[data-special-badge]')).toBeNull()
  })
})
