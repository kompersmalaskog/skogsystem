'use client'

// Förhandsvisning av en PDF innan den delas — en helskärmspanel under toppfältet (underTopbar()), som appens andra helskärmspaneler.
// PDF:en skapas när panelen öppnas (pdf-lib, några hundra ms) och visas som bilder: VARJE sida renderas med pdf.js till en canvas som fyller
// bredden, under varandra (förut bara sida 1 — markägarrapportens karta och egenkontrollens bilaga syntes aldrig).
// Varför canvas och inte <iframe src=blob:>: iOS i installerad PWA visar PDF i iframe som bara första sidan eller ingenting, och appen har redan
// gett upp den vägen (PdfLasare i planeringen renderar likadant, med samma pdfjs-dist och samma worker, av samma skäl). Ingen blob-URL skapas för
// visningen, så det finns inget att återkalla; delningen använder den riktiga filen (Web Share med fil, annars nedladdning — delaFil).
// Toppfält: bakåt vänster, "Dela" höger. Esc stänger också.
import { useEffect, useRef, useState } from 'react'
import type * as PdfjsTypes from 'pdfjs-dist'
import { AVSTAND, FARG, IKON, INAKTIV, KNAPP, TRAFFYTA, TYP, designCss, underTopbar } from '@/lib/design/tokens'
import Tillstand from '@/components/design/Tillstand'
import { delaFil } from '../_lib/veckolageDela'
import Ikon from '@/components/design/Ikon'

type Status = 'skapar' | 'klar' | 'kan_inte_visa' | 'fel'

// iOS Safari < 17.4 saknar Promise.withResolvers, som pdf.js kan referera (samma skydd som PdfLasare).
function sakraPromiseWithResolvers() {
  const P = Promise as unknown as { withResolvers?: unknown }
  if (typeof P.withResolvers !== 'function') {
    ;(P as { withResolvers: unknown }).withResolvers = function <T>() {
      let resolve!: (v: T | PromiseLike<T>) => void
      let reject!: (r?: unknown) => void
      const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
      return { promise, resolve, reject }
    }
  }
}

export default function PdfForhandsvisning({ skapa, filnamn, titel, onStang }: {
  /** Skapar PDF:en. Anropas en gång när panelen öppnas (och vid "Försök igen"). */
  skapa: () => Promise<Uint8Array>
  /** Filnamn utan ändelse ("manadsfacit-2026-09"). */
  filnamn: string
  /** Titeln i delaarket. */
  titel: string
  onStang: () => void
}) {
  const [status, setStatus] = useState<Status>('skapar')
  const [version, setVersion] = useState(0)
  const [delar, setDelar] = useState(false)
  const bytesRef = useRef<Uint8Array | null>(null)
  const ytaRef = useRef<HTMLDivElement>(null)
  const sidorRef = useRef<HTMLDivElement>(null)

  // Esc stänger.
  useEffect(() => {
    const vidTangent = (e: KeyboardEvent) => { if (e.key === 'Escape') onStang() }
    window.addEventListener('keydown', vidTangent)
    return () => window.removeEventListener('keydown', vidTangent)
  }, [onStang])

  // Skapa PDF:en, rendera sidan.
  useEffect(() => {
    let avbruten = false
    let doc: { destroy: () => unknown } | null = null
    bytesRef.current = null
    setStatus('skapar')
    ;(async () => {
      let bytes: Uint8Array
      try {
        bytes = await skapa()
      } catch (e) {
        console.error('[PdfForhandsvisning] kunde inte skapa PDF', e)
        if (!avbruten) setStatus('fel')
        return
      }
      if (avbruten) return
      bytesRef.current = bytes
      try {
        sakraPromiseWithResolvers()
        const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as typeof PdfjsTypes
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        // pdf.js skickar bufferten till sin worker (och tömmer den): ge den en kopia, filen vi delar ska vara hel.
        const laddad = await pdfjs.getDocument({ data: bytes.slice() }).promise
        doc = laddad
        if (avbruten) return
        const sidor = sidorRef.current
        const yta = ytaRef.current
        if (!sidor || !yta) throw new Error('Ingen yta')
        sidor.replaceChildren()
        const antal = Math.max(1, (laddad as { numPages?: number }).numPages ?? 1)
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        for (let nr = 1; nr <= antal; nr++) {
          if (avbruten) return
          const sida = await laddad.getPage(nr)
          const canvas = document.createElement('canvas')
          canvas.setAttribute('aria-label', `Sida ${nr} av ${antal}`)
          canvas.style.cssText = `display:block;width:100%;height:auto;background:${FARG.text}`
          if (nr > 1) canvas.style.marginTop = `${AVSTAND.s}px`
          const ctx = canvas.getContext('2d')
          if (!ctx) throw new Error('Ingen canvas')
          const bas = sida.getViewport({ scale: 1 })
          const cssBredd = yta.clientWidth || bas.width
          const vy = sida.getViewport({ scale: (cssBredd / bas.width) * dpr })
          canvas.width = Math.floor(vy.width)
          canvas.height = Math.floor(vy.height)
          sidor.appendChild(canvas)
          await sida.render({ canvasContext: ctx, viewport: vy }).promise
        }
        if (!avbruten) setStatus('klar')
      } catch (e) {
        // PDF:en finns och går att dela, men sidan gick inte att visa.
        console.error('[PdfForhandsvisning] kunde inte rendera', e)
        if (!avbruten) setStatus('kan_inte_visa')
      }
    })()
    return () => {
      avbruten = true
      if (doc) { try { void doc.destroy() } catch { /* ignoreras */ } }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version])

  const kanDela = (status === 'klar' || status === 'kan_inte_visa') && !delar
  async function dela() {
    const bytes = bytesRef.current
    if (!bytes || delar) return
    setDelar(true)
    try {
      const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' })
      await delaFil(blob, `${filnamn}.pdf`, titel)
    } catch (e) {
      console.error('[PdfForhandsvisning] dela misslyckades', e)
    } finally {
      setDelar(false)
    }
  }

  const tillstand = status === 'skapar'
    ? <Mitt><span style={{ ...TYP.text, color: FARG.text2 }}>Skapar PDF…</span></Mitt>
    : status === 'fel'
      ? (
        <Mitt>
          <div style={{ ...TYP.listtitel, color: FARG.text }}>Kunde inte skapa PDF:en</div>
          <button type="button" onClick={() => setVersion(v => v + 1)} style={{ ...KNAPP.sekundar, width: 'auto', padding: `0 ${AVSTAND.xl}px` }}>Försök igen</button>
        </Mitt>
      )
      : status === 'kan_inte_visa'
        ? (
          <Mitt>
            <div style={{ ...TYP.listtitel, color: FARG.text }}>Kan inte visa sidan här</div>
            <div style={{ ...TYP.meta, color: FARG.text2 }}>PDF:en är klar och går att dela.</div>
          </Mitt>
        )
        : null

  return (
    <div
      role="dialog"
      aria-label="Förhandsvisning av PDF"
      style={{ position: 'fixed', top: underTopbar(), left: 0, right: 0, bottom: 0, zIndex: 40, display: 'flex', flexDirection: 'column', background: FARG.bg, color: FARG.text }}
    >
      <style>{designCss}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `0 ${AVSTAND.s}px`, minHeight: TRAFFYTA.min, borderBottom: `1px solid ${FARG.linje}`, flexShrink: 0 }}>
        <button
          type="button"
          aria-label="Tillbaka"
          onClick={onStang}
          style={{ width: TRAFFYTA.min, height: TRAFFYTA.min, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          <Ikon namn="chevron_left" storlek={IKON.rad} farg={FARG.bla} />
        </button>
        <button
          type="button"
          onClick={dela}
          disabled={!kanDela}
          aria-busy={delar}
          style={{ ...KNAPP.lank, padding: `0 ${AVSTAND.s}px`, ...(kanDela ? null : INAKTIV) }}
        >
          Dela
        </button>
      </div>

      {/* Sidorna: en vit canvas per sida som fyller bredden, scroll genom alla. */}
      <div ref={ytaRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', position: 'relative' }}>
        <div ref={sidorRef} data-pdf-sidor="" style={{ display: status === 'klar' ? 'block' : 'none' }} />
        <Tillstand nyckel={status === 'klar' ? 'klar' : status}>{tillstand}</Tillstand>
      </div>
    </div>
  )
}

function Mitt({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: AVSTAND.m, textAlign: 'center', padding: `${AVSTAND.xxl}px ${AVSTAND.l}px` }}>
      {children}
    </div>
  )
}
