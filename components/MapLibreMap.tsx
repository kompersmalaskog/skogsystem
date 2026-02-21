'use client'
import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

interface Props {
  onMapReady: (map: maplibregl.Map) => void
  onMapRemoved?: () => void
  initialCenter: [number, number]
  initialZoom: number
  initialPitch?: number
  initialBearing?: number
  mapStyle: maplibregl.StyleSpecification
  style?: React.CSSProperties
}

export default function MapLibreMap({
  onMapReady,
  onMapRemoved,
  initialCenter,
  initialZoom,
  initialPitch = 0,
  initialBearing = 0,
  mapStyle,
  style,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  // Stable refs for callbacks (avoid stale closures)
  const onMapReadyRef = useRef(onMapReady)
  const onMapRemovedRef = useRef(onMapRemoved)
  onMapReadyRef.current = onMapReady
  onMapRemovedRef.current = onMapRemoved

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    console.log('[MapLibre] === INIT START ===', containerRef.current.offsetWidth, 'x', containerRef.current.offsetHeight)

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle,
      center: initialCenter,
      zoom: initialZoom,
      pitch: initialPitch,
      bearing: initialBearing,
      interactive: true,
      attributionControl: false,
      dragRotate: true,
      touchZoomRotate: true,
      touchPitch: true,
    })

    mapRef.current = map

    map.on('load', () => {
      console.log('[MapLibre] Map loaded, canvas:', map.getCanvas().width, 'x', map.getCanvas().height)
      map.resize()

      // 3D-terräng (AWS Terrarium 30m DEM)
      try {
        map.addSource('terrain-dem', {
          type: 'raster-dem',
          tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
          tileSize: 256,
          maxzoom: 15,
          encoding: 'terrarium',
        })
        map.setTerrain({ source: 'terrain-dem', exaggeration: 1.5 })
        map.setSky({
          'sky-color': '#1a1a2e',
          'horizon-color': '#2a3a1e',
          'fog-color': '#0d1508',
          'sky-horizon-blend': 0.5,
        })
        console.log('[MapLibre] 3D terrain enabled')
      } catch (e) {
        console.error('[MapLibre] Terrain setup failed:', e)
      }

      onMapReadyRef.current(map)
    })

    map.on('error', (e: any) => {
      console.error('[MapLibre] Error:', e.error || e)
    })

    // Window resize listener
    const onResize = () => map.resize()
    window.addEventListener('resize', onResize)

    return () => {
      console.log('[MapLibre] === CLEANUP ===')
      window.removeEventListener('resize', onResize)
      map.remove()
      mapRef.current = null
      onMapRemovedRef.current?.()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} style={style} />
}
