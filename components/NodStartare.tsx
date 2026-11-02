'use client'

// "Om något händer" ska fungera utan täckning — också för den som aldrig öppnat sidan med nät. Den här startaren gör två saker
// när appen har nät (vid start och när nätet kommer tillbaka, högst en gång i timmen):
//  1. sparar nödkontakterna och traktenas larmplatser på enheten (lib/arbetsmiljo/nod, NOD_NYCKEL);
//  2. ber service workern spara sidan /om-nagot-hander och dess filer (public/sw.js, NOD_CACHA).
// Inget syns. Ett fel gör ingenting — nästa start försöker igen.

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { hamtaNodData } from '@/lib/arbetsmiljo/tillbud'
import { lasNod, slaIhopNod, sparaNod } from '@/lib/arbetsmiljo/nod'

export const NOD_CACHA = 'nod-cacha'
const MIN_MELLAN_MS = 60 * 60 * 1000

export async function uppdateraNod(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  const d = await hamtaNodData(supabase).catch(() => null)
  if (d) sparaNod(slaIhopNod(d, lasNod()))
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    const sw = reg?.active
    if (sw) sw.postMessage({ typ: NOD_CACHA })
  } catch { /* ingen service worker — sidan fungerar ändå med nät */ }
}

export default function NodStartare() {
  useEffect(() => {
    let senast = lasNod()?.hamtad ?? 0
    const kor = () => {
      if (Date.now() - senast < MIN_MELLAN_MS) return
      senast = Date.now()
      void uppdateraNod()
    }
    // Lite efter start, så det aldrig konkurrerar med det sidan själv laddar.
    const t = window.setTimeout(kor, 5000)
    window.addEventListener('online', kor)
    return () => { window.clearTimeout(t); window.removeEventListener('online', kor) }
  }, [])
  return null
}
