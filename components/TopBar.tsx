'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { CURRENT_VERSION } from '@/lib/changelog'

const pageNames: Record<string, string> = {
  '/': 'Kompersmåla Skog',
  '/uppfoljning': 'Uppföljning',
  '/maskinvy': 'Maskinvy',
  '/arbetsrapport': 'Arbetsrapport',
  '/starta-jobb': 'Starta jobb',
  '/planering': 'Planering',
  '/objekt': 'Objekt',
  '/oversikt': 'Översikt',
  '/redigering': 'Redigering',
  '/kalibrering': 'Kalibrering',
  '/bestallningar': 'Beställningar',
  '/helikopter': 'Helikopter',
  '/forbattringsforslag': 'Förslag',
  '/maskin-service': 'Maskinservice',
  '/datahalsa': 'Datahälsa',
  '/utbildning': 'Utbildning',
  '/fordonsoversikt': 'Fordonsöversikt',
  '/maskinflytt': 'Maskinflytt',
  '/maskinflytt/sammanstallning': 'Flyttlogg',
  '/avtal': 'Avtal & Abonnemang',
  '/personal': 'Personal',
  '/om': 'Om appen',
}

export default function TopBar() {
  const pathname = usePathname()
  const isHome = pathname === '/'
  const pageName = pageNames[pathname]
    || (pathname.startsWith('/maskin-service/') ? 'Maskinservice'
    : pathname.startsWith('/admin/markagarrapport') ? 'Markägarrapport'
    : pathname.replace('/', '').charAt(0).toUpperCase() + pathname.slice(2))

  // Undersida-vyer (t.ex. Arbetsrapport-interna steg) sätter body[data-hide-home]
  // för att dölja hemknappen när de har egen bakåt-navigation.
  const [hideHome, setHideHome] = useState(false)
  useEffect(() => {
    if (typeof document === 'undefined') return
    const check = () => setHideHome(document.body.hasAttribute('data-hide-home'))
    check()
    const mo = new MutationObserver(check)
    mo.observe(document.body, { attributes: true, attributeFilter: ['data-hide-home'] })
    return () => mo.disconnect()
  }, [])

  if (isHome) return null
  // Planeringsvyn har egen minimal header (hem + objekt-pill + nödprick)
  if (pathname === '/planering') return null

  return (
    <header style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      height: 'calc(56px + env(safe-area-inset-top))',
      paddingTop: 'env(safe-area-inset-top)',
      background: 'rgba(13,13,15,0.92)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif",
    }}>
      {/* Hem-knapp — dold när underliggande vy har egen bakåtpil */}
      {!isHome && !hideHome ? (
        <Link href="/" style={{
          position: 'absolute',
          left: 12,
          width: 36,
          height: 36,
          borderRadius: 10,
          background: 'rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textDecoration: 'none',
          color: 'rgba(255,255,255,0.7)',
          fontSize: 20,
          lineHeight: 1,
        }}>
          <img src="/home-icon.png" alt="Hem" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover' }} />
        </Link>
      ) : null}

      {/* Sidnamn */}
      <span id="topbar-title" style={{
        fontSize: 16,
        fontWeight: 600,
        color: '#fff',
        letterSpacing: -0.3,
      }}>
        {pageName}
      </span>

      {/* Version-tagg nere t.h. — läsbar version (från changelog[0], samma källa som /om)
          stort, git-SHA mindre under för felsökning/fälttest. Dold på / och /planering. */}
      <span aria-hidden="true" style={{
        position: 'absolute',
        right: 12,
        bottom: 4,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        lineHeight: 1.1,
        pointerEvents: 'none',
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.2 }}>
          v{CURRENT_VERSION}
        </span>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.26)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', letterSpacing: 0.2 }}>
          {(process.env.NEXT_PUBLIC_BUILD_SHA || 'dev').slice(0, 7)}
        </span>
      </span>
    </header>
  )
}
