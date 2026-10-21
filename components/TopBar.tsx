'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { CURRENT_VERSION } from '@/lib/changelog'
import { LAYOUT, TRAFFYTA } from '@/lib/design/tokens' // toppfältets höjd bor BARA i tokens

const pageNames: Record<string, string> = {
  '/': 'Kompersmåla Skog',
  '/uppfoljning': 'Uppföljning',
  '/maskinvy': 'Maskinvy',
  '/arbetsrapport': 'Arbetsrapport',
  '/planera': 'Planera',
  '/starta-jobb': 'Starta jobb',
  '/planering': 'Planering',
  '/objekt': 'Objekt',
  '/oversikt': 'Översikt',
  '/redigering': 'Redigering',
  '/kalibrering': 'Kalibrering',
  '/bestallningar': 'Beställningar',
  '/helikopter': 'Helikopter',
  '/helikopter-v2': 'Helikopter v2',
  '/helikopter/veckor': 'Veckor',
  '/forbattringsforslag': 'Förslag',
  '/maskin-service': 'Maskinservice',
  '/datahalsa': 'Datahälsa',
  '/utbildning': 'Utbildning',
  '/utbildning/katalog': 'Katalog',
  '/egenkontroll': 'Egenkontroll',
  '/gallring': 'Gallring',
  '/matning': 'Mätning',
  '/affarsuppfoljning': 'Affärsuppföljning',
  '/kontroller': 'Kontroller',
  '/maskinflytt/platser': 'Flyttplatser',
  '/lastbil': 'Lastbilen',
  '/inventarier': 'Inventarier',
  '/avtal': 'Avtal & Abonnemang',
  '/personal': 'Personal',
  '/om': 'Om appen',
}

export default function TopBar() {
  const pathname = usePathname()
  const isHome = pathname === '/'
  const pageName = pageNames[pathname]
    || (pathname.startsWith('/objekt/') ? 'Objekt'
    : pathname.startsWith('/affarsuppfoljning/') ? 'Affärsuppföljning'
    : pathname.startsWith('/gallring/') ? 'Gallring'
    // /utbildning/typ/<id> och /utbildning/person/<id>: sidans EGEN etikett säger
    // vilken utbildning eller person det gäller — toppfältet säger bara var man är.
    : pathname.startsWith('/utbildning/') ? 'Utbildning'
    : pathname.startsWith('/maskin-service/') ? 'Maskinservice'
    // /inventarier/plats/<id>: platsens namn står i sidan, toppfältet säger bara var man är.
    : pathname.startsWith('/inventarier/') ? 'Inventarier'
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
  // Planeringsvyn har egen minimal header (hem + objekt-pill + nödprick). /maskin är SAMMA vy i maskinläge
  // ("Öppna som maskin") — utan den här raden ritades ett "Maskin v1.0.0"-fält ovanpå kartan.
  if (pathname === '/planering' || pathname === '/maskin') return null
  // Rundvyn (/egenkontroll/<objekt>) har ett eget huvud (KartHuvud: pil, objektnamn, antal kvar) — kartan ska ha hela skärmen och
  // "var är jag" ska stå på ETT ställe. Listan /egenkontroll (utan id) behåller toppfältet.
  if (pathname.startsWith('/egenkontroll/')) return null

  return (
    <header style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      height: LAYOUT.topbar,
      paddingTop: LAYOUT.safeTopp,
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
          // Träffytan är appens minimiyta (44 px); den synliga rutan (36 px, vänsterkant 12 px) ligger centrerad i den och ser ut som förut.
          position: 'absolute',
          left: 12 - (TRAFFYTA.min - 36) / 2,
          width: TRAFFYTA.min,
          height: TRAFFYTA.min,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textDecoration: 'none',
        }}>
          <span style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'rgba(255,255,255,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(255,255,255,0.7)',
            fontSize: 20,
            lineHeight: 1,
          }}>
            <img src="/home-icon.png" alt="Hem" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover' }} />
          </span>
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
