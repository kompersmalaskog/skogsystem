import { Suspense } from 'react'
import VeckorVy from '../_components/VeckorVy'

// /helikopter/veckor?typ=slutavverkning&ar=2026&manad=9 — vecka för vecka mot plan.
export default function VeckorPage() {
  return (
    <Suspense fallback={null}>
      <VeckorVy />
    </Suspense>
  )
}
