'use client'

// Appstart på en maskin som lämnats UPPLÅST (Chrome stängdes, datorn sov i mer än 10 minuter): maskinen låses innan något personligt renderas
// eller hämtas. Beslutet fattas SYNKRONT ur localStorage i första renderingen (ingen väntan på nätet) och barnen — som innehåller varje starter
// (push, köer, medarbetarlookup) och hela sidan — monteras aldrig medan låsningen pågår. Ingen blixt av personens sida, inget personligt anrop.
// På servern (ingen localStorage) och för alla andra enheter är beslutet "släpp igenom" — samma HTML som förut.
import { useEffect, useState, type ReactNode } from 'react'
import { skaLasasVidStart } from '@/lib/maskinkonto/upplast'
import { lasMaskinen } from '@/lib/maskinkonto/klient'
import { FARG, TYP } from '@/lib/design/tokens'

export default function MaskinStartVakt({ children }: { children: ReactNode }) {
  const [las] = useState(() => typeof window !== 'undefined' && skaLasasVidStart())
  useEffect(() => { if (las) void lasMaskinen() }, [las])
  if (!las) return <>{children}</>
  return (
    <div data-maskin-startvakt role="status" style={{ position: 'fixed', inset: 0, background: FARG.bg, color: FARG.text2, display: 'flex', alignItems: 'center', justifyContent: 'center', ...TYP.text }}>
      Låser maskinen …
    </div>
  )
}
