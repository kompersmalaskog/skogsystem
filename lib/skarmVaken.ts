// Håller skärmen vaken (Screen Wake Lock) medan körvyn är öppen — en iPad/maskindator får aldrig slockna mitt i en lossning.
// Webbläsaren SLÄPPER låset av sig själv (dold sida, strömsparläge) — då begärs det om DIREKT, inte först vid nästa visibilitychange.
// En begäran som nekats prövas igen var 10:e sekund. Saknas API:t är det en tyst no-op. Ren logik utan React.
export const OMBEGAR_MS = 10_000

type LasLike = { release?: () => Promise<void>; addEventListener?: (t: 'release', f: () => void) => void }
export type SkarmVakenDeps = {
  begar: () => Promise<LasLike | undefined | null> | undefined
  synlig: () => boolean
}
export type SkarmVaken = { stopp: () => void; taNu: () => void }

export function hallSkarmenVaken(deps: SkarmVakenDeps): SkarmVaken {
  let aktiv = true
  let lock: LasLike | null = null
  let begar = false

  const ta = async () => {
    if (!aktiv || lock || begar || !deps.synlig()) return
    begar = true
    try {
      const l = await deps.begar()
      if (!l) return
      if (!aktiv || !deps.synlig()) { l.release?.().catch(() => {}); return }
      lock = l
      l.addEventListener?.('release', () => { if (lock === l) { lock = null; void ta() } })
    } catch { /* ej stött / nekat → prövas igen vid nästa tick */ }
    finally { begar = false }
  }

  void ta()
  const iv = setInterval(() => { void ta() }, OMBEGAR_MS)
  return {
    taNu: () => { void ta() },
    stopp: () => {
      aktiv = false
      clearInterval(iv)
      const l = lock; lock = null
      l?.release?.().catch(() => {})
    },
  }
}

/** Webbläsarbindningen: begär låset nu, igen så fort det släpps och direkt när sidan blir synlig. Returnerar stopp-funktionen. */
export function hallSkarmenVakenIWebblasare(): () => void {
  if (typeof document === 'undefined' || typeof navigator === 'undefined') return () => {}
  const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<LasLike> } }
  const v = hallSkarmenVaken({
    begar: () => nav.wakeLock?.request('screen'),
    synlig: () => document.visibilityState === 'visible',
  })
  const onVisible = () => { if (document.visibilityState === 'visible') v.taNu() }
  document.addEventListener('visibilitychange', onVisible)
  return () => { document.removeEventListener('visibilitychange', onVisible); v.stopp() }
}
