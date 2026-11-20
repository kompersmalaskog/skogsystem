'use client'

// Hämtar "räcker månaden?" (helikopter_ny_klar) för Planering och Månadsplan. Gamla data står kvar medan en ny hämtning pågår
// (efter "byt maskin" blinkar inget), ett fel visas som fel — aldrig som en tom plan.
import { useCallback, useEffect, useRef, useState } from 'react'
import { hamtaKlar } from './queries'
import type { KlarData } from './klar'

export function useKlar(ar: number, manad: number, idag: string, aktiv = true) {
  const [data, setData] = useState<KlarData | null>(null)
  const [fel, setFel] = useState<string | null>(null)
  const [laddar, setLaddar] = useState(aktiv)
  const lopnr = useRef(0)

  const ladda = useCallback(async () => {
    const mitt = ++lopnr.current
    setFel(null)
    const r = await hamtaKlar(ar, manad, idag)
    if (mitt !== lopnr.current) return // en nyare hämtning har tagit över
    if (r.error) {
      setFel(r.error)
      setData(null)
    } else {
      setData(r.data)
    }
    setLaddar(false)
  }, [ar, manad, idag])

  useEffect(() => {
    if (!aktiv) return
    setLaddar(true)
    setData(null)
    void ladda()
    return () => { lopnr.current++ }
  }, [aktiv, ladda])

  return { data, fel, laddar, ladda }
}
