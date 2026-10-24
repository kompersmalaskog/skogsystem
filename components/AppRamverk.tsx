'use client'

// Appens ramverk runt varje sida: toppfält, versionskoll, startvakt, push, köerna och innehållet under toppfältet.
// UNDANTAG: besökssidan för markägaren (/besok/<token>) är öppen utan inloggning och ska inte ha något av det här — inget toppfält med hemknapp, inga köer, ingen push-registrering,
// ingen medarbetarlookup. Där renderas bara sidan själv.

import React from 'react'
import { usePathname } from 'next/navigation'
import TopBar from './TopBar'
import PushRegister from './PushRegister'
import PushNavigering from './PushNavigering'
import FotoKoStartare from './FotoKoStartare'
import MarkeringSynkStartare from './MarkeringSynkStartare'
import KartkommentarStartare from './KartkommentarStartare'
import SkotarLassStartare from './SkotarLassStartare'
import VersionChecker from './VersionChecker'
import AppStartVakt from './AppStartVakt'
import { CurrentMedarbetareProvider } from '@/lib/CurrentMedarbetareContext'
import { LAYOUT } from '@/lib/design/tokens'
import { arBesoksSida } from '@/lib/besok/offentlig'

export default function AppRamverk({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  if (arBesoksSida(pathname)) return <>{children}</>
  return (
    <>
      <TopBar />
      <VersionChecker />
      <AppStartVakt />
      <PushRegister />
      <PushNavigering />
      <FotoKoStartare />
      <MarkeringSynkStartare />
      <KartkommentarStartare />
      <SkotarLassStartare />
      <CurrentMedarbetareProvider>
        {/* Innehållet börjar under toppfältet — samma mått som TopBar (tokens LAYOUT). */}
        <div style={{ paddingTop: LAYOUT.topbar }}>
          {children}
        </div>
      </CurrentMedarbetareProvider>
    </>
  )
}
