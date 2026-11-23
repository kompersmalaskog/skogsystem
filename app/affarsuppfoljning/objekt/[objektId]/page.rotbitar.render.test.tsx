// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

const rpc = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { stammar: 84, grupp2_stammar: 2 } }) }) }) }) }),
  },
}))
vi.mock('next/link', () => ({ default: (p: any) => <a {...p} /> }))
vi.mock('next/navigation', () => ({
  useParams: () => ({ objektId: '11280797' }),
  useSearchParams: () => new URLSearchParams('vy=tre-m&manad=alla'),
  useRouter: () => ({ push: () => {}, replace: () => {} }),
}))
import Sida from './page'

const niva2 = {
  objekt_id: '11280797', namn: 'Bondeskog', status: 'pagaende', omfang: 'objekt', manad: null, manader: ['2026-10'],
  period_fran: null, period_till: null, onskad_medellangd_m: 4.6, medellangd_m: 4.0, total_m3fub: 300,
  tre_m_stock: { m3fub: 20, st: 84, andel: 7, medellangd_utan_m3: 4.1 },
  sagbar: { m3fub: 0, andel: 0, sortiment: [], overlapp_m3: 0, antal_ur_maskinen: 0, antal_harledda: 0 },
  avkap: { st: 0, m3fub: 0, delar: [] }, valtor: [], langdfordelning: [], hemved_m3: 0,
  massa_utan_sagbar_stock_m3: 0, massa_utan_sagbar_stock_st: 0,
}
const svar = (rotbitar: unknown, fel: unknown = null) => rpc.mockImplementation((namn: string) =>
  Promise.resolve(namn === 'massaved_niva2' ? { data: niva2, error: null } : { data: rotbitar, error: fel }))

let root: Root | null = null
let el: HTMLDivElement
const montera = async () => {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el)
  await act(async () => { root!.render(<Sida />) })
  await act(async () => { await Promise.resolve() })
}
const radTexter = () => [...el.querySelectorAll('.yt-rader > *')].map(r => r.textContent ?? '')
beforeEach(() => { rpc.mockReset() })
afterEach(() => { act(() => root?.unmount()); root = null; el?.remove() })

describe('Korta rotbitar: efter 3 m blev nästa bit timmer eller kubb', () => {
  it('raden står överst med procenten i grönt, och resten av sidan är kvar', async () => {
    svar({ rotbitar: 84, nasta_sagbar: 82 })
    await montera()
    const r = radTexter()
    expect(r[0]).toContain('Efter 3 m blev nästa bit timmer eller kubb')
    expect(r[0]).toContain('98 %')
    expect(r[1]).toContain('Utan dem'); expect(r[2]).toContain('Rötan fortsatte'); expect(r[3]).toContain('Visa bitarna')
    const tal = [...el.querySelectorAll('.yt-rader > * span')].filter(s => s.textContent === '98 %').pop() as HTMLElement
    expect(tal.style.color).toBe('rgb(48, 209, 88)')   // FARG.gron #30d158
    // Etiketten är lång: den radbryts i stället för att kortas med … (annars står det "timmer e…" på en telefon).
    const etikett = [...el.querySelectorAll('.yt-rader > * span')].filter(s => s.textContent === 'Efter 3 m blev nästa bit timmer eller kubb').pop() as HTMLElement
    const stil = etikett.getAttribute('style') ?? ''
    expect(stil).not.toContain('nowrap'); expect(stil).not.toContain('ellipsis'); expect(stil).toContain('white-space: normal')
    expect(rpc).toHaveBeenCalledWith('massaved_rotbitar', { p_objekt_id: '11280797' })
  })
  it.each([[9, 9], [0, 0]])('under 10 rotbitar (%i) visas ingen rad', async (n, s) => {
    svar({ rotbitar: n, nasta_sagbar: s })
    await montera()
    expect(radTexter().join('|')).not.toContain('Efter 3 m')
    expect(radTexter()[0]).toContain('Utan dem')
  })
  it('funktionen saknas eller felar → ingen rad, sidan fungerar', async () => {
    svar(null, { message: 'function massaved_rotbitar does not exist', code: '42883' })
    await montera()
    expect(radTexter().join('|')).not.toContain('Efter 3 m')
    expect(el.textContent).toContain('Visa bitarna')
  })
})
