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
import { GET as kodNotisGet, POST as kodNotisPost } from './kod-notis/route'
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
      is: (k: string, v: any) => { rader = rader.filter(r => (r[k] ?? null) === v); return b },
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

function standard(over: { koder?: any[]; gate?: any; konto?: any[]; fel?: any } = {}) {
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
    maskin_kod_fel: () => { rpcAnrop.push('fel'); return over.fel ?? [{ vantar_till: null, timme: false }] },
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
  it('tio fel i rad: timmens väntan, loggen säger det och admin får en notis (aldrig personen själv) med namn och maskin — och direkt flush', async () => {
    const till = new Date(Date.now() + 3_600_000).toISOString()
    const { db } = standard({ fel: [{ vantar_till: till, timme: true }] })
    ;(db as any).from('medarbetare')   // (fakeDb läser tabellerna per anrop)
    const flush = vi.fn(async () => ({ ok: true }))
    vi.stubGlobal('fetch', flush)
    const r = await lasUppPost(req({ medarbetare_id: P_OSKAR, kod: '9999' })); const j = await r.json()
    vi.unstubAllGlobals()
    expect(r.status).toBe(401); expect(j).toMatchObject({ fel: 'fel_kod', timme: true, vantar_till: till })
    expect(db.skrivningar.filter(s => s.tabell === 'maskin_upplasning_logg').map(s => s.rad.utfall)).toEqual(['fel_kod', 'spard_timme'])
    const kö = db.skrivningar.find(s => s.tabell === 'notis_kö')!.rad as any[]
    expect(kö.map(x => x.mottagare_id)).toEqual([P_MARTIN])                           // bara aktiva admin
    expect(kö[0]).toMatchObject({ typ: 'maskin_kod_spar', skickas_at: 'infinity', payload: { namn: 'Oskar Nilsson', maskin_id: 'R64428' } })
    expect(JSON.stringify(kö)).not.toMatch(/9999|kod_hash|salt/)                      // aldrig något om själva koden
    expect(flush).toHaveBeenCalledOnce()
  })
  it('tio fel i rad på en ADMIN: de andra admin får notisen, personen själv aldrig', async () => {
    const P_ADMIN2 = '00000000-0000-4000-8000-0000000000a2'
    const till = new Date(Date.now() + 3_600_000).toISOString()
    const { db, t } = standard({ fel: [{ vantar_till: till, timme: true }], koder: [{ medarbetare_id: P_MARTIN, ...skapaHash('1234') }] })
    ;(t.medarbetare as any[]).push({ id: P_ADMIN2, namn: 'Joacim', roll: 'admin', maskin_id: null, aktiv: true, user_id: 'u-j', epost: 'j@x' })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })))
    const r = await lasUppPost(req({ medarbetare_id: P_MARTIN, kod: '9999' }))
    vi.unstubAllGlobals()
    expect(r.status).toBe(401)
    const kö = db.skrivningar.find(s => s.tabell === 'notis_kö')!.rad as any[]
    expect(kö.map(x => x.mottagare_id)).toEqual([P_ADMIN2])
  })
  it('fem fel (en minut) ger ingen notis', async () => {
    const { db } = standard({ fel: [{ vantar_till: new Date(Date.now() + 60_000).toISOString(), timme: false }] })
    const r = await lasUppPost(req({ medarbetare_id: P_OSKAR, kod: '9999' })); const j = await r.json()
    expect(j.timme).toBe(false); expect(db.skrivningar.some(s => s.tabell === 'notis_kö')).toBe(false)
    expect(db.skrivningar.some(s => s.tabell === 'maskin_upplasning_logg' && s.rad.utfall === 'spard_timme')).toBe(false)
  })
  it('MASKIN_KOD_PEPPAR saknas → tydligt 500, ingen token, inget räknat försök — och ALDRIG en reserv till service-nyckeln', async () => {
    const { rpcAnrop } = standard()
    const k = process.env.SUPABASE_SERVICE_ROLE_KEY; process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-nyckel'
    delete process.env.MASKIN_KOD_PEPPAR
    try {
      const r = await lasUppPost(req({ medarbetare_id: P_OSKAR, kod: '1234' })); const j = await r.json()
      expect(r.status).toBe(500); expect(j.fel).toBe('peppar_saknas'); expect(j.error).toContain('MASKIN_KOD_PEPPAR'); expect(j.token_hash).toBeUndefined()
      expect(rpcAnrop).toEqual([])
      h.session = { user: { id: 'u', email: 'o@x' }, medarbetareId: P_OSKAR, roll: 'forare' }
      const s = await kodPost(req({ kod: '4711' })); expect(s.status).toBe(500); expect((await s.json()).fel).toBe('peppar_saknas')
    } finally { process.env.MASKIN_KOD_PEPPAR = 'p'; if (k === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = k }
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


describe('Välj koden från maskinen — notisen till telefonen', () => {
  const P_DANIEL = 'p-daniel'
  const UUID_DANIEL = '00000000-0000-4000-8000-0000000000d1'
  const flushFetch = vi.fn(async () => new Response('{}', { status: 200 }))
  /** Daniel har ingen kod. Gate: första begäran tillåts, därefter "väntar" (som databasfunktionen under två minuter). */
  function opp(over: { subs?: any[]; koder?: any[]; gate?: (n: number) => any } = {}) {
    const { db, t } = standard({ koder: over.koder ?? [] })
    const med = (t.medarbetare as any[]).find(m => m.id === P_DANIEL)
    med.id = UUID_DANIEL
    t.push_subscriptions = over.subs ?? [{ id: 's1', medarbetare_id: UUID_DANIEL, maskin_id: null, subscription: { endpoint: 'e' } }]
    t.dim_maskin = [{ maskin_id: 'R64428', visningsnamn: 'H8E -26' }]
    let n = 0
    const anrop: any[] = []
    const fake = fakeDb(t, {
      maskin_kod_notis_begar: (a: any) => { anrop.push(a); n++; return [over.gate ? over.gate(n) : n === 1 ? { tillat: true, vantar_till: '2026-11-21T07:02:00Z', tid: '2026-11-21T07:00:00Z' } : { tillat: false, vantar_till: '2026-11-21T07:02:00Z', tid: '2026-11-21T07:00:00Z' }] },
    }, (db as any).auth)
    h.db = fake
    flushFetch.mockClear(); vi.stubGlobal('fetch', flushFetch)
    return { db: fake, t, anrop }
  }
  const notisRader = (db: any) => db.skrivningar.filter((s: any) => s.tabell === 'notis_kö')
  const loggRader = (db: any) => db.skrivningar.filter((s: any) => s.tabell === 'maskin_upplasning_logg').map((s: any) => s.rad.utfall)

  it('namn utan kod → EN notis till personens telefon: rätt mottagare, rätt typ, bara maskinens namn i innehållet', async () => {
    const { db, anrop } = opp()
    const r = await kodNotisPost(req({ medarbetare_id: UUID_DANIEL })); const j = await r.json()
    expect(r.status).toBe(200)
    expect(j).toEqual({ ok: true, harKod: false, harPush: true, skickad: true, vantarTill: '2026-11-21T07:02:00Z' })
    expect(anrop).toEqual([{ p_med: UUID_DANIEL, p_maskin: 'R64428' }])
    const n = notisRader(db).map((x: any) => x.rad[0])
    expect(n).toHaveLength(1)
    expect(n[0]).toMatchObject({ mottagare_id: UUID_DANIEL, typ: 'maskin_kod_val', skickas_at: 'infinity', payload: { maskin_namn: 'H8E -26' } })
    expect(Object.keys(n[0].payload)).toEqual(['maskin_namn'])                    // inget namn, ingen kod, inget personligt
    expect(n[0].dedup_nyckel).toBe(`kodval:${UUID_DANIEL}:2026-11-21T07:00:00Z`)
    expect(flushFetch).toHaveBeenCalledTimes(1)                                        // skickas direkt, inte först av nästa cron
    expect(JSON.stringify(j)).not.toMatch(/token|kod_hash|salt/)
  })

  it('två tryck inom två minuter → bara en notis; det andra svaret säger när "Skicka igen" går att trycka på', async () => {
    const { db, anrop } = opp()
    const a = await (await kodNotisPost(req({ medarbetare_id: UUID_DANIEL }))).json()
    const b = await (await kodNotisPost(req({ medarbetare_id: UUID_DANIEL }))).json()
    expect(a.skickad).toBe(true)
    expect(b).toEqual({ ok: true, harKod: false, harPush: true, skickad: false, vantarTill: '2026-11-21T07:02:00Z' })
    expect(anrop).toHaveLength(2)                                                      // båda begärandena går genom databasens gräns (som loggar dem)
    expect(notisRader(db)).toHaveLength(1)
    expect(flushFetch).toHaveBeenCalledTimes(1)
  })

  it('ingen push-prenumeration (eller bara maskinens egen) → reservsvaret, ingen notis, inget fel, begäran loggas', async () => {
    for (const subs of [[], [{ id: 's9', medarbetare_id: UUID_DANIEL, maskin_id: 'R64428', subscription: {} }]]) {
      const { db, anrop } = opp({ subs })
      const r = await kodNotisPost(req({ medarbetare_id: UUID_DANIEL })); const j = await r.json()
      expect(r.status).toBe(200)
      expect(j).toEqual({ ok: true, harKod: false, harPush: false, skickad: false, vantarTill: null })
      expect(notisRader(db)).toHaveLength(0); expect(anrop).toHaveLength(0); expect(flushFetch).not.toHaveBeenCalled()
      expect(loggRader(db)).toEqual(['kod_notis_ingen_push'])
    }
  })

  it('har personen redan en kod skickas ingen notis (arket visar plattan)', async () => {
    const kod = skapaHash('1234')
    const { db, anrop } = opp({ koder: [{ medarbetare_id: UUID_DANIEL, ...kod }] })
    const j = await (await kodNotisPost(req({ medarbetare_id: UUID_DANIEL }))).json()
    expect(j.harKod).toBe(true); expect(j.skickad).toBe(false)
    expect(notisRader(db)).toHaveLength(0); expect(anrop).toHaveLength(0)
  })

  it('bara en aktiv förare eller admin: inaktiv, maskinkonto och okänd person får 404 och ingen notis', async () => {
    const { db } = opp()
    for (const id of [P_SLUTAT, P_MASKIN, P_MASKIN_AKTIV, '00000000-0000-4000-8000-00000000ffff']) {
      expect((await kodNotisPost(req({ medarbetare_id: id }))).status).toBe(404)
    }
    expect(notisRader(db)).toHaveLength(0)
  })

  it('bara maskinkontot med brytaren PÅ: förare, admin, utloggad och maskin med brytaren av får ingenting', async () => {
    const { db } = opp()
    for (const [sess, status] of [
      [{ user: { id: 'u', email: 'o@x' }, medarbetareId: P_OSKAR, roll: 'forare' }, 403],
      [{ user: { id: 'u', email: 'a@x' }, medarbetareId: P_MARTIN, roll: 'admin' }, 403],
      [{ user: null, medarbetareId: null, roll: null }, 401],
    ] as const) {
      h.session = sess as any
      expect((await kodNotisPost(req({ medarbetare_id: UUID_DANIEL }))).status).toBe(status)
      expect((await kodNotisGet(new Request(`http://x/api/maskin/kod-notis?medarbetare_id=${UUID_DANIEL}`))).status).toBe(status)
    }
    h.session = { user: { id: 'u-m', email: 'h8@x' }, medarbetareId: 'med-m', roll: 'maskin' }
    standard({ konto: [{ maskin_id: 'R64428', aktiv: false }] })
    expect((await kodNotisPost(req({ medarbetare_id: UUID_DANIEL }))).status).toBe(403)
    expect(notisRader(db)).toHaveLength(0)
  })

  it('fel indata (inget id, inget uuid) → 400', async () => {
    opp()
    for (const b of [{}, { medarbetare_id: 'abc' }, { medarbetare_id: 5 }]) expect((await kodNotisPost(req(b))).status).toBe(400)
    expect((await kodNotisGet(new Request('http://x/api/maskin/kod-notis?medarbetare_id=nej'))).status).toBe(400)
  })

  it('GET frågar bara om koden finns — och svarar aldrig med något som låser upp', async () => {
    const kod = skapaHash('1234')
    opp()
    const url = `http://x/api/maskin/kod-notis?medarbetare_id=${UUID_DANIEL}`
    expect(await (await kodNotisGet(new Request(url))).json()).toEqual({ ok: true, harKod: false })
    opp({ koder: [{ medarbetare_id: UUID_DANIEL, ...kod }] })
    const j = await (await kodNotisGet(new Request(url))).json()
    expect(j).toEqual({ ok: true, harKod: true })
  })

  it('koden väljs i telefonen medan arket är stängt → ingenting låses upp: ingen token skapas, ingen upplåsning loggas', async () => {
    const { db } = opp()
    const generateLink = vi.spyOn((db as any).auth.admin, 'generateLink')
    h.session = { user: { id: 'u-daniel', email: 'd@x' }, medarbetareId: UUID_DANIEL, roll: 'forare' }
    process.env.MASKIN_KOD_PEPPAR = 'p'
    expect((await kodPost(req({ kod: '2468' }))).status).toBe(200)                      // personen väljer sin kod i telefonen
    h.session = { user: { id: 'u-m', email: 'h8@x' }, medarbetareId: 'med-m', roll: 'maskin' }
    expect(generateLink).not.toHaveBeenCalled()
    expect(loggRader(db)).not.toContain('upplast')
    expect((db as any).skrivningar.filter((s: any) => s.tabell === 'maskin_upplasning_logg')).toHaveLength(0)
  })
})
