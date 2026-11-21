/**
 * POST /api/maskin/auto: bara en inloggad förare/admin kan be om maskinens konto, brytaren avgör, kontot skapas vid behov, svaret är en
 * engångstoken och inget annat, och varje utfall loggas.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { kontoDb, type Tabeller } from '@/lib/maskinkonto/kontoDb.testStod'

const h = vi.hoisted(() => ({
  session: { user: { id: 'u-o', email: 'o@x' }, medarbetareId: 'med-o', roll: 'forare' } as { user: { id: string; email: string } | null; medarbetareId: string | null; roll: string | null },
  db: null as any,
}))
vi.mock('@/lib/auth/server', async () => {
  const mod = await vi.importActual<typeof import('@/lib/auth/server')>('@/lib/auth/server')
  return { ...mod, autentisera: async () => h.session }
})
vi.mock('@/lib/auth/admin', () => ({ adminSupabase: () => h.db }))

import { POST } from './route'

const req = (body: unknown) => new Request('http://x/api/maskin/auto', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const bas = (over: Tabeller = {}): Tabeller => ({
  dim_maskin: [
    { maskin_id: 'R64428', visningsnamn: 'H8E -26', maskin_typ: 'Harvester', aktiv_till: null },
    { maskin_id: 'GAMMAL', visningsnamn: 'Gammal', maskin_typ: 'Harvester', aktiv_till: '2020-01-01' },
    { maskin_id: 'LASTBIL', visningsnamn: 'Bilen', maskin_typ: 'Truck', aktiv_till: null },
  ],
  maskin_konto: [{ maskin_id: 'R64428', aktiv: true, user_id: null, medarbetare_id: null, epost: null }],
  medarbetare: [], maskin_upplasning_logg: [],
  ...over,
})
const logg = (t: Tabeller) => (t.maskin_upplasning_logg ?? []).map(r => r.utfall)

beforeEach(() => { h.session = { user: { id: 'u-o', email: 'o@x' }, medarbetareId: 'med-o', roll: 'forare' } })

describe('POST /api/maskin/auto', () => {
  it('brytaren på + ingen konto: kontot skapas och svaret är en engångstoken för maskinens konto — inget annat', async () => {
    const t = bas(); h.db = kontoDb(t)
    const r = await POST(req({ maskin_id: 'R64428' })); const j = await r.json()
    expect(r.status).toBe(200)
    expect(j).toEqual({ ok: true, token_hash: 'tok-maskin-r64428@maskin.invalid', maskin_id: 'R64428', skapad: true })
    expect(JSON.stringify(j)).not.toMatch(/password|lösenord|user_id|u-ny/i)
    expect(t.medarbetare[0]).toMatchObject({ roll: 'maskin', aktiv: false, maskin_id: 'R64428' })
    expect(logg(t)).toEqual(['auto_konto', 'auto_inloggad'])
    expect(t.maskin_upplasning_logg[0]).toMatchObject({ maskin_id: 'R64428', medarbetare_id: 'med-o' })
  })

  it('andra starten återanvänder samma konto: ingen ny auth-användare, ingen ny medarbetarrad, bara auto_inloggad loggas', async () => {
    const t = bas(); h.db = kontoDb(t)
    await POST(req({ maskin_id: 'R64428' }))
    const r2 = await POST(req({ maskin_id: 'R64428' })); const j2 = await r2.json()
    expect(j2).toMatchObject({ ok: true, skapad: false })
    expect(h.db.spar.skapade).toHaveLength(1); expect(t.medarbetare).toHaveLength(1)
    expect(logg(t)).toEqual(['auto_konto', 'auto_inloggad', 'auto_inloggad'])
  })

  it('en admin kan också utlösa det (hen sitter vid maskindatorn)', async () => {
    h.session = { user: { id: 'u-a', email: 'a@x' }, medarbetareId: 'med-a', roll: 'admin' }
    const t = bas(); h.db = kontoDb(t)
    expect((await POST(req({ maskin_id: 'R64428' }))).status).toBe(200)
  })

  it('brytaren AV (eller ingen rad alls): 403 { fel: av }, INGET skapas och det loggas', async () => {
    for (const konto of [[{ maskin_id: 'R64428', aktiv: false, user_id: null }], []]) {
      const t = bas({ maskin_konto: konto }); h.db = kontoDb(t)
      const r = await POST(req({ maskin_id: 'R64428' })); const j = await r.json()
      expect(r.status).toBe(403); expect(j.fel).toBe('av')
      expect(h.db.spar.skapade).toHaveLength(0); expect(t.medarbetare).toHaveLength(0)
      expect(h.db.auth.admin.generateLink).not.toHaveBeenCalled()
      expect(logg(t)).toEqual(['auto_nekad'])
    }
  })

  it('en brytare som är av för EN maskin öppnar inte en annan: konto skapas bara för maskinen som frågas', async () => {
    const t = bas({ dim_maskin: [...bas().dim_maskin, { maskin_id: 'A030353', visningsnamn: 'Wisent', maskin_typ: 'Forwarder', aktiv_till: null }] })
    h.db = kontoDb(t)
    expect((await POST(req({ maskin_id: 'A030353' }))).status).toBe(403)
    expect(h.db.spar.skapade).toHaveLength(0)
  })

  it('okänd maskin, avvecklad maskin och en lastbil: 404, inget skapas', async () => {
    for (const id of ['FINNS-INTE', 'GAMMAL', 'LASTBIL']) {
      const t = bas({ maskin_konto: [{ maskin_id: id, aktiv: true, user_id: null }] }); h.db = kontoDb(t)
      const r = await POST(req({ maskin_id: id }))
      expect(r.status).toBe(404); expect(h.db.spar.skapade).toHaveLength(0)
    }
  })

  it('maskinkontot självt, utloggad, och en roll som inte är förare/admin: aldrig', async () => {
    const t = bas(); h.db = kontoDb(t)
    h.session = { user: { id: 'u-m', email: 'h8@x' }, medarbetareId: 'med-m', roll: 'maskin' }
    expect((await POST(req({ maskin_id: 'R64428' }))).status).toBe(403)
    h.session = { user: null, medarbetareId: null, roll: null }
    expect((await POST(req({ maskin_id: 'R64428' }))).status).toBe(401)
    h.session = { user: { id: 'u', email: 'x@x' }, medarbetareId: 'med-x', roll: 'chef' }
    expect((await POST(req({ maskin_id: 'R64428' }))).status).toBe(403)
    h.session = { user: { id: 'u', email: 'x@x' }, medarbetareId: null, roll: 'forare' }
    expect((await POST(req({ maskin_id: 'R64428' }))).status).toBe(403)
    expect(h.db.spar.skapade).toHaveLength(0); expect(h.db.auth.admin.generateLink).not.toHaveBeenCalled()
  })

  it('felaktig indata: 400', async () => {
    h.db = kontoDb(bas())
    for (const b of [null, {}, { maskin_id: 5 }, { maskin_id: '' }, { maskin_id: 'x'.repeat(65) }]) expect((await POST(req(b))).status).toBe(400)
  })

  it('går engångstoken inte att skapa: fel, inget byte — men ett konto som redan skapats blir kvar (det är ofarligt och återanvänds)', async () => {
    const t = bas(); h.db = kontoDb(t)
    h.db.auth.admin.generateLink.mockResolvedValueOnce({ data: null, error: { message: 'x' } })
    const r = await POST(req({ maskin_id: 'R64428' }))
    expect(r.status).toBe(500)
    expect(logg(t)).toContain('auto_nekad')
    const r2 = await POST(req({ maskin_id: 'R64428' }))
    expect(r2.status).toBe(200); expect(h.db.spar.skapade).toHaveLength(1)
  })
})
