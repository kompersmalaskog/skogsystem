// @vitest-environment jsdom
/**
 * Nya startsidan: montera den riktiga komponenten (jsdom) och kontrollera det som får användaren att lita på den —
 * att ingen vy försvinner, att Behöver dig bara visar det som väntar, att märken aldrig säger "0", sökningen och
 * kontomenyn. Plus HomeClient: admin får den nya sidan, förare den gamla.
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({ roll: 'admin' as string | null, ek: 0, ledighet: 0 }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { email: 't@exempel.se' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: h.roll ? { roll: h.roll } : null }) }) }) }),
    rpc: async (namn: string) => namn === 'ledighet_prick'
      ? { data: { att_godkanna: h.ledighet, nya_beslut: 0, nya_beslut_ids: [], nya_beslut_till: null }, error: null }
      : { data: null, error: null },
  },
}))
vi.mock('@/app/datahalsa/useDatahalsa', () => ({ useDatahalsa: () => ({ besked: { niva: 'rod', rubrik: '3 saker att titta på' } }) }))
vi.mock('../../app/datahalsa/useDatahalsa', () => ({ useDatahalsa: () => ({ besked: { niva: 'rod', rubrik: '3 saker att titta på' } }) }))
vi.mock('@/lib/egenkontroll', () => ({ hamtaVantande: async () => ({ antalVantande: h.ek }) }))

import Startsida from './Startsida'
import HomeClient from '@/app/HomeClient'
import { VYER } from '@/lib/vyer'

let rot: ReturnType<typeof createRoot> | null = null
let el: HTMLDivElement | null = null

beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  h.roll = 'admin'; h.ek = 0; h.ledighet = 0
  el = document.createElement('div'); document.body.appendChild(el)
})
afterEach(() => { act(() => { rot?.unmount() }); el?.remove(); rot = null; el = null })

const flush = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve() }) }
async function montera(node: React.ReactElement) {
  rot = createRoot(el!)
  await act(async () => { rot!.render(node) })
  await flush()
}
const sektion = (namn: string) => document.querySelector(`section[aria-label="${namn}"]`)
const lankar = (s: Element | Document = document) => Array.from(s.querySelectorAll('a')).map(a => a.getAttribute('href'))
const knapp = (text: string) => Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes(text)) as HTMLButtonElement
const skriv = async (input: HTMLInputElement, varde: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => { setter.call(input, varde); input.dispatchEvent(new Event('input', { bubbles: true })) })
}

describe('Startsida (admin)', () => {
  it('varje vy går att nå: grupperna (utfällda) + kontomenyn innehåller alla vyer i registret', async () => {
    await montera(<Startsida roll="admin" marken={{}} />)
    for (const b of Array.from(sektion('Alla vyer')!.querySelectorAll('button[aria-expanded]'))) await act(async () => { (b as HTMLButtonElement).click() })
    await act(async () => { (document.querySelector('button[aria-label^="Mer"]') as HTMLButtonElement).click() })
    const nabara = new Set([...lankar(sektion('Alla vyer')!), ...lankar(document.querySelector('[role="dialog"]')!)])
    expect(VYER.map(v => v.href).filter(href => !nabara.has(href))).toEqual([])
  })

  it('Behöver dig visas inte när inget väntar — och okänt (null) räknas aldrig som noll', async () => {
    await montera(<Startsida roll="admin" marken={{ egenkontroll: null, ledighet: 0 }} datahalsa={{ niva: 'gron', rubrik: 'Allt lugnt' }} />)
    expect(sektion('Behöver dig')).toBeNull()
    expect(document.querySelectorAll('[role="status"]')).toHaveLength(0)
  })

  it('Behöver dig: egenkontroll, ledighet och datahälsa när något är fel — med tal och länk', async () => {
    await montera(<Startsida roll="admin" marken={{ egenkontroll: 3, ledighet: 2 }} datahalsa={{ niva: 'rod', rubrik: '3 saker att titta på' }} />)
    const s = sektion('Behöver dig')!
    expect(s.textContent).toContain('3 objekt väntar på egenkontroll')
    expect(s.textContent).toContain('2 att göra i ledighet')
    expect(s.textContent).toContain('Datahälsa: 3 saker att titta på')
    expect(lankar(s)).toEqual(['/egenkontroll', '/ledighet', '/datahalsa'])
  })

  it('favoriterna: åtta rutor, märket sitter på rätt ruta', async () => {
    await montera(<Startsida roll="admin" marken={{ egenkontroll: 5 }} />)
    expect(lankar(sektion('Dina vyer')!)).toHaveLength(8)
    // Egenkontroll är inte en adminfavorit — märket syns i gruppen Objekt (ihopfälld: summan på gruppraden).
    const objektRad = knapp('Objekt')
    expect(objektRad.querySelector('[role="status"]')?.textContent).toBe('5')
    await act(async () => { objektRad.click() })
    const ek = Array.from(sektion('Alla vyer')!.querySelectorAll('a[href="/egenkontroll"]'))
    expect(ek).toHaveLength(1)
    expect(ek[0].querySelector('[role="status"]')?.getAttribute('aria-label')).toBe('5 objekt väntar på egenkontroll')
  })

  it('grupperna är ihopfällda på telefon och fälls ut med ett tryck', async () => {
    await montera(<Startsida roll="admin" marken={{}} />)
    expect(document.querySelector('a[href="/kalibrering"]')).toBeNull()
    const maskiner = knapp('Maskiner')
    expect(maskiner.getAttribute('aria-expanded')).toBe('false')
    await act(async () => { maskiner.click() })
    expect(maskiner.getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelector('a[href="/kalibrering"]')).not.toBeNull()
  })

  it('sökning ersätter sidan med träffar, och säger vad man ska göra när inget hittas', async () => {
    await montera(<Startsida roll="admin" marken={{}} />)
    const input = document.querySelector('input[type="search"]') as HTMLInputElement
    await skriv(input, 'semester')
    expect(sektion('Dina vyer')).toBeNull()
    expect(lankar(sektion('Träffar')!)).toEqual(['/ledighet'])
    await skriv(input, 'xyzzy')
    expect(sektion('Träffar')!.textContent).toContain('Ingen vy heter "xyzzy"')
    await act(async () => { (document.querySelector('button[aria-label="Rensa sökningen"]') as HTMLButtonElement).click() })
    expect(sektion('Dina vyer')).not.toBeNull()
  })

  it('kontomenyn: Inställningar, Datahälsa, Feedback, Om appen och Admin — inte bland arbetsvyerna', async () => {
    await montera(<Startsida roll="admin" marken={{}} />)
    expect(lankar(sektion('Alla vyer')!)).not.toContain('/om')
    await act(async () => { (document.querySelector('button[aria-label^="Mer"]') as HTMLButtonElement).click() })
    expect(lankar(document.querySelector('[role="dialog"]')!)).toEqual(['/planering?installningar=1', '/datahalsa', '/forbattringsforslag', '/om', '/admin'])
  })
})

describe('Startsida (förare) — samma sida, utan admin-vyer', () => {
  it('ingen admin-vy och ingen datahälsa-rad', async () => {
    await montera(<Startsida roll="forare" marken={{}} datahalsa={{ niva: 'rod', rubrik: 'x' }} />)
    for (const b of Array.from(document.querySelectorAll('button[aria-expanded]'))) await act(async () => { (b as HTMLButtonElement).click() })
    await act(async () => { (document.querySelector('button[aria-label^="Mer"]') as HTMLButtonElement).click() })
    const alla = lankar()
    expect(alla).not.toContain('/ekonomi')
    expect(alla).not.toContain('/admin')
    expect(alla).not.toContain('/admin/markagarrapport')
    expect(sektion('Behöver dig')).toBeNull()
  })
})

describe('HomeClient väljer sida efter roll', () => {
  it('admin → nya startsidan', async () => {
    h.roll = 'admin'; h.ek = 2
    await montera(<HomeClient />)
    expect(sektion('Dina vyer')).not.toBeNull()
    expect(sektion('Behöver dig')!.textContent).toContain('2 objekt väntar på egenkontroll')
  })

  it('förare → gamla startsidan, oförändrad — och egenkontrollens märke syns nu (buggen)', async () => {
    h.roll = 'forare'; h.ek = 4
    await montera(<HomeClient />)
    expect(sektion('Dina vyer')).toBeNull()
    expect(document.body.textContent).toContain('Administration')
    const m = document.querySelector('a[href="/egenkontroll"] [role="status"]')
    expect(m?.textContent).toBe('4')
  })

  it('rollen går inte att läsa → gamla startsidan, aldrig en tom skärm', async () => {
    h.roll = null
    await montera(<HomeClient />)
    expect(document.body.textContent).toContain('Produktion')
  })
})
