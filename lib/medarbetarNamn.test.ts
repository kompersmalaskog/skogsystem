/** Namn på andra personer till maskinen: bara namn, bara de id:n man ber om, och aldrig ett fel. */
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
import { hamtaVisningsnamn, kompletteraNamn } from './medarbetarNamn'

const dbMed = (data: any, error: any = null) => { const rpc = vi.fn(async () => ({ data, error })); return { rpc } }

describe('hamtaVisningsnamn', () => {
  it('ber om de unika id:n och inget annat; tomma/saknade id:n hoppas över', async () => {
    const db = dbMed([{ id: 'a', namn: 'Daniel' }])
    const m = await hamtaVisningsnamn(['a', 'a', null, undefined, ''], db)
    expect(db.rpc).toHaveBeenCalledWith('medarbetare_visning', { p_ids: ['a'] })
    expect(m.get('a')).toBe('Daniel')
  })
  it('inga id:n: ingen läsning alls', async () => {
    const db = dbMed([]); await hamtaVisningsnamn([null, undefined], db); expect(db.rpc).not.toHaveBeenCalled()
  })
  it('fler än 200 id:n läses i omgångar om högst 200', async () => {
    const db = dbMed([]); await hamtaVisningsnamn(Array.from({ length: 450 }, (_, i) => `id${i}`), db)
    expect(db.rpc.mock.calls.map((c: any) => (c[1] as any).p_ids.length)).toEqual([200, 200, 50])
  })
  it('fel, kast, saknad funktion, konstiga svar: tomt resultat, aldrig ett fel', async () => {
    expect((await hamtaVisningsnamn(['a'], dbMed(null, { message: 'x' }))).size).toBe(0)
    expect((await hamtaVisningsnamn(['a'], dbMed({ nej: 1 }))).size).toBe(0)
    expect((await hamtaVisningsnamn(['a'], { rpc: async () => { throw new Error('nät') } })).size).toBe(0)
    expect((await hamtaVisningsnamn(['a'], {})).size).toBe(0)
    expect((await hamtaVisningsnamn(['a'], dbMed([{ id: 'a', namn: '  ' }, { id: 5, namn: 'x' }]))).size).toBe(0)
  })
})

describe('kompletteraNamn', () => {
  const rader = [{ id: 1, av: 'a', namn: 'Martin' }, { id: 2, av: 'b', namn: null }, { id: 3, av: null, namn: null }]
  const satt = (r: any, n: string) => ({ ...r, namn: n })
  it('fyller bara i de som saknar namn och har en författare; de som har namn rörs aldrig', async () => {
    const db = dbMed([{ id: 'b', namn: 'Oskar' }, { id: 'a', namn: 'FEL' }])
    const ut = await kompletteraNamn(rader, (r) => r.av, (r) => r.namn, satt, db)
    expect(ut.map((r) => r.namn)).toEqual(['Martin', 'Oskar', null])
    expect(db.rpc).toHaveBeenCalledWith('medarbetare_visning', { p_ids: ['b'] })
  })
  it('har alla namn frågas inget; saknas svar lämnas raderna som de var', async () => {
    const db = dbMed([]); const a = [{ id: 1, av: 'a', namn: 'X' }]
    expect(await kompletteraNamn(a, (r) => r.av, (r) => r.namn, satt, db)).toBe(a); expect(db.rpc).not.toHaveBeenCalled()
    const b = [{ id: 2, av: 'b', namn: null }]
    expect(await kompletteraNamn(b, (r) => r.av, (r) => r.namn, satt, dbMed([]))).toBe(b)
  })
})
