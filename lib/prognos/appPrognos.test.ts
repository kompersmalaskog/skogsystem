import { describe, it, expect, vi } from 'vitest'
import type { UtfallRad } from '@/lib/g15Forslag'
import { appPrognosText, beraknaAppPrognos, frysAppPrognos, lasAppPrognos } from './appPrognos'

const utfall: UtfallRad[] = Array.from({ length: 8 }, (_, i) => ({
  typ: 'slutavverkning', volymObjekt: 1000, skordadM3: 1000, stammar: 1200 + i * 10, skordareG15: 25, skotareG15: 40 + i,
}))
const nu = new Date('2026-10-27T08:00:00Z')

describe('beraknaAppPrognos (ren)', () => {
  it('ger G15-timmar per roll, metod och antal — samma räkning som Klar med trakten', () => {
    const p = beraknaAppPrognos({ typ: 'slutavverkning', volym: 500, medelstam: null }, utfall, nu, 'import')!
    expect(p.skordare).toBe(Math.round(500 / 40))
    expect(p.skotare).toBeGreaterThan(0)
    expect(p.metod.skordare).toBe('snitt-medelstam-saknas')
    expect(p.antal.skordare).toBe(8)
    expect(p.raknad).toBe('2026-10-27T08:00:00.000Z')
    expect(p.kalla).toBe('import')
  })
  it('GROT, saknad volym eller för få trakter → null', () => {
    expect(beraknaAppPrognos({ typ: 'grot', volym: 500, medelstam: null }, utfall, nu, 'frys')).toBeNull()
    expect(beraknaAppPrognos({ typ: 'gallring', volym: null, medelstam: null }, utfall, nu, 'frys')).toBeNull()
    expect(beraknaAppPrognos({ typ: 'gallring', volym: 500, medelstam: null }, utfall, nu, 'frys')).toBeNull()
  })
  it('texten i importsvaret och läsningen tillbaka', () => {
    const p = beraknaAppPrognos({ typ: 'slutavverkning', volym: 500, medelstam: null }, utfall, nu, 'import')!
    expect(appPrognosText(p)).toMatch(/^Appens prognos fryst: skördare \d+ tim · skotare \d+ tim \(G15\)$/)
    expect(lasAppPrognos(p)).toEqual({ skordare: p.skordare, skotare: p.skotare })
    expect(lasAppPrognos(null)).toEqual({})
    expect(lasAppPrognos({ skordare: 'x', skotare: 0 })).toEqual({})
  })
})

// En liten tabellfake: objekt, dim_objekt, fakt_tid. Loggar skrivningar.
function fake(opts: { objekt: Record<string, any> | null; dim?: string[]; tid?: boolean; utfallFel?: boolean }) {
  const skrivningar: any[] = []
  const from = (t: string) => {
    const q: any = { _t: t, _filters: [] as any[] }
    const chain = () => q
    q.select = chain; q.eq = chain; q.or = chain; q.in = chain; q.limit = chain
    q.is = (_k: string, v: any) => { q._is = v; return q }
    q.update = (p: any) => { q._update = p; return q }
    q.maybeSingle = async () => ({ data: opts.objekt, error: null })
    q.then = (res: any) => {
      let out: any
      if (t === 'dim_objekt') out = { data: (opts.dim ?? ['D1']).map(objekt_id => ({ objekt_id })), error: null }
      else if (t === 'fakt_tid') out = { data: opts.tid ? [{ id: 1 }] : [], error: null }
      else if (t === 'objekt' && q._update) {
        skrivningar.push(q._update)
        out = { data: opts.objekt?.app_prognos == null ? [{ app_prognos: q._update.app_prognos }] : [], error: null }
      } else out = { data: null, error: null }
      return Promise.resolve(out).then(res)
    }
    return q
  }
  const rpc = vi.fn(async () => (opts.utfallFel ? { data: null, error: { message: 'nej' } } : {
    data: utfall.map(u => ({ typ: u.typ, volym_objekt: u.volymObjekt, skordad_m3: u.skordadM3, stammar: u.stammar, skordare_g15: u.skordareG15, skotare_g15: u.skotareG15 })), error: null,
  }))
  return { sb: { from, rpc } as any, skrivningar, rpc }
}
const objekt = { id: 'o1', typ: 'slutavverkning', volym: 500, medelstam: null, basvag_timmar: null, app_prognos: null, vo_nummer: '123', dim_objekt_id: null }

describe('frysAppPrognos (mot fake)', () => {
  it('fryser en orörd trakt: skriver app_prognos en gång', async () => {
    const f = fake({ objekt })
    const r = await frysAppPrognos(f.sb, 'o1', { kalla: 'import', nu })
    expect(r.status).toBe('fryst')
    expect(f.skrivningar).toHaveLength(1)
    expect(f.skrivningar[0].app_prognos.skordare).toBe(Math.round(500 / 40))
    expect(f.rpc).toHaveBeenCalledWith('prognos_utfall')
  })
  it('redan fryst / inte virke / ingen volym / maskinen har börjat → hoppad, ingen skrivning', async () => {
    const fall: [Parameters<typeof fake>[0], string][] = [
      [{ objekt: { ...objekt, app_prognos: { skordare: 10 } } }, 'redan_fryst'],
      [{ objekt: { ...objekt, typ: 'grot' } }, 'inte_virke'],
      [{ objekt: { ...objekt, volym: 0 } }, 'ingen_volym'],
      [{ objekt, tid: true }, 'maskinen_har_borjat'],
    ]
    for (const [o, skal] of fall) {
      const f = fake(o)
      const r = await frysAppPrognos(f.sb, 'o1', { kalla: 'frys', utfall })
      expect(r, skal).toEqual({ status: 'hoppad', skal })
      expect(f.skrivningar).toHaveLength(0)
    }
  })
  it('ett läsfel på utfallet är ett fel, aldrig "inget förslag"', async () => {
    const f = fake({ objekt, utfallFel: true })
    const r = await frysAppPrognos(f.sb, 'o1', { kalla: 'frys' })
    expect(r.status).toBe('fel')
    expect(f.skrivningar).toHaveLength(0)
  })
  it('utan förslag (för få trakter av typen) hoppas trakten, ingen skrivning', async () => {
    const f = fake({ objekt: { ...objekt, typ: 'gallring' } })
    expect(await frysAppPrognos(f.sb, 'o1', { kalla: 'frys', utfall })).toEqual({ status: 'hoppad', skal: 'inget_forslag' })
    expect(f.skrivningar).toHaveLength(0)
  })
})
