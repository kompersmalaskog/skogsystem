// @vitest-environment jsdom
/**
 * Produktion (skördare): periodpanelens objektlista visar Special-badge på special-objekt, och läsningen
 * (fetchProduktion) ändrar ingen siffra av att objektet är special.
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

const data = vi.hoisted(() => ({ special: true as boolean }))

vi.mock('@/lib/supabase', () => {
  const OBJEKT = [
    { objekt_id: '11177558', object_name: 'Hushållningssällskapet' },
    { objekt_id: '11213462', object_name: 'Vanligt objekt' },
  ]
  const from = (t: string) => {
    const q: any = {
      select: () => q, in: () => q,
      eq: (k: string, v: unknown) => {
        if (t === 'dim_objekt' && k === 'special' && v === true) {
          return Promise.resolve({ data: data.special ? [{ objekt_id: '11177558', special_skal: 'Vindfällor' }] : [], error: null })
        }
        return q
      },
      then: (res: any) => Promise.resolve({ data: t === 'dim_objekt' ? OBJEKT : [], error: null }).then(res),
    }
    return q
  }
  const rpc = (namn: string) => {
    const rader = namn === 'maskindata_produktion' ? [
      { datum: '2026-10-05', volym_m3sub: 120, stammar: 300, operator_id: 'op1', objekt_id: '11177558' },
      { datum: '2026-10-05', volym_m3sub: 80, stammar: 200, operator_id: 'op1', objekt_id: '11213462' },
    ] : []
    const pr: any = Promise.resolve({ data: rader, error: null })
    pr.range = (a: number, b: number) => Promise.resolve({ data: rader.slice(a, b + 1), error: null })
    return pr
  }
  return { supabase: { from, rpc } }
})

import { fetchProduktion, PeriodDetalj } from './ProduktionNy'

let rot: HTMLDivElement; let r: ReturnType<typeof createRoot>
beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  data.special = true
  rot = document.createElement('div'); document.body.appendChild(rot); r = createRoot(rot)
})
afterEach(() => { act(() => r.unmount()); document.body.innerHTML = '' })

describe('Produktion › special-objekt', () => {
  it('fetchProduktion ger namn → skäl för special-objekten bland dagens objekt', async () => {
    const d = await fetchProduktion('R64428', '2026-10-01', '2026-10-31')
    expect(d.specialNamn).toEqual({ Hushållningssällskapet: 'Vindfällor' })
    expect(d.perDag['2026-10-05'].objektNamn).toEqual(['Hushållningssällskapet', 'Vanligt objekt'])
  })

  it('FLAGGAN ÄNDRAR INGEN SIFFRA: volym, stammar, dagar och m³/dag är desamma med och utan special', async () => {
    const med = await fetchProduktion('R64428', '2026-10-01', '2026-10-31')
    data.special = false
    const utan = await fetchProduktion('R64428', '2026-10-01', '2026-10-31')
    expect(utan.specialNamn).toEqual({})
    const { specialNamn: _a, ...medSiffror } = med
    const { specialNamn: _b, ...utanSiffror } = utan
    expect(medSiffror).toEqual(utanSiffror)
    expect(med.totalVolym).toBe(200)
  })

  it('periodpanelen: badge på special-objektet, inte på det vanliga', async () => {
    const d = await fetchProduktion('R64428', '2026-10-01', '2026-10-31')
    const dag = d.perDag['2026-10-05']
    const bucket = {
      kind: 'day' as const, key: '2026-10-05', start: '2026-10-05', end: '2026-10-05', label: '5/10', titleLabel: 'Måndag 5 oktober 2026',
      vol: dag.vol, stammar: dag.stammar, objektNamn: dag.objektNamn, forareNamn: dag.forareNamn, avbrott: dag.avbrott, arbetsdagar: 1,
    }
    await act(async () => { r.render(<PeriodDetalj bucket={bucket} specialNamn={d.specialNamn} onClose={() => {}} />) })
    const rader = Array.from(document.querySelectorAll('div')).filter(el => el.children.length === 1 && el.firstElementChild?.tagName === 'SPAN' && /Hushållningssällskapet|Vanligt objekt/.test(el.textContent || ''))
    const hush = rader.find(el => el.textContent?.startsWith('Hushållningssällskapet'))!
    const vanligt = rader.find(el => el.textContent === 'Vanligt objekt')!
    expect(hush.querySelector('[data-special-badge]')?.getAttribute('title')).toBe('Special-objekt: Vindfällor')
    expect(vanligt.querySelector('[data-special-badge]')).toBeNull()
    expect(document.querySelectorAll('[data-special-badge]')).toHaveLength(1)
  })
})
