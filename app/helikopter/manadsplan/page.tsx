import { Suspense } from 'react'
import ManadsplanVy from '../_components/ManadsplanVy'

// /helikopter/manadsplan?ar=2026&manad=11 — månadsplanen på en A4: svar, mot beställning, maskiner med klar-datum, att göra. Länkas från Planering.
export default function ManadsplanPage() {
  return (
    <Suspense fallback={null}>
      <ManadsplanVy />
    </Suspense>
  )
}
