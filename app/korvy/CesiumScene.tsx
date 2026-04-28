'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import type * as CesiumNS from 'cesium'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Cesium laddas från CDN av app/korvy/page.tsx — finns på window.Cesium när denna komponent monteras
declare global {
  interface Window {
    Cesium: typeof CesiumNS
    CESIUM_BASE_URL?: string
  }
}
const Cesium = (typeof window !== 'undefined' ? window.Cesium : ({} as any)) as typeof CesiumNS

interface Marker {
  id: string
  x: number
  y: number
  type?: string
  isMarker?: boolean
  isLine?: boolean
  isZone?: boolean
  lineType?: string
  zoneType?: string
  path?: { x: number; y: number }[]
  comment?: string
}

interface Objekt {
  id: string
  namn: string
  lat: number
  lng: number
  areal?: number
  typ?: string
}

interface Props {
  objektId: string | null
}

// Höjd-färgramp för ElevationRamp-materialet på globen.
// Låga partier = mörkblått (dalar/svackor), medel = grönt, höjder = brunt/ljust.
function createElevationRamp(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 1
  const ctx = canvas.getContext('2d')!
  const grad = ctx.createLinearGradient(0, 0, 256, 0)
  grad.addColorStop(0.00, '#0a2a1a')   // dalar/lågt — mörkt blågrön
  grad.addColorStop(0.25, '#1a4028')   // svackor
  grad.addColorStop(0.45, '#3a5a2a')   // medel — olivgrön
  grad.addColorStop(0.65, '#6a6a3a')   // höglänt övergång
  grad.addColorStop(0.80, '#8a7a5a')   // högt — ljusbrun
  grad.addColorStop(0.95, '#6a3a2a')   // brant/topp — rödbrun
  grad.addColorStop(1.00, '#7a4030')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 256, 1)
  return canvas
}

export default function CesiumScene({ objektId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<CesiumNS.Viewer | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const cameraTickRef = useRef<CesiumNS.Event.RemoveCallback | null>(null)
  const imageryLayerRef = useRef<CesiumNS.ImageryLayer | null>(null)
  const [objekt, setObjekt] = useState<Objekt | null>(null)
  const [markers, setMarkers] = useState<Marker[]>([])
  const [pos, setPos] = useState<{ lat: number; lon: number; heading: number | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState<'terrain' | 'satellite'>('terrain')

  // === Hämta objekt + markeringar ===
  useEffect(() => {
    if (!objektId) return
    let cancelled = false
    ;(async () => {
      try {
        const { data: obj, error: oErr } = await supabase.from('objekt').select('*').eq('id', objektId).single()
        if (cancelled) return
        if (oErr || !obj) { setError('Objekt kunde inte hämtas'); return }
        setObjekt(obj as Objekt)
        const { data: mk, error: mErr } = await supabase
          .from('planering_markeringar')
          .select('marker_id, data')
          .eq('objekt_id', objektId)
        if (cancelled) return
        if (mErr) { setError('Markeringar kunde inte hämtas: ' + mErr.message); return }
        setMarkers((mk || []).map((r: any) => r.data as Marker))
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e))
      }
    })()
    return () => { cancelled = true }
  }, [objektId])

  // === GPS-watcher ===
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return
    watchIdRef.current = navigator.geolocation.watchPosition(
      (p) => {
        setPos({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          heading: (p.coords.heading != null && !isNaN(p.coords.heading) && (p.coords.speed ?? 0) >= 1) ? p.coords.heading : null,
        })
      },
      (err) => console.warn('[Körvy3D GPS]', err.code, err.message),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    )
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current)
    }
  }, [])

  // === Cesium init ===
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return
    let cancelled = false

    const init = async () => {
      try {
        Cesium.Ion.defaultAccessToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN || ''

        // Cesium World Terrain (kräver Ion-token, gratis under tak)
        const terrain = await Cesium.createWorldTerrainAsync({ requestVertexNormals: true, requestWaterMask: false })
        if (cancelled || !containerRef.current) return

        const viewer = new Cesium.Viewer(containerRef.current, {
          terrainProvider: terrain,
          // Avaktivera default-UI för ren körvy
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          animation: false,
          timeline: false,
          fullscreenButton: false,
          vrButton: false,
          infoBox: false,
          selectionIndicator: false,
          requestRenderMode: true,
          maximumRenderTimeChange: Infinity,
        })
        viewerRef.current = viewer

        // Inga imagery-lager by default — vi visar ren terräng med höjd-färgramp + hillshade.
        // Esri imagery laddas on-demand när användaren togglar till satellit-läget.
        viewer.imageryLayers.removeAll()

        // Mörk bakgrund + dimmad globe baseColor
        viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#0d1929')
        viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#1a2a1a')

        // Höjdöverdrift så kullar och dalar syns tydligt.
        // Cesium 1.107+ använder scene.verticalExaggeration; äldre globe.terrainExaggeration.
        try { (viewer.scene as any).verticalExaggeration = 2.5 } catch {}
        try { (viewer.scene.globe as any).terrainExaggeration = 2.5 } catch {}

        // Hillshade: terrain lighting från sol-positionen + vertex normals (redan begärda).
        viewer.scene.globe.enableLighting = true

        // Höjd-baserad färg på terrängen — låg = blå, hög = brun, så föraren ser dalar/kullar.
        viewer.scene.globe.material = Cesium.Material.fromType('ElevationRamp', {
          minimumHeight: 30,
          maximumHeight: 350,
          image: createElevationRamp(),
        })

        // Sky/atmosphere av i terrängläget — vi vill ha rent schematiskt utseende.
        if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false
        viewer.scene.fog.enabled = true
        viewer.scene.fog.density = 0.0006

        // Riktat ljus från nordväst (hög sol) → tydliga skuggor på terrängens normaler.
        // Direction-vektorn pekar från ljuset mot scenen: nordväst = (+x öst, +y nord) → riktning (-x, -y, -z).
        viewer.scene.light = new Cesium.DirectionalLight({
          direction: Cesium.Cartesian3.normalize(
            new Cesium.Cartesian3(0.6, -0.6, -0.5),
            new Cesium.Cartesian3()
          ),
          intensity: 3.5,
        })

        setReady(true)
        console.log('[Körvy3D] Viewer initialiserad')
      } catch (e: any) {
        console.error('[Körvy3D] Init fel:', e)
        if (!cancelled) setError('Kunde inte starta 3D-vyn: ' + (e?.message || String(e)))
      }
    }

    init()
    return () => {
      cancelled = true
      try {
        if (cameraTickRef.current) cameraTickRef.current()
        viewerRef.current?.destroy()
      } catch {}
      viewerRef.current = null
    }
  }, [])

  // === Mode-toggle: terräng vs satellit ===
  useEffect(() => {
    if (!ready || !viewerRef.current) return
    const viewer = viewerRef.current
    let cancelled = false

    if (mode === 'satellite') {
      // Lägg till Esri imagery (eller visa befintligt lager) + neutralisera höjd-rampen.
      viewer.scene.globe.material = undefined as any
      viewer.scene.globe.baseColor = Cesium.Color.WHITE
      if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true
      viewer.scene.backgroundColor = Cesium.Color.BLACK

      if (imageryLayerRef.current) {
        imageryLayerRef.current.show = true
        viewer.scene.requestRender()
      } else {
        Cesium.ArcGisMapServerImageryProvider.fromUrl(
          'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
        ).then((provider) => {
          if (cancelled || !viewerRef.current) return
          imageryLayerRef.current = viewer.imageryLayers.addImageryProvider(provider)
          viewer.scene.requestRender()
        }).catch((e) => console.warn('[Körvy3D] imagery load:', e))
      }
    } else {
      // Terräng: göm imagery, sätt höjd-ramp + dark bakgrund + exaggering.
      if (imageryLayerRef.current) imageryLayerRef.current.show = false
      viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#0d1929')
      viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#1a2a1a')
      try { (viewer.scene as any).verticalExaggeration = 2.5 } catch {}
      try { (viewer.scene.globe as any).terrainExaggeration = 2.5 } catch {}
      viewer.scene.globe.material = Cesium.Material.fromType('ElevationRamp', {
        minimumHeight: 30,
        maximumHeight: 350,
        image: createElevationRamp(),
      })
      if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false
      viewer.scene.requestRender()
    }

    return () => { cancelled = true }
  }, [ready, mode])

  // === Initial-vy: zooma till objektet ===
  useEffect(() => {
    if (!ready || !objekt || !viewerRef.current) return
    const viewer = viewerRef.current
    if (objekt.lat == null || objekt.lng == null) return
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(objekt.lng, objekt.lat, 150),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-25), roll: 0 },
      duration: 1.5,
    })
  }, [ready, objekt])

  // === Markeringar → Cesium-entiteter ===
  useEffect(() => {
    if (!ready || !viewerRef.current || markers.length === 0 || !objekt) return
    const viewer = viewerRef.current
    // SVG-koord (x, y) → lat/lng — EXAKT samma formel som planering/page.tsx svgToLatLon.
    // Markeringar är skärm-relativa till mapCenter+mapZoom. Vi antar planeringens initial-state:
    // mapCenter = objektets lat/lng, mapZoom = 15 (samma som setMapZoom(15) vid objektval).
    // OBS: om föraren panorerade/zoomade kraftigt INNAN markeringen ritades så stämmer detta inte.
    const mapCenter = { lat: objekt.lat, lng: objekt.lng }
    const mapZoom = 15
    const scale = 156543.03392 * Math.cos(mapCenter.lat * Math.PI / 180) / Math.pow(2, mapZoom)
    const svgToLatLon = (x: number, y: number) => {
      const mPerDegLat = 111320
      const mPerDegLon = 111320 * Math.cos(mapCenter.lat * Math.PI / 180)
      const dxMeters = x * scale
      const dyMeters = -y * scale
      return {
        lat: mapCenter.lat + dyMeters / mPerDegLat,
        lon: mapCenter.lng + dxMeters / mPerDegLon,
      }
    }

    // Rensa befintliga (re-render om markers ändras)
    const oldEntities = viewer.entities.values.filter((e: any) => e.id?.toString().startsWith('mk-'))
    for (const e of oldEntities) viewer.entities.remove(e)

    // Hjälp för att skapa label-property som syns tydligt vid alla zoom-nivåer.
    const makeLabel = (text: string) => ({
      text,
      font: 'bold 18px -apple-system, "SF Pro Display", sans-serif',
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -28),
      showBackground: true,
      backgroundColor: Cesium.Color.fromCssColorString('rgba(20,20,22,0.78)') as any,
      backgroundPadding: new Cesium.Cartesian2(8, 4),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    })

    for (const m of markers) {
      try {
        if (m.isMarker) {
          const ll = svgToLatLon(m.x, m.y)
          const pos = Cesium.Cartesian3.fromDegrees(ll.lon, ll.lat)
          if (m.type === 'eternitytree') {
            // Stam: tjock cylinder, 20m hög
            viewer.entities.add({
              id: `mk-${m.id}-trunk`,
              position: Cesium.Cartesian3.fromDegrees(ll.lon, ll.lat, 10),
              cylinder: {
                length: 20,
                topRadius: 1.5,
                bottomRadius: 2.0,
                material: Cesium.Color.fromCssColorString('#3a2818'),
                outline: false,
              },
            })
            // Krona: stor sfär
            viewer.entities.add({
              id: `mk-${m.id}-crown`,
              position: Cesium.Cartesian3.fromDegrees(ll.lon, ll.lat, 22),
              ellipsoid: {
                radii: new Cesium.Cartesian3(4.0, 4.0, 5.0),
                material: Cesium.Color.fromCssColorString('#30d158'),
              },
              label: m.comment ? makeLabel(m.comment) : undefined,
            })
          } else if (m.type === 'culturestump' || m.type === 'highstump' || m.type === 'brashpile') {
            // Klump: större box på marken
            viewer.entities.add({
              id: `mk-${m.id}`,
              position: Cesium.Cartesian3.fromDegrees(ll.lon, ll.lat, 1.5),
              box: {
                dimensions: new Cesium.Cartesian3(6.0, 6.0, 3.0),
                material: Cesium.Color.fromCssColorString('#8e8e93').withAlpha(0.85),
              },
              label: m.comment ? makeLabel(m.comment) : undefined,
            })
          } else if (m.type === 'ditch' || m.type === 'wet') {
            // Blå fläck på marken — större
            viewer.entities.add({
              id: `mk-${m.id}`,
              position: pos,
              ellipse: {
                semiMajorAxis: 4.5,
                semiMinorAxis: 4.5,
                material: Cesium.Color.fromCssColorString('#0a84ff').withAlpha(0.65),
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              },
              label: m.comment ? makeLabel(m.comment) : undefined,
            })
          } else if (m.type === 'culturemonument') {
            // Orange pelare, större
            viewer.entities.add({
              id: `mk-${m.id}`,
              position: Cesium.Cartesian3.fromDegrees(ll.lon, ll.lat, 3),
              cylinder: {
                length: 6,
                topRadius: 1.5,
                bottomRadius: 1.5,
                material: Cesium.Color.fromCssColorString('#ff9f0a'),
              },
              label: m.comment ? makeLabel(m.comment) : undefined,
            })
          } else {
            // Default: röd cylinder, större
            viewer.entities.add({
              id: `mk-${m.id}`,
              position: Cesium.Cartesian3.fromDegrees(ll.lon, ll.lat, 3),
              cylinder: {
                length: 6,
                topRadius: 1.2,
                bottomRadius: 1.2,
                material: Cesium.Color.fromCssColorString('#ff453a'),
              },
              label: m.comment ? makeLabel(m.comment) : undefined,
            })
          }
        } else if (m.isLine && m.path && m.path.length > 1) {
          const positions: CesiumNS.Cartesian3[] = []
          for (const p of m.path) {
            const ll = svgToLatLon(p.x, p.y)
            positions.push(Cesium.Cartesian3.fromDegrees(ll.lon, ll.lat))
          }
          const color = m.lineType === 'boundary'
            ? Cesium.Color.fromCssColorString('#ffaa00')   // lysande orange traktgräns
            : m.lineType === 'mainRoad'
              ? Cesium.Color.fromCssColorString('#ffd60a')  // gul basväg
              : Cesium.Color.fromCssColorString('#ffffff')
          viewer.entities.add({
            id: `mk-${m.id}`,
            polyline: {
              positions,
              width: m.lineType === 'boundary' ? 8 : m.lineType === 'mainRoad' ? 8 : 6,
              clampToGround: true,
              material: m.lineType === 'boundary'
                ? new Cesium.PolylineDashMaterialProperty({ color, dashLength: 24 })
                : color,
            },
          })
        } else if (m.isZone && m.path && m.path.length >= 3) {
          const hierarchy: CesiumNS.Cartesian3[] = []
          for (const p of m.path) {
            const ll = svgToLatLon(p.x, p.y)
            hierarchy.push(Cesium.Cartesian3.fromDegrees(ll.lon, ll.lat))
          }
          const zoneColor = m.zoneType === 'wet' ? '#0a84ff'
            : m.zoneType === 'steep' ? '#ff453a'
            : m.zoneType === 'culture' ? '#ff9f0a'
            : '#8e8e93'
          const height = m.zoneType === 'wet' ? 3 : m.zoneType === 'steep' ? 3 : 1
          viewer.entities.add({
            id: `mk-${m.id}`,
            polygon: {
              hierarchy: new Cesium.PolygonHierarchy(hierarchy),
              material: Cesium.Color.fromCssColorString(zoneColor).withAlpha(0.5),
              extrudedHeight: height,
              outline: true,
              outlineColor: Cesium.Color.fromCssColorString(zoneColor),
            },
          })
        }
      } catch (e) {
        console.error('[Körvy3D] Marker render fel:', m.id, e)
      }
    }
    console.log('[Körvy3D]', markers.length, 'markeringar renderade')
  }, [ready, markers, objekt])

  // === Kamera-follow på GPS (third-person bakom) ===
  useEffect(() => {
    if (!ready || !viewerRef.current || !pos) return
    const viewer = viewerRef.current
    const heading = pos.heading != null ? pos.heading : 0
    const target = Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, 0)
    // Offset: bakom (mot heading + 180°), 50m bakåt, 20m upp, pitch -15°
    const offset = new Cesium.HeadingPitchRange(
      Cesium.Math.toRadians(heading + 180),
      Cesium.Math.toRadians(-15),
      55,
    )
    viewer.camera.lookAt(target, offset)
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)  // frigör så vi kan flyTo igen om vi vill
  }, [ready, pos])

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Topp-overlay: tillbaka + objektnamn */}
      <div style={{
        position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 12px)', left: 12, right: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        zIndex: 100, pointerEvents: 'none',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
      }}>
        <Link
          href={objektId ? `/planering` : '/'}
          aria-label="Tillbaka"
          style={{
            pointerEvents: 'auto',
            width: 44, height: 44, borderRadius: 22,
            background: 'rgba(20,20,22,0.72)',
            backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            textDecoration: 'none', color: '#fff',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M15 18 L9 12 L15 6" />
          </svg>
        </Link>
        <div style={{
          pointerEvents: 'auto', flex: '0 1 auto', maxWidth: 'calc(100% - 120px)',
          padding: '10px 18px', borderRadius: 22,
          background: 'rgba(20,20,22,0.72)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: '#fff', fontSize: 15, fontWeight: 600,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          textAlign: 'center',
        }}>
          {objekt?.namn || (objektId ? 'Laddar…' : 'Inget objekt')}
          <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.65)', marginLeft: 6 }}>
            · 3D Körvy
          </span>
        </div>
        <button
          onClick={() => setMode((m) => m === 'terrain' ? 'satellite' : 'terrain')}
          aria-label="Växla satellit/terräng"
          style={{
            pointerEvents: 'auto',
            height: 44, padding: '0 14px', borderRadius: 22,
            background: 'rgba(20,20,22,0.72)',
            backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center', gap: 6,
            fontFamily: 'inherit',
          }}
        >
          <span style={{ opacity: mode === 'terrain' ? 1 : 0.45 }}>Terräng</span>
          <span style={{ opacity: 0.4 }}>/</span>
          <span style={{ opacity: mode === 'satellite' ? 1 : 0.45 }}>Satellit</span>
        </button>
      </div>

      {/* Status-overlay nere-vänster */}
      <div style={{
        position: 'fixed', left: 12, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
        padding: '8px 14px', borderRadius: 12,
        background: 'rgba(20,20,22,0.72)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)',
        color: '#fff', fontSize: 13,
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
        zIndex: 100, opacity: 0.92,
      }}>
        <div>{ready ? 'Cesium ✓' : 'Init…'} · {pos ? `GPS ✓` : 'GPS …'} · {markers.length} markeringar</div>
        {error && <div style={{ color: '#ff453a', marginTop: 4 }}>{error}</div>}
      </div>
    </div>
  )
}
