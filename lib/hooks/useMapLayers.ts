'use client'

/**
 * useMapLayers — overlays-state med localStorage-persistens.
 *
 * Returnerar [overlays, setOverlays] med samma signatur som useState så att
 * existerande kallsidor (planering, kommande korvy) bara byter useState mot
 * useMapLayers utan andra ändringar.
 *
 * Default: alla overlays av (även vidaKartbild som tidigare var på i
 * planering). Tanken är att förarens egen kombination av lager spara i
 * localStorage och återställs vid nästa session — inga lager startar
 * "förvalda".
 */

import { useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'

const STORAGE_KEY = 'mapLayers'

export type MapLayers = Record<string, boolean>

// Samma keys som overlays-defaults i app/planering/page.tsx, men alla false.
export const DEFAULT_MAP_LAYERS: MapLayers = {
  vidaKartbild: false,
  propertyLines: false,
  fastighetsgranser: false,
  hydrografi: false,
  moisture: false,
  contours: false,
  wetlands: false,
  // Skogsstyrelsen
  nyckelbiotoper: false,
  naturvarde: false,
  sumpskog: false,
  skoghistoria: false,
  biotopskydd: false,
  naturvardsavtal: false,
  avverkningsanmalan: false,
  utfordavverkning: false,
  // Riksantikvarieämbetet
  fornlamningar: false,
  // Naturvårdsverket
  naturreservat: false,
  natura2000: false,
  vattenskydd: false,
  // MSB
  brandrisk: false,
  oversvamning: false,
  // SGU
  jordarter: false,
  // Trafikverket
  barighet: false,
  // Svenska Kraftnät
  kraftledningar: false,
  // Körbarhet
  korbarhet: false,
  // Skogsstyrelsen Raster
  // sks_markfuktighet är ren cockpit-vy default OFF — SLU-rastret är en
  // heltäckande fyrklassig färgkarta (inte glow), passar bättre toggla på
  // manuellt vid behov. Föraren kan slå på via lager-menyn när som helst.
  sks_markfuktighet: false,
  sks_virkesvolym: false,
  sks_tradhojd: false,
  sks_lutning: false,
  sks_gallringsindex: false,
  // Lantmäteriet
  lm_skuggning: false,
  lm_ortofoto: false,
  // HPR-högar
  produktionshogar: false,
  grothogar: false,
}

export function useMapLayers(): [MapLayers, Dispatch<SetStateAction<MapLayers>>] {
  // Initialt DEFAULT (matchar SSR så ingen hydration-mismatch). localStorage
  // läses i useEffect efter mount.
  const [layers, setLayers] = useState<MapLayers>(DEFAULT_MAP_LAYERS)
  const hydratedRef = useRef(false)

  // Write FÖRE Read i deklarationsordning så att första writes effekt-körning
  // ser hydratedRef = false och skippar — undviker att DEFAULT skriver över
  // sparade värden under första render-cykeln.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!hydratedRef.current) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layers))
    } catch {
      // localStorage kan vara full eller blockerad — ignorera
    }
  }, [layers])

  // Read on mount — körs en gång och flippar hydratedRef så framtida writes
  // sparar.
  useEffect(() => {
    if (typeof window === 'undefined') {
      hydratedRef.current = true
      return
    }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const stored = JSON.parse(raw)
        if (stored && typeof stored === 'object') {
          // Merga defaults med sparade värden så nya keys får default
          setLayers({ ...DEFAULT_MAP_LAYERS, ...stored })
        }
      }
    } catch {
      // Ogiltig JSON eller blockerad localStorage — använd defaults
    }
    hydratedRef.current = true
  }, [])

  return [layers, setLayers]
}
