'use client'

// Tyst fartmätning (lib/fart/fartLogg.ts). INGET ritas — förarna ska inte se något på skärmen. Mäter appstart, vybyten och sega anrop
// och skickar raderna i klump till fart_logg: var 60:e sekund och när appen läggs i bakgrunden. Ett fel gör ingenting; saknas tabellen
// (migrationen ej körd) slutar den skicka.

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { hamtaEnhetMaskin } from '@/lib/enhetMaskin'
import { anropNamn, aterlagg, enhetNamn, koLangd, laggTill, taAllt, vyNamn, BYTE_TRYCK_MAX_MS, FART_SPARA_FRAN_MS } from '@/lib/fart/fartLogg'

const SKICKA_VAR_MS = 60_000
let stoppad = false

function natText(): string | null {
  try { const c = (navigator as any).connection; return c ? `${c.effectiveType ?? '?'}${c.downlink ? ` ${c.downlink}` : ''}` : null } catch { return null }
}

export async function skickaFart(): Promise<void> {
  if (stoppad || koLangd() === 0) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  const rader = taAllt()
  try {
    const { data } = await supabase.auth.getSession()
    if (!data?.session) return   // utloggad: raderna kastas
    const enhet = enhetNamn(window.innerWidth, (navigator.maxTouchPoints ?? 0) > 0)
    const maskin = hamtaEnhetMaskin()
    const nat = natText()
    const { error } = await supabase.from('fart_logg').insert(rader.map((r) => ({ enhet, maskin_id: maskin, vy: r.vy, slag: r.slag, namn: r.namn.slice(0, 120), ms: Math.min(r.ms, 600000), nat, detalj: r.detalj ?? null })))
    if (!error) return
    if (error.code === 'PGRST205' || error.code === '42P01' || error.code === '42501') { stoppad = true; return }
    aterlagg(rader)
  } catch { aterlagg(rader) }
}

const tvaBildrutor = (fn: (t: number) => void) => requestAnimationFrame(() => requestAnimationFrame(fn))

export default function FartLoggStartare() {
  const sokvag = usePathname() ?? '/'
  const tryckRef = useRef<number | null>(null)
  const vyRef = useRef<string | null>(null)

  useEffect(() => {
    const tryck = () => { tryckRef.current = performance.now() }
    window.addEventListener('pointerdown', tryck, true)
    let obs: PerformanceObserver | null = null
    try {
      obs = new PerformanceObserver((l) => {
        for (const e of l.getEntries() as PerformanceResourceTiming[]) {
          if (e.duration < FART_SPARA_FRAN_MS) continue
          if (e.initiatorType !== 'fetch' && e.initiatorType !== 'xmlhttprequest') continue
          const namn = anropNamn(e.name, window.location.origin)
          if (namn) laggTill({ slag: 'anrop', namn, ms: e.duration, vy: vyNamn(window.location.pathname) })
        }
      })
      obs.observe({ type: 'resource', buffered: false })
    } catch { /* webbläsaren saknar mätningen */ }
    const t = setInterval(() => { void skickaFart() }, SKICKA_VAR_MS)
    const dold = () => { if (document.visibilityState === 'hidden') void skickaFart() }
    document.addEventListener('visibilitychange', dold)
    return () => { window.removeEventListener('pointerdown', tryck, true); try { obs?.disconnect() } catch { /* */ } clearInterval(t); document.removeEventListener('visibilitychange', dold) }
  }, [])

  useEffect(() => {
    const vy = vyNamn(sokvag)
    const fore = vyRef.current
    vyRef.current = vy
    if (fore === vy) return
    const tryck = tryckRef.current
    const ram = tvaBildrutor((t) => {
      // Första vyn: tiden från att sidan började laddas (performance.now() räknas därifrån). Sedan: från trycket.
      if (fore === null) { laggTill({ slag: 'sida', namn: vy, ms: t, vy }); return }
      if (tryck == null || t - tryck > BYTE_TRYCK_MAX_MS) return
      const ms = t - tryck
      if (ms >= FART_SPARA_FRAN_MS) laggTill({ slag: 'byte', namn: `${fore} → ${vy}`, ms, vy })
    })
    return () => cancelAnimationFrame(ram)
  }, [sokvag])

  return null
}
