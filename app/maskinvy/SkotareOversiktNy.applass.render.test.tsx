// @vitest-environment jsdom
/**
 * Skotare › Översikt med appens egna lass (Elefant 26, november 2026): maskinen har Opti-filer t.o.m. 2 nov och registrerar sedan
 * lass i appen (skotar_lass). Vyn läser båda via maskindata_lass_alla (dubbelräkningen är avgjord i SQL) och måste:
 *   · räkna app-lassen i utkört och lass, märkt "uppskattad";
 *   · dela skotningsavståndet bara på lassen som HAR ett mått ("2 av 14 lass"), aldrig på alla;
 *   · räkna lass/G15h och m³/G15h bara på dagar som har G15-tid, med en förklaring (aldrig en gissning);
 *   · slå ihop förarens Opti-operatör och appens medarbetare till EN rad.
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

const db = vi.hoisted(() => {
  const dag = (n: number) => `2026-11-${String(n).padStart(2, '0')}`
  const optiLass = (datum: string, v: number) => ({
    datum, maskin_id: 'A130743', operator_id: 'A130743_1', lossnings_tid: null, volym_m3sub: v, korstracka_m: 640, objekt_id: 'O1',
    kalla: 'opti', lass_id: null, medarbetare_id: null, volym_forare: v, skalad: false,
  })
  const appLass = (datum: string, v: number, skalad = false) => ({
    datum, maskin_id: 'A130743', operator_id: null, lossnings_tid: `${datum}T10:00:00Z`, volym_m3sub: v, korstracka_m: null, objekt_id: 'O1',
    kalla: 'app', lass_id: `l-${datum}-${v}`, medarbetare_id: 'med-daniel', volym_forare: v, skalad,
  })
  const tid = (datum: string, h: number) => ({
    datum, maskin_id: 'A130743', operator_id: 'A130743_1', objekt_id: 'O1', processing_sek: h * 3600, terrain_sek: 0, other_work_sek: 0,
    kort_stopp_sek: 0, rast_sek: 0, bransle_liter: 5, tomgang_sek: 0, engine_time_sek: 0,
  })
  const lass: any[] = [optiLass(dag(2), 20), optiLass(dag(2), 20)]
  // 4 dagar × 3 lass × 20 m³ i appen, ingen maskintid de dagarna
  for (const d of [23, 24, 25, 26]) for (let i = 0; i < 3; i++) lass.push(appLass(dag(d), 20))
  return {
    lass,
    tid: [tid(dag(2), 10)],
    tabeller: {
      dim_maskin: [{ maskin_id: 'A130743', visningsnamn: 'Elefant 26', modell: 'Elephant King AF', maskin_typ: 'Forwarder', aktiv_fran: '2026-08-13', aktiv_till: null, bekraftad: true }],
      dim_operator: [{ operator_id: 'A130743_1', operator_namn: 'Daniel Fransson', maskin_id: 'A130743' }],
      operator_medarbetare: [{ operator_id: 'A130743_1', medarbetare_id: 'med-daniel' }],
      skotare_objekt_manuell: [], fakt_tid: [{ maskin_id: 'A130743' }],
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
    const kalla = namn === 'maskindata_lass_alla' ? db.lass : namn === 'maskindata_tid' ? db.tid : null
    const rader = kalla === null ? [] : kalla.filter((r: any) => (p.p_maskin_ids ?? []).includes(r.maskin_id)
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
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-26T12:00:00'))
  rot = document.createElement('div'); document.body.appendChild(rot); r = createRoot(rot)
})
afterEach(() => { act(() => r.unmount()); document.body.innerHTML = ''; vi.useRealTimers() })

const text = () => document.body.textContent || ''
const vanta = async (villkor: () => boolean) => {
  for (let i = 0; i < 100 && !villkor(); i++) await act(async () => { await new Promise(res => setTimeout(res, 5)) })
  expect(villkor(), text().slice(0, 600)).toBe(true)
}
const rad = (etikett: string): string => {
  const el = Array.from(document.body.querySelectorAll('div')).find(d => (d.textContent || '').startsWith(etikett) && d.children.length >= 2 && d.parentElement?.style.overflow === 'hidden')
  return el?.textContent || ''
}

describe('Skotare Översikt med appens lass (Elefant 26)', () => {
  it('utkört och lass räknar app-lassen: 280 m³, 14 lass — märkt "uppskattad"', async () => {
    await act(async () => { r.render(<SkotareOversiktNy maskin={{ id: 'A130743', namn: 'Elefant 26' }} onMaskinChange={() => {}} />) })
    await vanta(() => text().includes('Daniel Fransson'))
    expect(text()).toContain('280')
    expect(rad('Lass')).toContain('14')
    expect(document.querySelector('[data-volym-mark="uppskattad"]')).not.toBeNull()
    // Opti-lassen på 2 nov har inget eget märke utöver att perioden innehåller app-lass.
    expect(text()).not.toContain('manuell')
  })

  it('skotningsavståndet delas bara på lassen med mått: "2 av 14 lass" (320 m), inte 46 m', async () => {
    await act(async () => { r.render(<SkotareOversiktNy maskin={{ id: 'A130743', namn: 'Elefant 26' }} onMaskinChange={() => {}} />) })
    await vanta(() => text().includes('Daniel Fransson'))
    const av = rad('Skotningsavstånd')
    expect(av).toContain('320')
    expect(av).toContain('2 av 14 lass')
    expect(av).not.toContain('46')
    // Avståndsprofilen är andel av lassen MED mått: båda ligger i samma klass = 100 % (inte 14 %).
    expect(text()).toContain('100%')
    expect(text()).not.toContain('14%')
    expect(text()).toContain('2 av 14 lass')
  })

  it('lass/G15h räknas bara på dagen med G15-tid: 2 lass / 10 h = 0,2 — med förklaring om dagarna utan maskintid', async () => {
    await act(async () => { r.render(<SkotareOversiktNy maskin={{ id: 'A130743', namn: 'Elefant 26' }} onMaskinChange={() => {}} />) })
    await vanta(() => text().includes('Daniel Fransson'))
    const k = rad('Lass/G15h')
    expect(k).toContain('0,2')
    expect(k).not.toContain('1,4')      // 14 lass / 10 h = 1,4 vore volym utan tid i täljaren
    expect(k).toContain('räknat på 1 av 5 dagar')
  })

  it('Daniel är EN rad (Opti-operatören och appens medarbetare slås ihop): 5 dagar, 280 m³, m³/G15h 4,0 (bara de 40 m³ med tid)', async () => {
    await act(async () => { r.render(<SkotareOversiktNy maskin={{ id: 'A130743', namn: 'Elefant 26' }} onMaskinChange={() => {}} />) })
    await vanta(() => text().includes('Daniel Fransson'))
    const knappar = Array.from(document.body.querySelectorAll('button')).filter(b => (b.textContent || '').includes('Daniel'))
    expect(knappar).toHaveLength(1)
    const daniel = knappar[0].textContent!
    expect(daniel).toContain('5 dagar')
    expect(daniel).toContain('280 m³')
    expect(daniel).toContain('4,0')
    expect(daniel).not.toContain('28,0')   // 280 m³ / 10 h vore uppblåst
  })
})
