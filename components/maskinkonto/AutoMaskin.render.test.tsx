// @vitest-environment jsdom
/**
 * Maskinen blir maskin av sig själv (jsdom, riktiga MaskinKontoProvider): en förare/admin vid en RIKTIG maskindator (Web Serial-GPS + vald maskin)
 * ber servern om maskinens konto utan något tryck. Testläget, telefonen, surfplattan, hemdatorn utan maskinens GPS, en dator utan vald maskin,
 * "Logga ut maskinen"-pausen och maskinkontot självt berörs aldrig — och går bytet fel är personen kvar som förut.
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  pathname: '/',
  medarbetare: { id: 'p1', namn: 'Oskar Nilsson', roll: 'forare', maskin_id: 'R64428', partner_user_id: null } as any,
  blir: vi.fn(),
  kartan: vi.fn(),
  webSerial: true,
  flagga: true,
  portar: 0,
}))

vi.mock('next/navigation', () => ({ usePathname: () => h.pathname, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: any) => <a href={href} {...r}>{children}</a> }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'x@x' } } }), getSession: async () => ({ data: { session: null } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.medarbetare }) }) }) }),
    rpc: async () => ({ data: { maskin_id: 'R64428', aktiv: true }, error: null }),
  },
}))
vi.mock('@/lib/gpsSerialFlagga', () => ({
  harWebSerial: () => h.webSerial,
  serialGpsVald: () => h.flagga,
  antalBeviljadeSerialPortar: async () => h.portar,
}))
vi.mock('@/lib/maskinkonto/klient', async () => {
  const orig = await vi.importActual<typeof import('@/lib/maskinkonto/klient')>('@/lib/maskinkonto/klient')
  return { ...orig, blirMaskinAutomatiskt: (...a: any[]) => h.blir(...a), gaTillKartan: () => h.kartan() }
})

import MaskinKontoProvider from './MaskinKontoProvider'
import { CurrentMedarbetareProvider } from '@/lib/CurrentMedarbetareContext'
import { sattAutoPaus, AUTO_PAUS_MS } from '@/lib/maskinkonto/autoStart'
import { ENHET_MASKIN_KEY, sattEnhetMaskin } from '@/lib/enhetMaskin'

let rot: ReturnType<typeof createRoot> | null = null
let el: HTMLDivElement | null = null
const flush = async () => { for (let i = 0; i < 12; i++) await act(async () => { await Promise.resolve() }) }
async function montera() {
  rot = createRoot(el!)
  await act(async () => { rot!.render(<CurrentMedarbetareProvider><MaskinKontoProvider><div data-barn>sidan</div></MaskinKontoProvider></CurrentMedarbetareProvider>) })
  await flush()
}

beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  h.pathname = '/'; h.webSerial = true; h.flagga = true; h.portar = 0
  h.medarbetare = { id: 'p1', namn: 'Oskar Nilsson', roll: 'forare', maskin_id: 'R64428', partner_user_id: null }
  h.blir.mockReset(); h.blir.mockResolvedValue('ok'); h.kartan.mockReset()
  localStorage.clear(); sessionStorage.clear()
  localStorage.setItem(ENHET_MASKIN_KEY, 'R64428')
  el = document.createElement('div'); document.body.appendChild(el)
})
afterEach(() => { act(() => { rot?.unmount() }); el?.remove(); rot = null; el = null })

describe('riktig maskindator + förare inloggad', () => {
  it('byter till maskinen utan något tryck: servern frågas för just enhetens maskin, och sidan laddas om till kartan', async () => {
    await montera()
    expect(h.blir).toHaveBeenCalledTimes(1); expect(h.blir).toHaveBeenCalledWith('R64428')
    expect(h.kartan).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-barn]')).not.toBeNull()          // inget mellansteg, ingen fråga, inget lösenordsfält
    expect(document.body.textContent).not.toMatch(/lösenord|Vem är du|Logga in/i)
  })
  it('en admin byts också', async () => {
    h.medarbetare = { ...h.medarbetare, roll: 'admin' }
    await montera(); expect(h.blir).toHaveBeenCalledTimes(1); expect(h.kartan).toHaveBeenCalledTimes(1)
  })
  it('maskinens GPS räknas som ansluten även när bara en beviljad port finns (ingen flagga)', async () => {
    h.flagga = false; h.portar = 1
    await montera(); expect(h.blir).toHaveBeenCalledTimes(1)
  })
  it('bara ETT försök per sidladdning, också när sidan byter väg', async () => {
    await montera()
    h.pathname = '/planering'
    await act(async () => { rot!.render(<CurrentMedarbetareProvider><MaskinKontoProvider><div data-barn>sidan</div></MaskinKontoProvider></CurrentMedarbetareProvider>) }); await flush()
    expect(h.blir).toHaveBeenCalledTimes(1)
  })
  it('en dator som får sin maskin vald NU (frågan "Vilken maskin är det här?") byter direkt', async () => {
    localStorage.removeItem(ENHET_MASKIN_KEY)
    await montera(); expect(h.blir).not.toHaveBeenCalled()
    await act(async () => { sattEnhetMaskin('R64428') }); await flush()
    expect(h.blir).toHaveBeenCalledWith('R64428'); expect(h.kartan).toHaveBeenCalledTimes(1)
  })
})

describe('allt annat berörs aldrig', () => {
  it('brytaren av: servern säger nej → ingenting ändras, ingen omladdning', async () => {
    h.blir.mockResolvedValue('av')
    await montera(); expect(h.blir).toHaveBeenCalledTimes(1); expect(h.kartan).not.toHaveBeenCalled()
    expect(document.querySelector('[data-barn]')).not.toBeNull()
  })
  it('bytet går fel (nät, token): personen är kvar som förut, ingen omladdning, ingen slinga', async () => {
    h.blir.mockResolvedValue('fel')
    await montera(); expect(h.blir).toHaveBeenCalledTimes(1); expect(h.kartan).not.toHaveBeenCalled()
    h.pathname = '/planering'
    await act(async () => { rot!.render(<CurrentMedarbetareProvider><MaskinKontoProvider><div data-barn>sidan</div></MaskinKontoProvider></CurrentMedarbetareProvider>) }); await flush()
    expect(h.blir).toHaveBeenCalledTimes(1)
  })
  it('testläget (/maskin?som=…): aldrig, hur enheten än är konfigurerad', async () => {
    h.pathname = '/maskin'; await montera(); expect(h.blir).not.toHaveBeenCalled()
  })
  it('telefon och surfplatta (ingen Web Serial): aldrig — även om enheten råkar ha en vald maskin', async () => {
    h.webSerial = false; await montera(); expect(h.blir).not.toHaveBeenCalled()
  })
  it('hemdator med Web Serial men utan maskinens GPS: aldrig', async () => {
    h.flagga = false; h.portar = 0; await montera(); expect(h.blir).not.toHaveBeenCalled()
  })
  it('en dator utan vald maskin: aldrig', async () => {
    localStorage.removeItem(ENHET_MASKIN_KEY); await montera(); expect(h.blir).not.toHaveBeenCalled()
  })
  it('maskinkontot självt: aldrig (det är redan maskinen)', async () => {
    h.medarbetare = { ...h.medarbetare, roll: 'maskin' }
    await montera(); expect(h.blir).not.toHaveBeenCalled()
  })
  it('pausen efter "Logga ut maskinen": en person kan logga in som sig själv; efter pausen gäller bytet igen', async () => {
    sattAutoPaus(Date.now() + AUTO_PAUS_MS)
    await montera(); expect(h.blir).not.toHaveBeenCalled()
    act(() => { rot!.unmount() }); rot = null
    sattAutoPaus(Date.now() - 1)
    await montera(); expect(h.blir).toHaveBeenCalledTimes(1)
  })
  it('en upplåst person på maskinen (kod inskriven) byts inte ut: läget är upplåst, inte en vanlig förare', async () => {
    const { sattUpplast, sattMaskinSession } = await import('@/lib/maskinkonto/upplast')
    sattUpplast({ id: 'p1', namn: 'Oskar Nilsson', roll: 'forare', aktivitet: Date.now() })
    sattMaskinSession({ access_token: 'a', refresh_token: 'b', maskin_id: 'R64428' })
    await montera(); expect(h.blir).not.toHaveBeenCalled()
  })
})
