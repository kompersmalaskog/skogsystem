// @vitest-environment jsdom
/**
 * Maskinen som maskin i gränssnittet (jsdom, riktiga komponenter): kodplattan (fjärde siffran loggar in direkt, ingen OK-knapp, fel kod skakar och töms),
 * "Vem är du?" (ordning, ingen kod, fel kod, väntan efter fem fel), och leverantören: förarens egna saker låsta, Ekonomi/Personal dolda, upplåsningens
 * pill, lås vid kartan / Lås / 10 minuter utan tryck, brytaren av. Layout och finger mäts INTE här (jsdom har ingen layout) — se PR-texten.
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  pathname: '/planering',
  medarbetare: { id: 'm1', namn: 'H8', roll: 'maskin', maskin_id: 'R64428', partner_user_id: null } as any,
  lage: { maskin_id: 'R64428', aktiv: true } as any,
  personer: [] as any[],
  lasUpp: vi.fn(),
  begar: vi.fn(),
  harKod: vi.fn(),
  lasMaskinen: vi.fn(async () => undefined),
  loggaUt: vi.fn(async () => undefined),
}))

vi.mock('next/navigation', () => ({ usePathname: () => h.pathname, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: any) => <a href={href} {...r}>{children}</a> }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'x@x' } } }), getSession: async () => ({ data: { session: null } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.medarbetare }) }) }) }),
    rpc: async (n: string) => (n === 'maskin_konto_lage' ? { data: h.lage, error: null } : { data: null, error: null }),
  },
}))
vi.mock('@/lib/maskinkonto/klient', async () => {
  const orig = await vi.importActual<typeof import('@/lib/maskinkonto/klient')>('@/lib/maskinkonto/klient')
  return { ...orig, hamtaPersoner: async () => h.personer, lasUppMedKod: (...a: any[]) => h.lasUpp(...a), begarKodNotis: (...a: any[]) => h.begar(...a), hamtaHarKod: (...a: any[]) => h.harKod(...a), lasMaskinen: () => h.lasMaskinen(), loggaUtMaskinen: () => h.loggaUt() }
})

import KodPlatta from './KodPlatta'
import VemArDuArk, { KOD_FRAGA_MS } from './VemArDuArk'
import MaskinKontoProvider from './MaskinKontoProvider'
import { CurrentMedarbetareProvider } from '@/lib/CurrentMedarbetareContext'
import { IDLE_MS, sattMaskinSession, sattUpplast } from '@/lib/maskinkonto/upplast'

let rot: ReturnType<typeof createRoot> | null = null
let el: HTMLDivElement | null = null
const flush = async () => { for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve() }) }
async function montera(node: React.ReactElement) { rot = createRoot(el!); await act(async () => { rot!.render(node) }); await flush() }
const tangent = (t: string) => document.querySelector(`[data-tangent="${t}"]`) as HTMLButtonElement
const tryck = async (...siffror: string[]) => { for (const s of siffror) { await act(async () => { tangent(s).click() }) } await flush() }
const prickar = () => Array.from(document.querySelectorAll('[data-prick]')).map(p => p.getAttribute('data-prick'))

beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  h.pathname = '/planering'
  h.medarbetare = { id: 'm1', namn: 'H8', roll: 'maskin', maskin_id: 'R64428', partner_user_id: null }
  h.lage = { maskin_id: 'R64428', aktiv: true }
  h.personer = [
    { id: 'p1', namn: 'Oskar Nilsson', roll: 'forare', harKod: true },
    { id: 'p2', namn: 'Daniel', roll: 'forare', harKod: false },
    { id: 'p3', namn: 'Martin', roll: 'admin', harKod: true },
  ]
  h.lasUpp.mockReset(); h.lasMaskinen.mockClear(); h.loggaUt.mockClear()
  h.begar.mockReset(); h.begar.mockResolvedValue({ typ: 'skickad', vantarTill: new Date(Date.now() + 120_000).toISOString() })
  h.harKod.mockReset(); h.harKod.mockResolvedValue(false)
  localStorage.clear(); sessionStorage.clear()
  el = document.createElement('div'); document.body.appendChild(el)
})
afterEach(() => { vi.useRealTimers(); act(() => { rot?.unmount() }); el?.remove(); rot = null; el = null })

describe('kodplattan', () => {
  it('fjärde siffran skickas direkt — ingen OK-knapp — och prickarna fylls en och en', async () => {
    const onFyra = vi.fn()
    await montera(<KodPlatta onFyra={onFyra} />)
    expect(document.body.textContent).not.toMatch(/\bOK\b/)
    await tryck('1', '2', '3')
    expect(prickar()).toEqual(['full', 'full', 'full', 'tom']); expect(onFyra).not.toHaveBeenCalled()
    await tryck('4')
    expect(onFyra).toHaveBeenCalledOnce(); expect(onFyra).toHaveBeenCalledWith('1234')
  })
  it('sudda tar bort senaste; tangentbordets siffror funkar; fel kod (nytt skak-värde) tömmer prickarna', async () => {
    const onFyra = vi.fn()
    await montera(<KodPlatta onFyra={onFyra} />)
    await tryck('1', '2'); await tryck('sudda')
    expect(prickar().filter(p => p === 'full')).toHaveLength(1)
    for (const k of ['9', '8', '7']) await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: k })) })
    expect(onFyra).toHaveBeenCalledWith('1987')
    await act(async () => { rot!.render(<KodPlatta onFyra={onFyra} skakaNyckel={1} />) })
    expect(prickar()).toEqual(['tom', 'tom', 'tom', 'tom'])
  })
  it('stängd (kontrollerar/väntar): knapparna går inte att trycka', async () => {
    const onFyra = vi.fn()
    await montera(<KodPlatta onFyra={onFyra} stangd />)
    for (const t of ['1', '2', '3', '4']) expect(tangent(t).disabled).toBe(true)
    await tryck('1', '2', '3', '4'); expect(onFyra).not.toHaveBeenCalled()
  })
})

describe('Vem är du?', () => {
  const namnKnappar = () => Array.from(document.querySelectorAll('[data-person]')).map(b => b.textContent)
  it('förarna som stora namnknappar, arbetsledningen sist och särskild; ingen kod syns på något namn', async () => {
    await montera(<VemArDuArk efterUpplasning="/arbetsrapport" onStang={() => undefined} />)
    expect(namnKnappar()).toEqual(['Oskar Nilsson', 'Daniel', 'Martin'])
    expect(document.body.textContent).toContain('Arbetsledning')
  })
  it('har personen ingen kod: ingen platta — arket säger att en notis skickats (se "Välj koden från maskinen" nedan)', async () => {
    await montera(<VemArDuArk efterUpplasning="/arbetsrapport" onStang={() => undefined} />)
    await act(async () => { (document.querySelector('[data-person="p2"]') as HTMLButtonElement).click() }); await flush()
    expect(document.querySelector('[data-ingen-kod]')?.textContent).toContain('Välj din kod i telefonen – vi har skickat en notis till dig')
    expect(document.querySelector('[data-kodplatta]')).toBeNull()
  })
  it('rätt kod → upplåst och sidan öppnas dit man ville (utan någon OK-knapp)', async () => {
    h.lasUpp.mockResolvedValue({ ok: true })
    const assign = vi.fn(); Object.defineProperty(window, 'location', { value: { assign }, writable: true })
    await montera(<VemArDuArk efterUpplasning="/arbetsrapport" onStang={() => undefined} />)
    await act(async () => { (document.querySelector('[data-person="p1"]') as HTMLButtonElement).click() })
    await tryck('4', '7', '1', '1')
    expect(h.lasUpp).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), '4711')
    expect(assign).toHaveBeenCalledWith('/arbetsrapport')
  })
  it('fel kod → prickarna töms, texten säger att det var fel, man kan försöka igen, inget öppnas', async () => {
    h.lasUpp.mockResolvedValue({ ok: false, fel: 'fel_kod', vantarTill: null })
    const assign = vi.fn(); Object.defineProperty(window, 'location', { value: { assign }, writable: true })
    await montera(<VemArDuArk efterUpplasning="/" onStang={() => undefined} />)
    await act(async () => { (document.querySelector('[data-person="p1"]') as HTMLButtonElement).click() })
    await tryck('0', '0', '0', '0')
    expect(prickar()).toEqual(['tom', 'tom', 'tom', 'tom'])
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('Fel kod. Försök igen.')
    expect(assign).not.toHaveBeenCalled(); expect(tangent('1').disabled).toBe(false)
  })
  it('fem fel i rad → en minuts väntan: plattan stängs och en nedräkning visas tills tiden gått', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    h.lasUpp.mockResolvedValue({ ok: false, fel: 'fel_kod', vantarTill: new Date(Date.now() + 60_000).toISOString() })
    await montera(<VemArDuArk efterUpplasning="/" onStang={() => undefined} />)
    await act(async () => { (document.querySelector('[data-person="p1"]') as HTMLButtonElement).click() })
    await tryck('1', '1', '1', '1')
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('Fel kod fem gånger. Vänta en minut.')
    expect(document.body.textContent).toMatch(/Vänta \d+ s/)
    for (const t of ['1', '2', '3']) expect(tangent(t).disabled).toBe(true)
    await act(async () => { vi.advanceTimersByTime(61_000) })
    expect(tangent('1').disabled).toBe(false)
  })
})

describe('Välj koden från maskinen', () => {
  const rader = () => document.querySelector('[data-ingen-kod]')?.textContent ?? ''
  const skickaIgen = () => document.querySelector('[data-skicka-igen]') as HTMLButtonElement | null
  const tryckNamn = async (id: string) => { await act(async () => { (document.querySelector(`[data-person="${id}"]`) as HTMLButtonElement).click() }); await flush() }
  const FAKE = { toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] as const }
  const assign = vi.fn()
  beforeEach(() => { assign.mockReset(); Object.defineProperty(window, 'location', { value: { assign }, writable: true }) })

  it('namn utan kod → notis begärs för just den personen, arket säger det, "Skicka igen" är grå med nedräkning och ingen platta visas', async () => {
    vi.useFakeTimers({ toFake: [...FAKE.toFake] })
    await montera(<VemArDuArk efterUpplasning="/" onStang={() => undefined} />)
    await tryckNamn('p2')
    expect(h.begar).toHaveBeenCalledTimes(1)
    expect(h.begar).toHaveBeenCalledWith(expect.objectContaining({ id: 'p2' }))
    expect(rader()).toContain('Välj din kod i telefonen – vi har skickat en notis till dig')
    expect(skickaIgen()!.disabled).toBe(true)
    expect(skickaIgen()!.textContent).toMatch(/Skicka igen \(\d+ s\)/)
    expect(document.querySelector('[data-kodplatta]')).toBeNull()
    // Efter två minuter går den att trycka på — och ett tryck begär en ny notis.
    await act(async () => { vi.advanceTimersByTime(121_000) })
    expect(skickaIgen()!.disabled).toBe(false); expect(skickaIgen()!.textContent).toBe('Skicka igen')
    await act(async () => { skickaIgen()!.click() }); await flush()
    expect(h.begar).toHaveBeenCalledTimes(2)
  })

  it('under nedräkningen gör ett tryck på "Skicka igen" ingenting — ingen andra notis', async () => {
    vi.useFakeTimers({ toFake: [...FAKE.toFake] })
    await montera(<VemArDuArk efterUpplasning="/" onStang={() => undefined} />)
    await tryckNamn('p2')
    await act(async () => { vi.advanceTimersByTime(60_000) })
    await act(async () => { skickaIgen()!.click() }); await flush()
    expect(h.begar).toHaveBeenCalledTimes(1)
  })

  it('namnet trycks igen inom två minuter: servern svarar "vantar" (ingen ny notis) och arket visar nedräkningen kvar', async () => {
    vi.useFakeTimers({ toFake: [...FAKE.toFake] })
    await montera(<VemArDuArk efterUpplasning="/" onStang={() => undefined} />)
    await tryckNamn('p2')
    h.begar.mockResolvedValueOnce({ typ: 'vantar', vantarTill: new Date(Date.now() + 90_000).toISOString() })   // servern: redan skickad för 30 s sedan
    const tillbaka = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Det är inte jag') as HTMLButtonElement
    await act(async () => { tillbaka.click() }); await flush()
    await tryckNamn('p2')
    expect(rader()).toContain('vi har skickat en notis till dig')
    expect(skickaIgen()!.disabled).toBe(true)
    expect(skickaIgen()!.textContent).toMatch(/Skicka igen \((8\d|90) s\)/)
  })

  it('personen saknar push i telefonen → reservtexten, ingen "Skicka igen", inget fel', async () => {
    h.begar.mockResolvedValue({ typ: 'ingen_push' })
    await montera(<VemArDuArk efterUpplasning="/" onStang={() => undefined} />)
    await tryckNamn('p2')
    expect(rader()).toBe('Öppna appen i telefonen → Profil → Kod för maskinen')
    expect(skickaIgen()).toBeNull()
    expect(document.querySelector('[role="alert"]')).toBeNull()
    expect(document.querySelector('[data-kodplatta]')).toBeNull()
  })

  it('kunde inte skicka (täckning) → texten säger det och "Skicka igen" går att trycka direkt', async () => {
    h.begar.mockResolvedValue({ typ: 'fel' })
    await montera(<VemArDuArk efterUpplasning="/" onStang={() => undefined} />)
    await tryckNamn('p2')
    expect(rader()).toContain('Kunde inte skicka notisen')
    expect(skickaIgen()!.disabled).toBe(false)
  })

  it('koden väljs i telefonen medan arket väntar → sifferplattan kommer för den personen, och upplåsningen kräver koden', async () => {
    vi.useFakeTimers({ toFake: [...FAKE.toFake] })
    h.lasUpp.mockResolvedValue({ ok: true })
    await montera(<VemArDuArk efterUpplasning="/arbetsrapport" onStang={() => undefined} />)
    await tryckNamn('p2')
    expect(document.querySelector('[data-kodplatta]')).toBeNull()
    await act(async () => { vi.advanceTimersByTime(KOD_FRAGA_MS + 50) }); await flush()
    expect(h.harKod).toHaveBeenCalledWith('p2')
    expect(document.querySelector('[data-kodplatta]')).toBeNull()      // ännu ingen kod vald
    h.harKod.mockResolvedValue(true)                                    // personen väljer koden i telefonen
    await act(async () => { vi.advanceTimersByTime(KOD_FRAGA_MS + 50) }); await flush()
    expect(document.querySelector('[data-kodplatta]')).not.toBeNull()
    // Plattan har kommit — men ingenting är upplåst: varken las-upp eller omladdning har anropats.
    expect(h.lasUpp).not.toHaveBeenCalled(); expect(assign).not.toHaveBeenCalled()
    await tryck('2', '4', '6', '8')
    expect(h.lasUpp).toHaveBeenCalledWith(expect.objectContaining({ id: 'p2' }), '2468')
    expect(assign).toHaveBeenCalledWith('/arbetsrapport')
  })

  it('koden väljs i telefonen medan arket är STÄNGT → frågandet har slutat och ingenting låses upp', async () => {
    vi.useFakeTimers({ toFake: [...FAKE.toFake] })
    await montera(<VemArDuArk efterUpplasning="/" onStang={() => undefined} />)
    await tryckNamn('p2')
    await act(async () => { vi.advanceTimersByTime(KOD_FRAGA_MS + 50) }); await flush()
    const anrop = h.harKod.mock.calls.length
    expect(anrop).toBeGreaterThan(0)
    await act(async () => { rot!.unmount() }); rot = null          // arket stängs (maskinen går tillbaka till kartan)
    h.harKod.mockResolvedValue(true)
    await act(async () => { vi.advanceTimersByTime(10 * KOD_FRAGA_MS) }); await flush()
    expect(h.harKod.mock.calls.length).toBe(anrop)                  // ingen fråga efter stängningen
    expect(h.lasUpp).not.toHaveBeenCalled(); expect(assign).not.toHaveBeenCalled()
  })

  it('en person MED kod får ingen notis — plattan visas direkt', async () => {
    await montera(<VemArDuArk efterUpplasning="/" onStang={() => undefined} />)
    await tryckNamn('p1')
    expect(h.begar).not.toHaveBeenCalled()
    expect(document.querySelector('[data-kodplatta]')).not.toBeNull()
  })
})

const Barn = () => <div data-barn>kartan</div>
async function leverantor(path: string) { h.pathname = path; await montera(<CurrentMedarbetareProvider><MaskinKontoProvider><Barn /></MaskinKontoProvider></CurrentMedarbetareProvider>) }

describe('maskinkontot', () => {
  it('kartan och planeringen är öppna utan kod', async () => {
    for (const p of ['/planering', '/oversikt', '/objekt', '/uppfoljning', '/maskinvy']) {
      act(() => { rot?.unmount() }); rot = null
      await leverantor(p)
      expect(document.querySelector('[data-barn]'), p).not.toBeNull(); expect(document.querySelector('[data-maskin-skarm]')).toBeNull()
    }
  })
  it('förarens egna saker är låsta: skärmen säger det och "Vem är du?" öppnas av ett tryck', async () => {
    await leverantor('/arbetsrapport')
    expect(document.querySelector('[data-barn]')).toBeNull()
    expect(document.querySelector('[data-maskin-skarm]')?.textContent).toContain('Förarens egna saker')
    await act(async () => { (Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Vem är du?') as HTMLButtonElement).click() })
    await flush()
    expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Vem är du?')
  })
  it('Ekonomi och Personal syns inte någonstans: ingen "Vem är du?", ingen länk att låsa upp dem här', async () => {
    for (const p of ['/ekonomi', '/ekonomi/fakturaunderlag', '/personal', '/admin', '/avtal']) {
      act(() => { rot?.unmount() }); rot = null
      await leverantor(p)
      expect(document.querySelector('[data-barn]'), p).toBeNull()
      expect(document.querySelector('[data-maskin-skarm]')?.textContent).toContain('Finns inte på maskinen')
      expect(Array.from(document.querySelectorAll('button')).some(b => b.textContent === 'Vem är du?')).toBe(false)
    }
  })
  it('brytaren av → "Maskinkontot är avstängt", ingenting annat öppnas', async () => {
    h.lage = { maskin_id: 'R64428', aktiv: false }
    await leverantor('/planering')
    expect(document.querySelector('[data-maskin-skarm]')?.textContent).toContain('Maskinkontot är avstängt')
    expect(document.querySelector('[data-barn]')).toBeNull()
  })
})

describe('en vanlig förare eller admin (telefon/dator) — oförändrat', () => {
  it('ser allt, inga lås, ingen pill, ingen dold sida', async () => {
    for (const roll of ['forare', 'admin']) {
      for (const p of ['/arbetsrapport', '/ekonomi', '/personal', '/planering']) {
        act(() => { rot?.unmount() }); rot = null
        h.medarbetare = { id: 'p', namn: 'Oskar', roll, maskin_id: 'R64428', partner_user_id: null }
        await leverantor(p)
        expect(document.querySelector('[data-barn]'), `${roll} ${p}`).not.toBeNull()
        expect(document.querySelector('[data-las-pill]')).toBeNull(); expect(document.querySelector('[data-maskin-skarm]')).toBeNull()
      }
    }
  })
})

describe('upplåst', () => {
  const lasUpp = (roll: 'forare' | 'admin', aktivitet = Date.now()) => {
    h.medarbetare = { id: 'p1', namn: 'Oskar Nilsson', roll, maskin_id: 'R64428', partner_user_id: null }
    sattUpplast({ id: 'p1', namn: 'Oskar Nilsson', roll, aktivitet })
    sattMaskinSession({ access_token: 'a', refresh_token: 'r', maskin_id: 'R64428' })
  }
  it('pillen "Oskar · Lås" överst, och ett tryck på den låser', async () => {
    lasUpp('forare'); await leverantor('/arbetsrapport')
    const pill = document.querySelector('[data-las-pill]') as HTMLButtonElement
    expect(pill.textContent).toBe('Oskar·lockLås')
    expect(document.querySelector('[data-barn]')).not.toBeNull()   // personen ser sina egna saker
    await act(async () => { pill.click() }); await flush()
    expect(h.lasMaskinen).toHaveBeenCalledOnce()
  })
  it('en förare som låst upp ser aldrig Ekonomi eller Personal — admin gör det', async () => {
    for (const p of ['/ekonomi', '/personal', '/avtal']) {
      act(() => { rot?.unmount() }); rot = null
      lasUpp('forare'); await leverantor(p)
      expect(document.querySelector('[data-barn]'), `förare ${p}`).toBeNull()
      expect(document.querySelector('[data-maskin-skarm]')?.textContent).toContain('Finns inte på maskinen')
    }
    for (const p of ['/ekonomi', '/personal']) {
      act(() => { rot?.unmount() }); rot = null
      lasUpp('admin'); await leverantor(p)
      expect(document.querySelector('[data-barn]'), `admin ${p}`).not.toBeNull()
    }
  })
  it('låser sig när man går tillbaka till kartan', async () => {
    lasUpp('forare'); await leverantor('/planering')
    expect(h.lasMaskinen).toHaveBeenCalledOnce()
  })
  it('låser sig efter 10 minuter utan tryck — också när fönstret legat öppet — men inte före; ett tryck förlänger', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    lasUpp('forare', Date.now()); await leverantor('/arbetsrapport')
    await act(async () => { vi.advanceTimersByTime(IDLE_MS - 30_000) })
    expect(h.lasMaskinen).not.toHaveBeenCalled()
    await act(async () => { document.dispatchEvent(new Event('pointerdown')) })              // ett tryck
    await act(async () => { vi.advanceTimersByTime(IDLE_MS - 30_000) })
    expect(h.lasMaskinen).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(40_000) })                                 // nu har 10 min gått sedan sista trycket
    expect(h.lasMaskinen).toHaveBeenCalledOnce()
  })
  it('en upplåsning som redan gått ut (fönstret öppnades efter lång tid) låser direkt', async () => {
    lasUpp('forare', Date.now() - IDLE_MS - 1000); await leverantor('/arbetsrapport')
    expect(h.lasMaskinen).toHaveBeenCalledOnce()
  })
})
