'use client'

import { useEffect, useRef } from 'react'

// Kartan för Lastbilsvyn. Samma kartlösning som förarens kartpekare
// (maplibre-gl + LM-proxyn /api/forarkarta, vägkarte-lagret dampad).
//
// Ritar:
//  • det map-matchade spåret (heldragen blå linje längs vägnätet),
//  • segment som inte kunde matchas rakt och dämpat (streckat) — gissar aldrig,
//  • de FAKTISKA loggpunkterna som små prickar, så glesheten syns ärligt,
//  • markör på senaste position.

type Punkt = { lat: number; lng: number }
// coords = [[lng,lat],...] (GeoJSON-ordning)
type Segment = { coords: [number, number][]; matchad: boolean }

export default function LastbilKarta({
  position, segment, punkter, height = 260,
}: {
  position: Punkt | null
  segment: Segment[]
  punkter: Punkt[]
  height?: number
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markorRef = useRef<any>(null)
  const klarRef = useRef(false)

  // Skapa kartan en gång
  useEffect(() => {
    if (!boxRef.current || mapRef.current) return
    let cancelled = false

    if (!document.getElementById('maplibre-css-lastbil')) {
      const link = document.createElement('link')
      link.id = 'maplibre-css-lastbil'
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/maplibre-gl@5.18.0/dist/maplibre-gl.css'
      document.head.appendChild(link)
    }

    const start = position ?? punkter[0] ?? { lat: 56.55, lng: 14.74 } // fallback: verksamhetens trakt
    import('maplibre-gl').then(mlbre => {
      if (cancelled || !boxRef.current) return
      const map = new mlbre.Map({
        container: boxRef.current,
        style: {
          version: 8,
          sources: {
            bas: {
              type: 'raster',
              tiles: ['/api/forarkarta?layer=dampad&z={z}&x={x}&y={y}'],
              tileSize: 256,
              attribution: '© Lantmäteriet',
            },
          },
          layers: [{ id: 'bas-layer', type: 'raster', source: 'bas' }],
        },
        center: [start.lng, start.lat],
        zoom: 11,
        attributionControl: false,
      })
      mapRef.current = map
      map.on('load', () => {
        if (cancelled) return
        map.addSource('spar', { type: 'geojson', data: tomtFc() })
        map.addSource('punkter', { type: 'geojson', data: tomtFc() })
        // Omatchade segment underst (dämpat streck), matchade ovanpå (blått).
        map.addLayer({
          id: 'spar-rak', type: 'line', source: 'spar',
          filter: ['==', ['get', 'matchad'], false],
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#8a8f98', 'line-width': 2.5, 'line-opacity': 0.5, 'line-dasharray': [2, 2] },
        })
        map.addLayer({
          id: 'spar-matchad', type: 'line', source: 'spar',
          filter: ['==', ['get', 'matchad'], true],
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#3b82f6', 'line-width': 4, 'line-opacity': 0.9 },
        })
        // Faktiska loggpunkter som prickar överst.
        map.addLayer({
          id: 'spar-punkter', type: 'circle', source: 'punkter',
          paint: {
            'circle-radius': 3.2, 'circle-color': '#e5e7eb',
            'circle-stroke-color': '#111827', 'circle-stroke-width': 1, 'circle-opacity': 0.95,
          },
        })
        klarRef.current = true
        rita(mlbre)
      })
    })
    return () => {
      cancelled = true
      klarRef.current = false
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      markorRef.current = null
    }
    // Kartan skapas en gång; data uppdateras i effekten nedan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Uppdatera markör + spår + punkter när data ändras
  useEffect(() => {
    if (!klarRef.current || !mapRef.current) return
    import('maplibre-gl').then(rita)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position?.lat, position?.lng, segment, punkter])

  function rita(mlbre: any) {
    const map = mapRef.current
    if (!map || !klarRef.current) return

    // Markör
    if (position) {
      if (!markorRef.current) {
        markorRef.current = new mlbre.Marker({ color: '#ff9f0a' })
          .setLngLat([position.lng, position.lat]).addTo(map)
      } else {
        markorRef.current.setLngLat([position.lng, position.lat])
      }
    } else if (markorRef.current) {
      markorRef.current.remove(); markorRef.current = null
    }

    // Spår (segment) + punkter
    const sparSrc = map.getSource('spar')
    if (sparSrc) sparSrc.setData(segmentFc(segment))
    const punktSrc = map.getSource('punkter')
    if (punktSrc) punktSrc.setData(punktFc(punkter))

    // Passa in vyn: alla segmentkoordinater om de finns, annars punkter/position
    const allaKoord: [number, number][] = segment.length
      ? segment.flatMap(s => s.coords)
      : punkter.map(p => [p.lng, p.lat] as [number, number])
    const koord = allaKoord.length ? allaKoord : (position ? [[position.lng, position.lat] as [number, number]] : [])
    if (koord.length >= 2) {
      const b = koord.reduce(
        (acc, c) => acc.extend(c),
        new mlbre.LngLatBounds(koord[0], koord[0]),
      )
      map.fitBounds(b, { padding: 36, maxZoom: 14, duration: 400 })
    } else if (koord.length === 1) {
      map.easeTo({ center: koord[0], zoom: 12, duration: 400 })
    }
  }

  return (
    <div ref={boxRef} style={{
      height, borderRadius: 14, overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.06)', background: '#131315',
    }} />
  )
}

function tomtFc() {
  return { type: 'FeatureCollection' as const, features: [] }
}
function segmentFc(segment: Segment[]) {
  return {
    type: 'FeatureCollection' as const,
    features: segment
      .filter(s => s.coords.length >= 2)
      .map(s => ({
        type: 'Feature' as const,
        properties: { matchad: s.matchad },
        geometry: { type: 'LineString' as const, coordinates: s.coords },
      })),
  }
}
function punktFc(punkter: Punkt[]) {
  return {
    type: 'FeatureCollection' as const,
    features: punkter.map(p => ({
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
    })),
  }
}
