'use client'
import { useEffect, useRef, useState } from 'react'
import { DJUP_MARKOR, NIVA_NYCKEL, nivaUr, signalera } from '@/lib/maskinvy/historik'

let rakna = 0

/**
 * En öppen djupvy/panel är ett steg i historiken: systemets backa STÄNGER den och lämnar vyn man står i (Maskinvyn 2026-11-22;
 * samma mönster som PdfLasare).
 *
 *  - oppen blir true  → en post läggs i historiken (samma adress, märkt med ett id)
 *  - backa            → `onTillbaka` anropas (vyn gör sin vanliga stängning, med animation om den har en)
 *  - stängs i appen (✕, ‹, Escape, tryck utanför) → vår post tas bort med history.back(), så nästa backa inte bara "gör ingenting"
 *  - navigerar man bort medan djupvyn är öppen (t.ex. val i sidolistan) → `skrivNavigering` ersätter djupvyns post, och vi
 *    rör inte historiken här (märket är borta)
 *
 * Posten läggs i en timeout(0): React StrictMode kör effekten, städar och kör den igen direkt; utan fördröjningen hade den första
 * posten hunnit läggas och en back() i städningen stängt den nya djupvyn i samma ögonblick.
 */
export function useDjupvyHistorik(oppen: boolean, onTillbaka: () => void): void {
  const cb = useRef(onTillbaka)
  cb.current = onTillbaka

  useEffect(() => {
    if (!oppen || typeof window === 'undefined') return
    const id = ++rakna
    let pushad = false
    let poppad = false

    const lagg = setTimeout(() => {
      try {
        window.history.pushState({ [DJUP_MARKOR]: id, [NIVA_NYCKEL]: nivaUr(window.history.state) + 1 }, '', window.location.href)
        pushad = true
        signalera() // toppfältets knapp ska bli en tillbaka-knapp så fort djupvyn är ett steg i historiken
      } catch { /* ingen historik — vyns egna stängknappar räcker */ }
    }, 0)

    const vidBacka = () => {
      if (!pushad || poppad) return
      // Står vi fortfarande på en post som är vår? Då är det inte vi som lämnades (t.ex. en annan djupvy öppnades ovanpå).
      const marke = (window.history.state as Record<string, unknown> | null)?.[DJUP_MARKOR]
      if (marke === id) return
      poppad = true
      cb.current()
    }
    window.addEventListener('popstate', vidBacka)

    return () => {
      clearTimeout(lagg)
      window.removeEventListener('popstate', vidBacka)
      if (pushad && !poppad) {
        const marke = (window.history.state as Record<string, unknown> | null)?.[DJUP_MARKOR]
        if (marke === id) { try { window.history.back() } catch { /* ignoreras */ } }
      }
    }
  }, [oppen])
}

/**
 * Djupvyer som inte är React utan DOM-paneler: den gamla maskinvyns skript öppnar dem genom att sätta en klass (`open`) på ett
 * överdrag (#forarOverlay) och stänger via en global funktion. Läser klassen och gör den till ett steg i historiken, på samma sätt
 * som useDjupvyHistorik. `stang` anropas när man backar (den ska ta bort klassen).
 */
export function usePanelDjupvyHistorik(overdragId: string, stang: () => void, klass = 'open'): void {
  const [oppen, setOppen] = useState(false)
  useEffect(() => {
    const kolla = () => setOppen(!!document.getElementById(overdragId)?.classList.contains(klass))
    const obs = new MutationObserver(kolla)
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true })
    kolla()
    return () => obs.disconnect()
  }, [overdragId, klass])
  useDjupvyHistorik(oppen, stang)
}
