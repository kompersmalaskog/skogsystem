// @vitest-environment jsdom
/**
 * Admin › Medarbetare › Maskinkonton: EN brytare per maskin (PATCH) och för de maskiner som har ett konto när det skapades. Ingen knapp för att lägga upp
 * ett konto, inget lösenord, ingen adress — kontot skapas av servern själv när maskindatorn startar. Nollställa en förares kod (bekräftas först) finns
 * kvar. Av = "maskinen fungerar som förut". Servern gör jobbet — här prövas bara att rätt anrop görs och att texten säger rätt sak.
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import MaskinkontoSektion from './MaskinkontoSektion'

const anrop: [string, string, any][] = []
let maskiner: any[]; let personer: any[]
let rot: ReturnType<typeof createRoot> | null = null
let el: HTMLDivElement | null = null
const flush = async () => { for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve() }) }
const knapp = (t: string) => Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === t) as HTMLButtonElement

beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  anrop.length = 0
  maskiner = [
    { maskin_id: 'R64428', namn: 'H8E -26', typ: 'Harvester', kontoFinns: false, aktiv: true, skapat: null },
    { maskin_id: 'A130743', namn: 'Elefant 26', typ: 'Forwarder', kontoFinns: true, aktiv: false, skapat: '2026-11-21T07:30:00Z' },
    { maskin_id: 'A030353', namn: 'Wisent', typ: 'Forwarder', kontoFinns: true, aktiv: true, skapat: '2026-11-22T09:00:00Z' },
  ]
  personer = [{ id: 'p1', namn: 'Oskar Nilsson', roll: 'forare', harKod: true }, { id: 'p2', namn: 'Daniel', roll: 'forare', harKod: false }]
  ;(globalThis as any).fetch = vi.fn(async (url: string, init?: any) => {
    const m = init?.method || 'GET'; const body = init?.body ? JSON.parse(init.body) : null
    anrop.push([String(url), m, body])
    const svar = (j: any, status = 200) => ({ ok: status < 400, status, json: async () => j })
    if (url === '/api/maskin/konto' && m === 'GET') return svar({ ok: true, maskiner, personer })
    if (url === '/api/maskin/konto' && m === 'PATCH') { maskiner = maskiner.map(x => x.maskin_id === body.maskin_id ? { ...x, aktiv: body.aktiv } : x); return svar({ ok: true, aktiv: body.aktiv }) }
    if (url === '/api/maskin/kod/nollstall') { personer = personer.map(p => p.id === body.medarbetare_id ? { ...p, harKod: false } : p); return svar({ ok: true }) }
    return svar({}, 404)
  })
  el = document.createElement('div'); document.body.appendChild(el)
})
afterEach(() => { act(() => { rot?.unmount() }); el?.remove(); rot = null; el = null })
async function montera() { rot = createRoot(el!); await act(async () => { rot!.render(<MaskinkontoSektion />) }); await flush() }

describe('Maskinkonton (admin)', () => {
  it('svaret först: hur många maskiner som har maskinkonto på, och per maskin av/på med ord om kontot', async () => {
    await montera()
    expect(document.querySelector('[data-maskinkonton]')?.textContent).toContain('2 maskiner har maskinkonto på.')
    expect(document.querySelector('[data-maskin="R64428"]')?.textContent).toContain('På · kontot skapas när maskinen startar')
    expect(document.querySelector('[data-maskin="A030353"]')?.textContent).toMatch(/På · konto skapat 22 nov 2026/)
    expect(document.querySelector('[data-maskin="A130743"]')?.textContent).toContain('Av · maskinen fungerar som förut')
  })
  it('brytaren skickar PATCH med rätt maskin och värde — och listan läses om', async () => {
    await montera()
    const sw = document.querySelector('[data-maskin="A130743"] [role="switch"]') as HTMLButtonElement
    await act(async () => { sw.click() }); await flush()
    expect(anrop.find(a => a[1] === 'PATCH')![2]).toEqual({ maskin_id: 'A130743', aktiv: true })
    expect(anrop.filter(a => a[1] === 'GET').length).toBe(2)
    expect(document.querySelector('[data-maskinkonton]')?.textContent).toContain('3 maskiner har maskinkonto på.')
  })
  it('ingen knapp för att lägga upp ett konto eller byta lösenord, ingen e-postadress och inget lösenord någonstans — admin slår bara på och av', async () => {
    await montera()
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/Lägg upp|Nytt lösenord|lösenord|@|e-post/i)
    expect(document.querySelector('input')).toBeNull()
    expect(Array.from(document.querySelectorAll('button')).map(b => b.textContent).filter(t => /konto|lösen/i.test(t ?? ''))).toEqual([])
    expect(anrop.some(a => a[1] === 'POST' && a[0] === '/api/maskin/konto')).toBe(false)
  })
  it('Nollställ kod frågar först, och skickar rätt person; den som saknar kod har ingen knapp', async () => {
    await montera()
    expect(document.body.textContent).toContain('Ingen kod än')
    expect(Array.from(document.querySelectorAll('button')).filter(b => b.textContent === 'Nollställ')).toHaveLength(1)
    await act(async () => { knapp('Nollställ').click() }); await flush()
    expect(anrop.some(a => a[0].includes('nollstall'))).toBe(false)           // inget skickat före bekräftelsen
    expect(document.body.textContent).toContain('Nollställa Oskar Nilssons kod?')
    await act(async () => { Array.from(document.querySelectorAll('button')).filter(b => b.textContent === 'Nollställ').pop()!.click() }); await flush()
    expect(anrop.find(a => a[0].includes('nollstall'))![2]).toEqual({ medarbetare_id: 'p1' })
    expect(Array.from(document.querySelectorAll('button')).filter(b => b.textContent === 'Nollställ')).toHaveLength(0)
  })
  it('läsfel är ett fel med Försök igen — aldrig en tom lista', async () => {
    ;(globalThis as any).fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: 'Kunde inte läsa maskinkontona.' }) }))
    await montera()
    expect(document.body.textContent).toContain('Kunde inte läsa maskinkontona.')
    expect(document.querySelector('[data-maskin]')).toBeNull()
  })
})
