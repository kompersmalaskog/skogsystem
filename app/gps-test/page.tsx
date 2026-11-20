'use client'
import { useState, useEffect, useRef } from 'react'

type Pos = { lat: number; lng: number; accuracy: number; heading: number | null; speed: number | null; ts: number }

export default function GpsTestPage() {
  const [supported, setSupported] = useState<boolean | null>(null)
  const [permission, setPermission] = useState<string>('okänd')
  const [pos, setPos] = useState<Pos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [updateCount, setUpdateCount] = useState(0)
  const [now, setNow] = useState(Date.now())
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const watchIdRef = useRef<number | null>(null)

  // Tick var sekund för "senast uppdaterad"-räknare
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Geolocation setup
  useEffect(() => {
    const isSupported = typeof navigator !== 'undefined' && 'geolocation' in navigator
    setSupported(isSupported)
    if (!isSupported) return

    // Permissions API om tillgänglig
    if ('permissions' in navigator) {
      ;(navigator.permissions as any).query({ name: 'geolocation' }).then((p: any) => {
        setPermission(p.state)
        p.onchange = () => setPermission(p.state)
      }).catch(() => {})
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (p) => {
        setPos({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
          heading: p.coords.heading,
          speed: p.coords.speed,
          ts: Date.now(),
        })
        setError(null)
        setUpdateCount(c => c + 1)
      },
      (e) => {
        setError(`${e.code}: ${e.message}`)
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    )
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }, [])

  // Init map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return
    let cancelled = false

    if (typeof document !== 'undefined' && !document.getElementById('maplibre-css-test')) {
      const link = document.createElement('link')
      link.id = 'maplibre-css-test'
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/maplibre-gl@5.18.0/dist/maplibre-gl.css'
      document.head.appendChild(link)
    }

    import('maplibre-gl').then((mlbre) => {
      if (cancelled || !mapContainerRef.current) return
      const map = new mlbre.Map({
        container: mapContainerRef.current,
        style: {
          version: 8,
          sources: {
            // Flygfoto: LM ortofoto via egen proxy. Esri borttagen (kräver ArcGIS-licens).
            'sat': {
              type: 'raster',
              tiles: ['/api/forarkarta?layer=ortofoto&z={z}&x={x}&y={y}'],
              tileSize: 256,
              attribution: '© Lantmäteriet',
            },
          },
          layers: [{ id: 'sat-layer', type: 'raster', source: 'sat' }],
        },
        center: [14.7, 56.5],
        zoom: 12,
      })
      mapRef.current = map
      map.on('load', () => {
        if (cancelled) return
        try {
          map.addSource('gps-pos', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
          map.addLayer({
            id: 'gps-halo',
            type: 'circle',
            source: 'gps-pos',
            paint: {
              'circle-radius': 22,
              'circle-color': '#0a84ff',
              'circle-opacity': 0.3,
              'circle-pitch-alignment': 'viewport',
            },
          })
          map.addLayer({
            id: 'gps-ring',
            type: 'circle',
            source: 'gps-pos',
            paint: {
              'circle-radius': 11,
              'circle-color': '#ffffff',
              'circle-opacity': 1,
              'circle-pitch-alignment': 'viewport',
            },
          })
          map.addLayer({
            id: 'gps-dot',
            type: 'circle',
            source: 'gps-pos',
            paint: {
              'circle-radius': 8,
              'circle-color': '#0a84ff',
              'circle-opacity': 1,
              'circle-pitch-alignment': 'viewport',
            },
          })
          // Pulse-animation på halo
          let raf = 0
          const start = performance.now()
          const tick = (t: number) => {
            const phase = (((t - start) % 2000) / 2000)
            try {
              map.setPaintProperty('gps-halo', 'circle-radius', 22 + phase * 28)
              map.setPaintProperty('gps-halo', 'circle-opacity', 0.4 * (1 - phase))
            } catch {}
            raf = requestAnimationFrame(tick)
          }
          raf = requestAnimationFrame(tick)
          ;(map as any)._gpsTestRaf = raf
        } catch (e) {
          console.error('[gps-test] layer setup:', e)
        }
      })
    })

    return () => {
      cancelled = true
      try {
        const r = (mapRef.current as any)?._gpsTestRaf
        if (r) cancelAnimationFrame(r)
        mapRef.current?.remove()
      } catch {}
      mapRef.current = null
    }
  }, [])

  // Update map source + center när pos ändras
  useEffect(() => {
    if (!mapRef.current || !pos) return
    try {
      const src = mapRef.current.getSource('gps-pos')
      if (!src) return
      src.setData({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [pos.lng, pos.lat] },
        }],
      })
      // Centrera kameran på första uppdateringen
      if (updateCount === 1) {
        mapRef.current.flyTo({ center: [pos.lng, pos.lat], zoom: 17, duration: 800 })
      }
    } catch (e) {
      console.error('[gps-test] source update:', e)
    }
  }, [pos, updateCount])

  const secondsAgo = pos ? Math.floor((now - pos.ts) / 1000) : null
  const headingDisp = pos?.heading != null && !isNaN(pos.heading) ? `${pos.heading.toFixed(0)}°` : '—'
  const speedDisp = pos?.speed != null && !isNaN(pos.speed) ? `${pos.speed.toFixed(1)} m/s` : '—'

  return (
    <div style={{
      minHeight: '100vh',
      background: '#000',
      color: '#fff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
      padding: 16,
    }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: '8px 0 16px' }}>GPS-test</h1>

      <div style={{ background: '#1c1c1e', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <Row label="Geolocation stöds" value={supported === null ? '…' : supported ? 'JA' : 'NEJ'} good={supported === true} bad={supported === false} />
        <Row label="Tillstånd" value={permission} good={permission === 'granted'} bad={permission === 'denied'} />
        <Row label="Uppdateringar" value={String(updateCount)} />
        {error && <Row label="Fel" value={error} bad />}
      </div>

      <div style={{ background: '#1c1c1e', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <Row label="Latitud" value={pos?.lat.toFixed(6) ?? '—'} mono />
        <Row label="Longitud" value={pos?.lng.toFixed(6) ?? '—'} mono />
        <Row label="Accuracy" value={pos?.accuracy != null ? `${pos.accuracy.toFixed(1)} m` : '—'} mono />
        <Row label="Heading" value={headingDisp} mono />
        <Row label="Speed" value={speedDisp} mono />
        <Row label="Senast" value={secondsAgo != null ? `${secondsAgo} s sedan` : '—'} />
      </div>

      <div ref={mapContainerRef} style={{
        width: '100%',
        height: '50vh',
        minHeight: 320,
        borderRadius: 12,
        overflow: 'hidden',
        background: '#222',
      }} />

      <div style={{ fontSize: 13, color: '#8e8e93', marginTop: 12, textAlign: 'center' }}>
        watchPosition · enableHighAccuracy: true · timeout 15s
      </div>
    </div>
  )
}

function Row({ label, value, good, bad, mono }: { label: string; value: string; good?: boolean; bad?: boolean; mono?: boolean }) {
  const color = bad ? '#ff453a' : good ? '#30d158' : '#fff'
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '8px 0',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      <span style={{ fontSize: 15, color: '#8e8e93' }}>{label}</span>
      <span style={{
        fontSize: 15,
        fontWeight: 600,
        color,
        fontFamily: mono ? '"SF Mono", "Menlo", monospace' : 'inherit',
        fontVariantNumeric: mono ? 'tabular-nums' : 'normal',
      }}>
        {value}
      </span>
    </div>
  )
}
