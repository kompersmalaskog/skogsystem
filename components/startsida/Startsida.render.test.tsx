// @vitest-environment jsdom
/**
 * Nya startsidan: montera den riktiga komponenten (jsdom) och kontrollera det som får användaren att lita på den —
 * att ingen vy försvinner, att Behöver dig bara visar det som väntar, att märken aldrig säger "0", sökningen och
 * kontomenyn. Plus HomeClient: admin och förare får den nya sidan; okänd roll den gamla.
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({ roll: 'admin' as string | null, ek: 0, ledighet: 0, favoriter: null as string[] | null }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 't@exempel.se' } } }) },
    from: (tabell: string) => tabell === 'startsida_favoriter'
      ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.favoriter ? { vyer: h.favoriter } : null, error: null }) }) }) }
      : { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: h.roll ? { roll: h.roll } : null }) }) }) },
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
  h.roll = 'admin'; h.ek = 0; h.ledighet = 0; h.favoriter = null
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

  it('kontomenyn: Inställningar, Datahälsa, Feedback, Om appen — inte bland arbetsvyerna, och inte Admin', async () => {
    await montera(<Startsida roll="admin" marken={{}} />)
    expect(lankar(sektion('Alla vyer')!)).not.toContain('/om')
    await act(async () => { (document.querySelector('button[aria-label^="Mer"]') as HTMLButtonElement).click() })
    expect(lankar(document.querySelector('[role="dialog"]')!)).toEqual(['/planering?installningar=1', '/datahalsa', '/forbattringsforslag', '/om'])
  })

  it('gruppen Admin samlar Ekonomi, Markägarrapport och Admin', async () => {
    await montera(<Startsida roll="admin" marken={{}} />)
    await act(async () => { knapp('Admin').click() })
    const ekonomi = sektion('Alla vyer')!.querySelector('a[href="/ekonomi"]')!
    expect(ekonomi).not.toBeNull()
    const grupp = ekonomi.parentElement!
    expect(Array.from(grupp.querySelectorAll('a')).map(a => a.getAttribute('href'))).toEqual(['/ekonomi', '/admin/markagarrapport', '/admin'])
  })
})

describe('Startsida (förare) — samma sida, utan admin-vyer', () => {
  it('ingen admin-vy, ingen Admin-grupp och ingen datahälsa-rad', async () => {
    await montera(<Startsida roll="forare" marken={{}} datahalsa={{ niva: 'rod', rubrik: 'x' }} />)
    for (const b of Array.from(document.querySelectorAll('button[aria-expanded]'))) await act(async () => { (b as HTMLButtonElement).click() })
    await act(async () => { (document.querySelector('button[aria-label^="Mer"]') as HTMLButtonElement).click() })
    const alla = lankar()
    expect(alla).not.toContain('/ekonomi')
    expect(alla).not.toContain('/admin')
    expect(alla).not.toContain('/admin/markagarrapport')
    expect(sektion('Behöver dig')).toBeNull()
    expect(Array.from(document.querySelectorAll('button[aria-expanded]')).map(b => b.textContent)).not.toContainEqual(expect.stringContaining('Admin'))
  })
})

describe('HomeClient väljer sida efter roll', () => {
  it('admin → nya startsidan', async () => {
    h.roll = 'admin'; h.ek = 2
    await montera(<HomeClient />)
    expect(sektion('Dina vyer')).not.toBeNull()
    expect(sektion('Behöver dig')!.textContent).toContain('2 objekt väntar på egenkontroll')
  })

  it('förare → nya startsidan med förarens förinställda vyer, utan admin-vyer', async () => {
    h.roll = 'forare'; h.ek = 4
    await montera(<HomeClient />)
    expect(lankar(sektion('Dina vyer')!)).toEqual(['/planera', '/planering', '/ledighet', '/maskinflytt', '/kalibrering', '/maskin-service', '/uppfoljning', '/utbildning'])
    expect(lankar()).not.toContain('/admin')
    expect(lankar()).not.toContain('/ekonomi')
    // Datahälsan är admins; föraren ser den aldrig i Behöver dig. Egenkontrollen syns.
    expect(sektion('Behöver dig')!.textContent).toContain('4 objekt väntar på egenkontroll')
    expect(sektion('Behöver dig')!.textContent).not.toContain('Datahälsa')
  })

  it('rollen går inte att läsa → gamla startsidan, aldrig en tom skärm — och egenkontrollens märke syns där', async () => {
    h.roll = null; h.ek = 4
    await montera(<HomeClient />)
    expect(sektion('Dina vyer')).toBeNull()
    expect(document.body.textContent).toContain('Produktion')
    expect(document.body.textContent).toContain('Administration')
    const m = document.querySelector('a[href="/egenkontroll"] [role="status"]')
    expect(m?.textContent).toBe('4')
  })

  it('okänd rolltext (varken admin eller förare) → gamla startsidan', async () => {
    h.roll = 'nagot-annat'
    await montera(<HomeClient />)
    expect(sektion('Dina vyer')).toBeNull()
  })
})

describe('Egna favoriter', () => {
  const dinaVyer = () => lankar(sektion('Dina vyer')!)
  const andra = async () => { await act(async () => { knapp('Ändra').click() }) }
  const ark = () => document.querySelector('[role="dialog"]')!
  const iArk = (etikett: string) => ark().querySelector(`button[aria-label="${etikett}"]`) as HTMLButtonElement
  const spara = () => Array.from(ark().querySelectorAll('button')).find(b => b.textContent === 'Spara') as HTMLButtonElement

  it('medan favoriterna läses: inga rutor och ingen Ändra-knapp (ingen blinkning av fel uppsättning)', async () => {
    await montera(<Startsida roll="admin" marken={{}} onSparaFavoriter={async () => true} />)
    expect(dinaVyer()).toHaveLength(0)
    expect(knapp('Ändra')).toBeUndefined()
  })

  it('egna favoriter visas i sparad ordning', async () => {
    await montera(<Startsida roll="admin" marken={{}} favoritIds={['ledighet', 'ekonomi']} onSparaFavoriter={async () => true} />)
    expect(dinaVyer()).toEqual(['/ledighet', '/ekonomi'])
  })

  it('ta bort, lägg till, flytta upp → Spara skickar exakt den listan och arket stängs', async () => {
    const sparat: string[][] = []
    await montera(<Startsida roll="admin" marken={{}} favoritIds={['oversikt', 'uppfoljning']} onSparaFavoriter={async ids => { sparat.push(ids); return true }} />)
    await andra()
    expect(spara().disabled).toBe(true) // inget ändrat än
    await act(async () => { iArk('Ta bort Översikt').click() })
    await act(async () => { iArk('Lägg till Ledighet').click() })
    await act(async () => { iArk('Flytta upp Ledighet').click() })
    expect(spara().disabled).toBe(false)
    await act(async () => { spara().click() })
    await flush()
    expect(sparat).toEqual([['ledighet', 'uppfoljning']])
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('sparningen misslyckas → arket står kvar och säger vad man ska göra', async () => {
    await montera(<Startsida roll="admin" marken={{}} favoritIds={['oversikt']} onSparaFavoriter={async () => false} />)
    await andra()
    await act(async () => { iArk('Ta bort Översikt').click() })
    await act(async () => { spara().click() })
    await flush()
    expect(ark().querySelector('[role="alert"]')!.textContent).toContain('tryck Spara igen')
  })

  it('åtta valda → plus är avstängt och det står varför', async () => {
    await montera(<Startsida roll="admin" marken={{}} onSparaFavoriter={async () => true} favoritIds={null} />)
    await andra()
    expect(iArk('Lägg till Ledighet').disabled).toBe(true)
    expect(ark().textContent).toContain('plats för 8')
  })

  it('förare kan inte lägga till en admin-vy', async () => {
    await montera(<Startsida roll="forare" marken={{}} favoritIds={['ledighet']} onSparaFavoriter={async () => true} />)
    await andra()
    expect(iArk('Lägg till Ekonomi')).toBeNull()
    expect(iArk('Lägg till Admin')).toBeNull()
    expect(iArk('Lägg till Planera')).not.toBeNull()
  })

  it('Återställ ger rollens förinställda', async () => {
    const sparat: string[][] = []
    await montera(<Startsida roll="admin" marken={{}} favoritIds={['ledighet']} onSparaFavoriter={async ids => { sparat.push(ids); return true }} />)
    await andra()
    await act(async () => { Array.from(ark().querySelectorAll('button')).find(b => b.textContent?.includes('Återställ'))!.click() })
    await act(async () => { spara().click() })
    await flush()
    expect(sparat[0]).toEqual(['oversikt', 'uppfoljning', 'planering', 'objekt', 'helikopter', 'maskinvy-2', 'bestallningar', 'ekonomi'])
  })

  it('HomeClient: sparade favoriter läses in för admin', async () => {
    h.roll = 'admin'; h.favoriter = ['kalibrering', 'ledighet']
    await montera(<HomeClient />)
    expect(dinaVyer()).toEqual(['/kalibrering', '/ledighet'])
    expect(knapp('Ändra')).toBeDefined()
  })
})
