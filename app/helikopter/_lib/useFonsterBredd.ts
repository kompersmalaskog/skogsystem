'use client'

// Fönstrets bredd, reaktivt. Servern (och första renderingen innan klienten vet) räknas som telefon.
import { useSyncExternalStore } from 'react'

const TELEFON_BREDD = 390

function prenumerera(cb: () => void) {
  window.addEventListener('resize', cb)
  window.addEventListener('orientationchange', cb)
  return () => {
    window.removeEventListener('resize', cb)
    window.removeEventListener('orientationchange', cb)
  }
}

export function useFonsterBredd(): number {
  return useSyncExternalStore(prenumerera, () => window.innerWidth, () => TELEFON_BREDD)
}
