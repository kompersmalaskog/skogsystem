// @vitest-environment jsdom
/**
 * Admin › Medarbetare › Maskinkonton: brytaren per maskin (PATCH), lägga upp kontot (e-post föreslås ur adminens egen, lösenordet visas EN gång),
 * nytt lösenord, och nollställa en förares kod (bekräftas först). Av = "maskinen fungerar som förut". Servern gör jobbet — här prövas bara
 * att rätt anrop görs och att texten säger rätt sak.
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getUser: async () => ({ data: { user: { email: 'martin@kompersmala.se' } } }) } } }))
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
    { maskin_id: 'R64428', namn: 'H8E -26', typ: 'Harvester', kontoFinns: false, aktiv: true, epost: null },
    { maskin_id: 'A130743', namn: 'Elefant 26', typ: 'Forwarder', kontoFinns: true, aktiv: false, epost: 'k+elefant@kompersmala.se' },
  ]
  personer = [{ id: 'p1', namn: 'Oskar Nilsson', roll: 'forare', harKod: true }, { id: 'p2', namn: 'Daniel', roll: 'forare', harKod: false }]
  ;(globalThis as any).fetch = vi.fn(async (url: string, init?: any) => {
    const m = init?.method || 'GET'; const body = init?.body ? JSON.parse(init.body) : null
    anrop.push([String(url), m, body])
    const svar = (j: any, status = 200) => ({ ok: status < 400, status, json: async () => j })
    if (url === '/api/maskin/konto' && m === 'GET') return svar({ ok: true, maskiner, personer })
    if (url === '/api/maskin/konto' && m === 'PATCH') { maskiner = maskiner.map(x => x.maskin_id === body.maskin_id ? { ...x, aktiv: body.aktiv } : x); return svar({ ok: true, aktiv: body.aktiv }) }
    if (url === '/api/maskin/konto' && m === 'POST') return svar({ ok: true, epost: body.epost ?? 'k+elefant@kompersmala.se', losenord: 'hemligt-lösen-123' })
    if (url === '/api/maskin/kod/nollstall') { personer = personer.map(p => p.id === body.medarbetare_id ? { ...p, harKod: false } : p); return svar({ ok: true }) }
    return svar({}, 404)
  })
  el = document.createElement('div'); document.body.appendChild(el)
})
afterEach(() => { act(() => { rot?.unmount() }); el?.remove(); rot = null; el = null })
async function montera() { rot = createRoot(el!); await act(async () => { rot!.render(<MaskinkontoSektion />) }); await flush() }

describe('Maskinkonton (admin)', () => {
  it('svaret först: hur många maskiner som har maskinkonto på, och per maskin av/på med ord om vad av betyder', async () => {
    await montera()
    expect(document.querySelector('[data-maskinkonton]')?.textContent).toContain('1 maskin har maskinkonto på.')
    expect(document.querySelector('[data-maskin="R64428"]')?.textContent).toContain('På · men inget konto är upplagt än')
    expect(document.querySelector('[data-maskin="A130743"]')?.textContent).toContain('Av · maskinen fungerar som förut')
  })
  it('brytaren skickar PATCH med rätt maskin och värde — och listan läses om', async () => {
    await montera()
    const sw = document.querySelector('[data-maskin="A130743"] [role="switch"]') as HTMLButtonElement
    await act(async () => { sw.click() }); await flush()
    expect(anrop.find(a => a[1] === 'PATCH')![2]).toEqual({ maskin_id: 'A130743', aktiv: true })
    expect(anrop.filter(a => a[1] === 'GET').length).toBe(2)
    expect(document.querySelector('[data-maskinkonton]')?.textContent).toContain('2 maskiner har maskinkonto på.')
  })
  it('Lägg upp konto: adressen föreslås ur adminens egen (+maskin-id), lösenordet visas en gång och kontot skapas med den adressen', async () => {
    await montera()
    await act(async () => { knapp('Lägg upp konto').click() }); await flush()
    const falt = document.querySelector('input') as HTMLInputElement
    expect(falt.value).toBe('martin+r64428@kompersmala.se')
    await act(async () => { knapp('Lägg upp kontot').click() }); await flush()
    expect(anrop.find(a => a[1] === 'POST')![2]).toEqual({ maskin_id: 'R64428', epost: 'martin+r64428@kompersmala.se' })
    expect(document.querySelector('[data-konto-losenord]')?.textContent).toBe('hemligt-lösen-123')
    expect(document.querySelector('[data-konto-epost]')?.textContent).toBe('martin+r64428@kompersmala.se')
    expect(document.body.textContent).toContain('Lösenordet visas bara nu')
  })
  it('Nytt lösenord för en maskin som har konto', async () => {
    await montera()
    await act(async () => { knapp('Nytt lösenord').click() }); await flush()
    expect(anrop.find(a => a[1] === 'POST')![2]).toEqual({ maskin_id: 'A130743', nytt_losenord: true })
    expect(document.querySelector('[data-konto-losenord]')?.textContent).toBe('hemligt-lösen-123')
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
