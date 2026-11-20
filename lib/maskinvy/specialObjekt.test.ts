import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Svaret som nästa anrop mot dim_objekt får; hoistat så vi.mock-fabriken når det.
const svar = vi.hoisted(() => ({ ut: { data: [] as any, error: null as any }, kastar: false, anrop: [] as any[] }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (t: string) => ({
      select: (kol: string) => ({
        eq: (k: string, v: unknown) => {
          svar.anrop.push({ t, kol, k, v })
          if (svar.kastar) throw new Error('nät borta')
          return Promise.resolve(svar.ut)
        },
      }),
    }),
  },
}))

import { hamtaSpecialObjekt, specialPerNamn, forstaSkal } from './specialObjekt'

let varna: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  svar.ut = { data: [], error: null }; svar.kastar = false; svar.anrop = []
  varna = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => varna.mockRestore())

describe('hamtaSpecialObjekt', () => {
  it('läser bara flaggade objekt (special = true) och ger objekt_id → skäl', async () => {
    svar.ut = { data: [
      { objekt_id: '11177558', special_skal: '  Vindfällor ' },
      { objekt_id: '11213462', special_skal: null },
      { objekt_id: 'X', special_skal: '   ' },
    ], error: null }
    const m = await hamtaSpecialObjekt()
    expect(svar.anrop).toEqual([{ t: 'dim_objekt', kol: 'objekt_id, special_skal', k: 'special', v: true }])
    expect(m.get('11177558')).toBe('Vindfällor')            // trimmat
    expect(m.get('11213462')).toBeNull()                    // flaggat utan skäl
    expect(m.get('X')).toBeNull()                           // blankt skäl är inget skäl
    expect(m.has('A110148_1')).toBe(false)
  })

  it('kolumnen saknas (migrationen ej körd): tom karta, vyn faller inte, felet loggas', async () => {
    svar.ut = { data: null, error: { code: '42703', message: 'column dim_objekt.special does not exist' } }
    const m = await hamtaSpecialObjekt()
    expect(m.size).toBe(0)
    expect(varna).toHaveBeenCalled()
  })

  it('ett kast (nätet) fäller inte vyn och loggas', async () => {
    svar.kastar = true
    const m = await hamtaSpecialObjekt()
    expect(m.size).toBe(0)
    expect(varna).toHaveBeenCalled()
  })
})

describe('specialPerNamn', () => {
  const special = new Map<string, string | null>([['a', 'Vindfällor'], ['b', null]])
  const namnAv = { a: 'Hushållningssällskapet', b: 'Storm', c: 'Vanligt' }

  it('bara special-objekten bland de angivna idn, nycklade på NAMN (listorna visar namn)', () => {
    expect(specialPerNamn(['a', 'b', 'c'], namnAv, special)).toEqual({ Hushållningssällskapet: 'Vindfällor', Storm: null })
  })
  it('ett special-objekt som inte finns bland idn syns inte', () => {
    expect(specialPerNamn(['c'], namnAv, special)).toEqual({})
  })
  it('saknas namnet används id:t, som listan gör', () => {
    expect(specialPerNamn(['a'], {}, special)).toEqual({ a: 'Vindfällor' })
  })
  it('två objekt med samma namn: det skrivna skälet vinner, flaggan behålls', () => {
    const m = new Map<string, string | null>([['x', null], ['y', 'Storm']])
    expect(specialPerNamn(['x', 'y'], { x: 'Dubbel', y: 'Dubbel' }, m)).toEqual({ Dubbel: 'Storm' })
  })
})

describe('forstaSkal', () => {
  it('första skrivna skälet vinner, annars null', () => {
    expect(forstaSkal(null, 'A')).toBe('A')
    expect(forstaSkal('A', 'B')).toBe('A')
    expect(forstaSkal(undefined, undefined)).toBeNull()
  })
})
