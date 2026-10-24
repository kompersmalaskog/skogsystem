// @vitest-environment jsdom
/**
 * Produktion › kalendern: tomma dagar med känd orsak står som Semester / Ledig / Stopp. Scorpion 14–16 oktober 2026
 * (Stefans semester) är facit. En dag med produktion förklaras aldrig, och går något inte att läsa står dagarna som "Ej aktiv".
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

const SCORPION = 'PONS20SDJAA270231'
const data = vi.hoisted(() => ({
  rpcFel: false as boolean,
  datakalla: 'auto' as string,
  typ: 'semester' as string,
  dagar: [] as { maskin_id: string; datum: string; status: string; orsak: string | null }[],
}))

vi.mock('@/lib/supabase', () => {
  const from = (t: string) => {
    const q: any = {}
    for (const m of ['select', 'in', 'eq', 'is', 'lte', 'gte', 'order']) q[m] = () => q
    q.then = (res: any) => {
      const rader =
        t === 'dim_maskin' ? [{ maskin_id: SCORPION, datakalla: data.datakalla }]
        : t === 'medarbetare' ? [{ id: 'm1', maskin_id: SCORPION, aktiv: true }]
        : t === 'ledighet_ansokningar' ? [{ medarbetare_id: 'm1', typ: data.typ, startdatum: '2026-10-14', slutdatum: '2026-10-16' }]
        : []
      return Promise.resolve({ data: rader, error: null }).then(res)
    }
    return q
  }
  const rpc = (namn: string, args: any) => {
    if (namn === 'helikopter_ny_maskindag') {
      if (data.rpcFel) return Promise.resolve({ data: null, error: new Error('nej') })
      return Promise.resolve({ data: args.p_manad === 10 ? data.dagar : [], error: null })
    }
    const rader = namn === 'maskindata_produktion' ? [
      { datum: '2026-10-12', volym_m3sub: 100, stammar: 300, operator_id: 'op1', objekt_id: 'o1' },
      { datum: '2026-10-15', volym_m3sub: 50, stammar: 100, operator_id: 'op1', objekt_id: 'o1' },
    ] : []
    const pr: any = Promise.resolve({ data: rader, error: null })
    pr.range = (a: number, b: number) => Promise.resolve({ data: rader.slice(a, b + 1), error: null })
    return pr
  }
  return { supabase: { from, rpc } }
})

import ProduktionNy from './ProduktionNy'

let rot: HTMLDivElement; let r: ReturnType<typeof createRoot>
const lugn = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve() }) }
const rad = (datum: string, status: string, orsak: string | null = null) => ({ maskin_id: SCORPION, datum, status, orsak })

async function montera() {
  await act(async () => { r.render(<ProduktionNy maskin={{ id: SCORPION, namn: 'Ponsse Scorpion' } as any} onMaskinChange={() => {}} />) })
  await lugn()
}
// Dagens markering i kalendern: vilket slag (semester | ledig | stopp), eller null.
const markering = (dag: number) =>
  Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('title')?.startsWith(`${dag}:`))?.getAttribute('data-dag-forklaring') ?? null
const rader = () => Array.from(document.querySelectorAll('[data-forklaring-rad]')).map(e => e.textContent)
const titel = (dag: number) => Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('title')?.startsWith(`${dag}:`))?.getAttribute('title')

beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  ;(globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-22T10:00:00') })
  data.rpcFel = false; data.datakalla = 'auto'; data.typ = 'semester'
  data.dagar = [
    rad('2026-10-14', 'planerat', 'ledig:Stefan'), rad('2026-10-15', 'planerat', 'ledig:Stefan'), rad('2026-10-16', 'planerat', 'ledig:Stefan'),
    rad('2026-10-19', 'registrerat', 'registrerat:service'), rad('2026-10-20', 'oforklarat'),
  ]
  rot = document.createElement('div'); document.body.appendChild(rot); r = createRoot(rot)
})
afterEach(() => { act(() => r.unmount()); document.body.innerHTML = ''; vi.useRealTimers() })

describe('Produktion › förklarade tomma dagar', () => {
  it('Scorpion 14 och 16 oktober: Semester; 15:e har produktion och visas som produktion', async () => {
    await montera()
    expect(markering(14)).toBe('semester')
    expect(markering(16)).toBe('semester')
    expect(markering(15)).toBeNull()
    expect(titel(15)).toMatch(/50 m³/)
    expect(titel(14)).toBe('14: Semester')
    expect(rader()).toEqual(['Semester 14 okt', 'Semester 16 okt', 'Stopp 19 okt · Service'])
  })
  it('allt annat än semester står som Ledig', async () => {
    data.typ = 'sjuk'
    await montera()
    expect(markering(14)).toBe('ledig')
    expect(rader()[0]).toBe('Ledig 14 okt')
    expect(document.body.textContent).not.toMatch(/sjuk/i)
  })
  it('registrerat stopp står som Stopp; oförklarad dag förblir Ej aktiv', async () => {
    await montera()
    expect(markering(19)).toBe('stopp')
    expect(markering(20)).toBeNull()
    expect(titel(20)).toBe('20: Ej aktiv')
  })
  it('manuell maskin: inga förklaringar alls', async () => {
    data.datakalla = 'manuell'
    await montera()
    expect(document.querySelectorAll('[data-dag-forklaring]')).toHaveLength(0)
    expect(rader()).toEqual([])
  })
  it('går förklaringarna inte att läsa står dagarna som Ej aktiv och kalendern fungerar som förut', async () => {
    data.rpcFel = true
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await montera()
    expect(document.querySelectorAll('[data-dag-forklaring]')).toHaveLength(0)
    expect(rader()).toEqual([])
    expect(titel(14)).toBe('14: Ej aktiv')
    expect(titel(12)).toMatch(/100 m³/)
  })
  it('dagpanelen säger orsaken', async () => {
    await montera()
    const knapp = Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('title')?.startsWith('14:'))!
    await act(async () => { knapp.click() })
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog.textContent).toContain('Semester')
    expect(dialog.textContent).not.toContain('Ingen produktion registrerad')
  })
})
