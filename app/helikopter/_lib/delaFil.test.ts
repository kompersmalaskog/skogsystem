// @vitest-environment jsdom
/**
 * Hur en fil lämnar appen: `delaFil` (Web Share med fil, annars nedladdning),
 * `laddaNerFil` (EN implementation av <a download> — både Spara-knappen och
 * delningens reserv går hit) och `kanSparaFil` (visar vi "Spara"?).
 *
 * Varför kanSparaFil finns: `<a download>` ger ingen fil i iOS installerad PWA.
 * En knapp som inte gör något är värre än ingen knapp.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { delaFil, kanSparaFil, laddaNerFil } from './veckolageDela'

type FalskNav = Navigator & { standalone?: boolean }
const nav = (d: Partial<FalskNav>): Navigator =>
  ({ userAgent: '', platform: '', maxTouchPoints: 0, ...d }) as unknown as Navigator
const win = (standalone: boolean): Window =>
  ({ matchMedia: () => ({ matches: standalone }) }) as unknown as Window

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0'
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/131.0.0.0'

describe('kanSparaFil', () => {
  it('dator och vanlig webbläsare i telefonen: ja', () => {
    expect(kanSparaFil(nav({ userAgent: WINDOWS }), win(false))).toBe(true)
    expect(kanSparaFil(nav({ userAgent: MAC }), win(false))).toBe(true)
    expect(kanSparaFil(nav({ userAgent: IPHONE }), win(false))).toBe(true) // Safari, inte PWA
    expect(kanSparaFil(nav({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' }), win(true))).toBe(true)
  })

  it('iOS i installerad PWA: nej — nedladdningen ger ingen fil där', () => {
    expect(kanSparaFil(nav({ userAgent: IPHONE, standalone: true }), win(false))).toBe(false)
    expect(kanSparaFil(nav({ userAgent: IPHONE }), win(true))).toBe(false)
    // iPad i skrivbordsläge (säger sig vara Mac men har touch).
    expect(kanSparaFil(nav({ userAgent: MAC, platform: 'MacIntel', maxTouchPoints: 5, standalone: true }), win(false))).toBe(false)
    // Riktig Mac med samma UA är fortfarande en dator.
    expect(kanSparaFil(nav({ userAgent: MAC, platform: 'MacIntel', maxTouchPoints: 0, standalone: true }), win(false))).toBe(true)
  })

  it('en webbläsare som kastar räknas som att det inte går', () => {
    const trasig = { get userAgent(): string { throw new Error('nej') } } as unknown as Navigator
    expect(kanSparaFil(trasig, win(false))).toBe(false)
  })
})

describe('laddaNerFil och delaFil', () => {
  let klickad: HTMLAnchorElement | null = null
  const url = 'blob:test'
  beforeEach(() => {
    klickad = null
    // jsdom har ingen blob-URL-fabrik — lägg in den och spionera på den.
    Object.assign(URL, { createObjectURL: () => url, revokeObjectURL: () => {} })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue(url)
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { klickad = this })
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('laddaNerFil klickar en <a download> med filnamnet och städar blob-URL:en', () => {
    vi.useFakeTimers()
    laddaNerFil(new Blob(['x'], { type: 'application/pdf' }), 'skotningsrapport-11280797.pdf')
    expect(klickad!.download).toBe('skotningsrapport-11280797.pdf')
    expect(klickad!.href).toBe(url)
    expect(klickad!.isConnected).toBe(false) // taget bort ur sidan igen
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(10_000)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url)
    vi.useRealTimers()
  })

  it('delaFil delar filen när webbläsaren kan — annars sparar den den (samma väg som Spara)', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const n = navigator as Navigator & { share?: unknown; canShare?: unknown }
    Object.assign(n, { share, canShare: () => true })
    const blob = new Blob(['x'], { type: 'application/pdf' })
    expect(await delaFil(blob, 'a.pdf', 'A')).toBe('delad')
    expect(share).toHaveBeenCalledTimes(1)
    expect(klickad).toBeNull()

    Object.assign(n, { share: undefined, canShare: undefined })
    expect(await delaFil(blob, 'b.pdf', 'B')).toBe('nedladdad')
    expect(klickad!.download).toBe('b.pdf')
  })

  it('avbryter man delningen sparas ingen fil', async () => {
    const n = navigator as Navigator & { share?: unknown; canShare?: unknown }
    Object.assign(n, { share: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' })), canShare: () => true })
    expect(await delaFil(new Blob(['x']), 'a.pdf', 'A')).toBe('avbruten')
    expect(klickad).toBeNull()
  })
})
