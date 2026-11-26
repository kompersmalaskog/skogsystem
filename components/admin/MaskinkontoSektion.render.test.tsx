// @vitest-environment jsdom
/**
 * Maskinkonto (på maskinens sida i Admin › Maskiner) och kod för maskinen (på personens sida i Admin › Medarbetare).
 * Förut två listor längst ned i Medarbetare (flyttade 2026-11-25). EN brytare per maskin (PATCH) och för de maskiner som har ett konto när det skapades. Ingen knapp för att lägga upp
 * ett konto, inget lösenord, ingen adress — kontot skapas av servern själv när maskindatorn startar. Nollställa en förares kod (bekräftas först) finns
 * kvar. Av = "maskinen fungerar som förut". Servern gör jobbet — här prövas bara att rätt anrop görs och att texten säger rätt sak.
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { MaskinkontoRad, MaskinKodRad } from './MaskinkontoSektion'

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
async function montera(ui: React.ReactElement) { rot = createRoot(el!); await act(async () => { rot!.render(ui) }); await flush() }

describe('Maskinkonto på maskinens sida', () => {
  it('EN brytare för maskinen, med ord om kontot', async () => {
    await montera(<MaskinkontoRad maskinId="A030353" />)
    expect(document.querySelectorAll('[role="switch"]')).toHaveLength(1)
    expect(document.querySelector('[data-maskin="A030353"]')?.textContent).toMatch(/På · konto skapat 22 nov 2026/)
    await montera(<MaskinkontoRad maskinId="R64428" />)
    expect(document.body.textContent).toContain('På · kontot skapas när maskinen startar')
  })
  it('av = "maskinen fungerar som förut"; brytaren skickar PATCH för just den maskinen', async () => {
    await montera(<MaskinkontoRad maskinId="A130743" />)
    expect(document.body.textContent).toContain('Av · maskinen fungerar som förut')
    await act(async () => { (document.querySelector('[role="switch"]') as HTMLButtonElement).click() }); await flush()
    expect(anrop.find(a => a[1] === 'PATCH')![2]).toEqual({ maskin_id: 'A130743', aktiv: true })
  })
  it('en maskin utan rad (inte skördare/skotare) visar ingenting', async () => {
    await montera(<MaskinkontoRad maskinId="JD810E" />)
    expect(document.querySelector('[data-maskinkonto]')).toBeNull()
  })
  it('inget lösenord, ingen e-post, ingen knapp för att lägga upp ett konto', async () => {
    await montera(<MaskinkontoRad maskinId="A030353" />)
    expect(document.body.textContent ?? '').not.toMatch(/Lägg upp|lösenord|@|e-post/i)
    expect(document.querySelector('input')).toBeNull()
  })
  it('läsfel är ett fel med Försök igen — aldrig ingenting', async () => {
    ;(globalThis as any).fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: 'Kunde inte läsa maskinkontona.' }) }))
    await montera(<MaskinkontoRad maskinId="A030353" />)
    expect(document.body.textContent).toContain('Kunde inte läsa maskinkontona.')
  })
})

describe('Kod för maskinen på personens sida', () => {
  it('har kod: Nollställ frågar först och skickar rätt person', async () => {
    await montera(<MaskinKodRad personId="p1" />)
    expect(document.querySelector('[data-maskinkod]')?.textContent).toContain('Har valt kod')
    await act(async () => { knapp('Nollställ').click() }); await flush()
    expect(anrop.some(a => a[0].includes('nollstall'))).toBe(false)
    expect(document.body.textContent).toContain('Nollställa Oskar Nilssons kod?')
    await act(async () => { Array.from(document.querySelectorAll('button')).filter(b => b.textContent === 'Nollställ').pop()!.click() }); await flush()
    expect(anrop.find(a => a[0].includes('nollstall'))![2]).toEqual({ medarbetare_id: 'p1' })
    expect(document.querySelector('[data-maskinkod]')?.textContent).toContain('Ingen kod än')
  })
  it('ingen kod: säger var den väljs, ingen knapp', async () => {
    await montera(<MaskinKodRad personId="p2" />)
    expect(document.body.textContent).toContain('Ingen kod än')
    expect(document.body.textContent).toContain('Mer › Kod för maskinen')
    expect(knapp('Nollställ')).toBeUndefined()
  })
})
