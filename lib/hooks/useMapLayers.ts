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

// v4: bumpad nyckel 2026-05 för att kassera befintliga sparningar där
// markfuktighet + lutning ofta var påslagna som default sedan tidigare —
// kombinerat med ny default-baskarta (OpenTopoMap istället för Esri-satellit)
// blev resultatet en grötig gul/lila yta som dolde terräng-informationen.
// Gamla 'mapLayers' / 'mapLayers_v2' / 'mapLayers_v3'-nycklar lämnas orörda
// i localStorage. Användaren får börja från clean state med inga overlays.
// Ändå togglebara — föraren kan slå på vad hen vill, sparas i v4 framöver.
const STORAGE_KEY = 'mapLayers_v4'

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
  // sks_lutning default OFF — 1m DEM-hillshade i 3D-vyn ger nu skarpare
  // topografi-läsning än SKS-rastret. Föraren kan toggla på som komplement.
  sks_markfuktighet: false,
  sks_virkesvolym: false,
  sks_tradhojd: false,
  sks_lutning: false,
  sks_gallringsindex: false,
  // Lantmäteriet
  // lm_skuggning default OFF — Cesium renderar hillshade direkt från 1m DEM
  // via vertex-normaler i realtid (skarpt vid alla zoom-nivåer); WMS-rastret
  // blir pixligt vid nära zoom så det är inte längre default i 3D.
  lm_skuggning: false,
  lm_ortofoto: false,
  // HPR-högar
  produktionshogar: false,
  grothogar: false,
}

/**
 * useNumericSetting — generisk number-state med localStorage-persistens.
 * Samma SSR-säkra hydration-mönster som useMapLayers (read i useEffect,
 * skip av första write innan hydration så DEFAULT inte skriver över sparade
 * värden). Används för viewfield_distance + viewfield_softness i 3D-körvyn.
 */
export function useNumericSetting(
  key: string,
  defaultValue: number,
): [number, Dispatch<SetStateAction<number>>] {
  const [val, setVal] = useState<number>(defaultValue)
  const hydratedRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!hydratedRef.current) return
    try { window.localStorage.setItem(key, String(val)) } catch {}
  }, [key, val])

  useEffect(() => {
    if (typeof window === 'undefined') {
      hydratedRef.current = true
      return
    }
    try {
      const raw = window.localStorage.getItem(key)
      if (raw !== null) {
        const n = Number(raw)
        if (!isNaN(n)) setVal(n)
      }
    } catch {}
    hydratedRef.current = true
  }, [key])

  return [val, setVal]
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
