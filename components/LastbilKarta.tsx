'use client'

import { useEffect, useRef } from 'react'

// Kartan för Lastbilsvyn. Samma kartlösning som förarens kartpekare
// (maplibre-gl + LM-proxyn /api/forarkarta) — här på vägkarte-lagret
// (dampad) eftersom en körrutt läses bättre mot vägar än mot flygfoto.
//
// Ritar: markör på senaste position + en polyline av spårpunkterna
// (GPS-spår, ~5 min mellan punkter → medvetet grov linje).

type Punkt = { lat: number; lng: number }

export default function LastbilKarta({
  position, spar, height = 260,
}: {
  position: Punkt | null
  spar: Punkt[]
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

    const start = position ?? spar[0] ?? { lat: 56.55, lng: 14.74 } // fallback: verksamhetens trakt
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
        map.addSource('spar', { type: 'geojson', data: linjeGeojson([]) })
        map.addLayer({
          id: 'spar-linje', type: 'line', source: 'spar',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#3b82f6', 'line-width': 4, 'line-opacity': 0.9 },
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
    // Kartan skapas en gång; position/spår uppdateras i effekten nedan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Uppdatera markör + spårlinje när data ändras
  useEffect(() => {
    if (!klarRef.current || !mapRef.current) return
    import('maplibre-gl').then(rita)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position?.lat, position?.lng, spar])

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

    // Spårlinje
    const src = map.getSource('spar')
    if (src) src.setData(linjeGeojson(spar))

    // Passa in vyn: hela spåret om det finns, annars centrera på positionen
    const punkter = spar.length ? spar : (position ? [position] : [])
    if (punkter.length >= 2) {
      const b = punkter.reduce(
        (acc, p) => acc.extend([p.lng, p.lat]),
        new mlbre.LngLatBounds([punkter[0].lng, punkter[0].lat], [punkter[0].lng, punkter[0].lat]),
      )
      map.fitBounds(b, { padding: 36, maxZoom: 14, duration: 400 })
    } else if (punkter.length === 1) {
      map.easeTo({ center: [punkter[0].lng, punkter[0].lat], zoom: 12, duration: 400 })
    }
  }

  return (
    <div ref={boxRef} style={{
      height, borderRadius: 14, overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.06)', background: '#131315',
    }} />
  )
}

function linjeGeojson(spar: Punkt[]) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates: spar.map(p => [p.lng, p.lat]) },
  }
}
