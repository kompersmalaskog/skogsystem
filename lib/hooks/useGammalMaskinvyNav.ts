'use client'
import { useCallback } from 'react'
import {
  lasOffset, lasPeriod, navParam, offsetAndring, periodAndring, skrivNavigering, useNavSok,
  type PeriodTyp,
} from '@/lib/maskinvy/historik'

/**
 * Navigeringstillståndet i den GAMLA maskinvyn (maskinvy.tsx = Skördare, skotare.tsx = Skotare), ur adressen i stället för useState
 * (se lib/maskinvy/historik.ts). Samma regler som nya vyn:
 *   flik (idag/oversikt/produktion/avbrott/analys/jamfor) och maskin → push   (backa = föregående flik / maskin)
 *   period (V/M/K/Å) och månadspilarna                             → replace (backa blir inte ett tjat genom varje månadsklick)
 * Standardvärdet skrivs som "ingen parameter", så adressen är densamma oavsett väg dit. En okänd flik i adressen = standardfliken
 * (jamfor finns bara hos skördaren, och en gammal adress ska aldrig ge en blank sida).
 */
export function useGammalMaskinvyNav(opts: {
  /** vilken parameter maskinen bor i: skördaren och skotaren har var sin (de delar adress i page.tsx) */
  maskinParam: 'skordare' | 'skotare'
  giltigaVyer: readonly string[]
  standardVy: string
}) {
  const { maskinParam, giltigaVyer, standardVy } = opts
  const sok = useNavSok()

  const vyParam = navParam(sok, 'vy')
  const activeView = vyParam && giltigaVyer.includes(vyParam) ? vyParam : standardVy
  const setActiveView = useCallback((v: string) => {
    if (v === activeView) return
    skrivNavigering({ vy: v === standardVy ? null : v }, 'push')
  }, [activeView, standardVy])

  const maskinId = navParam(sok, maskinParam)
  /** Byt maskin. `forstaId` = listans första (standardmaskinen). Redan vald maskin = ingen post. */
  const valjMaskin = useCallback((id: string, forstaId: string | undefined, valdId: string | undefined) => {
    if (id === valdId) return
    skrivNavigering({ [maskinParam]: id === forstaId ? null : id }, 'push')
  }, [maskinParam])

  const period: PeriodTyp = lasPeriod(sok)
  const periodOffset = lasOffset(sok)
  const setPeriodOffset = useCallback((f: number | ((o: number) => number)) => {
    // Läs värdet nu, inte ur renderingen: två snabba tryck på pilen får inte räkna från samma gamla värde.
    const nu = lasOffset(window.location.search)
    const nytt = typeof f === 'function' ? f(nu) : f
    skrivNavigering(offsetAndring(nytt), 'replace')
  }, [])
  /** Period och steg i ETT skrivande (ett tryck på V/M/K/Å nollar steget). */
  const valjPeriod = useCallback((p: PeriodTyp) => { skrivNavigering(periodAndring(p), 'replace') }, [])

  return { sok, activeView, setActiveView, maskinId, valjMaskin, period, periodOffset, setPeriodOffset, valjPeriod }
}
