// @vitest-environment jsdom
/**
 * "Objekt" i Idag (skördare och skotare): vilket objekt maskinen arbetade på den visade dagen.
 * Namn ur dim_objekt, volym per objekt bara när det är fler än ett, Special-badge, ärliga fel.
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({
  namn: { data: [] as any[], error: null as any },
  special: { data: [] as any[], error: null as any },
  fragor: [] as Array<{ tabell: string; ids?: string[] }>,
}))

vi.mock('@/lib/supabase', () => {
  const from = (tabell: string) => {
    const q: any = {
      select: () => q,
      in: (_k: string, ids: string[]) => { db.fragor.push({ tabell, ids }); return Promise.resolve(db.namn) },
      eq: () => Promise.resolve(db.special),
    }
    return q
  }
  return { supabase: { from } }
})

import DagensObjekt from './DagensObjekt'

let rot: HTMLDivElement; let r: ReturnType<typeof createRoot>
beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  db.namn = { data: [], error: null }; db.special = { data: [], error: null }; db.fragor = []
  rot = document.createElement('div'); document.body.appendChild(rot); r = createRoot(rot)
})
afterEach(() => { act(() => r.unmount()); document.body.innerHTML = '' })

const text = () => rot.textContent || ''
const vanta = async (villkor: () => boolean) => {
  for (let i = 0; i < 100 && !villkor(); i++) await act(async () => { await new Promise(res => setTimeout(res, 5)) })
  expect(villkor(), text().slice(0, 300)).toBe(true)
}
const rader = (...rs: Array<[string | null, number | null]>) => rs.map(([objekt_id, volym_m3sub]) => ({ objekt_id, volym_m3sub }))
const visa = (el: React.ReactElement) => act(async () => { r.render(el) })
const namnRader = () => Array.from(document.querySelectorAll('[data-objekt-rad]')).map(e => e.textContent)

describe('DagensObjekt', () => {
  it('ett objekt: bara namnet — volymen står redan i siffrorna ovanför', async () => {
    db.namn = { data: [{ objekt_id: 'A', object_name: 'Hålabäck RP 2026' }], error: null }
    await visa(<DagensObjekt rader={rader(['A', 100], ['A', 12])} loading={false} />)
    await vanta(() => namnRader().length === 1)
    expect(namnRader()).toEqual(['Hålabäck RP 2026'])
    expect(text()).toContain('Objekt')
    expect(text()).not.toContain('m³')
  })

  it('flera objekt: volym per objekt, störst först', async () => {
    db.namn = { data: [{ objekt_id: 'A', object_name: 'Hålabäck RP 2026' }, { objekt_id: 'B', object_name: 'Vällust gallring' }], error: null }
    await visa(<DagensObjekt rader={rader(['A', 38], ['B', 412])} loading={false} />)
    await vanta(() => namnRader().length === 2)
    expect(namnRader().map(t => t!.replace(/\s/g, ' '))).toEqual(['Vällust gallring412 m³', 'Hålabäck RP 2026'.concat('38 m³')])
  })

  it('frågar bara efter dagens objekt, en gång per id', async () => {
    db.namn = { data: [{ objekt_id: 'A', object_name: 'Hålabäck RP 2026' }], error: null }
    await visa(<DagensObjekt rader={rader(['A', 1], ['A', 2], ['A', 3])} loading={false} />)
    await vanta(() => namnRader().length === 1)
    expect(db.fragor).toEqual([{ tabell: 'dim_objekt', ids: ['A'] }])
  })

  it('Special-objekt får badgen med skälet', async () => {
    db.namn = { data: [{ objekt_id: 'A', object_name: 'Vindfällor Akelius' }], error: null }
    db.special = { data: [{ objekt_id: 'A', special_skal: 'vindfällor' }], error: null }
    await visa(<DagensObjekt rader={rader(['A', 50])} loading={false} />)
    await vanta(() => document.querySelector('[data-special-badge]') != null)
    expect(document.querySelector('[data-special-badge]')!.getAttribute('title')).toBe('Special-objekt: vindfällor')
  })

  it('objekt som saknas i registret heter "Okänt objekt" — inget gissat namn', async () => {
    db.namn = { data: [], error: null }
    await visa(<DagensObjekt rader={rader(['X9', 5])} loading={false} />)
    await vanta(() => namnRader().length === 1)
    expect(namnRader()).toEqual(['Okänt objekt'])
  })

  it('rader utan objekt_id sägs: volymen försvinner inte tyst', async () => {
    db.namn = { data: [{ objekt_id: 'A', object_name: 'Hålabäck RP 2026' }], error: null }
    await visa(<DagensObjekt rader={rader(['A', 90], [null, 6])} loading={false} />)
    await vanta(() => document.querySelector('[data-objekt-not]') != null)
    expect(document.querySelector('[data-objekt-not]')!.textContent).toBe('6 m³ saknar objekt i datan.')
  })

  it('bara rader utan objekt_id: ärlig rad i stället för en tom ruta', async () => {
    await visa(<DagensObjekt rader={rader([null, 6])} loading={false} />)
    await vanta(() => text().includes('saknar objekt i datan'))
    expect(namnRader()).toEqual([])
  })

  it('namnen går inte att läsa: det sägs, ingen gissning', async () => {
    db.namn = { data: null as any, error: { message: 'x' } }
    await visa(<DagensObjekt rader={rader(['A', 10])} loading={false} />)
    await vanta(() => text().includes('kunde inte läsas'))
    expect(namnRader()).toEqual([])
  })

  it('special-flaggan går inte att läsa: objekten visas ändå, utan badge', async () => {
    db.namn = { data: [{ objekt_id: 'A', object_name: 'Hålabäck RP 2026' }], error: null }
    db.special = { data: null as any, error: { message: 'kolumnen finns inte' } }
    await visa(<DagensObjekt rader={rader(['A', 10])} loading={false} />)
    await vanta(() => namnRader().length === 1)
    expect(document.querySelector('[data-special-badge]')).toBeNull()
  })

  it('under laddning eller utan data ritas inget kort', async () => {
    await visa(<DagensObjekt rader={null} loading={true} />)
    expect(document.querySelector('[data-dagens-objekt]')).toBeNull()
    await visa(<DagensObjekt rader={null} loading={false} />)
    expect(document.querySelector('[data-dagens-objekt]')).toBeNull()
  })
})
