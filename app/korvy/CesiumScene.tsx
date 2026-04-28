'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import type * as CesiumNS from 'cesium'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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

interface NextItem {
  id: string
  type: string
  comment?: string
  dist: number
  bearing: number
  color: string
}

interface AcuteWarning extends NextItem {
  expireAt: number
}

// === Geo-helpers ===
function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const toRad = (x: number) => x * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
function bearingTo(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (x: number) => x * Math.PI / 180
  const toDeg = (x: number) => x * 180 / Math.PI
  const f1 = toRad(lat1), f2 = toRad(lat2), dl = toRad(lon2 - lon1)
  const y = Math.sin(dl) * Math.cos(f2)
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}
function offsetLatLngByBearing(lat: number, lon: number, distM: number, bearingDeg: number): [number, number] {
  const R = 6371000
  const ang = distM / R
  const brg = bearingDeg * Math.PI / 180
  const lat1 = lat * Math.PI / 180
  const lon1 = lon * Math.PI / 180
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(ang) + Math.cos(lat1) * Math.sin(ang) * Math.cos(brg))
  const lon2 = lon1 + Math.atan2(
    Math.sin(brg) * Math.sin(ang) * Math.cos(lat1),
    Math.cos(ang) - Math.sin(lat1) * Math.sin(lat2),
  )
  return [lon2 * 180 / Math.PI, lat2 * 180 / Math.PI]
}
function bearingArrow(bearing: number, heading: number): string {
  const diff = (((bearing - heading) % 360) + 540) % 360 - 180
  if (diff < -135 || diff > 135) return '↓'
  if (diff < -45) return '←'
  if (diff > 45) return '→'
  return '↑'
}
function colorForType(type?: string): string {
  if (!type) return '#8e8e93'
  if (type === 'landing') return '#30d158'
  if (['ditch', 'wet', 'bridge'].includes(type)) return '#0a84ff'
  if (['corduroy', 'brashpile', 'road', 'trail', 'manualfelling', 'highstump'].includes(type)) return '#8e8e93'
  if (['culturemonument', 'culturestump', 'eternitytree', 'naturecorner', 'warning', 'powerline'].includes(type)) return '#ff9f0a'
  if (['steep', 'windfall'].includes(type)) return '#ff453a'
  return '#8e8e93'
}

// === Konstanter ===
// verticalExaggeration skalar terrängen visuellt men INTE entiteters
// absolutpositioner. Vi multiplicerar därför entitet-höjder manuellt.
const VERTICAL_EXAG = 2.5
const CAM_HEIGHT = 25
const CAM_PITCH = -12
const CAM_BACK = 55
const LIGHT_INTENSITY = 3.5

// === Maskin-ikon canvas (cachas) — vit cirkel + blå pil uppåt ===
let _machineIconCache: HTMLCanvasElement | null = null
function getMachineIconCanvas(): HTMLCanvasElement {
  if (_machineIconCache) return _machineIconCache
  const size = 96
  const c = document.createElement('canvas')
  c.width = size; c.height = size
  const ctx = c.getContext('2d')!
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size / 2 - 6, 0, 2 * Math.PI)
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.fill()
  ctx.strokeStyle = '#0a84ff'
  ctx.lineWidth = 5
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(size / 2, 14)
  ctx.lineTo(size / 2 + 26, size - 26)
  ctx.lineTo(size / 2, size / 2 + 6)
  ctx.lineTo(size / 2 - 26, size - 26)
  ctx.closePath()
  ctx.fillStyle = '#0a84ff'
  ctx.fill()
  _machineIconCache = c
  return c
}

export default function CesiumScene({ objektId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<CesiumNS.Viewer | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const imageryLayerRef = useRef<CesiumNS.ImageryLayer | null>(null)
  const groundHeightRef = useRef<number>(150)
  const triggeredIdsRef = useRef<Set<string>>(new Set())
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [objekt, setObjekt] = useState<Objekt | null>(null)
  const [markers, setMarkers] = useState<Marker[]>([])
  const [pos, setPos] = useState<{ lat: number; lon: number; heading: number | null; speed: number | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [nextItems, setNextItems] = useState<NextItem[]>([])
  const [acuteWarning, setAcuteWarning] = useState<AcuteWarning | null>(null)

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
          speed: p.coords.speed ?? null,
        })
      },
      (err) => console.warn('[Körvy3D GPS]', err.code, err.message),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    )
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current)
    }
  }, [])

  // === Cesium init: 1 m DEM-terräng + Esri satellit-imagery som default-bas ===
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return
    let cancelled = false

    const init = async () => {
      try {
        Cesium.Ion.defaultAccessToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN || ''

        const terrain = await Cesium.CesiumTerrainProvider.fromIonAssetId(4683565, { requestVertexNormals: true })
        if (cancelled || !containerRef.current) return

        const viewer = new Cesium.Viewer(containerRef.current, {
          terrainProvider: terrain,
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

        viewer.imageryLayers.removeAll()

        viewer.scene.backgroundColor = Cesium.Color.BLACK
        viewer.scene.globe.baseColor = Cesium.Color.WHITE
        if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true

        try { (viewer.scene as any).verticalExaggeration = VERTICAL_EXAG } catch {}
        try { (viewer.scene.globe as any).terrainExaggeration = VERTICAL_EXAG } catch {}

        viewer.scene.globe.enableLighting = true

        viewer.scene.fog.enabled = true
        viewer.scene.fog.density = 0.0006
        viewer.scene.fog.minimumBrightness = 0.1
        try { (viewer.scene.fog as any).color = Cesium.Color.WHITE.clone() } catch {}

        // Initialt fallback-ljus i ECEF; ersätts av lokal ENU-baserat när objektet är känt.
        viewer.scene.light = new Cesium.DirectionalLight({
          direction: Cesium.Cartesian3.normalize(
            new Cesium.Cartesian3(0.6, -0.6, -0.5),
            new Cesium.Cartesian3()
          ),
          intensity: LIGHT_INTENSITY,
        })

        // Lazy-load Esri World Imagery som bas (gratis, ingen token).
        try {
          const provider = await Cesium.ArcGisMapServerImageryProvider.fromUrl(
            'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
          )
          if (!cancelled && viewerRef.current) {
            imageryLayerRef.current = viewer.imageryLayers.addImageryProvider(provider)
            viewer.scene.requestRender()
          }
        } catch (e) {
          console.warn('[Körvy3D] imagery load:', e)
        }

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
      try { viewerRef.current?.destroy() } catch {}
      viewerRef.current = null
    }
  }, [])

  // === Initial-vy: sampla objektets terränghöjd → ENU-ljus + flyTo ===
  useEffect(() => {
    if (!ready || !objekt || !viewerRef.current) return
    const viewer = viewerRef.current
    if (objekt.lat == null || objekt.lng == null) return
    let cancelled = false

    ;(async () => {
      let groundH = 150
      try {
        const cart = Cesium.Cartographic.fromDegrees(objekt.lng, objekt.lat)
        const sampled = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider as any, [cart])
        if (cancelled) return
        groundH = sampled[0].height || 150
        groundHeightRef.current = groundH

        // Bygg ljusriktning från lokal ENU-frame: solen kommer från NW (östkomponent +1,
        // nordkomponent -1, ned -1 → ljuset träffar terrängen från NW och nedåt)
        const center = Cesium.Cartesian3.fromDegrees(objekt.lng, objekt.lat)
        const enuFrame = Cesium.Transforms.eastNorthUpToFixedFrame(center)
        const localDir = new Cesium.Cartesian3(1, -1, -1)
        Cesium.Cartesian3.normalize(localDir, localDir)
        const worldDir = Cesium.Matrix4.multiplyByPointAsVector(enuFrame, localDir, new Cesium.Cartesian3())
        Cesium.Cartesian3.normalize(worldDir, worldDir)
        viewer.scene.light = new Cesium.DirectionalLight({
          direction: worldDir,
          intensity: LIGHT_INTENSITY,
        })
      } catch (e) {
        console.warn('[Körvy3D] terrain sample (init):', e)
      }

      // Kamera 30 m över exaggererad terräng (Tesla-låg, framåtblickande -12°)
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(objekt.lng, objekt.lat, groundH * VERTICAL_EXAG + 30),
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(CAM_PITCH), roll: 0 },
        duration: 1.5,
      })
    })()

    return () => { cancelled = true }
  }, [ready, objekt])

  // === Markeringar → Cesium-entiteter med terräng-relativa höjder ===
  useEffect(() => {
    if (!ready || !viewerRef.current || markers.length === 0 || !objekt) return
    const viewer = viewerRef.current
    let cancelled = false

    // SVG-koord → lat/lng (samma formel som planering/page.tsx)
    const mapCenter = { lat: objekt.lat, lng: objekt.lng }
    const mapZoom = 15
    const scale = 156543.03392 * Math.cos(mapCenter.lat * Math.PI / 180) / Math.pow(2, mapZoom)
    const svgToLatLon = (x: number, y: number) => {
      const mPerDegLat = 111320
      const mPerDegLon = 111320 * Math.cos(mapCenter.lat * Math.PI / 180)
      return {
        lat: mapCenter.lat + (-y * scale) / mPerDegLat,
        lon: mapCenter.lng + (x * scale) / mPerDegLon,
      }
    }

    ;(async () => {
      // 1) Konvertera punkt-markeringar till lat/lng
      const pointMarkers: { m: Marker; lat: number; lon: number }[] = []
      for (const m of markers) {
        if (m.isMarker) {
          const ll = svgToLatLon(m.x, m.y)
          pointMarkers.push({ m, lat: ll.lat, lon: ll.lon })
        }
      }

      // 2) Sampla terränghöjd för alla punkt-markeringar i ett anrop
      let pointHeights: number[] = pointMarkers.map(() => groundHeightRef.current)
      if (pointMarkers.length > 0) {
        try {
          const carts = pointMarkers.map(p => Cesium.Cartographic.fromDegrees(p.lon, p.lat))
          const sampled = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider as any, carts)
          if (cancelled) return
          pointHeights = sampled.map(c => c.height || groundHeightRef.current)
        } catch (e) {
          console.warn('[Körvy3D] terrain sample (markers):', e)
        }
      }

      // 3) Rensa befintliga marker-entities
      const oldEntities = viewer.entities.values.filter((e: any) => e.id?.toString().startsWith('mk-'))
      for (const e of oldEntities) viewer.entities.remove(e)

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
        disableDepthTestDistance: 200,
      })

      // 4) Rendera punkt-markeringar med exaggererade höjder
      // Cylinder/ellipsoid/box stödjer inte heightReference — vi måste manuellt
      // skala ground-höjden med VERTICAL_EXAG eftersom terrängen är exaggererad.
      for (let i = 0; i < pointMarkers.length; i++) {
        const { m, lat, lon } = pointMarkers[i]
        const exH = pointHeights[i] * VERTICAL_EXAG
        try {
          if (m.type === 'eternitytree') {
            viewer.entities.add({
              id: `mk-${m.id}-trunk`,
              position: Cesium.Cartesian3.fromDegrees(lon, lat, exH + 10),
              cylinder: {
                length: 20, topRadius: 1.5, bottomRadius: 2.0,
                material: Cesium.Color.fromCssColorString('#3a2818'),
                outline: false,
              },
            })
            viewer.entities.add({
              id: `mk-${m.id}-crown`,
              position: Cesium.Cartesian3.fromDegrees(lon, lat, exH + 22),
              ellipsoid: {
                radii: new Cesium.Cartesian3(4.0, 4.0, 5.0),
                material: Cesium.Color.fromCssColorString('#30d158'),
              },
              label: m.comment ? makeLabel(m.comment) : undefined,
            })
            // Glow-skal — lysande halo runt kronan
            viewer.entities.add({
              id: `mk-${m.id}-glow`,
              position: Cesium.Cartesian3.fromDegrees(lon, lat, exH + 22),
              ellipsoid: {
                radii: new Cesium.Cartesian3(7.0, 7.0, 9.0),
                material: Cesium.Color.fromCssColorString('#30d158').withAlpha(0.3),
              },
            })
          } else if (m.type === 'culturestump' || m.type === 'highstump' || m.type === 'brashpile') {
            viewer.entities.add({
              id: `mk-${m.id}`,
              position: Cesium.Cartesian3.fromDegrees(lon, lat, exH + 1.5),
              box: {
                dimensions: new Cesium.Cartesian3(6.0, 6.0, 3.0),
                material: Cesium.Color.fromCssColorString('#8e8e93').withAlpha(0.85),
              },
              label: m.comment ? makeLabel(m.comment) : undefined,
            })
          } else if (m.type === 'ditch' || m.type === 'wet') {
            viewer.entities.add({
              id: `mk-${m.id}`,
              position: Cesium.Cartesian3.fromDegrees(lon, lat),
              ellipse: {
                semiMajorAxis: 4.5, semiMinorAxis: 4.5,
                material: Cesium.Color.fromCssColorString('#0a84ff').withAlpha(0.65),
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              },
              label: m.comment ? makeLabel(m.comment) : undefined,
            })
          } else if (m.type === 'culturemonument') {
            viewer.entities.add({
              id: `mk-${m.id}`,
              position: Cesium.Cartesian3.fromDegrees(lon, lat, exH + 3),
              cylinder: {
                length: 6, topRadius: 1.5, bottomRadius: 1.5,
                material: Cesium.Color.fromCssColorString('#ff9f0a'),
              },
              label: m.comment ? makeLabel(m.comment) : undefined,
            })
          } else {
            viewer.entities.add({
              id: `mk-${m.id}`,
              position: Cesium.Cartesian3.fromDegrees(lon, lat, exH + 3),
              cylinder: {
                length: 6, topRadius: 1.2, bottomRadius: 1.2,
                material: Cesium.Color.fromCssColorString('#ff453a'),
              },
              label: m.comment ? makeLabel(m.comment) : undefined,
            })
          }
        } catch (e) {
          console.error('[Körvy3D] Marker render fel:', m.id, e)
        }
      }

      // 5) Linjer (clampToGround → följer terrängen)
      for (const m of markers) {
        if (!m.isLine || !m.path || m.path.length <= 1) continue
        try {
          const positions: CesiumNS.Cartesian3[] = []
          for (const p of m.path) {
            const ll = svgToLatLon(p.x, p.y)
            positions.push(Cesium.Cartesian3.fromDegrees(ll.lon, ll.lat))
          }
          const color = m.lineType === 'boundary'
            ? Cesium.Color.fromCssColorString('#ffaa00')
            : m.lineType === 'mainRoad'
              ? Cesium.Color.fromCssColorString('#ffd60a')
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
        } catch (e) {
          console.error('[Körvy3D] Line render fel:', m.id, e)
        }
      }

      // 6) Zoner (clampToGround utan extrudering — extruderad polygon stödjer ej CLAMP)
      for (const m of markers) {
        if (!m.isZone || !m.path || m.path.length < 3) continue
        try {
          const hierarchy: CesiumNS.Cartesian3[] = []
          for (const p of m.path) {
            const ll = svgToLatLon(p.x, p.y)
            hierarchy.push(Cesium.Cartesian3.fromDegrees(ll.lon, ll.lat))
          }
          const zoneColor = m.zoneType === 'wet' ? '#0a84ff'
            : m.zoneType === 'steep' ? '#ff453a'
            : m.zoneType === 'culture' ? '#ff9f0a'
            : '#8e8e93'
          viewer.entities.add({
            id: `mk-${m.id}`,
            polygon: {
              hierarchy: new Cesium.PolygonHierarchy(hierarchy),
              material: Cesium.Color.fromCssColorString(zoneColor).withAlpha(0.5),
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              outline: true,
              outlineColor: Cesium.Color.fromCssColorString(zoneColor),
            },
          })
        } catch (e) {
          console.error('[Körvy3D] Zone render fel:', m.id, e)
        }
      }

      console.log(
        '[Körvy3D]', pointMarkers.length, 'pelare,',
        markers.filter(m => m.isLine).length, 'linjer,',
        markers.filter(m => m.isZone).length, 'zoner renderade'
      )
    })()

    return () => { cancelled = true }
  }, [ready, markers, objekt])

  // === GPS-follow: smooth flyTo med terräng-sampling ===
  useEffect(() => {
    if (!ready || !viewerRef.current || !pos) return
    const viewer = viewerRef.current
    let cancelled = false

    ;(async () => {
      const heading = pos.heading != null ? pos.heading : 0
      let groundH = groundHeightRef.current
      try {
        const cart = Cesium.Cartographic.fromDegrees(pos.lon, pos.lat)
        const sampled = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider as any, [cart])
        if (cancelled) return
        groundH = sampled[0].height || groundHeightRef.current
      } catch {}

      // Kamera bakom föraren (motsatt heading), över exaggererad terräng
      const back = offsetLatLngByBearing(pos.lat, pos.lon, CAM_BACK, (heading + 180) % 360)
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(back[0], back[1], groundH * VERTICAL_EXAG + CAM_HEIGHT),
        orientation: {
          heading: Cesium.Math.toRadians(heading),
          pitch: Cesium.Math.toRadians(CAM_PITCH),
          roll: 0,
        },
        duration: 0.4,
      })
    })()

    return () => { cancelled = true }
  }, [ready, pos])

  // === Maskin-ikon + pulserande halo (klampad till mark) ===
  useEffect(() => {
    if (!ready || !viewerRef.current || !pos) return
    const viewer = viewerRef.current
    const heading = pos.heading != null ? pos.heading : 0
    const position = Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat)

    // Rensa befintliga maskin-entiteter
    for (const id of ['machine-icon', 'machine-halo']) {
      const e = viewer.entities.getById(id)
      if (e) viewer.entities.remove(e)
    }

    // Pulserande halo: ellipse-radie animeras 8 → 18 m via CallbackProperty
    const pulseRadius = new Cesium.CallbackProperty(() => {
      const t = (Date.now() % 1800) / 1800   // 0..1 över 1.8 s
      return 8 + t * 10
    }, false)
    const pulseColor = new Cesium.ColorMaterialProperty(
      new Cesium.CallbackProperty(() => {
        const t = (Date.now() % 1800) / 1800
        return Cesium.Color.fromCssColorString('#0a84ff').withAlpha(0.45 * (1 - t))
      }, false) as any
    )
    viewer.entities.add({
      id: 'machine-halo',
      position,
      ellipse: {
        semiMajorAxis: pulseRadius,
        semiMinorAxis: pulseRadius,
        material: pulseColor,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    })

    viewer.entities.add({
      id: 'machine-icon',
      position,
      billboard: {
        image: getMachineIconCanvas(),
        scale: 1.1,
        rotation: Cesium.Math.toRadians(-heading),
        alignedAxis: Cesium.Cartesian3.UNIT_Z,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
    viewer.scene.requestRender()
  }, [ready, pos])

  // === Animation-loop: trigga render ~30 fps medan maskin-halo finns ===
  // requestRenderMode: true innebär att scenen bara renderar vid ändringar.
  // CallbackProperty triggar inte render automatiskt, så vi pinger den.
  useEffect(() => {
    if (!ready || !viewerRef.current || !pos) return
    const viewer = viewerRef.current
    let raf = 0
    let lastTick = 0
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (now - lastTick < 33) return  // ~30 fps
      lastTick = now
      viewer.scene.requestRender()
    }
    raf = requestAnimationFrame(tick)
    return () => { if (raf) cancelAnimationFrame(raf) }
  }, [ready, pos])

  // === Siktfält-kon: blå polygon 30°×150 m framåt, klampad till mark ===
  useEffect(() => {
    if (!ready || !viewerRef.current || !pos) return
    const viewer = viewerRef.current
    const heading = pos.heading != null ? pos.heading : 0

    const existing = viewer.entities.getById('sight-cone')
    if (existing) viewer.entities.remove(existing)

    const halfAngle = 15
    const segments = 8
    const lengthM = 150
    const coords: [number, number][] = [[pos.lon, pos.lat]]
    for (let i = 0; i <= segments; i++) {
      const a = -halfAngle + (2 * halfAngle * i / segments)
      const bearing = (heading + a + 360) % 360
      const [eLon, eLat] = offsetLatLngByBearing(pos.lat, pos.lon, lengthM, bearing)
      coords.push([eLon, eLat])
    }

    viewer.entities.add({
      id: 'sight-cone',
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(
          coords.map(c => Cesium.Cartesian3.fromDegrees(c[0], c[1]))
        ),
        material: Cesium.Color.fromCssColorString('#0a84ff').withAlpha(0.18),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    })
    viewer.scene.requestRender()
  }, [ready, pos])

  // === Nästa-kö: 3 närmaste markeringar inom 300 m ===
  useEffect(() => {
    if (!pos || markers.length === 0 || !objekt) { setNextItems([]); return }

    const mapCenter = { lat: objekt.lat, lng: objekt.lng }
    const mapZoom = 15
    const scale = 156543.03392 * Math.cos(mapCenter.lat * Math.PI / 180) / Math.pow(2, mapZoom)
    const svgToLatLon = (x: number, y: number) => {
      const mPerDegLat = 111320
      const mPerDegLon = 111320 * Math.cos(mapCenter.lat * Math.PI / 180)
      return {
        lat: mapCenter.lat + (-y * scale) / mPerDegLat,
        lon: mapCenter.lng + (x * scale) / mPerDegLon,
      }
    }

    const items: NextItem[] = []
    for (const m of markers) {
      if (!m.isMarker) continue
      const ll = svgToLatLon(m.x, m.y)
      const dist = haversineM(pos.lat, pos.lon, ll.lat, ll.lon)
      if (dist > 300) continue
      const brg = bearingTo(pos.lat, pos.lon, ll.lat, ll.lon)
      items.push({
        id: String(m.id),
        type: m.type || 'default',
        comment: m.comment,
        dist: Math.round(dist),
        bearing: brg,
        color: colorForType(m.type),
      })
    }
    items.sort((a, b) => a.dist - b.dist)
    setNextItems(items.slice(0, 3))
  }, [pos, markers, objekt])

  // === Akut varning vid ≤50 m: vibration + kort + audio ===
  useEffect(() => {
    const closest = nextItems[0]
    if (!closest || closest.dist > 50) return
    if (triggeredIdsRef.current.has(closest.id)) return
    triggeredIdsRef.current.add(closest.id)

    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([30, 50, 30])
    setAcuteWarning({ ...closest, expireAt: Date.now() + 8000 })

    const m = markers.find(mm => String(mm.id) === closest.id) as any
    if (m?.audioData) {
      try {
        if (audioRef.current) audioRef.current.pause()
        audioRef.current = new Audio(m.audioData)
        audioRef.current.play().catch(() => {})
      } catch {}
    }
  }, [nextItems, markers])

  // Auto-dismiss av akut-varning efter expireAt
  useEffect(() => {
    if (!acuteWarning) return
    const remaining = Math.max(0, acuteWarning.expireAt - Date.now())
    const t = setTimeout(() => setAcuteWarning(null), remaining)
    return () => clearTimeout(t)
  }, [acuteWarning])

  const uiHeading = pos?.heading != null ? pos.heading : 0
  const speedKmh = pos?.speed != null && pos.speed >= 0 ? Math.round(pos.speed * 3.6) : null

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
          pointerEvents: 'auto', flex: '0 1 auto', maxWidth: 'calc(100% - 70px)',
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
            · Körvy
          </span>
        </div>
        <div style={{ width: 44, flexShrink: 0 }} />
      </div>

      {/* Akut varning (≤50 m) */}
      {acuteWarning && (
        <div style={{
          position: 'fixed',
          top: 'calc(env(safe-area-inset-top, 0px) + 80px)',
          left: 12, right: 12,
          padding: '14px 18px', borderRadius: 16,
          background: 'rgba(20,20,22,0.92)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          border: `2px solid ${acuteWarning.color}`,
          color: '#fff', zIndex: 110,
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
          display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: `0 8px 32px ${acuteWarning.color}40`,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 20,
            background: acuteWarning.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 800, color: '#fff', flexShrink: 0,
          }}>!</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: acuteWarning.color }}>
              {acuteWarning.dist} m — {acuteWarning.type}
            </div>
            {acuteWarning.comment && (
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>
                {acuteWarning.comment}
              </div>
            )}
          </div>
          <button
            onClick={() => setAcuteWarning(null)}
            aria-label="Stäng"
            style={{
              background: 'rgba(255,255,255,0.1)', border: 'none',
              width: 32, height: 32, borderRadius: 16,
              color: '#fff', fontSize: 18, cursor: 'pointer', flexShrink: 0,
            }}
          >×</button>
        </div>
      )}

      {/* Nästa-kö (3 närmaste markeringar) */}
      {nextItems.length > 0 && (
        <div style={{
          position: 'fixed',
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 56px)',
          left: 12, right: 12,
          display: 'flex', flexDirection: 'column', gap: 6,
          zIndex: 100, pointerEvents: 'none',
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
        }}>
          {nextItems.map((it, idx) => (
            <div key={it.id} style={{
              padding: '10px 14px', borderRadius: 14,
              background: 'rgba(20,20,22,0.78)',
              backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
              border: `1px solid ${idx === 0 ? it.color : 'rgba(255,255,255,0.08)'}`,
              color: '#fff', fontSize: 14,
              display: 'flex', alignItems: 'center', gap: 12,
              opacity: 1 - idx * 0.15,
            }}>
              <span style={{
                fontSize: 22, lineHeight: 1, fontWeight: 700,
                color: it.color, width: 22, textAlign: 'center', flexShrink: 0,
              }}>
                {bearingArrow(it.bearing, uiHeading)}
              </span>
              <span style={{ fontWeight: 700, minWidth: 52, color: it.color }}>
                {it.dist} m
              </span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {it.comment || it.type}
              </span>
            </div>
          ))}
        </div>
      )}

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
        <div>
          {ready ? 'Cesium ✓' : 'Init…'} · {pos ? 'GPS ✓' : 'GPS …'} · {markers.length} mark
          {speedKmh != null ? ` · ${speedKmh} km/h` : ''}
        </div>
        {error && <div style={{ color: '#ff453a', marginTop: 4 }}>{error}</div>}
      </div>
    </div>
  )
}
