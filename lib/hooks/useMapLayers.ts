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
// kombinerat med dåvarande default-baskarta
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
  // Körvy-spår (default PÅ). Sparas per enhet som övriga toggles (mapLayers_v4).
  mittSpar: true,               // eget hyttspår (hist + live)
  andrasSpar: true,             // andra maskinens hyttspår (skördare/skotare-motpart)
  rekonstrueradeStrak: true,    // skordarstrak-* + skotar-hogar-dots
  // Trakt-geometri (envz-import). Default PÅ — finns geometri ska den synas. Knapparna är
  // datadrivna (visas bara när lagret faktiskt har data), så PÅ-default stör inte de 42
  // objekt som saknar geometri. korFara forcas dessutom PÅ när ett objekt öppnas (se
  // page.tsx) — kraftledning ligger där och får aldrig vara sparad släckt.
  traktGrans: true,
  hansyn: true,
  korFara: true,
  // PR A: Vida/SKS/RAÄ-referensgeometri (envz-vektor, ej WMS). Default PÅ (datadrivna knappar).
  // Traktdelar (L_TRAKTDEL) är ALLTID tända och har ingen toggle. I körvyn tänds alla via whitelist.
  traktNyckelbiotop: true,
  traktLamning: true,
  // Fastighetsgräns (rågång, nedtoning utanför trakten, beteckningar) — EN knapp: Vidas SV_FASTIGHET där den finns, annars Lantmäteriets gräns i samma stil.
  // Default AV, som alla andra lager (Martin 2026-10-22: gränserna syntes fast han inte tänt lagret). Första versionen hade true här, och eftersom hooken skriver in standardvärdena
  // i localStorage vid första körningen blev "tänt" ett sparat val hos alla — se `fastighetsgransVal` nedan.
  fastighetsgrans: false,
  // Märke: finns det i en sparad uppsättning är `fastighetsgrans` i den ett val användaren själv gjort (eller det nya standardvärdet). Sparningar utan märket skrevs av
  // första versionen, där standarden true skrevs till alla enheter, och nollas en gång. Märket är alltid true i en uppsättning som den här hooken skrivit sedan dess.
  fastighetsgransVal: true,
}

/**
 * Tolkar den sparade uppsättningen (ren funktion, prövas i lib/hooks/useMapLayers.test.ts). Alltid en giltig uppsättning: skräp, tomt och trasig JSON ger standard.
 * Nya nycklar får sitt standardvärde. `fastighetsgranser` (Lantmäteri-rastret) hade en egen menyrad förut och kan stå sparad som PÅ; nu styrs allt fastighetsgräns av EN rad
 * (`fastighetsgrans`) och nyckeln används bara tillfälligt av briefingen — en gammal sparad PÅ skulle annars ligga kvar utan att något i menyn kan släcka den.
 */
export function lasSparadeLager(raw: string | null | undefined): MapLayers {
  if (!raw) return { ...DEFAULT_MAP_LAYERS }
  let stored: unknown
  try { stored = JSON.parse(raw) } catch { return { ...DEFAULT_MAP_LAYERS } }
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return { ...DEFAULT_MAP_LAYERS }
  const s = stored as Record<string, unknown>
  const ut: MapLayers = { ...DEFAULT_MAP_LAYERS }
  for (const [k, v] of Object.entries(s)) if (typeof v === 'boolean') ut[k] = v
  ut.fastighetsgranser = false
  if (s.fastighetsgransVal !== true) ut.fastighetsgrans = DEFAULT_MAP_LAYERS.fastighetsgrans
  ut.fastighetsgransVal = true
  return ut
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
      if (raw) setLayers(lasSparadeLager(raw))
    } catch {
      // Ogiltig JSON eller blockerad localStorage — använd defaults
    }
    hydratedRef.current = true
  }, [])

  return [layers, setLayers]
}

/**
 * useStringSetting — generisk string-state med localStorage-persistens.
 *
 * Samma SSR-säkra mönster som useNumericSetting ovan. Tillagd (PR A) för
 * baskarte-valet: planeringsvyn håller `mapType` i en vanlig useState och
 * tappar därför valet vid varje omladdning. Egenkontrollen sparar det i
 * stället — man ska slippa välja Flygfoto varje gång man öppnar en runda.
 *
 * `giltiga` skyddar mot skräp i localStorage: ett värde som inte längre finns
 * i listan (borttagen baskarta, handredigerad nyckel) faller tillbaka på
 * default i stället för att ge en tom karta.
 */
export function useStringSetting<T extends string>(
  key: string,
  defaultValue: T,
  giltiga: readonly T[],
): [T, Dispatch<SetStateAction<T>>] {
  const [val, setVal] = useState<T>(defaultValue)
  const hydratedRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!hydratedRef.current) return
    try { window.localStorage.setItem(key, val) } catch {}
  }, [key, val])

  useEffect(() => {
    if (typeof window === 'undefined') { hydratedRef.current = true; return }
    try {
      const raw = window.localStorage.getItem(key)
      if (raw !== null && (giltiga as readonly string[]).includes(raw)) setVal(raw as T)
    } catch {}
    hydratedRef.current = true
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  return [val, setVal]
}
