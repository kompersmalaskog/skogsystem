import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { hallSkarmenVaken, OMBEGAR_MS } from './skarmVaken'

function lasFabrik() {
  const las: { slappt: boolean; onRelease: (() => void) | null; release: () => Promise<void>; addEventListener: (t: 'release', f: () => void) => void }[] = []
  const begar = vi.fn(async () => {
    const l = {
      slappt: false, onRelease: null as (() => void) | null,
      release: async () => { l.slappt = true },
      addEventListener: (_t: 'release', f: () => void) => { l.onRelease = f },
    }
    las.push(l)
    return l
  })
  return { las, begar }
}

describe('hallSkarmenVaken', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('begär låset direkt och släpper det vid stopp', async () => {
    const f = lasFabrik()
    const v = hallSkarmenVaken({ begar: f.begar, synlig: () => true })
    await vi.advanceTimersByTimeAsync(0)
    expect(f.begar).toHaveBeenCalledTimes(1)
    v.stopp()
    await vi.advanceTimersByTimeAsync(0)
    expect(f.las[0].slappt).toBe(true)
  })

  it('återtar DIREKT när webbläsaren släpper låset (inte först vid nästa tick)', async () => {
    const f = lasFabrik()
    const v = hallSkarmenVaken({ begar: f.begar, synlig: () => true })
    await vi.advanceTimersByTimeAsync(0)
    f.las[0].onRelease!()
    await vi.advanceTimersByTimeAsync(0)
    expect(f.begar).toHaveBeenCalledTimes(2)
    v.stopp()
  })

  it('en nekad begäran prövas igen efter OMBEGAR_MS', async () => {
    let nekar = true
    const f = lasFabrik()
    const begar = vi.fn(async () => { if (nekar) throw new Error('NotAllowed'); return f.begar() })
    const v = hallSkarmenVaken({ begar, synlig: () => true })
    await vi.advanceTimersByTimeAsync(0)
    expect(begar).toHaveBeenCalledTimes(1)
    nekar = false
    await vi.advanceTimersByTimeAsync(OMBEGAR_MS)
    expect(f.las.length).toBe(1)
    v.stopp()
  })

  it('begär inget medan sidan är dold, men direkt via taNu när den blir synlig', async () => {
    let synlig = false
    const f = lasFabrik()
    const v = hallSkarmenVaken({ begar: f.begar, synlig: () => synlig })
    await vi.advanceTimersByTimeAsync(0)
    expect(f.begar).not.toHaveBeenCalled()
    synlig = true; v.taNu()
    await vi.advanceTimersByTimeAsync(0)
    expect(f.begar).toHaveBeenCalledTimes(1)
    v.stopp()
  })

  it('släpper ett lås som kom efter stopp', async () => {
    let los: (l: any) => void = () => {}
    const begar = vi.fn(() => new Promise<any>((r) => { los = r }))
    const v = hallSkarmenVaken({ begar, synlig: () => true })
    v.stopp()
    const l = { release: vi.fn(async () => {}), addEventListener: vi.fn() }
    los(l)
    await vi.advanceTimersByTimeAsync(0)
    expect(l.release).toHaveBeenCalled()
  })

  it('saknas API:t är det en tyst no-op', async () => {
    const v = hallSkarmenVaken({ begar: () => undefined, synlig: () => true })
    await vi.advanceTimersByTimeAsync(OMBEGAR_MS * 2)
    expect(() => v.stopp()).not.toThrow()
  })
})
