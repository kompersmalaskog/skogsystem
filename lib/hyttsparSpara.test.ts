import { describe, it, expect, vi } from 'vitest'
import { sparaHyttsparSession, nollstallHyttspar, type HyttsparRefs, type HyttsparPunkt } from './hyttsparSpara'

const p = (i: number): HyttsparPunkt => ({ lat: 56 + i * 0.0001, lng: 15, tid: `2026-11-16T07:00:${String(i).padStart(2, '0')}Z` })
const refs = (o: Partial<Record<keyof HyttsparRefs, any>> = {}): HyttsparRefs => ({
  rowId: { current: o.rowId ?? 'rad-A' }, points: { current: o.points ?? [p(0), p(1), p(2)] }, lastFix: { current: { lat: 56, lon: 15, ts: 1 } },
  datum: { current: '2026-11-16' }, ctx: { current: o.ctx ?? { objektId: 'A' } }, initKlar: { current: true }, synced: { current: o.synced ?? 1 }, dirty: { current: true },
})
const tunna = (x: HyttsparPunkt[]) => x
/** En databas vars svar kommer först när testet släpper dem — som en server på 4G. */
function tregDb(appendFel: any = null) {
  const slapp: (() => void)[] = []
  const vanta = <T,>(v: T) => new Promise<T>((res) => slapp.push(() => res(v)))
  const rpc = vi.fn((_n: string, _a: any) => vanta({ error: appendFel }))
  const eq = vi.fn((_k: string, _v: any) => vanta({ error: null }))
  const update = vi.fn((_v: any) => ({ eq }))
  return { db: { rpc, from: () => ({ update }) }, rpc, update, eq, slappAllt: async () => { for (let i = 0; i < 10; i++) { slapp.splice(0).forEach((f) => f()); await Promise.resolve(); await Promise.resolve() } } }
}

describe('objektbyte: avslutet av det gamla spåret rör aldrig det nya', () => {
  it('nya loggningen startar medan avslutet väntar på servern — den står kvar när svaret kommer (Martin 15 nov, Oskar 16 nov)', async () => {
    const r = refs()
    const { db, rpc, eq, slappAllt } = tregDb()
    const klar = sparaHyttsparSession(r, db as any, true, tunna)   // städningen i effekten (objekt A stängs)
    // … och i samma ögonblick startar effekten för objekt B:
    const ctxB = { objektId: 'B' }
    r.ctx.current = ctxB; r.datum.current = '2026-11-16'; r.initKlar.current = true; r.rowId.current = 'rad-B'; r.points.current = [p(7)]; r.synced.current = 1
    await slappAllt(); await klar
    expect(r.ctx.current).toBe(ctxB)
    expect(r.initKlar.current).toBe(true)
    expect(r.rowId.current).toBe('rad-B')
    expect(r.points.current).toEqual([p(7)])
    expect(r.synced.current).toBe(1)
    // det gamla spåret sparades och stängdes på SIN rad
    expect(rpc).toHaveBeenCalledWith('hyttspar_append', { p_id: 'rad-A', p_punkter: [p(1), p(2)] })
    expect(eq).toHaveBeenCalledWith('id', 'rad-A')
  })

  it('avslutet nollställer direkt, före första svaret från servern', () => {
    const r = refs()
    const { db } = tregDb()
    void sparaHyttsparSession(r, db as any, true, tunna)
    expect(r.ctx.current).toBeNull()
    expect(r.rowId.current).toBeNull()
    expect(r.initKlar.current).toBe(false)
    expect(r.points.current).toEqual([])
  })

  it('en mellansparning som är på väg när trakten byts flyttar inte fram det NYA spårets räknare', async () => {
    const r = refs()
    const { db, slappAllt } = tregDb()
    const klar = sparaHyttsparSession(r, db as any, false, tunna)
    nollstallHyttspar(r)
    r.ctx.current = { objektId: 'B' }; r.rowId.current = 'rad-B'; r.points.current = [p(5), p(6)]; r.synced.current = 0; r.dirty.current = true
    await slappAllt(); await klar
    expect(r.synced.current).toBe(0)     // annars hoppas B:s två första punkter över
    expect(r.dirty.current).toBe(true)
  })
})

describe('vanlig sparning', () => {
  it('lyckad mellansparning: räknaren flyttas fram, loggningen står kvar', async () => {
    const r = refs()
    const { db, rpc, update, slappAllt } = tregDb()
    const klar = sparaHyttsparSession(r, db as any, false, tunna)
    await slappAllt(); await klar
    expect(r.synced.current).toBe(3)
    expect(r.rowId.current).toBe('rad-A')
    expect(r.dirty.current).toBe(false)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(update).not.toHaveBeenCalled()
  })

  it('misslyckad mellansparning: räknaren står kvar så punkterna skickas igen', async () => {
    const r = refs()
    const { db, slappAllt } = tregDb({ message: 'nät' })
    const klar = sparaHyttsparSession(r, db as any, false, tunna)
    await slappAllt(); await klar
    expect(r.synced.current).toBe(1)
  })

  it('inget nytt att skicka: inget anrop', async () => {
    const r = refs({ synced: 3 })
    const { db, rpc } = tregDb()
    await sparaHyttsparSession(r, db as any, false, tunna)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('avslut utan rad (öppnat och stängt utan GPS-punkt): nollställer, skriver ingenting', async () => {
    const r = refs({ rowId: null }); r.rowId.current = null
    const { db, rpc, update } = tregDb()
    await sparaHyttsparSession(r, db as any, true, tunna)
    expect(r.ctx.current).toBeNull()
    expect(rpc).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled()
  })
})

describe('källvakt: planeringssidan', () => {
  it('sparar via sparaHyttsparSession och avslutar aldrig spåret en andra gång efter en avbruten start', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('app/planering/page.tsx', 'utf8')
    expect(src).toContain('await sparaHyttsparSession(hyttsparRefs,')
    expect(src).not.toMatch(/if \(avbruten\) \{ sparaHyttspar\(true\)/)
    // de asynkrona delarna skriver inte i minnet när loggningen bytts under tiden
    expect((src.match(/if \(hyttsparCtxRef\.current !== ctx\) return;/g) ?? []).length).toBeGreaterThanOrEqual(5)
  })
})
