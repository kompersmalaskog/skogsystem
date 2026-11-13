'use client'

// Appens ramverk runt varje sida: toppfält, versionskoll, startvakt, push, köerna och innehållet under toppfältet.
// UNDANTAG: besökssidan för markägaren (/besok/<token>) är öppen utan inloggning och ska inte ha något av det här — inget toppfält med hemknapp, inga köer, ingen push-registrering,
// ingen medarbetarlookup. Där renderas bara sidan själv. Samma för skotarlänken (/skotare/<token>, en extern skotare).

import React, { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import TopBar from './TopBar'
import PushRegister from './PushRegister'
import PushNavigering from './PushNavigering'
import FotoKoStartare from './FotoKoStartare'
import MarkeringSynkStartare from './MarkeringSynkStartare'
import KartkommentarStartare from './KartkommentarStartare'
import SkotarLassStartare from './SkotarLassStartare'
import NodStartare from './NodStartare'
import FartLoggStartare from './FartLoggStartare'
import VersionChecker from './VersionChecker'
import AppStartVakt from './AppStartVakt'
import { CurrentMedarbetareProvider } from '@/lib/CurrentMedarbetareContext'
import { LAYOUT } from '@/lib/design/tokens'
import { arBesoksSida } from '@/lib/besok/offentlig'
import { arSkotarSida } from '@/lib/skotarlank/offentlig'
import { arInbaddad, meddelandeForSokvag, sagTillKartan } from '@/lib/inbaddad'

export default function AppRamverk({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  // I MASKINEN ligger vyn i en ruta ovanpå kartan (lib/inbaddad). Där ska den aldrig starta om appen, fråga om push eller ladda en andra karta:
  // hamnar den på startsidan eller kartan säger den till kartan under sig i stället.
  const [inbaddad] = useState(() => arInbaddad())
  useEffect(() => {
    if (!inbaddad) return
    const m = meddelandeForSokvag(pathname, typeof window !== 'undefined' ? window.location.search : '')
    if (m) sagTillKartan(m)
  }, [inbaddad, pathname])
  if (arBesoksSida(pathname)) return <>{children}</>
  if (arSkotarSida(pathname)) return <>{children}</>
  return (
    <>
      <TopBar />
      {!inbaddad && <VersionChecker />}
      {!inbaddad && <AppStartVakt />}
      {!inbaddad && <PushRegister />}
      {!inbaddad && <PushNavigering />}
      <FotoKoStartare />
      <MarkeringSynkStartare />
      <KartkommentarStartare />
      <SkotarLassStartare />
      {!inbaddad && <NodStartare />}
      <FartLoggStartare />
      <CurrentMedarbetareProvider>
        {/* Innehållet börjar under toppfältet — samma mått som TopBar (tokens LAYOUT). */}
        <div style={{ paddingTop: LAYOUT.topbar }}>
          {children}
        </div>
      </CurrentMedarbetareProvider>
    </>
  )
}
