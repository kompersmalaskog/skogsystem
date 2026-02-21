'use client'
import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
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
      maxPitch: 60,
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

      // 3D-terräng — starta med AWS 30m, uppgradera till lokal 1m om tillgänglig
      try {
        map.addSource('terrain-dem', {
          type: 'raster-dem',
          tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
          tileSize: 256,
          maxzoom: 15,
          encoding: 'terrarium',
        })
        map.setTerrain({ source: 'terrain-dem', exaggeration: 1.5 })
        console.log('[MapLibre] 3D terrain: AWS 30m (default)')
      } catch (e) {
        console.error('[MapLibre] Terrain setup failed:', e)
      }

      // 3D forest — synchronous add, MapLibre fetches GeoJSON internally
      try {
        map.addSource('forest-height', { type: 'geojson', data: '/forest-height.geojson' });
        map.addLayer({
          id: 'forest-3d',
          type: 'fill-extrusion',
          source: 'forest-height',
          minzoom: 10,
          layout: { visibility: 'none' },
          paint: {
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': 0,
            'fill-extrusion-color': [
              'interpolate', ['linear'], ['get', 'height'],
              2, '#a5d6a7',
              8, '#66bb6a',
              14, '#43a047',
              20, '#2e7d32',
              28, '#1b5e20',
              35, '#0d3b0f',
            ],
            'fill-extrusion-opacity': 0.5,
            'fill-extrusion-vertical-gradient': true,
          },
        });
        console.log('[MapLibre] 3D forest layer added');
      } catch (e) {
        console.error('[MapLibre] Failed to add 3D forest layer:', e);
      }

      // Directional light for realistic 3D shading
      map.setLight({
        anchor: 'viewport',
        color: '#ffffff',
        intensity: 0.4,
        position: [1.5, 210, 30],
      });

      onMapReadyRef.current(map)

      // Asynkront: kolla om lokala 1m terrain tiles finns (Lantmäteriet DEM)
      fetch('/terrain-tiles/bounds.json')
        .then(r => r.ok ? r.json() : null)
        .then(bounds => {
          if (!bounds || !mapRef.current) return
          console.log('[MapLibre] Local 1m terrain tiles found:', bounds)
          const m = mapRef.current
          m.addSource('terrain-dem-local', {
            type: 'raster-dem',
            tiles: [window.location.origin + '/terrain-tiles/{z}/{x}/{y}.png'],
            tileSize: 256,
            minzoom: bounds.minZoom || 10,
            maxzoom: bounds.maxZoom || 15,
            encoding: 'terrarium',
            bounds: bounds.bbox,
          })
          m.setTerrain({ source: 'terrain-dem-local', exaggeration: 1.5 })
          console.log('[MapLibre] 3D terrain upgraded: local 1m DEM (Lantmäteriet)')
        })
        .catch(() => { /* No local tiles, keep AWS 30m */ })
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
