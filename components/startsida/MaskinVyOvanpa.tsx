'use client'

// En vy OVANPÅ kartan i maskinen (lib/inbaddad.ts): Arbetsrapporten, Uppföljningen m.fl. öppnas i en ruta över hela skärmen medan kartan
// ligger kvar under — körspåret loggas och larmen går som vanligt. Hemknappen i vyn stänger rutan (appens låda ligger kvar under den),
// och en länk till kartan stänger både rutan och lådan.

import { useEffect, useRef } from 'react'
import { FARG } from '@/lib/design/tokens'
import { tolkaMeddelande } from '@/lib/inbaddad'

/** Över appens låda (1500) och ark (1600). */
export const VY_OVANPA_Z = 1700

export default function MaskinVyOvanpa({ href, onHem, onKarta }: {
  href: string
  /** Hemknappen i vyn: tillbaka till appens låda. */
  onHem: () => void
  /** Vyn ville till kartan (adressen den bad om). */
  onKarta: (href: string) => void
}) {
  const ruta = useRef<HTMLIFrameElement | null>(null)
  const hem = useRef(onHem); hem.current = onHem
  const karta = useRef(onKarta); karta.current = onKarta
  useEffect(() => {
    const ta = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== ruta.current?.contentWindow) return
      const m = tolkaMeddelande(e.data)
      if (!m) return
      if (m.typ === 'hem') hem.current(); else karta.current(m.href)
    }
    window.addEventListener('message', ta)
    return () => window.removeEventListener('message', ta)
  }, [])
  return (
    <div data-testid="maskin-vy-ovanpa" style={{ position: 'fixed', inset: 0, zIndex: VY_OVANPA_Z, background: FARG.bg }}>
      <iframe ref={ruta} src={href} title="Vy" allow="geolocation; camera; microphone; clipboard-write"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', background: FARG.bg }} />
    </div>
  )
}
