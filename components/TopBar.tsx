'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const pageNames: Record<string, string> = {
  '/': 'Kompersmåla Skog',
  '/uppfoljning': 'Uppföljning',
  '/maskinvy': 'Maskinvy',
  '/arbetsrapport': 'Arbetsrapport',
  '/starta-jobb': 'Starta jobb',
  '/planering': 'Planering',
  '/planner': 'Planner',
  '/objekt': 'Objekt',
  '/karta': 'Karta',
  '/oversikt': 'Översikt',
  '/redigering': 'Redigering',
  '/kalibrering': 'Kalibrering',
  '/bestallningar': 'Beställningar',
  '/helikopter': 'Helikopter',
  '/forbattringsforslag': 'Förslag',
}

export default function TopBar() {
  const pathname = usePathname()
  const isHome = pathname === '/'
  const pageName = pageNames[pathname] || pathname.replace('/', '').charAt(0).toUpperCase() + pathname.slice(2)

  if (isHome) return null

  return (
    <header style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      height: 56,
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
      {/* Hem-knapp */}
      {!isHome ? (
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
      <span style={{
        fontSize: 16,
        fontWeight: 600,
        color: '#fff',
        letterSpacing: -0.3,
      }}>
        {pageName}
      </span>
    </header>
  )
}
