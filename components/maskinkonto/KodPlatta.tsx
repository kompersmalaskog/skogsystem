'use client'

// Fyra prickar och sifferknappar som iPhones låsskärm. Fjärde siffran skickas direkt — ingen OK-knapp. Fel kod: prickarna skakar och töms.
// Funkar med finger, mus och tangentbord (siffror, Backspace). Används för att låsa upp maskinen och för att välja sin kod.
import { useCallback, useEffect, useRef, useState } from 'react'
import Ikon from '@/components/design/Ikon'
import { AVSTAND, FARG, RADIE, TNUM, TYP } from '@/lib/design/tokens'

export const KOD_LANGD = 4
const TANGENTER = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'sudda'] as const

export default function KodPlatta({ onFyra, skakaNyckel = 0, stangd = false, etikett }: {
  /** Anropas när fjärde siffran är tryckt. */
  onFyra: (kod: string) => void
  /** Ändras (ökas) när koden var fel: prickarna skakar och töms. Ändras också för att tömma pricken efter ett steg. */
  skakaNyckel?: number
  /** Knapparna går inte att trycka (kontrollerar / väntar). */
  stangd?: boolean
  etikett?: string
}) {
  const [kod, setKod] = useState('')
  const prickarRef = useRef<HTMLDivElement>(null)
  const kodRef = useRef('')
  kodRef.current = kod

  const tryck = useCallback((siffra: string) => {
    if (stangd) return
    const ny = (kodRef.current + siffra).slice(0, KOD_LANGD)
    setKod(ny)
    if (ny.length === KOD_LANGD) onFyra(ny)
  }, [stangd, onFyra])
  const sudda = useCallback(() => { if (!stangd) setKod(k => k.slice(0, -1)) }, [stangd])

  // Fel kod (eller nytt steg): töm och skaka.
  const forst = useRef(true)
  useEffect(() => {
    if (forst.current) { forst.current = false; return }
    setKod('')
    const el = prickarRef.current
    if (el && typeof el.animate === 'function' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-12px)' }, { transform: 'translateX(12px)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }], { duration: 350, easing: 'ease-in-out' })
    }
  }, [skakaNyckel])

  useEffect(() => {
    const t = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); tryck(e.key) }
      else if (e.key === 'Backspace') { e.preventDefault(); sudda() }
    }
    document.addEventListener('keydown', t)
    return () => document.removeEventListener('keydown', t)
  }, [tryck, sudda])

  return (
    <div data-kodplatta style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: AVSTAND.l }}>
      {etikett && <div style={{ ...TYP.meta, color: FARG.text2, textAlign: 'center' }}>{etikett}</div>}
      <div ref={prickarRef} role="status" aria-label={`${kod.length} av ${KOD_LANGD} siffror`} style={{ display: 'flex', gap: AVSTAND.l, minHeight: 20 }}>
        {Array.from({ length: KOD_LANGD }, (_, i) => (
          <span key={i} data-prick={i < kod.length ? 'full' : 'tom'} style={{
            width: 16, height: 16, borderRadius: RADIE.cirkel, boxSizing: 'border-box',
            background: i < kod.length ? FARG.text : 'transparent', border: `2px solid ${i < kod.length ? FARG.text : FARG.text3}`,
          }} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 76px)', gap: AVSTAND.m }}>
        {TANGENTER.map((t, i) => t === '' ? <span key="luft" /> : (
          <button key={t} type="button" data-tangent={t} disabled={stangd}
            aria-label={t === 'sudda' ? 'Ta bort senaste siffran' : t}
            onClick={() => (t === 'sudda' ? sudda() : tryck(t))}
            style={{
              width: 76, height: 76, borderRadius: RADIE.cirkel, border: 'none', cursor: stangd ? 'default' : 'pointer', fontFamily: 'inherit',
              background: t === 'sudda' ? 'transparent' : FARG.upphojt, color: FARG.text, ...TYP.tal, ...TNUM, opacity: stangd ? 0.4 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation',
            }}>
            {t === 'sudda' ? <Ikon namn="backspace" storlek={28} farg={FARG.text2} /> : t}
          </button>
        ))}
      </div>
    </div>
  )
}
