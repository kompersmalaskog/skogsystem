// @vitest-environment jsdom
/**
 * Låsningen och upplåsningen i webbläsaren. KRITISKT (granskningen 2026-11-20): personens session får aldrig ligga kvar i webbläsaren — oavsett om
 * maskinkontots sparade session finns, om setSession misslyckas eller om signOut själv faller. Och upplåsningen skrivs FÖRE sessionsbytet.
 * Supabase-klienten är en fake med en enda sanning om vems session som gäller (`nu`) och med riktiga sb-nycklar i localStorage och cookies.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  nu: 'person' as 'person' | 'maskin' | null,
  uppsattning: { setSession: 'ok' as 'ok' | 'fel' | 'kast', signOut: 'ok' as 'ok' | 'kast', verifyOtp: 'ok' as 'ok' | 'fel' },
  anrop: [] as string[],
  vidVerify: null as null | (() => void),
}))

vi.mock('@/lib/supabase', () => {
  const skrivLagring = (vem: string | null) => {
    Object.keys(localStorage).filter(k => k.startsWith('sb-')).forEach(k => localStorage.removeItem(k))
    document.cookie = 'sb-proj-auth-token=; Max-Age=0; path=/'
    if (vem) { localStorage.setItem('sb-proj-auth-token', JSON.stringify({ access_token: `${vem}-jwt`, user: vem })); document.cookie = `sb-proj-auth-token=${vem}; path=/` }
  }
  return {
    supabase: { auth: {
      getSession: async () => { h.anrop.push('getSession'); return { data: { session: h.nu ? { access_token: `${h.nu}-jwt`, refresh_token: `${h.nu}-ref` } : null } } },
      setSession: async (s: any) => {
        h.anrop.push(`setSession:${s.access_token}`)
        if (h.uppsattning.setSession === 'kast') throw new Error('nät')
        if (h.uppsattning.setSession === 'fel') return { error: new Error('refresh token ogiltig') }
        h.nu = 'maskin'; skrivLagring('maskin'); return { error: null }
      },
      signOut: async (o: any) => {
        h.anrop.push(`signOut:${JSON.stringify(o)}`)
        if (h.uppsattning.signOut === 'kast') throw new Error('signOut föll')
        h.nu = null; skrivLagring(null); return { error: null }
      },
      verifyOtp: async () => {
        h.anrop.push('verifyOtp'); h.vidVerify?.()
        if (h.uppsattning.verifyOtp === 'fel') return { error: new Error('token ogiltig') }
        h.nu = 'person'; skrivLagring('person'); return { error: null }
      },
    } },
    __skriv: skrivLagring,
  }
})
vi.mock('@/lib/enhetMaskin', () => ({ hamtaEnhetMaskin: () => 'R64428' }))

import { lasMaskinen, loggaUtMaskinen, lasUppMedKod } from './klient'
import { lasMaskinSession, lasUpplast, sattMaskinSession, sattUpplast } from './upplast'

const assign = vi.fn()
const personSessionKvar = () => h.nu === 'person' || Object.keys(localStorage).some(k => k.startsWith('sb-') && localStorage.getItem(k)!.includes('person')) || document.cookie.includes('person')

beforeEach(async () => {
  h.nu = 'person'; h.anrop = []; h.vidVerify = null
  h.uppsattning = { setSession: 'ok', signOut: 'ok', verifyOtp: 'ok' }
  localStorage.clear(); document.cookie = 'sb-proj-auth-token=person; path=/'; localStorage.setItem('sb-proj-auth-token', JSON.stringify({ access_token: 'person-jwt', user: 'person' }))
  assign.mockReset(); Object.defineProperty(window, 'location', { value: { assign }, writable: true })
  sattUpplast({ id: 'p1', namn: 'Oskar', roll: 'forare', aktivitet: Date.now() })
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
})

describe('låsa — personens session ligger ALDRIG kvar', () => {
  it('normalfallet: maskinkontots session kommer tillbaka, personens spärras på servern, ingen lokal utloggning behövs', async () => {
    sattMaskinSession({ access_token: 'maskin-jwt', refresh_token: 'maskin-ref', maskin_id: 'R64428' })
    await lasMaskinen()
    expect(h.nu).toBe('maskin'); expect(personSessionKvar()).toBe(false)
    expect(assign).toHaveBeenCalledWith('/planering')
    expect(h.anrop.some(a => a.startsWith('signOut'))).toBe(false)
    expect(lasUpplast()).toBeNull(); expect(lasMaskinSession()).toBeNull()
    const [url, init] = (fetch as any).mock.calls[0]; expect(url).toBe('/api/maskin/las'); expect(init.headers.Authorization).toBe('Bearer person-jwt')
  })
  it('maskinkontots sparade session SAKNAS → personen loggas ut lokalt (scope local) innan inloggningssidan, ingen personlig session kvar', async () => {
    await lasMaskinen()
    expect(h.anrop).toContain('signOut:{"scope":"local"}')
    expect(h.nu).toBeNull(); expect(personSessionKvar()).toBe(false)
    expect(assign).toHaveBeenCalledWith('/login'); expect(lasUpplast()).toBeNull()
  })
  it('setSession misslyckas (ogiltig refresh-token) → samma: utloggad lokalt, ingen personlig session kvar', async () => {
    sattMaskinSession({ access_token: 'maskin-jwt', refresh_token: 'död', maskin_id: 'R64428' })
    h.uppsattning.setSession = 'fel'
    await lasMaskinen()
    expect(h.anrop).toContain('signOut:{"scope":"local"}'); expect(personSessionKvar()).toBe(false)
    expect(assign).toHaveBeenCalledWith('/login'); expect(lasMaskinSession()).toBeNull()
  })
  it('setSession KASTAR (nätet föll mitt i) → utloggad lokalt', async () => {
    sattMaskinSession({ access_token: 'maskin-jwt', refresh_token: 'r', maskin_id: 'R64428' })
    h.uppsattning.setSession = 'kast'
    await lasMaskinen()
    expect(personSessionKvar()).toBe(false); expect(assign).toHaveBeenCalledWith('/login')
  })
  it('till och med när signOut självt kastar rensas sessionen för hand (localStorage och cookies)', async () => {
    h.uppsattning.signOut = 'kast'
    await lasMaskinen()
    expect(Object.keys(localStorage).filter(k => k.startsWith('sb-'))).toEqual([]); expect(document.cookie).not.toContain('person')
    expect(assign).toHaveBeenCalledWith('/login')
  })
  it('Logga ut maskinen: alltid utloggad lokalt och till inloggningen', async () => {
    sattMaskinSession({ access_token: 'maskin-jwt', refresh_token: 'maskin-ref', maskin_id: 'R64428' })
    await loggaUtMaskinen()
    expect(h.nu).toBeNull(); expect(personSessionKvar()).toBe(false); expect(h.anrop).toContain('signOut:{"scope":"local"}'); expect(assign).toHaveBeenCalledWith('/login')
  })
})

describe('låsa upp — upplåsningen skrivs FÖRE sessionsbytet', () => {
  const ok = { ok: true, json: async () => ({ ok: true, token_hash: 'tok' }) }
  beforeEach(() => { h.nu = 'maskin'; sattUpplast(null); localStorage.clear(); localStorage.setItem('sb-proj-auth-token', '{"user":"maskin"}') })
  it('när verifyOtp körs finns redan upplåsningen och maskinkontots sparade session', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok))
    let vidByte: any = null
    h.vidVerify = () => { vidByte = { upplast: lasUpplast(), ms: lasMaskinSession() } }
    const r = await lasUppMedKod({ id: 'p1', namn: 'Oskar', roll: 'forare', harKod: true }, '1234')
    expect(r).toEqual({ ok: true })
    expect(vidByte.upplast).toMatchObject({ id: 'p1' }); expect(vidByte.ms).toMatchObject({ access_token: 'maskin-jwt', maskin_id: 'R64428' })
  })
  it('verifyOtp misslyckas → varken upplåsning eller sparad maskinsession blir kvar, och fel säger det', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok)); h.uppsattning.verifyOtp = 'fel'
    const r = await lasUppMedKod({ id: 'p1', namn: 'Oskar', roll: 'forare', harKod: true }, '1234')
    expect(r).toEqual({ ok: false, fel: 'annat' }); expect(lasUpplast()).toBeNull(); expect(lasMaskinSession()).toBeNull()
  })
  it('fel kod från servern rör inga sessioner', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ ok: false, fel: 'fel_kod', vantar_till: null }) })))
    const r = await lasUppMedKod({ id: 'p1', namn: 'Oskar', roll: 'forare', harKod: true }, '0000')
    expect(r).toMatchObject({ ok: false, fel: 'fel_kod' }); expect(h.anrop).toEqual([]); expect(lasMaskinSession()).toBeNull()
  })
})
