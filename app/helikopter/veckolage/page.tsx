import { Suspense } from 'react'
import VeckolageVy from '../_components/VeckolageVy'

// /helikopter/veckolage?datum=2026-09-16 — veckoläget för en dag på en skärm. Notisen länkar hit.
export default function VeckolagePage() {
  return (
    <Suspense fallback={null}>
      <VeckolageVy />
    </Suspense>
  )
}
