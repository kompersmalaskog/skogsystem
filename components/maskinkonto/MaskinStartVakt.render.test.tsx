// @vitest-environment jsdom
/**
 * KRITISKT (granskningen 2026-11-20): vid appstart med ett UTGÅNGET upplåst läge (datorn/Chrome stängd i mer än 10 minuter) ska maskinen låsas INNAN något
 * personligt renderas eller hämtas. Provet monterar hela AppRamverk med en fake-Supabase som loggar varje anrop i ordning, och kräver att
 * (1) inget barn och ingen starter monteras, (2) inget som läser data (from/rpc/getUser) anropas överhuvudtaget, (3) maskinkontots session sätts tillbaka
 * (eller personen loggas ut lokalt) — och att allt är orört när upplåsningen INTE har gått ut eller inte finns.
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({ pathname: '/arbetsrapport', anrop: [] as string[], monterat: [] as string[], setSessionFel: false }))
vi.mock('next/navigation', () => ({ usePathname: () => h.pathname, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ href, children }: any) => <a href={href}>{children}</a> }))
vi.mock('@/lib/supabase', () => {
  const logga = (n: string) => { h.anrop.push(n) }
  return { supabase: {
    auth: {
      getSession: async () => { logga('getSession'); return { data: { session: { access_token: 'person-jwt', refresh_token: 'r' } } } },
      getUser: async () => { logga('getUser'); return { data: { user: { id: 'u' } } } },
      setSession: async () => { logga('setSession'); return { error: h.setSessionFel ? new Error('död') : null } },
      signOut: async () => { logga('signOut'); return { error: null } },
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
    from: () => { logga('from'); return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }), single: async () => ({ data: null }) }) }) } },
    rpc: async () => { logga('rpc'); return { data: null } },
  } }
})
for (const n of ['TopBar', 'PushRegister', 'PushNavigering', 'FotoKoStartare', 'MarkeringSynkStartare', 'KartkommentarStartare', 'SkotarLassStartare', 'NodStartare', 'FartLoggStartare', 'VersionChecker', 'AppStartVakt']) {
  vi.doMock(`./../${n}`, () => ({ default: () => { h.monterat.push(n); return null } }))
}
vi.mock('@/lib/CurrentMedarbetareContext', async () => {
  const orig = await vi.importActual<any>('@/lib/CurrentMedarbetareContext')
  return { ...orig, CurrentMedarbetareProvider: ({ children }: any) => { h.monterat.push('CurrentMedarbetareProvider'); return <>{children}</> }, useCurrentMedarbetare: () => ({ medarbetare: null, loading: true }) }
})

import AppRamverk from '@/components/AppRamverk'
import { IDLE_MS, sattMaskinSession, sattUpplast } from '@/lib/maskinkonto/upplast'

let rot: ReturnType<typeof createRoot> | null = null
let el: HTMLDivElement | null = null
const assign = vi.fn()
const flush = async () => { for (let i = 0; i < 12; i++) await act(async () => { await Promise.resolve() }) }
const Barn = () => { h.monterat.push('barn'); return <div data-barn>personlig sida</div> }
async function montera() { rot = createRoot(el!); await act(async () => { rot!.render(<AppRamverk><Barn /></AppRamverk>) }); await flush() }

beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  h.pathname = '/arbetsrapport'; h.anrop = []; h.monterat = []; h.setSessionFel = false
  localStorage.clear(); assign.mockReset(); Object.defineProperty(window, 'location', { value: { assign }, writable: true })
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
  el = document.createElement('div'); document.body.appendChild(el)
})
afterEach(() => { act(() => { rot?.unmount() }); el?.remove(); rot = null; el = null; vi.unstubAllGlobals() })

describe('appstart med utgången upplåsning', () => {
  it('låser FÖRE allt: inget barn, ingen starter, ingen datahämtning — bara maskinkontots session tillbaka', async () => {
    sattUpplast({ id: 'p1', namn: 'Oskar', roll: 'forare', aktivitet: Date.now() - IDLE_MS - 60_000 })   // Chrome varit stängd i 11 minuter
    sattMaskinSession({ access_token: 'maskin-jwt', refresh_token: 'maskin-ref', maskin_id: 'R64428' })
    await montera()
    expect(document.querySelector('[data-maskin-startvakt]')).not.toBeNull()
    expect(document.querySelector('[data-barn]')).toBeNull()
    expect(h.monterat).toEqual([])                                   // inga barn, inga starters, ingen medarbetarlookup
    expect(h.anrop.filter(a => ['from', 'rpc', 'getUser'].includes(a))).toEqual([])
    expect(h.anrop).toEqual(['getSession', 'setSession'])             // bara spärren av personens session och maskinkontots tillbaka
    expect(assign).toHaveBeenCalledWith('/planering')
  })
  it('går maskinkontot inte att få tillbaka: personen loggas ut lokalt innan inloggningssidan — fortfarande inget personligt hämtat', async () => {
    sattUpplast({ id: 'p1', namn: 'Oskar', roll: 'forare', aktivitet: Date.now() - IDLE_MS - 1000 })
    sattMaskinSession({ access_token: 'maskin-jwt', refresh_token: 'död', maskin_id: 'R64428' }); h.setSessionFel = true
    await montera()
    expect(h.monterat).toEqual([]); expect(h.anrop.filter(a => ['from', 'rpc', 'getUser'].includes(a))).toEqual([])
    expect(h.anrop).toContain('signOut'); expect(assign).toHaveBeenCalledWith('/login')
  })
  it('personen upplåst men maskinkontots sparade session saknas: utloggad direkt, inget personligt', async () => {
    sattUpplast({ id: 'p1', namn: 'Oskar', roll: 'forare', aktivitet: Date.now() })
    await montera()
    expect(h.monterat).toEqual([]); expect(h.anrop).toContain('signOut'); expect(assign).toHaveBeenCalledWith('/login')
  })
  it('kvarlämnad maskinsession utan upplåsning (avbrutet byte): låses också innan något renderas', async () => {
    sattMaskinSession({ access_token: 'maskin-jwt', refresh_token: 'r', maskin_id: 'R64428' })
    await montera()
    expect(h.monterat).toEqual([]); expect(assign).toHaveBeenCalled()
  })
})

describe('allt annat är orört', () => {
  it('en upplåsning som INTE gått ut släpper igenom appen (provider tar över)', async () => {
    sattUpplast({ id: 'p1', namn: 'Oskar', roll: 'forare', aktivitet: Date.now() - 1000 })
    sattMaskinSession({ access_token: 'maskin-jwt', refresh_token: 'r', maskin_id: 'R64428' })
    await montera()
    expect(document.querySelector('[data-barn]')).not.toBeNull(); expect(document.querySelector('[data-maskin-startvakt]')).toBeNull()
    expect(assign).not.toHaveBeenCalled(); expect(h.anrop.filter(a => a === 'setSession' || a === 'signOut')).toEqual([])
  })
  it('en vanlig enhet (telefon, dator, maskinkonto utan upplåsning) berörs inte alls', async () => {
    await montera()
    expect(document.querySelector('[data-barn]')).not.toBeNull(); expect(assign).not.toHaveBeenCalled(); expect(h.anrop).not.toContain('setSession')
  })
})
