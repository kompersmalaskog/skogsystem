import { describe, it, expect } from 'vitest'
import { lasFavoriter, sparaFavoriter, type FavoritKlient } from './startsidaFavoriter'

type Rad = { vyer: unknown } | null
function klient(opts: { user?: { id: string } | null; las?: { data: Rad; error: any }; spara?: (rad: any) => { data: Rad; error: any }; kasta?: boolean }) {
  const skrivet: any[] = []
  const k: FavoritKlient = {
    auth: { getUser: async () => ({ data: { user: opts.user === undefined ? { id: 'u1' } : opts.user } }) },
    from: (tabell: string) => {
      expect(tabell).toBe('startsida_favoriter')
      if (opts.kasta) throw new Error('nät')
      return {
        select: () => ({ eq: (_k: string, v: string) => ({ maybeSingle: async () => { expect(v).toBe('u1'); return opts.las ?? { data: null, error: null } } }) }),
        upsert: (rad: any, o: any) => {
          skrivet.push({ rad, o })
          return { select: () => ({ single: async () => (opts.spara ? opts.spara(rad) : { data: { vyer: rad.vyer }, error: null }) }) }
        },
      }
    },
  }
  return { k, skrivet }
}

describe('lasFavoriter', () => {
  it('ingen rad → rollens förinställda', async () => {
    expect(await lasFavoriter(klient({}).k)).toEqual({ status: 'standard' })
  })
  it('en rad → egna, i sparad ordning', async () => {
    expect(await lasFavoriter(klient({ las: { data: { vyer: ['ledighet', 'planera'] }, error: null } }).k)).toEqual({ status: 'egna', ids: ['ledighet', 'planera'] })
  })
  it('läsfel (t.ex. tabellen saknas) är ett fel, aldrig "inga favoriter"', async () => {
    const r = await lasFavoriter(klient({ las: { data: null, error: { message: 'relation "startsida_favoriter" does not exist' } } }).k)
    expect(r.status).toBe('fel')
  })
  it('trasigt svar, utloggad och kastat fel → fel', async () => {
    expect((await lasFavoriter(klient({ las: { data: { vyer: 'x' }, error: null } }).k)).status).toBe('fel')
    expect((await lasFavoriter(klient({ user: null }).k)).status).toBe('fel')
    expect((await lasFavoriter(klient({ kasta: true }).k)).status).toBe('fel')
  })
})

describe('sparaFavoriter', () => {
  it('upsert på användaren, dubbletter bort, max åtta — och svarar med det som landade', async () => {
    const { k, skrivet } = klient({})
    const ids = ['a', 'b', 'a', 'c', 'd', 'e', 'f', 'g', 'h', 'i']
    expect(await sparaFavoriter(k, ids)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])
    expect(skrivet[0].rad.user_id).toBe('u1')
    expect(skrivet[0].o).toEqual({ onConflict: 'user_id' })
  })
  it('det som landade skiljer sig från det skickade → null (verifierat på innehåll)', async () => {
    const { k } = klient({ spara: () => ({ data: { vyer: ['a'] }, error: null }) })
    expect(await sparaFavoriter(k, ['a', 'b'])).toBeNull()
  })
  it('skrivfel, utloggad eller kastat fel → null', async () => {
    expect(await sparaFavoriter(klient({ spara: () => ({ data: null, error: { message: 'rls' } }) }).k, ['a'])).toBeNull()
    expect(await sparaFavoriter(klient({ user: null }).k, ['a'])).toBeNull()
    expect(await sparaFavoriter(klient({ kasta: true }).k, ['a'])).toBeNull()
  })
})
