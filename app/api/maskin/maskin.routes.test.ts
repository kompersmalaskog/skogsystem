/**
 * Serverrutterna för maskinkonton: bara maskinkontot (brytaren på) får hämta namnen och låsa upp, koden kontrolleras på servern med felräknaren
 * FÖRE kontrollen, rätt kod ger en engångstoken för just den personen, och varje utfall loggas. Förare/admin sätter sin egen kod; bara admin
 * lägger upp konton, slår brytaren och nollställer koder.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  session: { user: { id: 'u-m', email: 'h8@x' }, medarbetareId: 'med-m', roll: 'maskin' } as { user: { id: string; email: string } | null; medarbetareId: string | null; roll: string | null },
  db: null as any,
}))

vi.mock('@/lib/auth/server', async () => {
  const mod = await vi.importActual<typeof import('@/lib/auth/server')>('@/lib/auth/server')
  return { ...mod, autentisera: async () => h.session, kravRoll: async (roller: readonly string[]) => {
    if (!h.session.user) return { ok: false, res: mod.svar401() }
    if (!h.session.roll || !roller.includes(h.session.roll)) return { ok: false, res: mod.svar403() }
    return { ok: true, session: h.session }
  } }
})
vi.mock('@/lib/auth/admin', () => ({ adminSupabase: () => h.db }))

import { skapaHash } from '@/lib/maskinkonto/kod'
import { GET as vemGet } from './vem/route'
import { POST as lasUppPost } from './las-upp/route'
import { POST as lasPost } from './las/route'
import { GET as kodGet, POST as kodPost } from './kod/route'
import { POST as nollstallPost } from './kod/nollstall/route'
import { GET as kontoGet, POST as kontoPost, PATCH as kontoPatch } from './konto/route'

const P_OSKAR = '00000000-0000-4000-8000-0000000000f1'
const P_MARTIN = '00000000-0000-4000-8000-0000000000a1'
const P_SLUTAT = '00000000-0000-4000-8000-0000000000c1'
const P_MASKIN = '00000000-0000-4000-8000-0000000000b1'
const P_MASKIN_AKTIV = '00000000-0000-4000-8000-0000000000b2'

type Tabeller = Record<string, any[]>
/** Minimal Supabase-fake: select/eq/in/insert/upsert/delete/maybeSingle över arrayer, loggar skrivningar. */
function fakeDb(t: Tabeller, rpc: Record<string, (a: any) => any> = {}, auth: any = {}) {
  const skrivningar: { tabell: string; op: string; rad?: any }[] = []
  const from = (tabell: string) => {
    let rader = [...(t[tabell] ?? [])]
    const b: any = {
      select: () => b,
      eq: (k: string, v: any) => { rader = rader.filter(r => r[k] === v); return b },
      in: (k: string, v: any[]) => { rader = rader.filter(r => v.includes(r[k])); return b },
      order: () => b,
      ilike: () => { rader = []; return b },
      limit: () => b,
      maybeSingle: async () => ({ data: rader[0] ?? null, error: null }),
      insert: (rad: any) => { skrivningar.push({ tabell, op: 'insert', rad }); (t[tabell] ??= []).push(rad); const c: any = Promise.resolve({ data: [rad], error: null }); c.select = () => Promise.resolve({ data: [{ id: 'ny-med', ...rad }], error: null }); return c },
      upsert: (rad: any) => { skrivningar.push({ tabell, op: 'upsert', rad }); const c: any = Promise.resolve({ data: [rad], error: null }); c.select = () => Promise.resolve({ data: [rad], error: null }); return c },
      delete: () => ({ eq: async () => { skrivningar.push({ tabell, op: 'delete' }); return { error: null } } }),
      then: (ok: any) => Promise.resolve({ data: rader, error: null }).then(ok),
    }
    return b
  }
  return { from, skrivningar, rpc: async (namn: string, a: any) => ({ data: rpc[namn]?.(a) ?? null, error: null }), auth }
}

const req = (body: unknown, extra: Record<string, string> = {}) => new Request('http://x/api', { method: 'POST', headers: { 'content-type': 'application/json', ...extra }, body: JSON.stringify(body) })

function standard(over: { koder?: any[]; gate?: any; konto?: any[] } = {}) {
  process.env.MASKIN_KOD_PEPPAR = 'p'
  const kod = skapaHash('1234')
  const rpcAnrop: string[] = []
  const t: Tabeller = {
    medarbetare: [
      { id: 'med-m', roll: 'maskin', maskin_id: 'R64428', aktiv: false, user_id: 'u-m' },
      { id: P_OSKAR, namn: 'Oskar Nilsson', roll: 'forare', maskin_id: 'R64428', aktiv: true, user_id: 'u-oskar', epost: 'oskar@x' },
      { id: P_MARTIN, namn: 'Martin', roll: 'admin', maskin_id: null, aktiv: true, user_id: 'u-martin', epost: 'martin@x' },
      { id: P_SLUTAT, namn: 'Slutat', roll: 'forare', maskin_id: 'R64428', aktiv: false, user_id: 'u-slutat', epost: 's@x' },
      { id: P_MASKIN, namn: 'H8', roll: 'maskin', maskin_id: 'R64428', aktiv: false, user_id: 'u-m2', epost: 'h8b@x' },
      { id: P_MASKIN_AKTIV, namn: 'H8 (felaktigt aktiv)', roll: 'maskin', maskin_id: 'R64428', aktiv: true, user_id: 'u-m3', epost: 'h8c@x' },
      { id: 'p-daniel', namn: 'Daniel', roll: 'forare', maskin_id: 'A130743', aktiv: true, user_id: 'u-daniel', epost: 'd@x' },
    ],
    maskin_konto: over.konto ?? [{ maskin_id: 'R64428', aktiv: true, user_id: 'u-m' }],
    forare_maskinkod: over.koder ?? [{ medarbetare_id: P_OSKAR, ...kod }, { medarbetare_id: P_SLUTAT, ...kod }, { medarbetare_id: P_MASKIN, ...kod }, { medarbetare_id: P_MASKIN_AKTIV, ...kod }],
    maskin_upplasning_logg: [],
  }
  const db = fakeDb(t, {
    maskin_kod_forsok: () => { rpcAnrop.push('forsok'); return over.gate ?? [{ tillat: true, vantar_till: null }] },
    maskin_kod_fel: () => { rpcAnrop.push('fel'); return null },
    maskin_kod_ratt: () => { rpcAnrop.push('ratt'); return null },
    schema_forare: () => P_OSKAR,
  }, {
    admin: {
      getUserById: async () => ({ data: { user: { email: 'oskar@x' } } }),
      generateLink: async () => ({ data: { properties: { hashed_token: 'tok123' } }, error: null }),
      signOut: vi.fn(async () => ({ error: null })),
    },
    getUser: async (tok: string) => (tok === 'person-token' ? { data: { user: { id: 'u-oskar' } } } : tok === 'maskin-token' ? { data: { user: { id: 'u-m' } } } : { data: { user: null } }),
  })
  h.db = db
  return { db, t, rpcAnrop }
}

beforeEach(() => { h.session = { user: { id: 'u-m', email: 'h8@x' }, medarbetareId: 'med-m', roll: 'maskin' } })

describe('Vem är du? — namnen', () => {
  it('bara maskinkontot med brytaren på; maskinens förare först, sedan övriga förare, sist admin; inga koder eller hashar i svaret', async () => {
    standard()
    const r = await vemGet(); const j = await r.json()
    expect(r.status).toBe(200)
    expect(j.personer.map((p: any) => p.namn)).toEqual(['Oskar Nilsson', 'Daniel', 'Martin'])
    expect(j.personer[0].harKod).toBe(true); expect(j.personer[1].harKod).toBe(false)
    expect(JSON.stringify(j)).not.toMatch(/kod_hash|salt|epost|user_id/)
  })
  it('en förare, admin eller utloggad får inga namn; ett maskinkonto med brytaren AV inte heller', async () => {
    standard()
    h.session = { user: { id: 'u', email: 'o@x' }, medarbetareId: P_OSKAR, roll: 'forare' }
    expect((await vemGet()).status).toBe(403)
    h.session = { user: { id: 'u', email: 'a@x' }, medarbetareId: P_MARTIN, roll: 'admin' }
    expect((await vemGet()).status).toBe(403)
    h.session = { user: null, medarbetareId: null, roll: null }
    expect((await vemGet()).status).toBe(401)
    h.session = { user: { id: 'u-m', email: 'h8@x' }, medarbetareId: 'med-m', roll: 'maskin' }
    standard({ konto: [{ maskin_id: 'R64428', aktiv: false }] })
    const av = await vemGet()
    expect(av.status).toBe(403)
  })
})

describe('Låsa upp med kod', () => {
  it('rätt kod → engångstoken för just den personen, felräknaren nollas, utfallet loggas, inget hemligt i svaret', async () => {
    const { db, rpcAnrop } = standard()
    const r = await lasUppPost(req({ medarbetare_id: P_OSKAR, kod: '1234' })); const j = await r.json()
    expect(r.status).toBe(200)
    expect(j).toEqual({ ok: true, token_hash: 'tok123', medarbetare_id: P_OSKAR, namn: 'Oskar Nilsson', roll: 'forare' })
    expect(rpcAnrop).toEqual(['forsok', 'ratt'])
    expect(db.skrivningar.find(s => s.tabell === 'maskin_upplasning_logg')?.rad).toMatchObject({ utfall: 'upplast', maskin_id: 'R64428', medarbetare_id: P_OSKAR })
  })
  it('fel kod → 401, felet räknas, ingen token; femte felet ger väntan direkt i samma svar', async () => {
    const { rpcAnrop } = standard()
    const r = await lasUppPost(req({ medarbetare_id: P_OSKAR, kod: '9999' })); const j = await r.json()
    expect(r.status).toBe(401); expect(j.fel).toBe('fel_kod'); expect(j.token_hash).toBeUndefined()
    expect(rpcAnrop).toEqual(['forsok', 'fel'])
  })
  it('försöket räknas FÖRE kontrollen och en spärrad person (väntan) får 429 utan att koden ens prövas — fast koden är rätt', async () => {
    const vantar = new Date(Date.now() + 60_000).toISOString()
    const { rpcAnrop, db } = standard({ gate: [{ tillat: false, vantar_till: vantar }] })
    const r = await lasUppPost(req({ medarbetare_id: P_OSKAR, kod: '1234' })); const j = await r.json()
    expect(r.status).toBe(429); expect(j).toMatchObject({ fel: 'vantar', vantar_till: vantar }); expect(j.token_hash).toBeUndefined()
    expect(rpcAnrop).toEqual(['forsok'])                              // ingen ratt, ingen fel — och ingen token
    expect(db.skrivningar.find(s => s.tabell === 'maskin_upplasning_logg')?.rad.utfall).toBe('vantar')
  })
  it('går felräknaren inte att läsa → 500 och ingen token (aldrig "öppet" för att kontrollen föll)', async () => {
    standard({ gate: [] })
    const r = await lasUppPost(req({ medarbetare_id: P_OSKAR, kod: '1234' })); const j = await r.json()
    expect(r.status).toBe(500); expect(j.token_hash).toBeUndefined()
  })
  it('ingen kod vald → 409 "Välj din kod i telefonen först", ingen räknare rörs', async () => {
    const { rpcAnrop } = standard({ koder: [] })
    const r = await lasUppPost(req({ medarbetare_id: P_OSKAR, kod: '1234' })); const j = await r.json()
    expect(r.status).toBe(409); expect(j.fel).toBe('ingen_kod'); expect(rpcAnrop).toEqual([])
  })
  it('okänd, inaktiv eller annan sorts person (t.ex. maskinkontot självt) → 404; dålig indata → 400', async () => {
    standard()
    expect((await lasUppPost(req({ medarbetare_id: '00000000-0000-4000-8000-00000000dead', kod: '1234' }))).status).toBe(404)
    expect((await lasUppPost(req({ medarbetare_id: P_SLUTAT, kod: '1234' }))).status).toBe(404)      // inaktiv
    expect((await lasUppPost(req({ medarbetare_id: P_MASKIN, kod: '1234' }))).status).toBe(404)      // maskinkontot är ingen person
    expect((await lasUppPost(req({ medarbetare_id: P_MASKIN_AKTIV, kod: '1234' }))).status).toBe(404) // ... inte ens om raden av misstag är aktiv
    expect((await lasUppPost(req({ medarbetare_id: P_OSKAR, kod: '12' }))).status).toBe(400)
    expect((await lasUppPost(req({ medarbetare_id: 'inte-uuid', kod: '1234' }))).status).toBe(400)
    expect((await lasUppPost(req({}))).status).toBe(400)
  })
  it('bara maskinkontot: förare, admin och utloggad får inte försöka', async () => {
    const { rpcAnrop } = standard()
    for (const s of [{ user: { id: 'u', email: 'o@x' }, medarbetareId: P_OSKAR, roll: 'forare' }, { user: { id: 'u', email: 'a@x' }, medarbetareId: P_MARTIN, roll: 'admin' }, { user: null, medarbetareId: null, roll: null }]) {
      h.session = s as any
      expect((await lasUppPost(req({ medarbetare_id: P_OSKAR, kod: '1234' }))).status).toBeGreaterThanOrEqual(401)
    }
    expect(rpcAnrop).toEqual([])
  })
})

describe('Låsa (spärra personens session)', () => {
  it('spärrar personens session på servern; maskinkontots egen session vägras', async () => {
    const { db } = standard()
    const ok = await lasPost(new Request('http://x', { method: 'POST', headers: { authorization: 'Bearer person-token' } }))
    expect(ok.status).toBe(200); expect(db.auth.admin.signOut).toHaveBeenCalledWith('person-token', 'local')
    db.auth.admin.signOut.mockClear()
    const nej = await lasPost(new Request('http://x', { method: 'POST', headers: { authorization: 'Bearer maskin-token' } }))
    expect(nej.status).toBe(403); expect(db.auth.admin.signOut).not.toHaveBeenCalled()
    expect((await lasPost(new Request('http://x', { method: 'POST' }))).status).toBe(401)
    expect((await lasPost(new Request('http://x', { method: 'POST', headers: { authorization: 'Bearer skräp' } }))).status).toBe(401)
  })
})

describe('Kod för maskinen (personens egen)', () => {
  it('förare och admin sparar fyra siffror — hashen, aldrig klartext — och nollar felräknaren; GET säger bara om den är satt', async () => {
    for (const s of [{ user: { id: 'u', email: 'o@x' }, medarbetareId: P_OSKAR, roll: 'forare' }, { user: { id: 'u', email: 'a@x' }, medarbetareId: P_MARTIN, roll: 'admin' }]) {
      h.session = s as any
      const { db, rpcAnrop } = standard({ koder: [] })
      expect((await kodPost(req({ kod: '4711' }))).status).toBe(200)
      const rad = db.skrivningar.find(x => x.tabell === 'forare_maskinkod')!.rad
      expect(rad.medarbetare_id).toBe(s.medarbetareId); expect(JSON.stringify(rad)).not.toContain('4711'); expect(rad.kod_hash).toMatch(/^[0-9a-f]{64}$/)
      expect(rpcAnrop).toEqual(['ratt'])
      const g = await (await kodGet()).json(); expect(g.ok).toBe(true); expect(Object.keys(g).sort()).toEqual(['ok', 'satt', 'satt_at'])
    }
  })
  it('dålig kod (3/5 siffror, bokstäver) avvisas; maskinkontot och utloggad får inte sätta kod', async () => {
    standard({ koder: [] })
    h.session = { user: { id: 'u', email: 'o@x' }, medarbetareId: P_OSKAR, roll: 'forare' }
    for (const kod of ['123', '12345', 'abcd', '', null]) expect((await kodPost(req({ kod }))).status).toBe(400)
    h.session = { user: { id: 'u-m', email: 'h8@x' }, medarbetareId: 'med-m', roll: 'maskin' }
    expect((await kodPost(req({ kod: '4711' }))).status).toBe(403)
    expect((await kodGet()).status).toBe(403)
    h.session = { user: null, medarbetareId: null, roll: null }
    expect((await kodPost(req({ kod: '4711' }))).status).toBe(401)
  })
})

describe('Admin: nollställa kod, lägga upp konto, brytare', () => {
  it('bara admin', async () => {
    standard()
    for (const s of [{ user: { id: 'u', email: 'o@x' }, medarbetareId: P_OSKAR, roll: 'forare' }, { user: { id: 'u-m', email: 'h8@x' }, medarbetareId: 'med-m', roll: 'maskin' }, { user: null, medarbetareId: null, roll: null }]) {
      h.session = s as any
      expect([401, 403]).toContain((await nollstallPost(req({ medarbetare_id: P_OSKAR }))).status)
      expect([401, 403]).toContain((await kontoGet()).status)
      expect([401, 403]).toContain((await kontoPost(req({ maskin_id: 'R64428', epost: 'a@b.se' }))).status)
      expect([401, 403]).toContain((await kontoPatch(req({ maskin_id: 'R64428', aktiv: true }))).status)
    }
  })
  it('admin nollställer en kod (raden raderas, felräknaren nollas)', async () => {
    h.session = { user: { id: 'u', email: 'a@x' }, medarbetareId: P_MARTIN, roll: 'admin' }
    const { db, rpcAnrop } = standard()
    expect((await nollstallPost(req({ medarbetare_id: P_OSKAR }))).status).toBe(200)
    expect(db.skrivningar.some(s => s.tabell === 'forare_maskinkod' && s.op === 'delete')).toBe(true); expect(rpcAnrop).toEqual(['ratt'])
    expect((await nollstallPost(req({ medarbetare_id: 'x' }))).status).toBe(400)
  })
  it('admin slår brytaren (bara ett boolesk värde godtas)', async () => {
    h.session = { user: { id: 'u', email: 'a@x' }, medarbetareId: P_MARTIN, roll: 'admin' }
    const t: Tabeller = { dim_maskin: [{ maskin_id: 'R64428' }], maskin_konto: [] }
    h.db = fakeDb(t)
    const r = await kontoPatch(req({ maskin_id: 'R64428', aktiv: false })); const j = await r.json()
    expect(r.status).toBe(200); expect(j.aktiv).toBe(false)
    expect((await kontoPatch(req({ maskin_id: 'R64428', aktiv: 'ja' }))).status).toBe(400)
    expect((await kontoPatch(req({ maskin_id: 'FINNS-INTE', aktiv: true }))).status).toBe(404)
  })
})
