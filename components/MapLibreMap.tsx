'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
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

// Källor vars fel INTE ska räknas som "kartrutor kunde inte hämtas": terräng-DEM (AWS,
// egen 3D-höjd) och gov-overlays (wms-*, har egen fail-fast). Bara BASKARTANS rasterrutor.
const IGNORE_SOURCE = /terrain-dem|^wms-/

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
  // Behåll senaste mapStyle för retry (vet vilka tiles varje raster-källa har).
  const mapStyleRef = useRef(mapStyle)
  mapStyleRef.current = mapStyle

  // Tidsstämplar för nyligen misslyckade baskarte-rutor (glidande 8s-fönster) + ärligt
  // felläge som SURFAS till föraren. Aldrig en tyst grå karta utan förklaring.
  const errTimesRef = useRef<number[]>([])
  const [tileError, setTileError] = useState<{ status?: number } | null>(null)

  // Försök igen — tvinga omhämtning av alla baskarte-rasterrutor.
  const retryTiles = useCallback(() => {
    errTimesRef.current = []
    setTileError(null)
    const map = mapRef.current
    if (!map) return
    try {
      const sources: Record<string, any> = (mapStyleRef.current as any)?.sources || {}
      Object.entries(sources).forEach(([sid, src]) => {
        if (IGNORE_SOURCE.test(sid)) return
        if (src?.type === 'raster' && Array.isArray(src?.tiles)) {
          const s: any = map.getSource(sid)
          if (s && typeof s.setTiles === 'function') s.setTiles(src.tiles) // invaliderar + hämtar om
        }
      })
      ;(map as any).triggerRepaint?.()
    } catch (err) {
      console.error('[MapLibre] retry misslyckades:', err)
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    console.log('[MapLibre] === INIT START ===', containerRef.current.offsetWidth, 'x', containerRef.current.offsetHeight)

    // Färre samtidiga tile-requests (MapLibre-default är 16) → snällare mot alla tile-servrar,
    // mindre risk att trigga strypning/rate-limit i fält på svag/delad mobil-IP (CGNAT).
    // maplibre 5.x: global config (per-karta-option finns ej i typerna). Sätts före kart-init.
    try { (maplibregl.config as any).MAX_PARALLEL_IMAGE_REQUESTS = 6 } catch {}

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle,
      center: initialCenter,
      zoom: initialZoom,
      pitch: initialPitch,
      bearing: initialBearing,
      maxPitch: 60,
      // Zoom-gränser så att tiles alltid finns att rendera. OpenTopoMap har
      // maxzoom 17 — sätter maxZoom 18 för en smidig zoom-känsla utan att
      // oversample för mycket. minZoom 8 förhindrar utzoom bortom rimlig
      // skogsbruks-skala (motsvarar ~ region-nivå).
      minZoom: 8,
      maxZoom: 18,
      interactive: true,
      attributionControl: false,
      dragRotate: true,
      touchZoomRotate: true,
      touchPitch: true,
      renderWorldCopies: false,
      fadeDuration: 0,
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
        map.setTerrain({ source: 'terrain-dem', exaggeration: 1.0 })
        console.log('[MapLibre] 3D terrain: AWS 30m (default)')
      } catch (e) {
        console.error('[MapLibre] Terrain setup failed:', e)
      }

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
          m.setTerrain({ source: 'terrain-dem-local', exaggeration: 1.0 })
          console.log('[MapLibre] 3D terrain upgraded: local 1m DEM (Lantmäteriet)')
        })
        .catch(() => { /* No local tiles, keep AWS 30m */ })
    })

    // Fel på en baskarte-ruta (429/403/timeout/nätfel) → räkna i ett glidande 8s-fönster.
    // Flera fel på kort tid = kartan hämtas inte → SURFA ett ärligt besked med statuskod
    // (aldrig en tyst grå karta). Statuskoden gör fältfixen till sin egen diagnos.
    map.on('error', (e: any) => {
      console.error('[MapLibre] Error:', e?.error || e)
      const sid: string | undefined = e?.sourceId
      if (!sid || IGNORE_SOURCE.test(sid)) return
      const now = Date.now()
      const status: number | undefined = typeof e?.error?.status === 'number' ? e.error.status : undefined
      const arr = errTimesRef.current
      arr.push(now)
      while (arr.length && now - arr[0] > 8000) arr.shift()
      if (arr.length >= 4) setTileError(prev => (prev && prev.status === status ? prev : { status }))
    })

    // En baskarte-ruta laddades klart → nätet svarar igen: nolla räknaren och dölj felet.
    map.on('data', (e: any) => {
      if (e?.dataType === 'source' && e?.tile && e?.sourceId && !IGNORE_SOURCE.test(e.sourceId)) {
        if (errTimesRef.current.length) errTimesRef.current = []
        setTileError(prev => (prev ? null : prev))
      }
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

  return (
    <div style={{ ...style, position: (style?.position as React.CSSProperties['position']) || 'relative' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0, willChange: 'transform', transform: 'translateZ(0)' }} />
      {tileError && (
        <div
          role="status"
          style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            zIndex: 5, width: 'calc(100% - 48px)', maxWidth: 300, pointerEvents: 'auto',
            background: 'rgba(28,28,30,0.96)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.14)', borderRadius: 16, padding: '16px 18px', textAlign: 'center',
            fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif",
            boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 6 }}>Kartrutor kunde inte hämtas</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.45, marginBottom: 14 }}>
            {tileError.status === 429 ? 'Kartservern svarade 429 (för många anrop just nu).'
              : tileError.status === 403 ? 'Kartservern svarade 403 (blockerad).'
              : tileError.status ? `Kartservern svarade ${tileError.status}.`
              : 'Kunde inte nå kartservern.'} Kontrollera täckningen och försök igen.
          </div>
          <button
            type="button"
            onClick={retryTiles}
            style={{
              padding: '10px 20px', borderRadius: 11, border: 'none', background: '#0a84ff', color: '#fff',
              fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
            }}
          >
            Försök igen
          </button>
        </div>
      )}
    </div>
  )
}
