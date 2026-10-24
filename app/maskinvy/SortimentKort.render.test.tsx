// @vitest-environment jsdom
/**
 * Översikten › Sortiment. Facit: Scorpion oktober 2026 (uppmätt i prod 2026-10-21 via vy_sortiment_klass).
 * Kortet läser gruppen ur VYN — ett sortiment utan rad i dim_sortiment_grupp ska alltså ändå hamna rätt (det var de
 * 228,6 m³ som såg "okända" ut), och ett läsfel i vyn ska synas som ett fel, aldrig som "allt är Övrigt".
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

const db = vi.hoisted(() => {
  const OKT: Array<[string, string, number]> = [
    ['S_tim1', 'Timmer', 1088.6], ['S_tim2', 'Timmer', 1006.2],
    ['S_massa', 'Massa', 816.6], ['S_kubb', 'Kubb', 358.7],
    ['S_energi', 'Energi', 123.1], ['S_hemved', 'Hemved', 80.4], ['S_osort', 'Utan sortiment', 4.2],
  ]
  const grund = {
    fakt_sortiment: OKT.map(([id, , v], i) => ({ id: i + 1, sortiment_id: id, volym_m3sub: v })) as any[],
    vy: OKT.map(([id, g]) => ({ sortiment_id: id, grupp: g })) as any[],
  }
  return { grund, fakt_sortiment: grund.fakt_sortiment, vy: grund.vy, vyFel: false, anrop: [] as string[] }
})

vi.mock('@/lib/supabase', () => {
  const from = (tabell: string) => {
    db.anrop.push(tabell)
    const kalla = () => (tabell === 'fakt_sortiment' ? { data: db.fakt_sortiment, error: null }
      : tabell === 'vy_sortiment_klass' ? (db.vyFel ? { data: null, error: { message: 'permission denied' } } : { data: db.vy, error: null })
      : { data: [], error: null })
    const q: any = { select: () => q, in: () => q, gte: () => q, lte: () => q, order: () => q, range: () => Promise.resolve(kalla()) }
    return q
  }
  return { supabase: { from } }
})

import SortimentKort from './SortimentKort'

let rot: HTMLDivElement; let r: ReturnType<typeof createRoot>
beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-21T12:00:00'))
  db.vyFel = false; db.anrop = []
  db.fakt_sortiment = JSON.parse(JSON.stringify(db.grund.fakt_sortiment)); db.vy = JSON.parse(JSON.stringify(db.grund.vy))
  rot = document.createElement('div'); document.body.appendChild(rot); r = createRoot(rot)
})
afterEach(() => { act(() => r.unmount()); document.body.innerHTML = ''; vi.useRealTimers() })

const norm = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ')      // sv-SE skriver tusentalsavgränsaren som hårt mellanslag
const text = () => norm(document.body.textContent || '')
const vanta = async (villkor: () => boolean) => {
  for (let i = 0; i < 100 && !villkor(); i++) await act(async () => { await new Promise(res => setTimeout(res, 5)) })
  expect(villkor(), text().slice(0, 300)).toBe(true)
}
const rad = (s: string) => norm(document.querySelector(`[data-sortiment="${s}"]`)?.textContent ?? '')
const maskin = { id: 'PONS20SDJAA270231', namn: 'Giant' } as any

describe('SortimentKort', () => {
  it('Scorpion oktober: Timmer 60 %, Kubb 10 %, Massaved 24 %, Övrigt 6 % — med m³ per rad och inget okänt', async () => {
    await act(async () => { r.render(<SortimentKort maskin={maskin} period="M" offset={0} produktionsvolym={3474.0} />) })
    await vanta(() => !!document.querySelector('[data-sortiment="timmer"]'))
    expect(rad('timmer')).toContain('60 %')
    expect(rad('timmer')).toContain('2 095 m³')
    expect(rad('kubb')).toContain('10 %')
    expect(rad('kubb')).toContain('kubb och klentimmer')
    expect(rad('massa')).toContain('Massaved')
    expect(rad('massa')).toContain('24 %')
    expect(rad('massa')).toContain('817 m³')
    expect(rad('ovrigt')).toContain('6 %')
    expect(rad('ovrigt')).toContain('208 m³')
    expect(rad('ovrigt')).toContain('energived, avkap, hemved och osorterat')
    expect(text()).not.toMatch(/[Oo]känd/)
    expect(document.querySelectorAll('[data-sortiment-not]')).toHaveLength(0)     // 0,1 % mot produktionen — ingen not
  })

  it('gruppen läses ur vy_sortiment_klass, aldrig ur dim_sortiment_grupp', async () => {
    await act(async () => { r.render(<SortimentKort maskin={maskin} period="M" offset={0} />) })
    await vanta(() => !!document.querySelector('[data-sortiment="timmer"]'))
    expect(db.anrop).toContain('vy_sortiment_klass')
    expect(db.anrop).not.toContain('dim_sortiment_grupp')
  })

  it('läsfel i vyn är ett fel som sägs — aldrig "allt är Övrigt"', async () => {
    db.vyFel = true
    await act(async () => { r.render(<SortimentKort maskin={maskin} period="M" offset={0} />) })
    await vanta(() => text().includes('Kunde inte läsa sortiment'))
    expect(document.querySelector('[data-sortiment]')).toBeNull()
  })

  it('en grupp som saknas i vyn sägs: m³ ligger i Övrigt och noten säger det', async () => {
    db.fakt_sortiment = [{ id: 1, sortiment_id: 'A', volym_m3sub: 90 }, { id: 2, sortiment_id: 'B', volym_m3sub: 10 }]
    db.vy = [{ sortiment_id: 'A', grupp: 'Timmer' }, { sortiment_id: 'B', grupp: null }]
    await act(async () => { r.render(<SortimentKort maskin={maskin} period="M" offset={0} />) })
    await vanta(() => !!document.querySelector('[data-sortiment="ovrigt"]'))
    expect(rad('ovrigt')).toContain('10 %')
    expect(text()).toContain('10,0 m³ saknar sortimentgrupp och ingår i Övrigt.')
  })

  it('skiljer sortimentfilerna och produktionen ≥ 1 % står det med båda talen', async () => {
    db.fakt_sortiment = [{ id: 1, sortiment_id: 'A', volym_m3sub: 3510 }]
    db.vy = [{ sortiment_id: 'A', grupp: 'Timmer' }]
    await act(async () => { r.render(<SortimentKort maskin={maskin} period="M" offset={0} produktionsvolym={3474} />) })
    await vanta(() => !!document.querySelector('[data-sortiment="timmer"]'))
    expect(text()).toContain('Sortimentfilerna visar 3 510 m³ mot 3 474 m³ i produktionen.')
  })

  it('en grupp utan volym får ingen rad (gallring har knappt något timmer)', async () => {
    db.fakt_sortiment = [{ id: 1, sortiment_id: 'M', volym_m3sub: 100 }]
    db.vy = [{ sortiment_id: 'M', grupp: 'Massa' }]
    await act(async () => { r.render(<SortimentKort maskin={maskin} period="M" offset={0} />) })
    await vanta(() => !!document.querySelector('[data-sortiment="massa"]'))
    expect(document.querySelector('[data-sortiment="timmer"]')).toBeNull()
    expect(rad('massa')).toContain('100 %')
  })

  it('ingen produktion i perioden säger det', async () => {
    db.fakt_sortiment = []
    await act(async () => { r.render(<SortimentKort maskin={maskin} period="M" offset={0} />) })
    await vanta(() => text().includes('Ingen produktion i perioden.'))
  })
})
