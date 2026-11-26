// @vitest-environment jsdom
/**
 * Tillbaka dit maskinen var (Martin i H8 2026-11-22): efter Arbetsrapport (upplåst med kod) och tillbaka till kartan blev appen helskärm i stället
 * för halv karta + maskinlådan. Här körs RIKTIGA klienten (lasUppMedKod, lasMaskinen) och riktiga providern mot en supabase-fake som håller
 * sessionen — så testet visar både VAR låsningen landar och att personens session inte finns kvar efteråt. Omladdningar efterliknas med ny montering.
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  pathname: '/planering',
  medarbetare: null as any,
  /** Sessionen som webbläsaren har just nu. */
  sess: { access_token: 'MASKIN-AT', refresh_token: 'MASKIN-RT' } as { access_token: string; refresh_token: string } | null,
  setSessionFel: false,
  verifyOtp: vi.fn(),
  setSession: vi.fn(),
  signOut: vi.fn(),
  fetch: vi.fn(),
  assign: vi.fn(),
}))

vi.mock('next/navigation', () => ({ usePathname: () => h.pathname, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: any) => <a href={href} {...r}>{children}</a> }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { id: 'u1', email: 'x@x' } } }),
      getSession: async () => ({ data: { session: h.sess } }),
      verifyOtp: (...a: any[]) => h.verifyOtp(...a),
      setSession: (...a: any[]) => h.setSession(...a),
      signOut: (...a: any[]) => h.signOut(...a),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.medarbetare }) }) }) }),
    rpc: async (n: string) => (n === 'maskin_konto_lage' ? { data: { maskin_id: 'R64428', aktiv: true }, error: null } : { data: null, error: null }),
  },
}))

import MaskinKontoProvider, { useMaskinKonto } from './MaskinKontoProvider'
import { CurrentMedarbetareProvider } from '@/lib/CurrentMedarbetareContext'
import { sattEnhetMaskin } from '@/lib/enhetMaskin'
import { IDLE_MS, lasMaskinSession, lasUpplast } from '@/lib/maskinkonto/upplast'
import { ATERVAND_MAX_MS, ATERVAND_NYCKEL, PLANERING_LAGE_NYCKEL, sattPlaneringLage } from '@/lib/maskinkonto/aterstall'

let rot: ReturnType<typeof createRoot> | null = null
let el: HTMLDivElement | null = null
const flush = async () => { for (let i = 0; i < 12; i++) await act(async () => { await Promise.resolve() }) }
const PERSON = { id: 'p1', namn: 'Oskar Nilsson', roll: 'forare', maskin_id: 'R64428', partner_user_id: null }
const MASKIN = { id: 'm1', namn: 'H8', roll: 'maskin', maskin_id: 'R64428', partner_user_id: null }

/** En låst rad (som i maskinlådan) — ett tryck öppnar "Vem är du?" mot Arbetsrapport. */
function LastRad() { const mk = useMaskinKonto(); return <button data-last-rad onClick={() => mk.oppnaVemArDu('/arbetsrapport')}>Arbetsrapport</button> }

async function leverantor(path: string, medarbetare: any) {
  h.pathname = path; h.medarbetare = medarbetare
  await act(async () => { rot?.unmount() }); rot = null
  el!.innerHTML = ''
  rot = createRoot(el!)
  await act(async () => { rot!.render(<CurrentMedarbetareProvider><MaskinKontoProvider><LastRad /></MaskinKontoProvider></CurrentMedarbetareProvider>) })
  await flush()
}

/** Hela vägen in: trycka på den låsta raden, välja namn, skriva koden — riktiga lasUppMedKod. Slutar med att sidan "laddas om" som personen. */
async function laasUppSom(href = '/arbetsrapport') {
  await act(async () => { (document.querySelector('[data-last-rad]') as HTMLButtonElement).click() }); await flush()
  await act(async () => { (document.querySelector('[data-person="p1"]') as HTMLButtonElement).click() }); await flush()
  for (const s of ['4', '7', '1', '1']) await act(async () => { (document.querySelector(`[data-tangent="${s}"]`) as HTMLButtonElement).click() })
  await flush()
  expect(h.assign).toHaveBeenCalledWith(href)
}

beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear(); sessionStorage.clear()
  sattEnhetMaskin('R64428')
  h.sess = { access_token: 'MASKIN-AT', refresh_token: 'MASKIN-RT' }
  h.setSessionFel = false
  h.verifyOtp.mockReset(); h.verifyOtp.mockImplementation(async () => { h.sess = { access_token: 'PERSON-AT', refresh_token: 'PERSON-RT' }; return { error: null } })
  h.setSession.mockReset(); h.setSession.mockImplementation(async (s: any) => { if (h.setSessionFel) return { error: new Error('nej') }; h.sess = s; return { error: null } })
  h.signOut.mockReset(); h.signOut.mockImplementation(async () => { h.sess = null; return { error: null } })
  h.assign.mockReset()
  h.fetch.mockReset()
  h.fetch.mockImplementation(async (url: string) => {
    if (url === '/api/maskin/vem') return { ok: true, json: async () => ({ personer: [{ id: 'p1', namn: 'Oskar Nilsson', roll: 'forare', harKod: true }] }) }
    if (url === '/api/maskin/las-upp') return { ok: true, json: async () => ({ ok: true, token_hash: 'TH', namn: 'Oskar Nilsson', roll: 'forare' }) }
    return { ok: true, json: async () => ({}) }
  })
  ;(globalThis as any).fetch = h.fetch
  Object.defineProperty(window, 'location', { value: { assign: h.assign, href: 'http://localhost/planering', search: '' }, writable: true })
  el = document.createElement('div'); document.body.appendChild(el)
})
afterEach(() => { vi.useRealTimers(); act(() => { rot?.unmount() }); el?.remove(); rot = null; el = null })

/** Allt personen ska ha lämnat efter sig efter en låsning. */
function personensSessionArBorta() {
  expect(h.sess?.access_token).not.toBe('PERSON-AT')
  expect(lasUpplast()).toBeNull()
  expect(lasMaskinSession()).toBeNull()
}

describe('hem (halv karta + maskinlådan) → Arbetsrapport → kod → tillbaka till kartan → lådan igen', () => {
  async function tillArbetsrapportUpplast(menyOppen: boolean | null) {
    if (menyOppen !== null) sattPlaneringLage(menyOppen)                // planeringsvyn säger hur maskinen ser ut
    await leverantor('/planering', MASKIN)
    await laasUppSom()
    // Sidan laddas om som personen, på Arbetsrapport (planeringsvyn har lämnats: dess eget läge rensas av pagehide).
    sattPlaneringLage(null)
    await leverantor('/arbetsrapport', PERSON)
    expect(document.querySelector('[data-las-pill]')).not.toBeNull()
  }

  it('kartan (planeringen öppnas medan upplåst) låser och går till kartan MED maskinlådan', async () => {
    await tillArbetsrapportUpplast(true)
    h.assign.mockClear()
    await leverantor('/planering', PERSON)
    expect(h.assign).toHaveBeenCalledWith('/planering?maskinmeny=1')
    personensSessionArBorta()
  })
  it('Lås-knappen: samma sak', async () => {
    await tillArbetsrapportUpplast(true)
    h.assign.mockClear()
    await act(async () => { (document.querySelector('[data-las-pill]') as HTMLButtonElement).click() }); await flush()
    expect(h.assign).toHaveBeenCalledOnce(); expect(h.assign).toHaveBeenCalledWith('/planering?maskinmeny=1')
    personensSessionArBorta()
  })
  it('10 minuter utan tryck: samma sak', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    await tillArbetsrapportUpplast(true)
    h.assign.mockClear()
    await act(async () => { vi.advanceTimersByTime(IDLE_MS + 15_000) }); await flush()
    expect(h.assign).toHaveBeenCalledOnce(); expect(h.assign).toHaveBeenCalledWith('/planering?maskinmeny=1')
    personensSessionArBorta()
  })
  it('Chrome stängdes och öppnades efter 10 minuter: låsningen vid appstart går också tillbaka till lådan', async () => {
    await tillArbetsrapportUpplast(true)
    const { skaLasasVidStart } = await import('@/lib/maskinkonto/upplast')
    expect(skaLasasVidStart(Date.now() + IDLE_MS + 1000)).toBe(true)
    const { lasMaskinen } = await import('@/lib/maskinkonto/klient')
    h.assign.mockClear()
    await act(async () => { await lasMaskinen() })
    expect(h.assign).toHaveBeenCalledWith('/planering?maskinmeny=1')
    personensSessionArBorta()
  })
})

describe('körvyn → låst rad → kod → låsning → körvyn', () => {
  it('var maskinlådan inte öppen innan upplåsningen går låsningen till kartan utan lådan (körvyn där man var)', async () => {
    sattPlaneringLage(false)
    await leverantor('/planering', MASKIN)
    await laasUppSom()
    sattPlaneringLage(null)
    await leverantor('/arbetsrapport', PERSON)
    h.assign.mockClear()
    await act(async () => { (document.querySelector('[data-las-pill]') as HTMLButtonElement).click() }); await flush()
    expect(h.assign).toHaveBeenCalledWith('/planering')
    personensSessionArBorta()
  })
  it('utan något minne av planeringsvyn (direkt på en låst adress) → kartan som förut', async () => {
    await leverantor('/arbetsrapport', MASKIN)
    await act(async () => { (Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Vem är du?') as HTMLButtonElement).click() }); await flush()
    await act(async () => { (document.querySelector('[data-person="p1"]') as HTMLButtonElement).click() }); await flush()
    for (const s of ['4', '7', '1', '1']) await act(async () => { (document.querySelector(`[data-tangent="${s}"]`) as HTMLButtonElement).click() })
    await flush()
    await leverantor('/arbetsrapport', PERSON)
    h.assign.mockClear()
    await act(async () => { (document.querySelector('[data-las-pill]') as HTMLButtonElement).click() }); await flush()
    expect(h.assign).toHaveBeenCalledWith('/planering')
  })
  it('ett gammalt minne (äldre än 12 timmar) gäller inte', async () => {
    localStorage.setItem(PLANERING_LAGE_NYCKEL, JSON.stringify({ menyOppen: true, tid: Date.now() - ATERVAND_MAX_MS - 60_000 }))
    await leverantor('/planering', MASKIN)
    await laasUppSom()
    await leverantor('/arbetsrapport', PERSON)
    h.assign.mockClear()
    await act(async () => { (document.querySelector('[data-las-pill]') as HTMLButtonElement).click() }); await flush()
    expect(h.assign).toHaveBeenCalledWith('/planering')
  })
  it('minnet gäller EN låsning: nästa upplåsning börjar om', async () => {
    sattPlaneringLage(true)
    await leverantor('/planering', MASKIN); await laasUppSom()
    sattPlaneringLage(null)
    await leverantor('/arbetsrapport', PERSON)
    await act(async () => { (document.querySelector('[data-las-pill]') as HTMLButtonElement).click() }); await flush()
    expect(localStorage.getItem(ATERVAND_NYCKEL)).toBeNull()
  })
})

describe('upplåsningen — man kommer till det man tryckte på, inget annat', () => {
  it('rätt kod öppnar exakt den låsta raden, och minnet av lådan ändrar inte adressen', async () => {
    sattPlaneringLage(true)
    await leverantor('/planering', MASKIN)
    h.assign.mockClear()
    await laasUppSom('/arbetsrapport')
    expect(h.assign).toHaveBeenCalledOnce()
  })
})

describe('låsningens säkerhet är oförändrad', () => {
  it('maskinkontots session sätts tillbaka, personens spärras på servern och inget personligt ligger kvar', async () => {
    sattPlaneringLage(true)
    await leverantor('/planering', MASKIN); await laasUppSom()
    sattPlaneringLage(null)
    await leverantor('/arbetsrapport', PERSON)
    expect(h.sess?.access_token).toBe('PERSON-AT')
    await act(async () => { (document.querySelector('[data-las-pill]') as HTMLButtonElement).click() }); await flush()
    const las = h.fetch.mock.calls.find(c => c[0] === '/api/maskin/las')
    expect(las?.[1]?.headers?.Authorization).toBe('Bearer PERSON-AT')       // personens token spärras
    expect(h.setSession).toHaveBeenCalledWith({ access_token: 'MASKIN-AT', refresh_token: 'MASKIN-RT' })
    expect(h.sess?.access_token).toBe('MASKIN-AT')
    personensSessionArBorta()
  })
  it('går maskinkontot inte att få tillbaka loggas personen ut lokalt, lagringen rensas och det blir inloggningen — aldrig lådan', async () => {
    sattPlaneringLage(true)
    await leverantor('/planering', MASKIN); await laasUppSom()
    sattPlaneringLage(null)
    await leverantor('/arbetsrapport', PERSON)
    h.setSessionFel = true
    localStorage.setItem('sb-abc-auth-token', 'personens-session')
    h.assign.mockClear()
    await act(async () => { (document.querySelector('[data-las-pill]') as HTMLButtonElement).click() }); await flush()
    expect(h.signOut).toHaveBeenCalled()
    expect(localStorage.getItem('sb-abc-auth-token')).toBeNull()
    expect(h.assign).toHaveBeenCalledWith('/login')
    expect(h.assign).not.toHaveBeenCalledWith(expect.stringContaining('/planering'))
    expect(h.sess).toBeNull()
    expect(localStorage.getItem(ATERVAND_NYCKEL)).toBeNull()
  })
})
