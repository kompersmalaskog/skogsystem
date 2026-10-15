import { Suspense } from 'react'
import ManadsfacitVy from '../_components/ManadsfacitVy'

// /helikopter/manad?ar=2026&manad=9 — månadsfacit: hur det gick mot beställningen. Månadsnotisen länkar hit.
export default function ManadPage() {
  return (
    <Suspense fallback={null}>
      <ManadsfacitVy />
    </Suspense>
  )
}
