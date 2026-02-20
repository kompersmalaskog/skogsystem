'use client'
import { useEffect, useRef, useCallback } from 'react'

export interface MapLibreMapProps {
  center?: [number, number] // [lng, lat]
  zoom?: number
  pitch?: number
  bearing?: number
  minZoom?: number
  maxZoom?: number
  onLoad?: (map: any) => void
  onMove?: (center: { lat: number; lng: number }, zoom: number) => void
  onClick?: (lngLat: { lat: number; lng: number }) => void
  style?: React.CSSProperties
  interactive?: boolean
  flatMode?: boolean
}

const SATELLITE_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'

function loadMapLibre(): Promise<any> {
  return new Promise((resolve) => {
    if ((window as any).maplibregl) { resolve((window as any).maplibregl); return }
    if (!document.getElementById('maplibre-css')) {
      const link = document.createElement('link')
      link.id = 'maplibre-css'
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css'
      document.head.appendChild(link)
    }
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js'
    script.onload = () => resolve((window as any).maplibregl)
    document.head.appendChild(script)
  })
}

export default function MapLibreMap({
  center = [15.85, 56.65],
  zoom = 13,
  pitch = 50,
  bearing = 20,
  minZoom = 5,
  maxZoom = 18,
  onLoad,
  onMove,
  onClick,
  style,
  interactive = true,
  flatMode = false,
}: MapLibreMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)

  const onLoadRef = useRef(onLoad)
  const onMoveRef = useRef(onMove)
  const onClickRef = useRef(onClick)
  onLoadRef.current = onLoad
  onMoveRef.current = onMove
  onClickRef.current = onClick

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let cancelled = false

    loadMapLibre().then((maplibregl) => {
      if (cancelled || !containerRef.current || !maplibregl) return

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: {
          version: 8,
          glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
          sources: {
            satellite: {
              type: 'raster',
              tiles: [SATELLITE_TILES],
              tileSize: 256,
              maxzoom: 18,
              attribution: '&copy; Esri',
            },
            terrain: {
              type: 'raster-dem',
              tiles: [TERRAIN_TILES],
              tileSize: 256,
              maxzoom: 15,
              encoding: 'terrarium',
            },
          },
          layers: [
            { id: 'background', type: 'background', paint: { 'background-color': '#0a0a0a' } },
            {
              id: 'satellite',
              type: 'raster',
              source: 'satellite',
              paint: {
                'raster-brightness-max': 0.7,
                'raster-contrast': 0.15,
                'raster-saturation': -0.1,
              },
            },
          ],
          sky: {
            'sky-color': '#000000',
            'horizon-color': '#111111',
            'sky-horizon-blend': 0.5,
            'fog-color': '#0a0a0a',
            'fog-ground-blend': 0.8,
          },
          terrain: flatMode ? undefined : {
            source: 'terrain',
            exaggeration: 1.5,
          },
        },
        center,
        zoom,
        pitch: flatMode ? 0 : pitch,
        bearing: flatMode ? 0 : bearing,
        minZoom,
        maxZoom,
        interactive,
        attributionControl: false,
      })

      if (interactive) {
        map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right')
        map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left')
      }

      map.on('load', () => { onLoadRef.current?.(map) })
      map.on('moveend', () => {
        const c = map.getCenter()
        onMoveRef.current?.({ lat: c.lat, lng: c.lng }, map.getZoom())
      })
      map.on('click', (e: any) => {
        onClickRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng })
      })

      mapRef.current = map
    })

    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', background: '#0a0a0a', ...style }}
    />
  )
}

export function useMapRef() {
  const mapRef = useRef<any>(null)
  const setMap = useCallback((map: any) => { mapRef.current = map }, [])
  return { mapRef, setMap }
}
