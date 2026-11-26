// @vitest-environment jsdom
// DATAHÄLSA VISAR BARA DET SOM ÄR FEL JUST NU (Martin 2026-11-25). Hela sidan renderas; läsningen (useDatahalsa) är
// utbytt mot produktionens fixtur, men vad som räknas som ett fel kommer ur de riktiga reglerna (felNu via testStod).
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FARG } from '@/lib/design/tokens'
import { FX, NU, STATUS, byggDatahalsa, type Over } from './testStod'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('./useDatahalsa', async (orig) => ({
  ...(await orig<typeof import('./useDatahalsa')>()),
  useDatahalsa: () => (globalThis as any).__dh,
}))
vi.mock('./SkotarLassKort', () => ({ default: () => <div data-testid="skotarlass-kort">skotarlass</div> }))

import DatahalsaPage from './page'

let rot: Root
let c: HTMLDivElement

function rita(o: Over = {}) {
  ;(globalThis as any).__dh = byggDatahalsa(o)
  act(() => { rot.render(<DatahalsaPage />) })
}
const q = (s: string) => c.querySelector(s) as HTMLElement | null
const qa = (s: string) => Array.from(c.querySelectorAll(s)) as HTMLElement[]
const tryck = (el: HTMLElement) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const kort = () => qa('[data-kort]').map((k) => k.dataset.kort)
/** Färgerna som betyder fel. De får bara finnas i svaret. */
const LARMFARGER = [FARG.rod, FARG.orange, FARG.gul]
const harLarmfarg = (el: Element) => LARMFARGER.some((f) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(f.slice(i, i + 2), 16))
  return el.outerHTML.includes(f) || el.outerHTML.includes(`rgb(${r}, ${g}, ${b})`)
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(NU))
  c = document.createElement('div')
  document.body.appendChild(c)
  rot = createRoot(c)
})
afterEach(() => {
  act(() => { rot.unmount() })
  c.remove()
  vi.useRealTimers()
})

describe('FACIT PROD 2026-11-25: "Allt fungerar"', () => {
  it('svaret är grönt, i ord, och sidan visar inget kort', () => {
    rita()
    expect(q('[data-testid="svar"]')!.dataset.niva).toBe('gron')
    expect(q('[data-testid="svar-rubrik"]')!.textContent).toBe('Allt fungerar')
    expect(q('[data-testid="svar-problem"]')).toBeNull()
    expect(kort()).toEqual([])
    expect(q('[data-testid="svar-kontrollerat"]')!.textContent).toBe('Importen kontrollerad 20:45 · importdatorn 18:33')
  })

  it('de gamla räknarna är borta: inga "256 importfel", inget "NYA", inga 100 felrader i svaret', () => {
    rita()
    expect(c.textContent).not.toMatch(/256|NYA|importfel sedan|att titta på/)
    expect(c.textContent).not.toMatch(/UPDATE requires/)
  })

  it('EN grå rad längst ner: "Visa allt · 7 kontroller"', () => {
    rita()
    const knapp = q('[data-testid="visa-allt"]')!
    expect(knapp.querySelector('span')!.textContent).toBe('Visa allt · 7 kontroller')
    expect(knapp.getAttribute('aria-expanded')).toBe('false')
    expect(q('[data-testid="allt"]')).toBeNull()
  })

  it('raden fäller ut dagens sju kort — och inget av dem lyser', () => {
    rita()
    tryck(q('[data-testid="visa-allt"]')!)
    expect(kort()).toEqual(['filer', 'leverans', 'importfel', 'invarianter', 'kontroller', 'koordinat', 'skotarlass'])
    expect(q('[data-testid="visa-allt"]')!.getAttribute('aria-expanded')).toBe('true')
    expect(harLarmfarg(q('[data-testid="allt"]')!)).toBe(false)
    // maskinen som varit tyst i tolv dagar är ingen varning, bara en rad
    expect(q('[data-kort="leverans"]')!.textContent).toContain('Elefant 26')
    expect(q('[data-kort="leverans"]')!.textContent).toContain('12 dagar sedan')
  })

  it('historiken står bara i den utfällda delen, i ord: de läkta felen och de gamla i filloggen', () => {
    rita()
    expect(c.textContent).not.toMatch(/Läkt/)
    tryck(q('[data-testid="visa-allt"]')!)
    const h = q('[data-testid="importfel-historik"]')!
    expect(h.textContent).toContain('Gallring Santhe 2026 · H8E -26')
    expect(h.textContent).toContain('27 HPR-filer gick inte in helt 23 nov 16:39. Läkt – nästa fil skrev in allt.')
    expect(h.textContent).toContain('Tröjemåla 1115 AU · Scorpion')
    expect(h.textContent).toContain('256 äldre filer med fel')
    expect(h.textContent).toMatch(/Inget av dem är ett fel nu/)
    expect(q('[data-rad="importfel-inga"]')!.textContent).toContain('Inga fel just nu')
    expect(qa('[data-rad="importfel-nu"]')).toEqual([])
  })

  it('kontrollerna på importdatorn står med namn i klartext och "Inga larm"', () => {
    rita()
    tryck(q('[data-testid="visa-allt"]')!)
    const rader = qa('[data-kontroll]')
    expect(rader.map((r) => r.dataset.kontroll)).toEqual(['fakt_tid_mot_mom', 'stammar_utan_stockar', 'fakt_sortiment_mot_stock', 'inkommande_ko', 'parkerade_filer', 'deploy_drift'])
    expect(rader.every((r) => r.dataset.lage === 'ok' && /Inga larm/.test(r.textContent ?? ''))).toBe(true)
  })

  it('importens läge är en rad i kortet, inte en egen ruta över svaret', () => {
    rita()
    expect(q('[data-testid="import-live"]')).toBeNull()
    expect(c.querySelector('main')!.firstElementChild).toBe(q('[data-testid="svar"]'))
    tryck(q('[data-testid="visa-allt"]')!)
    expect(q('[data-rad="import-live"]')!.textContent).toMatch(/Importen just nu.*Fungerar/)
  })
})

describe('ett fel som INTE läkt står i svaret', () => {
  const mitt = Date.parse('2026-11-23T12:00:00Z')
  const haveri: Over = {
    nu: mitt,
    status: STATUS.map((r) => ({ ...r, kordTid: new Date(mitt - 600_000).toISOString() })),
    fel: FX.fel.filter((r) => Date.parse(r.tid) <= mitt),
    filer: FX.filer.filter((f) => Date.parse(f.importeradTid) <= mitt),
  }
  beforeEach(() => vi.setSystemTime(new Date(mitt)))

  it('"2 saker är fel" + en rad per problem, i ord, med vad man gör', () => {
    rita(haveri)
    expect(q('[data-testid="svar"]')!.dataset.niva).toBe('rod')
    expect(q('[data-testid="svar-rubrik"]')!.textContent).toBe('2 saker är fel')
    const rader = qa('[data-testid="svar-problem"] li')
    expect(rader.map((r) => r.firstElementChild!.textContent).sort()).toEqual([
      'Gallring Santhe 2026 · H8E -26: 24 HPR-filer gick inte in helt',
      'Tröjemåla 1115 AU · Scorpion: 8 HPR-filer gick inte in helt',
    ])
    expect(rader.every((r) => /Läks när nästa fil från objektet går in/.test(r.textContent ?? ''))).toBe(true)
  })

  it('bara kortet med problemet står uppe; resten ligger bakom raden', () => {
    rita(haveri)
    expect(kort()).toEqual(['importfel'])
    expect(qa('[data-rad="importfel-nu"]')).toHaveLength(2)
    expect(q('[data-kort="importfel"]')!.textContent).toContain('Skrevs inte: detalj_stam, detalj_stock')
    expect(q('[data-testid="visa-allt"] span')!.textContent).toBe('Visa det som fungerar · 6 kontroller')
    tryck(q('[data-testid="visa-allt"]')!)
    expect(kort()).toEqual(['importfel', 'filer', 'leverans', 'invarianter', 'kontroller', 'koordinat', 'skotarlass'])
  })

  it('en kontroll som larmar: problemraden och kortet', () => {
    vi.setSystemTime(new Date(NU))
    rita({ status: STATUS.map((r) => (r.id === 'parkerade_filer' ? { ...r, status: 'LARM', larmAntal: 1, sammanfattning: 'LARM OIMPORTERADE FILER i _vanta_stor_hpr: 5 st' } : r)) })
    expect(q('[data-testid="svar-rubrik"]')!.textContent).toBe('1 sak är fel')
    expect(q('[data-problem="kontroll:parkerade_filer"]')!.textContent).toContain('Parkerade filer: OIMPORTERADE FILER i _vanta_stor_hpr: 5 st')
    expect(kort()).toEqual(['kontroller'])
    expect(q('[data-kontroll="parkerade_filer"]')!.dataset.lage).toBe('larm')
  })

  it('obekräftade lass: problemraden, och lasskortet står uppe så de går att granska', () => {
    vi.setSystemTime(new Date(NU))
    rita({ lass: { antal: 19, m3: 380 } })
    expect(q('[data-testid="svar-rubrik"]')!.textContent).toBe('1 sak är fel')
    expect(q('[data-problem="lass:obekraftade"]')!.textContent).toContain('19 lass väntar på granskning')
    expect(kort()).toEqual(['skotarlass'])
  })
})

describe('ETT LÄSFEL ÄR ETT PROBLEM — aldrig "Allt fungerar"', () => {
  beforeEach(() => vi.setSystemTime(new Date(NU)))

  it('"Kunde inte kontrollera …" med Försök igen, som läser om', () => {
    const lasOm = vi.fn()
    rita({ fel: { fel: 'TypeError: Failed to fetch' }, lasOm })
    expect(q('[data-testid="svar"]')!.dataset.niva).toBe('okant')
    expect(q('[data-testid="svar-rubrik"]')!.textContent).toBe('Kunde inte kontrollera allt')
    expect(c.textContent).not.toMatch(/Allt fungerar/)
    const rad = q('[data-problem="las:importfel"]')!
    expect(rad.textContent).toContain('Kunde inte kontrollera om något tappades vid import')
    const knapp = rad.querySelector('button')!
    expect(knapp.textContent).toBe('Försök igen')
    tryck(knapp)
    expect(lasOm).toHaveBeenCalledTimes(1)
    // kortet som inte gick att läsa står uppe och säger det — aldrig tomt
    expect(kort()).toEqual(['importfel'])
    expect(q('[data-kort="importfel"]')!.textContent).toContain('Kunde inte läsas')
  })

  it('varje källa som inte går att läsa ger sin egen rad', () => {
    rita({ status: { fel: 'x' }, invarianter: { fel: 'x' }, koordinat: { fel: 'x' }, lass: { fel: 'x' }, leverans: { fel: 'x' }, filer: { fel: 'x' } })
    expect(qa('[data-testid="svar-problem"] li')).toHaveLength(6)
    expect(qa('[data-testid="svar-problem"] button')).toHaveLength(6)
    expect(c.textContent).not.toMatch(/Allt fungerar/)
  })

  it('medan det läses: "Kontrollerar …", inga kort, ingen rad — aldrig ett förhastat grönt', () => {
    rita({ laddar: true })
    expect(q('[data-testid="svar"]')!.dataset.niva).toBe('laddar')
    expect(q('[data-testid="svar-rubrik"]')!.textContent).toBe('Kontrollerar …')
    expect(kort()).toEqual([])
    expect(q('[data-testid="visa-allt"]')).toBeNull()
    expect(c.textContent).not.toMatch(/Allt fungerar/)
  })
})

describe('färgen bär aldrig ensam', () => {
  it('svaret står i ord i varje läge; pricken är dold för skärmläsare', () => {
    vi.setSystemTime(new Date(NU))
    for (const o of [{}, { lass: { antal: 1, m3: 20 } }, { fel: { fel: 'x' } }, { laddar: true }] as Over[]) {
      rita(o)
      expect(q('[data-testid="svar-rubrik"]')!.textContent!.length).toBeGreaterThan(5)
      expect(q('[data-testid="svar-prick"]')!.getAttribute('aria-hidden')).toBe('true')
    }
  })
})
