// @vitest-environment jsdom
/**
 * Sidolistan i maskinvyn (?ny=1) på stor skärm: alla maskiner i en lista, grupperade Skördare / Skotare, med prick (lever nu?)
 * och dagens siffror per rad. Hela sidan renderas (vyerna är stubbar — de har egna tester); det som prövas är sidans koppling:
 * när listan står, vad ett tryck gör, och att smal skärm och Jämförelse är orörda.
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

const SCORPION = 'PONS20SDJAA270231'
const WISENT = 'A030353'
const data = vi.hoisted(() => ({ fel: new Set<string>(), manga: false, tidFel: false, senasteAnrop: 0, avslutadFel: false, anrop: [] as string[][] }))

vi.mock('@/lib/supabase', () => {
  const from = (t: string) => {
    const q: any = {}
    let kolumner = ''
    for (const m of ['in', 'eq', 'is', 'limit', 'order']) q[m] = () => q
    q.select = (c: string) => { kolumner = c; return q }
    q.then = (res: any) => {
      // dim_maskin läses av två: skotarlistan (useMaskinvyMaskiner) och sidolistans aktiv_till. R64101 och gamla Elefant AF är avslutade.
      if (t === 'dim_maskin' && kolumner === 'maskin_id, aktiv_till' && data.avslutadFel) return Promise.resolve({ data: null, error: new Error('nej') }).then(res)
      const rader =
        t === 'dim_maskin' ? [
          { maskin_id: 'A030353', visningsnamn: 'Ponsse Wisent', modell: 'Wisent', maskin_typ: 'Forwarder', aktiv_fran: '2020-01-01', aktiv_till: null },
          { maskin_id: 'A110148', visningsnamn: 'Elefant AF', modell: 'Elephant King', maskin_typ: 'Forwarder', aktiv_fran: '2021-03-01', aktiv_till: '2026-07-08' },
          { maskin_id: 'R64101', visningsnamn: 'H8E -23', modell: 'H8E', maskin_typ: 'Harvester', aktiv_fran: null, aktiv_till: '2026-03-11' },
        ]
        : t === 'fakt_tid' ? [{ maskin_id: 'A030353' }]
        : []
      return Promise.resolve({ data: rader, error: null }).then(res)
    }
    return q
  }
  const rpc = (namn: string, args: any) => {
    const id = (args.p_maskin_ids as string[])[0]
    data.anrop.push(args.p_maskin_ids as string[])
    if (data.fel.has(id)) return Promise.resolve({ data: null, error: new Error('nej') })
    if (namn === 'maskindata_produktion_senaste') {
      data.senasteAnrop += 1
      if (id === SCORPION) return Promise.resolve({ data: [{ datum: '2026-10-22', skapad_tid: '2026-10-22T07:57:00Z' }], error: null })
      if (id === 'R64101') return Promise.resolve({ data: [{ datum: '2026-03-11', skapad_tid: null }], error: null })
      return Promise.resolve({ data: [], error: null })
    }
    if (namn === 'maskindata_lass_senaste') return Promise.resolve({ data: [{ datum: '2026-10-22', lossnings_tid: '2026-10-22T07:20:00Z' }], error: null })
    if (namn === 'maskindata_produktion') {
      return Promise.resolve({ data: data.manga ? Array.from({ length: 1000 }, () => ({ volym_m3sub: 1 })) : [{ volym_m3sub: 100 }, { volym_m3sub: 42 }], error: null })
    }
    if (namn === 'maskindata_tid' && data.tidFel) return Promise.resolve({ data: null, error: new Error('tid nej') })
    if (namn === 'maskindata_tid') return Promise.resolve({ data: [{ processing_sek: 36000, terrain_sek: 3600, other_work_sek: 1800 }], error: null })
    if (namn === 'maskindata_lass') return Promise.resolve({ data: [{ volym_m3sub: 10 }, { volym_m3sub: 11 }, { volym_m3sub: 12 }], error: null })
    return Promise.resolve({ data: [], error: null })
  }
  return { supabase: { from, rpc } }
})

// Vyerna har egna tester — här räcker det att veta vilken som visas och för vilken maskin.
const { stub } = vi.hoisted(() => ({
  stub: (namn: string) => ({ default: ({ maskin }: any) => React.createElement('div', { 'data-vy': namn }, maskin?.namn) }),
}))
vi.mock('./OversiktNy', () => stub('skordare-oversikt'))
vi.mock('./IdagNy', () => stub('skordare-idag'))
vi.mock('./ProduktionNy', () => stub('skordare-produktion'))
vi.mock('./AvbrottNy', () => stub('skordare-avbrott'))
vi.mock('./KapacitetNy', () => stub('skordare-kapacitet'))
vi.mock('./SkotareOversiktNy', () => stub('skotare-oversikt'))
vi.mock('./SkotareIdagNy', () => stub('skotare-idag'))
vi.mock('./SkotareProduktionNy', () => stub('skotare-produktion'))
vi.mock('./SkotareAvbrottNy', () => stub('skotare-avbrott'))
vi.mock('./SkotareJamforelseNy', () => stub('skotare-jamforelse'))
vi.mock('./Jamforelse', () => stub('jamforelse'))
vi.mock('./MaskinLogg', () => ({ default: () => null }))
vi.mock('../../maskinvy', () => ({ default: () => React.createElement('div', { 'data-vy': 'gamla-skordare' }) }))
vi.mock('../../skotare', () => ({ default: () => React.createElement('div', { 'data-vy': 'gamla-skotare' }) }))

import MaskinvyPage from './page'

let rot: HTMLDivElement; let r: ReturnType<typeof createRoot>
const lugn = async () => { for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve() }) }
const stallBredd = (bred: boolean) => {
  ;(window as any).matchMedia = (q: string) => ({ matches: bred, media: q, addEventListener() {}, removeEventListener() {} })
}
async function montera(url = '/maskinvy?ny=1', bred = true) {
  window.history.replaceState({}, '', url)
  stallBredd(bred)
  await act(async () => { r.render(<MaskinvyPage />) })
  await lugn()
}
const sida = () => document.querySelector('[data-sidolista]')
const rad = (id: string) => document.querySelector(`[data-sido-rad="${id}"]`) as HTMLElement | null
const vy = () => document.querySelector('[data-vy]')?.getAttribute('data-vy')
const tryck = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click() }); await lugn() }
const flik = (text: string) => Array.from(document.querySelectorAll('[role=tab]')).find(b => b.textContent === text) as HTMLElement

beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-22T08:00:00Z') })   // 10:00 svensk tid
  data.fel = new Set(); data.manga = false; data.tidFel = false; data.senasteAnrop = 0; data.avslutadFel = false; data.anrop = []
  rot = document.createElement('div'); document.body.appendChild(rot); r = createRoot(rot)
})
afterEach(() => { act(() => r.unmount()); rot.remove(); vi.useRealTimers(); document.body.removeAttribute('data-mv-sidolista') })

describe('sidolistan på stor skärm', () => {
  it('står till vänster med två grupper och en rad per maskin; body får attributet som flyttar innehållet', async () => {
    await montera()
    expect(sida()).not.toBeNull()
    expect(document.body.hasAttribute('data-mv-sidolista')).toBe(true)
    const skordare = Array.from(document.querySelectorAll('[data-sido-grupp="skordare"] [data-sido-rad]')).map(e => e.getAttribute('data-sido-rad'))
    expect(skordare).toEqual([SCORPION, 'R64428', 'R64101+R64428'])      // R64101 är avslutad → "Tidigare"; kombon har en aktiv maskin kvar
    const skotare = Array.from(document.querySelectorAll('[data-sido-grupp="skotare"] [data-sido-rad]')).map(e => e.getAttribute('data-sido-rad'))
    expect(skotare).toEqual([WISENT])
  })

  it('raden säger om maskinen lever och vad den gjort idag; en stillastående maskin säger det', async () => {
    await montera()
    const sc = rad(SCORPION)!
    expect(sc.getAttribute('data-sido-niva')).toBe('aktiv')
    expect(sc.textContent).toContain('Ponsse Scorpion')
    expect(sc.textContent).toContain('Aktiv nu')
    expect(sc.textContent).toContain('142 m³ · 12,3 m³/G15h')            // 142 m³ / 11,5 G15-timmar (36 000 + 3 600 + 1 800 s)
    const wi = rad(WISENT)!
    expect(wi.getAttribute('data-sido-niva')).toBe('sen')                  // lass för 40 min sedan → gul
    expect(wi.textContent).toContain('För 40 min sedan')
    expect(wi.textContent).toContain('33 m³ · 3 lass')
  })

  it('en maskin utan någon data alls säger "Ingen data" — den står aldrig kvar på "Läser …"', async () => {
    await montera()
    const r4428 = rad('R64428')!                                          // mocken svarar med noll rader för den
    expect(r4428.getAttribute('data-sido-niva')).toBe('ingen')
    expect(r4428.textContent).toContain('Ingen data')
    expect(r4428.textContent).not.toContain('Läser')
  })

  it('ett tryck på en skotare byter flik och maskin, och vyn (Idag) står kvar', async () => {
    await montera('/maskinvy?ny=1&vy=idag')
    expect(vy()).toBe('skordare-idag')
    await tryck(rad(WISENT))
    expect(vy()).toBe('skotare-idag')
    expect(document.querySelector('[data-vy]')?.textContent).toBe('Ponsse Wisent')
    expect(flik('Skotare').getAttribute('aria-selected')).toBe('true')
    expect(rad(WISENT)!.getAttribute('aria-current')).toBe('true')
    expect(rad(SCORPION)!.getAttribute('aria-current')).toBeNull()
    await tryck(rad('R64428'))
    expect(vy()).toBe('skordare-idag')
    expect(document.querySelector('[data-vy]')?.textContent).toBe('Rottne H8E -26')
  })

  it('en vy som fliken saknar (Kapacitet finns bara hos skördaren) faller tillbaka på Översikt — inte ett nav utan vald knapp', async () => {
    await montera('/maskinvy?ny=1&vy=kapacitet')
    expect(vy()).toBe('skordare-kapacitet')
    await tryck(rad(WISENT))
    expect(vy()).toBe('skotare-oversikt')
    const valda = Array.from(document.querySelectorAll('.mv-vy-btn.active')).map(e => e.textContent)
    expect(valda).toEqual(['Översikt'])
  })

  it('Jämförelse har inget maskinval: listan försvinner och innehållet flyttar tillbaka', async () => {
    await montera()
    await tryck(flik('Jämförelse'))
    expect(vy()).toBe('jamforelse')
    expect(sida()).toBeNull()
    expect(document.body.hasAttribute('data-mv-sidolista')).toBe(false)
    await tryck(flik('Skördare'))
    expect(sida()).not.toBeNull()
  })

  it('en maskin som inte går att läsa säger det på sin rad — de andra påverkas inte', async () => {
    data.fel.add(WISENT)
    await montera()
    expect(rad(WISENT)!.getAttribute('data-sido-niva')).toBe('fel')
    expect(rad(WISENT)!.textContent).toContain('Kunde inte läsas')
    expect(rad(SCORPION)!.getAttribute('data-sido-niva')).toBe('aktiv')
  })

  it('en dag med 1 000 rader (sidgränsen) är ett fel, aldrig en halv summa', async () => {
    data.manga = true
    await montera()
    expect(rad(SCORPION)!.getAttribute('data-sido-niva')).toBe('fel')
    expect(rad(SCORPION)!.textContent).not.toContain('1 000 m³')
  })

  it('går tiden inte att läsa visas volymen utan m³/G15h — kvoten gissas aldrig', async () => {
    data.tidFel = true
    await montera()
    expect(rad(SCORPION)!.textContent).toContain('142 m³')
    expect(rad(SCORPION)!.textContent).not.toContain('G15h')
  })

  it('listan läser om var 2:a minut, så en ny signal syns utan att sidan laddas om', async () => {
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'], now: new Date('2026-10-22T08:00:00Z') })
    await montera()
    const fore = data.senasteAnrop
    await act(async () => { vi.advanceTimersByTime(120000) })
    await lugn()
    expect(data.senasteAnrop).toBeGreaterThan(fore)
  })
})

describe('Tidigare — avslutade maskiner', () => {
  const tidigareKnapp = () => document.querySelector('[data-sido-tidigare] button[aria-expanded]') as HTMLElement | null
  const tidigareRader = () => Array.from(document.querySelectorAll('[data-sido-tidigare] [data-sido-rad]')).map(e => e.getAttribute('data-sido-rad'))

  it('avslutade maskiner (aktiv_till före idag) ligger i en hopfälld grupp längst ner — inte i skördar- eller skotargruppen', async () => {
    await montera()
    const knapp = tidigareKnapp()!
    expect(knapp.textContent).toContain('Tidigare (2)')
    expect(knapp.getAttribute('aria-expanded')).toBe('false')
    expect(tidigareRader()).toEqual([])                                   // hopfälld: raderna finns inte
    expect(rad('R64101')).toBeNull()
    expect(rad('A110148')).toBeNull()
    // Gruppen ligger sist i listan, efter Skotare.
    const nav = document.querySelector('[data-sidolista]')!
    const ordning = Array.from(nav.children).map(e => e.getAttribute('data-sido-grupp') ?? (e.hasAttribute('data-sido-tidigare') ? 'tidigare' : '?'))
    expect(ordning).toEqual(['skordare', 'skotare', 'tidigare'])
  })

  it('öppnad: bara namnet — ingen prick, ingen status, inga dagssiffror — och inget hämtas för dem', async () => {
    await montera()
    await tryck(tidigareKnapp())
    expect(tidigareKnapp()!.getAttribute('aria-expanded')).toBe('true')
    expect(tidigareRader()).toEqual(['R64101', 'A110148'])
    expect(rad('R64101')!.textContent).toBe('Rottne H8E -23')
    expect(rad('A110148')!.textContent).toBe('Elefant AF')
    expect(rad('R64101')!.hasAttribute('data-sido-niva')).toBe(false)
    expect(document.querySelectorAll('[data-sido-tidigare] [aria-hidden]').length).toBe(1)   // bara pilen i rubrikknappen
    // Ingen läsning av dagens signal/siffror för de avslutade (kombon läser bara sina egna id:n i en egen fråga).
    const ensamma = data.anrop.filter(a => a.length === 1).map(a => a[0])
    expect(ensamma).not.toContain('R64101')
    expect(ensamma).not.toContain('A110148')
  })

  it('en avslutad maskin går att välja som vanligt: fliken och maskinen byts, vyn står kvar, och raden syns vald', async () => {
    await montera('/maskinvy?ny=1&vy=idag')
    await tryck(tidigareKnapp())
    await tryck(rad('A110148'))
    expect(vy()).toBe('skotare-idag')
    expect(document.querySelector('[data-vy]')?.textContent).toBe('Elefant AF')
    expect(flik('Skotare').getAttribute('aria-selected')).toBe('true')
    expect(rad('A110148')!.getAttribute('aria-current')).toBe('true')
    await tryck(rad('R64101'))
    expect(vy()).toBe('skordare-idag')
    expect(document.querySelector('[data-vy]')?.textContent).toBe('Rottne H8E -23')
    expect(rad('R64101')!.getAttribute('aria-current')).toBe('true')
    expect(rad('A110148')!.getAttribute('aria-current')).toBeNull()
  })

  it('går aktiv_till inte att läsa är ingen maskin avslutad — listan ser ut som förut och felet säger sig inte vara "Tidigare"', async () => {
    data.avslutadFel = true
    await montera()
    expect(document.querySelector('[data-sido-tidigare]')).toBeNull()
    const skordare = Array.from(document.querySelectorAll('[data-sido-grupp="skordare"] [data-sido-rad]')).map(e => e.getAttribute('data-sido-rad'))
    expect(skordare).toContain('R64101')
    expect(rad('A110148')).not.toBeNull()
  })

  it('sista dagen räknas som aktiv: är aktiv_till idag eller längre fram finns ingen avslutad maskin och ingen grupp', async () => {
    vi.setSystemTime(new Date('2026-03-11T08:00:00Z'))   // R64101:s sista dag; Elefant AF (t.o.m. 2026-07-08) är ännu inte avslutad
    await montera()
    expect(document.querySelector('[data-sido-tidigare]')).toBeNull()
    expect(rad('R64101')).not.toBeNull()
    expect(rad('A110148')).not.toBeNull()
  })
})

describe('utan sidolista', () => {
  it('smal skärm: ingen lista, inget attribut — rullgardinen gäller som förut', async () => {
    await montera('/maskinvy?ny=1', false)
    expect(sida()).toBeNull()
    expect(document.body.hasAttribute('data-mv-sidolista')).toBe(false)
  })
  it('den äldre vyn (utan ?ny=1) får aldrig sidolistan', async () => {
    await montera('/maskinvy', true)
    expect(sida()).toBeNull()
    expect(vy()).toBe('gamla-skordare')
  })
})
