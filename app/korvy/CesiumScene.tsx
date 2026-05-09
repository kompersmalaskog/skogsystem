'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import type * as CesiumNS from 'cesium'
import { wmsLayerGroups, wmsLayers, type LayerDef } from '@/lib/mapLayers'
import { useMapLayers, useNumericSetting } from '@/lib/hooks/useMapLayers'

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
  isArrow?: boolean
  lineType?: string
  zoneType?: string
  arrowType?: string
  rotation?: number   // grader, för pilar
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
  // VIDA-traktdirektivets georefererade kartbild. När satt använder 2D
  // bounds-mitten som svgToLatLon-referens (page.tsx:8395–8409). 3D måste
  // matcha eller markeringar driftar relativt HPR-data.
  kartbild_bounds?: [[number, number], [number, number]]
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
// === Dev-mock GPS-loop (aktiveras endast via ?devmock=1) ===
// 60-sekunders lopp N → E → S → tillbaka, med 5 s stillastående mellan
// varje fas. Hastighet 2 m/s ≈ 7.2 km/h vilket matchar realistisk skördarfart
// i fält. Används för att testa kameralogik (följning, heading-rotation,
// stillastående-beteende) utan att vara ute på riktigt.
const DEVMOCK_PHASES: Array<{ duration: number; heading: number; speed: number }> = [
  { duration: 15, heading: 0,   speed: 2.0 },  // N, ~7 km/h, 30 m
  { duration: 5,  heading: 0,   speed: 0   },  // stopp
  { duration: 15, heading: 90,  speed: 2.0 },  // E, ~7 km/h, 30 m
  { duration: 5,  heading: 90,  speed: 0   },  // stopp
  { duration: 15, heading: 180, speed: 2.0 },  // S, ~7 km/h, 30 m
  { duration: 5,  heading: 180, speed: 0   },  // stopp (totalt 60 s)
]

// Beräkna mock-pos vid en given tid (sekunder sedan loop-start, modulo 60).
// Returnerar samma form som GPS-watcher: heading=null vid stillastående
// (matchar browser-GPS-beteende när hastighet < 1 m/s).
function computeDevMockPos(
  elapsedSec: number,
  baseLat: number,
  baseLng: number,
): { lat: number; lon: number; heading: number | null; speed: number | null } {
  let lat = baseLat
  let lng = baseLng
  let phaseStart = 0
  for (const phase of DEVMOCK_PHASES) {
    const phaseEnd = phaseStart + phase.duration
    if (elapsedSec < phaseEnd) {
      const tInPhase = elapsedSec - phaseStart
      if (phase.speed > 0) {
        const dist = tInPhase * phase.speed
        const [olon, olat] = offsetLatLngByBearing(lat, lng, dist, phase.heading)
        return { lat: olat, lon: olon, heading: phase.heading, speed: phase.speed }
      }
      return { lat, lon: lng, heading: null, speed: 0 }
    }
    if (phase.speed > 0) {
      const dist = phase.duration * phase.speed
      const [olon, olat] = offsetLatLngByBearing(lat, lng, dist, phase.heading)
      lng = olon
      lat = olat
    }
    phaseStart = phaseEnd
  }
  return { lat, lon: lng, heading: null, speed: 0 }
}

function bearingArrow(bearing: number, heading: number): string {
  const diff = (((bearing - heading) % 360) + 540) % 360 - 180
  if (diff < -135 || diff > 135) return '↓'
  if (diff < -45) return '←'
  if (diff > 45) return '→'
  return '↑'
}
// Beräkna mapCenter + mapZoom som matchar 2D-vyns referens när markeringar
// sparades (page.tsx:8395–8409): bounds-mitten + zoom 15 om kartbild_bounds
// finns på objektet, annars obj.lat/lng + zoom 16. Utan denna matchning
// driftar alla markeringar relativt HPR-data (som lagras med absoluta lat/lng).
function svgRefForObjekt(o: Objekt): { mapCenter: { lat: number; lng: number }; mapZoom: number } {
  const b = o.kartbild_bounds
  if (b && b[0] && b[1]) {
    return {
      mapCenter: { lat: (b[0][0] + b[1][0]) / 2, lng: (b[0][1] + b[1][1]) / 2 },
      mapZoom: 15,
    }
  }
  return { mapCenter: { lat: o.lat, lng: o.lng }, mapZoom: 16 }
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
// Bil-GPS-stil körvy. Pitch beräknas dynamiskt från viewport-aspect (se
// computeDynamicPitch) så maskinen alltid hamnar ~80% Y oberoende av om
// föraren håller mobilen i landscape eller portrait.
//   CAM_BACK 20 m   → tight bakom maskinen, pilen syns stor
//   CAM_HEIGHT 12 m → låg kamera, "inne i" landskapet
const CAM_HEIGHT = 12
const CAM_BACK = 20
// Andel av halv vertikal-FOV som maskinen ska hamna under bildmitt.
// 0.30 = 30 % från center mot bottom-edge → ~80 % Y från top.
const MACHINE_Y_OFFSET_FRACTION = 0.30
const LIGHT_INTENSITY = 3.5

// Beräkna kameragebyometri så maskinen alltid hamnar ~80% Y oberoende av
// viewport-aspect, slider-back-värde, och slider-pitch-läge.
//
// Två lägen styrt av userPitchDeg:
//   0   → AUTO: fast camHeight (CAM_HEIGHT_DEFAULT), beräkna pitch från
//         viewport-FOV + camBack
//   ≠ 0 → MANUELL: pitch fixerad enligt slider, beräkna istället camHeight
//         så maskinen ändå landar på 80% Y. Geometrin förblir konsekvent
//         när föraren testar olika pitch-vinklar.
//
// Geometri:
//   half_vert_fov = atan(tan(fovX/2) / aspect)
//   desired_y_offset = MACHINE_Y_OFFSET_FRACTION × half_vert_fov  (radianer)
//   machine_angle (under camera horizon) = atan(camHeight / camBack)
//   pitch = -(machine_angle - desired_y_offset)
//   ⇔ machine_angle = -pitch + desired_y_offset
//   ⇔ camHeight = camBack × tan(machine_angle)  (manuellt läge)
function computeCamGeometry(
  viewer: CesiumNS.Viewer,
  camBack: number,
  userPitchDeg: number,
): { pitch: number; camHeight: number } {
  const canvas = viewer.scene.canvas
  const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight)
  const fovX = (viewer.camera.frustum as any).fov  // X-FOV (default 60°)
  const halfVertFov = Math.atan(Math.tan(fovX / 2) / aspect)
  const desiredOffset = MACHINE_Y_OFFSET_FRACTION * halfVertFov

  if (userPitchDeg === 0) {
    // AUTO — fast camHeight, lös pitch
    const machineAngle = Math.atan(CAM_HEIGHT / camBack)
    return {
      pitch: -(machineAngle - desiredOffset),
      camHeight: CAM_HEIGHT,
    }
  }

  // MANUELL — fast pitch, lös camHeight så maskin på 80% Y
  const pitchRad = userPitchDeg * Math.PI / 180  // negativt
  const machineAngle = -pitchRad + desiredOffset
  const safeAngle = Math.max(0.01, Math.min(Math.PI / 2 - 0.01, machineAngle))
  return {
    pitch: pitchRad,
    camHeight: camBack * Math.tan(safeAngle),
  }
}

// === Lager-grupper synliga i 3D (filtrerade på show3D) ===
const layerGroups3D = wmsLayerGroups
  .map((g) => ({ ...g, layers: g.layers.filter((l) => l.show3D) }))
  .filter((g) => g.layers.length > 0)

// Bygg en Cesium ImageryProvider för en LayerDef. Returnerar null för
// lager-typer vi inte stödjer (t.ex. ArcGIS exportImage).
function createImageryProviderForLayer(d: LayerDef): CesiumNS.ImageryProvider | null {
  // /api/wms-proxy → URL-template med proxyns query-format
  if (d.url === '/api/wms-proxy') {
    return new Cesium.UrlTemplateImageryProvider({
      url: `/api/wms-proxy?layer=${d.id}&bbox={westProjected},{southProjected},{eastProjected},{northProjected}&width={width}&height={height}`,
      tilingScheme: new Cesium.WebMercatorTilingScheme(),
    })
  }
  // Direkt WMS — Cesium WebMapServiceImageryProvider sköter GetMap-anrop
  if (d.url.startsWith('http') && d.layers) {
    return new Cesium.WebMapServiceImageryProvider({
      url: d.url,
      layers: d.layers,
      parameters: { format: 'image/png', transparent: true },
    })
  }
  return null
}

// === Linje-stilar — speglar lineTypeDefs i app/planering/page.tsx:496–509 ===
// Två-färgs randmönster (boundary/mainRoad/nature/ditch) använder
// PolylineDashMaterialProperty med color + gapColor (Cesium ≥1.114).
// Övriga är streckade en-färgs (samma som 2D:s [2.5,1.5] dasharray).
function lineStyleFor(lineType: string | undefined): { material: any; width: number } {
  const stripe = (c1: string, c2: string, dashLength = 16) =>
    new Cesium.PolylineDashMaterialProperty({
      color: Cesium.Color.fromCssColorString(c1),
      gapColor: Cesium.Color.fromCssColorString(c2),
      dashLength,
    })
  const dashed = (c: string, dashLength = 12) =>
    new Cesium.PolylineDashMaterialProperty({
      color: Cesium.Color.fromCssColorString(c),
      dashLength,
    })
  switch (lineType) {
    case 'boundary':       return { material: stripe('#ff453a', '#fbbf24'), width: 8 }
    case 'mainRoad':       return { material: stripe('#3b82f6', '#fbbf24'), width: 8 }
    case 'nature':         return { material: stripe('#30d158', '#ff453a'), width: 6 }
    case 'ditch':          return { material: stripe('#06b6d4', '#0e7490'), width: 6 }
    case 'trail':          return { material: dashed('#ffffff', 10),         width: 4 }
    case 'backRoadRed':
    case 'sideRoadRed':    return { material: dashed('#ff453a'),              width: 4 }
    case 'backRoadYellow':
    case 'sideRoadYellow': return { material: dashed('#fbbf24'),              width: 4 }
    case 'backRoadBlue':
    case 'sideRoadBlue':   return { material: dashed('#3b82f6'),              width: 4 }
    case 'stickvag':       return { material: dashed('#ff00ff'),              width: 4 }
    default:               return { material: dashed('#ffffff'),              width: 4 }
  }
}

// === Zon-färger — speglar zoneTypes i app/planering/page.tsx:4686–4693 ===
function zoneColorFor(zoneType: string | undefined): string {
  switch (zoneType) {
    case 'wet':         return '#3b82f6'
    case 'steep':       return '#a855f7'
    case 'protected':   return '#30d158'
    case 'culture':     return '#f59e0b'
    case 'noentry':     return '#ff453a'
    case 'fornlamning': return '#ff453a'
    default:            return '#8e8e93'
  }
}

// === Outlier-filter för markeringar (SVG-units) ===
// Skyddar mot felaktiga markeringar med koordinater >200 SVG-units från
// objekt-centrum. De har troligen ritats när mapCenter stod på fel referens
// (ex. Stenshult-default innan ett objekt valdes), och hamnar hundratals m
// till km bort när rekonverterade. Filtreras klient-side i båda 2D- och 3D-vyer.
//
// Tröskel-resonemang: vid zoom 16 är 1 SVG-unit ≈ 1.32 m på 56°N (zoom 15: 2.65 m).
// 200 units → ~265 m (zoom 16) / ~530 m (zoom 15). Realistisk objekt-area får
// rejäl marginal, men markeringar som hamnat på fel kartbild-mitten klipps.
// Tidigare värde 1000 (≈ 1.3–2.6 km) släppte fortfarande igenom långa streck.
//
// SQL för manuell rensning i Supabase (kör inte automatiskt — verifiera först):
// DELETE FROM planering_markeringar WHERE marker_id IN (
//   '1772898258170', '1772898638712',
//   '1772445281097', '1777998752739', '1777304162620'
// );
const OUTLIER_LIMIT = 200
function isOutlierPoint(p: { x: number; y: number }): boolean {
  return Math.abs(p.x) > OUTLIER_LIMIT || Math.abs(p.y) > OUTLIER_LIMIT
}
function filterMarkerOutliers(m: Marker): Marker | null {
  if ((m.isMarker || m.isArrow) && isOutlierPoint(m)) return null
  if (m.path && m.path.length > 0) {
    const cleanPath = m.path.filter((p) => !isOutlierPoint(p))
    const minPath = m.isLine ? 2 : m.isZone ? 3 : 1
    if (cleanPath.length < minPath) return null
    return { ...m, path: cleanPath }
  }
  return m
}

// Alpha för overlay-imagery beroende på bg-läget. I cockpit vill vi att
// markfuktighet bara "glöder" mot mörk bas — annars solid. Topo-varianterna
// behandlas som 'satellite' (solid bg → solid overlays).
function alphaForOverlay(layerId: string, bg: 'cockpit' | 'satellite' | 'topo' | 'topo_nedtonad'): number {
  if (bg !== 'cockpit') return 1.0
  if (layerId === 'sks_markfuktighet') return 0.45
  return 1.0
}

// === Trädslag-färg för HPR-högar (matchar 2D pie-chart-paletten) ===
function colorForSlag(slag: string): string {
  switch (slag.toUpperCase()) {
    case 'GRAN':              return '#1d9e75'
    case 'TALL':              return '#f59e0b'
    case 'BJÖRK':
    case 'BJORK':             return '#ffffff'
    default:                  return '#8e8e93'   // ÖVR_LÖV och allt annat
  }
}

// Dominant trädslag = det med mest m³. Vid lika m³ → alfabetisk ordning.
function dominantSlagFor(volymPerSlag: Record<string, number>): string {
  const entries = Object.entries(volymPerSlag)
  if (entries.length === 0) return ''
  entries.sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
  return entries[0][0]
}

// === Pil-färg — speglar arrowTypes i app/planering/page.tsx:4713–4716 ===
function arrowColorFor(arrowType: string | undefined): string {
  switch (arrowType) {
    case 'fellingdirection': return '#30d158'  // grön
    case 'drivedirection':   return '#3b82f6'  // blå
    default:                 return '#ffffff'
  }
}

// === Pil som triangulär polygon, klampad till mark + roterad enligt
// m.rotation (grader). Spetsen pekar i riktningen. Storlek 6 m totalt
// så pilen syns på 50–100 m avstånd från Tesla-höjd.
function addArrowEntity(
  viewer: CesiumNS.Viewer,
  m: Marker,
  lat: number,
  lon: number,
  labelOpt: any,
): void {
  const baseId = `mk-${m.id}`
  const color = Cesium.Color.fromCssColorString(arrowColorFor(m.arrowType))
  const rot = m.rotation || 0

  // Triangulär pil-spets: tip 4 m framåt, bak-bas 2 m bakåt × 1.5 m bredd
  const tip = offsetLatLngByBearing(lat, lon, 4, rot)
  const back = offsetLatLngByBearing(lat, lon, 2, (rot + 180) % 360)
  const left = offsetLatLngByBearing(back[1], back[0], 1.5, (rot + 270) % 360)
  const right = offsetLatLngByBearing(back[1], back[0], 1.5, (rot + 90) % 360)

  const positions = [
    Cesium.Cartesian3.fromDegrees(tip[0], tip[1]),
    Cesium.Cartesian3.fromDegrees(right[0], right[1]),
    Cesium.Cartesian3.fromDegrees(left[0], left[1]),
  ]

  viewer.entities.add({
    id: baseId,
    position: Cesium.Cartesian3.fromDegrees(lon, lat),
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy(positions),
      material: color.withAlpha(0.85),
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      outline: true,
      outlineColor: color,
    },
    label: labelOpt,
  })
}

// === Markerings-3D — geometriska former per typ. Färgen matchar 2D-symbolens
// cirkelfärg så typen är igenkännbar. Cylinder/ellipsoid/box stödjer inte
// heightReference, så positions-höjden får exH (groundH * VERTICAL_EXAG)
// adderat med en lokal offset för att stå ovanpå exaggererad terräng.
// ===
function addMarkerEntities(
  viewer: CesiumNS.Viewer,
  m: Marker,
  lat: number,
  lon: number,
  exH: number,
  labelOpt: any,
): void {
  const baseId = `mk-${m.id}`
  const at = (h: number) => Cesium.Cartesian3.fromDegrees(lon, lat, exH + h)
  const colorOf = (hex: string) => Cesium.Color.fromCssColorString(hex)

  switch (m.type) {
    case 'eternitytree': {
      // Stam + krona. Glow-ellipsoiden borttagen (var dekorativ utan funktion).
      viewer.entities.add({
        id: `${baseId}-trunk`,
        position: at(10),
        cylinder: { length: 20, topRadius: 1.5, bottomRadius: 2.0, material: colorOf('#3a2818') },
      })
      viewer.entities.add({
        id: `${baseId}-crown`,
        position: at(22),
        ellipsoid: { radii: new Cesium.Cartesian3(4, 4, 5), material: colorOf('#30d158') },
        label: labelOpt,
      })
      break
    }
    case 'naturecorner': {
      // Grön smal stam + grön kon ovanpå (mindre än evighetsträd)
      viewer.entities.add({
        id: `${baseId}-trunk`,
        position: at(2),
        cylinder: { length: 4, topRadius: 0.3, bottomRadius: 0.3, material: colorOf('#30d158') },
      })
      viewer.entities.add({
        id: `${baseId}-top`,
        position: at(5),
        cylinder: { length: 2, topRadius: 0, bottomRadius: 1, material: colorOf('#30d158') },
        label: labelOpt,
      })
      break
    }
    case 'culturemonument': {
      // Orange stolpe + liten orange sfär (R-symbol i 2D)
      viewer.entities.add({
        id: `${baseId}-pole`,
        position: at(1),
        cylinder: { length: 2, topRadius: 0.4, bottomRadius: 0.4, material: colorOf('#f59e0b') },
      })
      viewer.entities.add({
        id: `${baseId}-top`,
        position: at(2.3),
        ellipsoid: { radii: new Cesium.Cartesian3(0.6, 0.6, 0.6), material: colorOf('#f59e0b') },
        label: labelOpt,
      })
      break
    }
    case 'culturestump': {
      // Grå stubbe — låg box på marken
      viewer.entities.add({
        id: baseId,
        position: at(0.25),
        box: { dimensions: new Cesium.Cartesian3(1, 1, 0.5), material: colorOf('#8e8e93') },
        label: labelOpt,
      })
      break
    }
    case 'highstump': {
      // Brun cylinder med platt avskuren topp, 4 m hög
      viewer.entities.add({
        id: baseId,
        position: at(2),
        cylinder: { length: 4, topRadius: 0.4, bottomRadius: 0.4, material: colorOf('#8e6b3d') },
        label: labelOpt,
      })
      break
    }
    case 'brashpile': {
      // Brun klump — två överlappande boxar för oregelbunden silhuett
      viewer.entities.add({
        id: `${baseId}-base`,
        position: at(0.5),
        box: { dimensions: new Cesium.Cartesian3(5, 3, 1), material: colorOf('#6b4423') },
      })
      viewer.entities.add({
        id: `${baseId}-top`,
        position: at(1),
        box: { dimensions: new Cesium.Cartesian3(3, 2, 1), material: colorOf('#6b4423') },
        label: labelOpt,
      })
      break
    }
    case 'landing': {
      // Mörk grå platt cylinder, markerar lagringsyta
      viewer.entities.add({
        id: baseId,
        position: at(0.15),
        cylinder: { length: 0.3, topRadius: 2, bottomRadius: 2, material: colorOf('#3a3a3a') },
        label: labelOpt,
      })
      break
    }
    case 'windfall': {
      // Liggande brun cylinder (fallet träd), pekar mot NE och lutad 5°
      const center = at(0.5)
      const hpr = new Cesium.HeadingPitchRoll(
        Cesium.Math.toRadians(30),   // riktning NE
        Cesium.Math.toRadians(90),    // ligger horisontellt
        Cesium.Math.toRadians(5),     // lutad lite
      )
      const orientation = Cesium.Transforms.headingPitchRollQuaternion(center, hpr)
      viewer.entities.add({
        id: baseId,
        position: center,
        orientation: orientation as any,
        cylinder: { length: 8, topRadius: 0.5, bottomRadius: 0.5, material: colorOf('#8e6b3d') },
        label: labelOpt,
      })
      break
    }
    case 'manualfelling': {
      // Mörk pole + orange varningsskylt
      viewer.entities.add({
        id: `${baseId}-pole`,
        position: at(1),
        cylinder: { length: 2, topRadius: 0.1, bottomRadius: 0.1, material: colorOf('#3a2818') },
      })
      viewer.entities.add({
        id: `${baseId}-sign`,
        position: at(2.5),
        box: { dimensions: new Cesium.Cartesian3(1.5, 0.2, 1.0), material: colorOf('#ff9f0a') },
        label: labelOpt,
      })
      break
    }
    case 'powerline': {
      // Grå pylon — torn med horisontellt cross-arm
      viewer.entities.add({
        id: `${baseId}-tower`,
        position: at(6),
        cylinder: { length: 12, topRadius: 0.3, bottomRadius: 0.5, material: colorOf('#5a5a5a') },
      })
      viewer.entities.add({
        id: `${baseId}-arm`,
        position: at(11.5),
        box: { dimensions: new Cesium.Cartesian3(3, 0.3, 0.3), material: colorOf('#5a5a5a') },
        label: labelOpt,
      })
      break
    }
    case 'ditch': {
      // Cyan nedsänkt cylinder, 0.5 m djup. Topp precis ovan mark så den
      // syns som en grund pöl/ränna. Färg matchar 2D dike-linjens cyan.
      viewer.entities.add({
        id: baseId,
        position: at(0.05),
        cylinder: {
          length: 0.5,
          topRadius: 1.5,
          bottomRadius: 1.5,
          material: colorOf('#06b6d4').withAlpha(0.7),
        },
        label: labelOpt,
      })
      break
    }
    case 'bridge': {
      // Grå platta, något upphöjd över mark
      viewer.entities.add({
        id: baseId,
        position: at(0.4),
        box: { dimensions: new Cesium.Cartesian3(4, 1, 0.3), material: colorOf('#5a5a5a') },
        label: labelOpt,
      })
      break
    }
    case 'corduroy': {
      // 3 parallella liggande timmer i öst-västlig riktning, offset i nord-syd
      for (let i = 0; i < 3; i++) {
        const offM = (i - 1) * 0.6
        const bearingDeg = offM >= 0 ? 0 : 180
        const [olon, olat] = offsetLatLngByBearing(lat, lon, Math.abs(offM), bearingDeg)
        const pos = Cesium.Cartesian3.fromDegrees(olon, olat, exH + 0.25)
        const orientation = Cesium.Transforms.headingPitchRollQuaternion(
          pos,
          new Cesium.HeadingPitchRoll(0, Cesium.Math.toRadians(90), 0),
        )
        viewer.entities.add({
          id: `${baseId}-log${i}`,
          position: pos,
          orientation: orientation as any,
          cylinder: { length: 3, topRadius: 0.25, bottomRadius: 0.25, material: colorOf('#6b4423') },
          ...(i === 1 ? { label: labelOpt } : {}),
        })
      }
      break
    }
    case 'wet': {
      // Halvtransparent blå sfär halvt nedsänkt — översta halvan synlig
      viewer.entities.add({
        id: baseId,
        position: at(0),
        ellipsoid: {
          radii: new Cesium.Cartesian3(1.5, 1.5, 1.5),
          material: colorOf('#3b82f6').withAlpha(0.6),
        },
        label: labelOpt,
      })
      break
    }
    case 'warning': {
      // Röd kon (cylinder med topRadius=0) — varningsskylt-känsla
      viewer.entities.add({
        id: baseId,
        position: at(1),
        cylinder: { length: 2, topRadius: 0, bottomRadius: 1, material: colorOf('#ff453a') },
        label: labelOpt,
      })
      break
    }
    default: {
      // Okänd typ — neutral grå cylinder så den ändå syns
      viewer.entities.add({
        id: baseId,
        position: at(1.5),
        cylinder: { length: 3, topRadius: 0.6, bottomRadius: 0.6, material: colorOf('#8e8e93') },
        label: labelOpt,
      })
      break
    }
  }
}

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

// === Tunnelvision-mask: radial gradient som mörkar terrängen utanför Synfält ===
// Cesium ImageMaterialProperty på en stor (5000 m) ellipse ger en
// clampToGround "skugga" runt maskinen. Gradient-stoparna beräknas
// dynamiskt från distance + softness:
//   total radie     = distance (m)
//   fadeout-zon     = distance × softness/100
//   full klarhet    = distance - fadeout
//
// Mappning till canvasens radial-axel (0..1) över ellipsens 5000 m semi-major:
//   0           → transparent
//   clarityEnd  → transparent (sista helt klara stoppet)
//   distance    → 65 % mörkt (första helmörka stoppet)
//   1.0         → 65 % mörkt (konstant utåt så terräng > distance dämpas)
// Tidigare 85 % var för mörkt — terrängen utanför fokuszonen drunknade.
function buildTunnelMaskCanvas(distance: number, softness: number): HTMLCanvasElement {
  const size = 512
  const ELLIPSE_R = 5000
  const c = document.createElement('canvas')
  c.width = size; c.height = size
  const ctx = c.getContext('2d')!
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)

  const fade = distance * (softness / 100)
  const clarityEnd = Math.max(0, distance - fade)

  const clarityStop = Math.max(0, Math.min(1, clarityEnd / ELLIPSE_R))
  const darkStop = Math.max(clarityStop, Math.min(1, distance / ELLIPSE_R))

  grad.addColorStop(0.0, 'rgba(20,20,20,0)')
  // Hoppa över duplicerat stopp om clarityStop = 0 (softness 100 %)
  if (clarityStop > 0.0001) {
    grad.addColorStop(clarityStop, 'rgba(20,20,20,0)')
  }
  grad.addColorStop(darkStop, 'rgba(20,20,20,0.65)')
  grad.addColorStop(1.0, 'rgba(20,20,20,0.65)')

  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)
  return c
}

// Applicera DistanceDisplayCondition på 3D-formade entiteter med given prefix.
// Hård hide bortom (distance + 5 m camera-buffer) — ClampToGround-objekt
// (polygons/polylines/ellipse) berörs INTE; de fadeas naturligt av tunnel-
// mask-overlayen.
function applyTunnelDDC(viewer: CesiumNS.Viewer, prefix: string, distance: number): void {
  const ddc = new Cesium.DistanceDisplayCondition(0, distance + 5)
  for (const e of viewer.entities.values) {
    const id = e.id?.toString() || ''
    if (!id.startsWith(prefix)) continue
    if (e.cylinder || e.box || e.ellipsoid) {
      e.distanceDisplayCondition = ddc
    }
  }
}

export default function CesiumScene({ objektId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<CesiumNS.Viewer | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const imageryLayerRef = useRef<CesiumNS.ImageryLayer | null>(null)
  const overlayLayersMapRef = useRef<Map<string, CesiumNS.ImageryLayer>>(new Map())
  // Cachar fetched + clustered HPR-data per objekt så toggle inte refetchar.
  // dominantSlag bestämmer halvsfärens färg per kluster.
  const hprCacheRef = useRef<{
    objektId: string
    clusters: Array<{
      lat: number; lng: number; volym: number; isGrot: boolean
      exH: number; dominantSlag: string
    }>
  } | null>(null)
  const groundHeightRef = useRef<number>(150)
  // Senast kända heading från GPS — används vid stillastående (pos.heading=null
  // när hastighet < 1 m/s) så kameran inte snäpper till nord-uppåt vid stopp.
  const lastHeadingRef = useRef<number>(0)
  // True efter initial-setView. GPS-follow bailar tills detta är true så
  // kameran inte börjar fly:To medan den fortfarande är i sin default-startpos
  // (rakt ner mot Earth-mitten). Skyddar mot async-race vid mount.
  const initialFlightDoneRef = useRef<boolean>(false)
  const triggeredIdsRef = useRef<Set<string>>(new Set())
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [objekt, setObjekt] = useState<Objekt | null>(null)
  const [markers, setMarkers] = useState<Marker[]>([])
  const [pos, setPos] = useState<{ lat: number; lon: number; heading: number | null; speed: number | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [nextItems, setNextItems] = useState<NextItem[]>([])
  const [acuteWarning, setAcuteWarning] = useState<AcuteWarning | null>(null)
  // === Lager-väljare ===
  const [overlays, setOverlays] = useMapLayers()
  const [layerMenuOpen, setLayerMenuOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  // bgType — bakgrundskarta. Default 'topo' (OpenTopoMap) eftersom den matchar
  // planeringsvyns terräng-bas och är visuellt rikast. Initial state läses från
  // ?bg=cockpit/satellite/topo/topo_nedtonad — fallback 'topo'.
  //   topo            → OpenTopoMap XYZ (icke-Lantmäteriet)
  //   topo_nedtonad   → Lantmäteriet topowebbkartan_nedtonad (WMS)
  // Se STATUS.md för licensrisker (CC-BY-SA + tile usage policy för OpenTopoMap).
  const [bgType, setBgType] = useState<'cockpit' | 'satellite' | 'topo' | 'topo_nedtonad'>(() => {
    if (typeof window === 'undefined') return 'topo'
    const bg = new URL(window.location.href).searchParams.get('bg')
    if (bg === 'satellite' || bg === 'topo' || bg === 'topo_nedtonad' || bg === 'cockpit') return bg
    return 'topo'
  })
  // Lazy-cachade ImageryLayer-refs per topo-variant så toggle bara visar/döljer
  // istället för add/remove varje gång.
  const topoLayerRef = useRef<CesiumNS.ImageryLayer | null>(null)
  const topoNedtonadLayerRef = useRef<CesiumNS.ImageryLayer | null>(null)
  // === Tunnelvision — Synfält (m) + Mjukhet (%) ===
  const [viewfieldDistance, setViewfieldDistance] = useNumericSetting('viewfield_distance', 300)
  // viewfield_softness_v2: bumpad nyckel så befintliga användare får ny default 60
  // (mjukare fade-zon än tidigare 40). Tillsammans med sänkt mörker-alpha 0.65
  // ger det en mindre dramatisk tunnelvision.
  const [viewfieldSoftness, setViewfieldSoftness] = useNumericSetting('viewfield_softness_v2', 60)
  // === Kamerasliders ===
  // camBack: avstånd bakom maskinen (15–80 m). Default 20 = tight bakom.
  // camPitchUser: 0 = AUTO (dynamisk pitch från viewport), annars fast pitch
  // i grader (-45 till -10). När fast pitch är satt löser computeCamGeometry
  // ut camHeight så maskinen ändå landar på 80% Y.
  // cam_back_v2: bumpad nyckel så existing users (stored 20 från v1) får nya
  // min/default 30 m. v1-värdet ligger kvar i localStorage men läses inte.
  const [camBack, setCamBack] = useNumericSetting('cam_back_v2', 30)
  const [camPitchUser, setCamPitchUser] = useNumericSetting('cam_pitch_user_v1', 0)
  // === Kamerakontroll ===
  // followGps=true → kameran följer GPS bakom maskinen (default).
  // followGps=false → användaren snurrar/tiltar/panar fritt; visa centrera-knapp.
  const [followGps, setFollowGps] = useState(true)

  // === Dev-mock-flagga: aktiveras via ?devmock=1 ===
  // page.tsx laddar CesiumScene med ssr:false så window är alltid tillgänglig
  // i useState-initializern — ingen hydration-mismatch.
  const [isDevMock] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('devmock') === '1'
  })

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

  // === GPS-watcher (skippas i dev-mock-läget) ===
  useEffect(() => {
    if (isDevMock) return  // dev-mock-loopen tar över i en separat effekt
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
  }, [isDevMock])

  // === Dev-mock GPS-loop (aktiveras via ?devmock=1) ===
  // Tickar 2 Hz med en pos beräknad från DEVMOCK_PHASES, modulo 60 s. Loggar
  // maskin- och kamera-state varje sekund så man kan verifiera att kameran
  // hamnar där matematiken säger. Effekten är helt no-op när isDevMock=false.
  useEffect(() => {
    if (!isDevMock) return
    if (!objekt || objekt.lat == null || objekt.lng == null) return
    const baseLat = objekt.lat
    const baseLng = objekt.lng
    const t0 = Date.now()
    let lastLogSec = -1

    const tick = () => {
      const elapsed = ((Date.now() - t0) / 1000) % 60
      const mock = computeDevMockPos(elapsed, baseLat, baseLng)
      setPos(mock)

      // Logga endast en gång per sekund (annars 2 Hz ger för mycket spam)
      const sec = Math.floor(elapsed)
      if (sec !== lastLogSec) {
        lastLogSec = sec
        const cam = viewerRef.current?.camera
        const carto = cam?.positionCartographic
        // eslint-disable-next-line no-console
        console.log('[devmock]', JSON.stringify({
          t: elapsed.toFixed(1),
          machine: {
            lat: +mock.lat.toFixed(6),
            lon: +mock.lon.toFixed(6),
            heading: mock.heading,
            speed: mock.speed,
          },
          camera: cam && carto ? {
            lat: +Cesium.Math.toDegrees(carto.latitude).toFixed(6),
            lon: +Cesium.Math.toDegrees(carto.longitude).toFixed(6),
            height: +carto.height.toFixed(1),
            heading: +Cesium.Math.toDegrees(cam.heading).toFixed(1),
            pitch: +Cesium.Math.toDegrees(cam.pitch).toFixed(1),
          } : null,
        }))
      }
    }

    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [isDevMock, objekt])

  // === Exponera viewerRef till window i dev-mock så Cesium-API:et kan
  // inspekteras från konsolen (window.viewerRef.scene, .camera, etc.) ===
  useEffect(() => {
    if (!isDevMock) return
    if (!ready || !viewerRef.current) return
    ;(window as any).viewerRef = viewerRef.current
    return () => { delete (window as any).viewerRef }
  }, [isDevMock, ready])

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
          // requestRenderMode default false (continuous rendering): flyTo:s
          // tween-animation behöver frames varje 16ms för att glida fram. Med
          // requestRenderMode=true triggas frames bara vid explicita
          // requestRender()-anrop, så tween-progressen körs aldrig och
          // kameran fastnar på sin start-position.
          requestRenderMode: false,
        })
        viewerRef.current = viewer

        // Skarpare tile-LOD vid nära zoom. Default 2.0 ger pixliga tile-
        // gränser när kameran är 5–25 m över marken. 1.5 → ~1.8× tile-budget
        // men noticeably skarpare hillshade-mesh vid förarens normala
        // arbetsavstånd.
        viewer.scene.globe.maximumScreenSpaceError = 1.5

        // === Kamerakontroll: matcha MapLibre 2D så användaren får samma gester ===
        // Cesium kräver OBJEKT-syntax {eventType, modifier} för modifier-bindings,
        // INTE array-syntax [eventType, modifier]. reactToInput läser
        // eventType.eventType och eventType.modifier — array tolkas som
        // separata entries och blir no-op (verifierat i SSC.js rad 504).
        //
        // I 3D anropas reactToInput INTE för translateEventTypes (det är 2D-
        // /Columbus-only enligt update3D rad 2874). LEFT_DRAG måste därför
        // vara i en av {rotate, look, tilt}EventTypes för att göra något.
        //
        // Mappning (matchar MapLibre dragPan + dragRotate):
        //   vänster-drag (1 finger)        → spin3D (pan via globe-rotation
        //                                      på låg altitud = förflyttning
        //                                      över terräng — motsvarar
        //                                      MapLibres DragPan)
        //   höger-drag                     → look3D (hanterar yaw + pitch i
        //                                      samma drag = rotera + tilta,
        //                                      motsvarar MapLibres DragRotate)
        //   Ctrl + vänster-drag            → look3D (alternativ för enknappsmus)
        //   hjul / pinch (spread)          → zoom
        //   pinch (vertikal 2-finger drag) → tilt3D
        const ssc = viewer.scene.screenSpaceCameraController
        ssc.enableInputs = true
        ssc.enableTranslate = true
        ssc.enableZoom = true
        ssc.enableRotate = true
        ssc.enableTilt = true
        ssc.enableLook = true
        ssc.translateEventTypes = Cesium.CameraEventType.LEFT_DRAG  // no-op i 3D, gäller 2D
        ssc.rotateEventTypes = Cesium.CameraEventType.LEFT_DRAG     // → spin3D = pan
        ssc.lookEventTypes = [
          Cesium.CameraEventType.RIGHT_DRAG,
          { eventType: Cesium.CameraEventType.LEFT_DRAG, modifier: Cesium.KeyboardEventModifier.CTRL },
        ]
        ssc.tiltEventTypes = [Cesium.CameraEventType.PINCH]
        ssc.zoomEventTypes = [
          Cesium.CameraEventType.WHEEL,
          Cesium.CameraEventType.PINCH,
        ]

        viewer.imageryLayers.removeAll()

        // === Cockpit-default — mörk himmel, ljus grå mark, ingen satellit-imagery.
        // baseColor = #c0c0c0 (RGB 192) ger en ljus neutral yta som mottar
        // shading från enableLighting + DirectionalLight (rad nedan). Vertex-
        // normaler på 1m DEM-terrängen ger oändligt skarpt hillshade vid alla
        // zoom-nivåer — bättre än WMS-rasters fasta tile-upplösning.
        // Esri-imagery lazy-laddas först om föraren togglar till "Satellit".
        viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#1a1a1a')
        viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#c0c0c0')
        if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false

        try { (viewer.scene as any).verticalExaggeration = VERTICAL_EXAG } catch {}
        try { (viewer.scene.globe as any).terrainExaggeration = VERTICAL_EXAG } catch {}

        viewer.scene.globe.enableLighting = true

        viewer.scene.fog.enabled = true
        viewer.scene.fog.density = 0.0006
        viewer.scene.fog.minimumBrightness = 0.1
        try { (viewer.scene.fog as any).color = Cesium.Color.fromCssColorString('#1a1a1a') } catch {}

        // Initialt fallback-ljus i ECEF; ersätts av lokal ENU-baserat när objektet är känt.
        viewer.scene.light = new Cesium.DirectionalLight({
          direction: Cesium.Cartesian3.normalize(
            new Cesium.Cartesian3(0.6, -0.6, -0.5),
            new Cesium.Cartesian3()
          ),
          intensity: LIGHT_INTENSITY,
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
      try { viewerRef.current?.destroy() } catch {}
      viewerRef.current = null
    }
  }, [])

  // === Detektera användar-input på Cesium-canvas → pausa GPS-följning ===
  // Cesium.Camera.moveStart fyrar för både programmatiska flyTo OCH user-input,
  // så vi kan inte använda den för att skilja. Lyssnar istället på DOM-events
  // direkt på canvas (mousedown/touchstart/wheel) som bara fyrar på riktig
  // user-input.
  useEffect(() => {
    if (!ready || !viewerRef.current) return
    const viewer = viewerRef.current
    const canvas = viewer.canvas
    if (!canvas) return

    const onUserInput = () => {
      // Avbryt eventuell pågående GPS-follow-flyTo så användarens drag inte
      // fightar med en flyto-animation.
      try { viewer.camera.cancelFlight() } catch {}
      setFollowGps((prev) => (prev ? false : prev))
    }

    canvas.addEventListener('mousedown', onUserInput)
    canvas.addEventListener('touchstart', onUserInput, { passive: true })
    canvas.addEventListener('wheel', onUserInput, { passive: true })
    return () => {
      canvas.removeEventListener('mousedown', onUserInput)
      canvas.removeEventListener('touchstart', onUserInput)
      canvas.removeEventListener('wheel', onUserInput)
    }
  }, [ready])

  // === Bakgrund-toggle: cockpit (mörk) vs satellit ===
  // Esri lazy-laddas först vid första 'satellite'-toggle. I cockpit får
  // markfuktighet låg alpha så den glöder mot mörk bas (alphaForOverlay).
  useEffect(() => {
    if (!ready || !viewerRef.current) return
    const viewer = viewerRef.current
    let cancelled = false

    // Hjälpare: dölj alla bg-imagery-layers innan vi visar den aktiva.
    const hideAllBgLayers = () => {
      if (imageryLayerRef.current) imageryLayerRef.current.show = false
      if (topoLayerRef.current) topoLayerRef.current.show = false
      if (topoNedtonadLayerRef.current) topoNedtonadLayerRef.current.show = false
    }

    if (bgType === 'satellite') {
      viewer.scene.backgroundColor = Cesium.Color.BLACK
      viewer.scene.globe.baseColor = Cesium.Color.WHITE
      if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true
      try { (viewer.scene.fog as any).color = Cesium.Color.WHITE.clone() } catch {}

      hideAllBgLayers()
      if (imageryLayerRef.current) {
        imageryLayerRef.current.show = true
      } else {
        Cesium.ArcGisMapServerImageryProvider.fromUrl(
          'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
        ).then((provider) => {
          if (cancelled || !viewerRef.current) return
          const layer = viewer.imageryLayers.addImageryProvider(provider)
          imageryLayerRef.current = layer
          // Lägg satellit-baslagret längst ner så overlays (markfuktighet etc) hamnar ovanpå
          try { viewer.imageryLayers.lowerToBottom(layer) } catch {}
          viewer.scene.requestRender()
        }).catch((e) => console.warn('[Körvy3D] satellite lazy-load:', e))
      }
    } else if (bgType === 'topo') {
      // OpenTopoMap XYZ — samma kartstil som planeringsvyns "Terräng"-bas.
      // CC-BY-SA + tile usage policy: måttlig privat användning OK, kommersiellt
      // kräver kontakt eller egen hosting (se STATUS.md). maxzoom 17 → kan bli
      // suddig vid hög pitch nära marken; använd 'topo_nedtonad' (LM) då.
      viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#1a1a1a')
      viewer.scene.globe.baseColor = Cesium.Color.WHITE
      if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false
      try { (viewer.scene.fog as any).color = Cesium.Color.fromCssColorString('#1a1a1a') } catch {}

      hideAllBgLayers()
      if (topoLayerRef.current) {
        topoLayerRef.current.show = true
      } else {
        try {
          const provider = new Cesium.UrlTemplateImageryProvider({
            url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
            maximumLevel: 17,
            credit: '© OpenTopoMap (CC-BY-SA), © OpenStreetMap contributors, SRTM',
          })
          const layer = viewer.imageryLayers.addImageryProvider(provider)
          topoLayerRef.current = layer
          try { viewer.imageryLayers.lowerToBottom(layer) } catch {}
          viewer.scene.requestRender()
        } catch (e) {
          console.warn('[Körvy3D] OpenTopoMap init:', e)
        }
      }
    } else if (bgType === 'topo_nedtonad') {
      // Lantmäteriet topowebbkartan_nedtonad — WMS direktanslutning, gråskala
      // designad som bakgrund för annat innehåll. Bra "fokus-läge" där markörer
      // sticker ut maximalt mot grå bas. SRS sätts från WebMercatorTilingScheme.
      viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#1a1a1a')
      viewer.scene.globe.baseColor = Cesium.Color.WHITE
      if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false
      try { (viewer.scene.fog as any).color = Cesium.Color.fromCssColorString('#1a1a1a') } catch {}

      hideAllBgLayers()
      if (topoNedtonadLayerRef.current) {
        topoNedtonadLayerRef.current.show = true
      } else {
        try {
          const provider = new Cesium.WebMapServiceImageryProvider({
            url: 'https://minkarta.lantmateriet.se/map/topowebb/',
            layers: 'topowebbkartan_nedtonad',
            parameters: { format: 'image/png' },
            tilingScheme: new Cesium.WebMercatorTilingScheme(),
          })
          const layer = viewer.imageryLayers.addImageryProvider(provider)
          topoNedtonadLayerRef.current = layer
          try { viewer.imageryLayers.lowerToBottom(layer) } catch {}
          viewer.scene.requestRender()
        } catch (e) {
          console.warn('[Körvy3D] topo-nedtonad init:', e)
        }
      }
    } else {
      // 'cockpit' — ljus grå mark (för 1m DEM-hillshade), mörk himmel, atmosfär av
      hideAllBgLayers()
      viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#1a1a1a')
      viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#c0c0c0')
      if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false
      try { (viewer.scene.fog as any).color = Cesium.Color.fromCssColorString('#1a1a1a') } catch {}
    }

    // Applicera alpha på alla aktiva overlays — sks_markfuktighet glöder i cockpit
    for (const [id, layer] of Array.from(overlayLayersMapRef.current.entries())) {
      try { (layer as any).alpha = alphaForOverlay(id, bgType) } catch {}
    }

    viewer.scene.requestRender()
    return () => { cancelled = true }
  }, [ready, bgType])

  // === Overlay-management: synka aktiva overlays mot Cesium imagery-lager ===
  useEffect(() => {
    if (!ready || !viewerRef.current) return
    const viewer = viewerRef.current
    const map = overlayLayersMapRef.current

    // 1) Ta bort lager som är avstängda eller inte längre i listan
    const activeIds = new Set<string>()
    for (const def of wmsLayers) {
      if (def.show3D && overlays[def.id]) activeIds.add(def.id)
    }
    for (const [id, imLayer] of Array.from(map.entries())) {
      if (!activeIds.has(id)) {
        try { viewer.imageryLayers.remove(imLayer, true) } catch {}
        map.delete(id)
      }
    }

    // 2) Lägg till nya aktiva lager
    for (const def of wmsLayers) {
      if (!def.show3D) continue
      if (!overlays[def.id]) continue
      if (map.has(def.id)) continue
      const provider = createImageryProviderForLayer(def)
      if (!provider) {
        console.warn('[Körvy3D] kunde inte bygga imagery-provider för', def.id)
        continue
      }
      try {
        const imLayer = viewer.imageryLayers.addImageryProvider(provider)
        try { (imLayer as any).alpha = alphaForOverlay(def.id, bgType) } catch {}
        map.set(def.id, imLayer)
      } catch (e) {
        console.warn('[Körvy3D] addImageryProvider', def.id, e)
      }
    }

    viewer.scene.requestRender()
  }, [ready, overlays, bgType])

  // === Initial-vy: setView (instant) + ENU-ljus async ===
  // setView görs synkront FÖRE terrain-sample så kameran landar direkt på
  // rätt plats. Annars cancellerade flyTo-cancellation från GPS-follow's
  // 2 Hz mock-tickar (eller 1 Hz riktig GPS) den initiala flygningen innan
  // den hann komma fram, och kameran fastnade tusentals km från målet.
  // Terrain-sample körs async efteråt — uppdaterar groundHeightRef + ljus
  // riktning men påverkar inte den redan placerade kameran.
  useEffect(() => {
    if (!ready || !objekt || !viewerRef.current) return
    const viewer = viewerRef.current
    if (objekt.lat == null || objekt.lng == null) return

    // 1) Synkront setView med default groundH (150 m fallback). Cesium
    //    klampar inte mot exakt terränghöjd här, men fel-marginal är ~1-2 m
    //    pga 1m DEM och dev-mock kan godta det. GPS-follow-flytten plockar
    //    upp den exakta höjden via terrain-sample (utom i dev-mock-läget).
    const groundH = groundHeightRef.current
    const initBack = offsetLatLngByBearing(objekt.lat, objekt.lng, camBack, 180)
    const initGeom = computeCamGeometry(viewer, camBack, camPitchUser)
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(initBack[0], initBack[1], groundH * VERTICAL_EXAG + initGeom.camHeight),
      orientation: { heading: 0, pitch: initGeom.pitch, roll: 0 },
    })
    initialFlightDoneRef.current = true
    viewer.scene.requestRender()

    // 2) Async terrain-sample + ljus — uppdaterar refs i bakgrunden
    let cancelled = false
    ;(async () => {
      try {
        const cart = Cesium.Cartographic.fromDegrees(objekt.lng, objekt.lat)
        const sampled = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider as any, [cart])
        if (cancelled) return
        groundHeightRef.current = sampled[0].height || 150

        // Bygg ljusriktning från lokal ENU-frame: klassisk hillshade-belysning
        // azimuth 315° (NW), elevation 45° över horisonten.
        //   sol-position ≈ (-0.5, 0.5, 0.707)  [East, North, Up]
        //   ljus-direktion = -sol-position ≈ (0.5, -0.5, -0.707)
        const center = Cesium.Cartesian3.fromDegrees(objekt.lng, objekt.lat)
        const enuFrame = Cesium.Transforms.eastNorthUpToFixedFrame(center)
        const localDir = new Cesium.Cartesian3(0.5, -0.5, -0.707)
        Cesium.Cartesian3.normalize(localDir, localDir)
        const worldDir = Cesium.Matrix4.multiplyByPointAsVector(enuFrame, localDir, new Cesium.Cartesian3())
        Cesium.Cartesian3.normalize(worldDir, worldDir)
        viewer.scene.light = new Cesium.DirectionalLight({
          direction: worldDir,
          intensity: LIGHT_INTENSITY,
        })
        viewer.scene.requestRender()
      } catch (e) {
        console.warn('[Körvy3D] terrain sample (init):', e)
      }
    })()

    return () => { cancelled = true }
  }, [ready, objekt])

  // === Markeringar → Cesium-entiteter med terräng-relativa höjder ===
  useEffect(() => {
    if (!ready || !viewerRef.current || markers.length === 0 || !objekt) return
    const viewer = viewerRef.current
    let cancelled = false

    // SVG-koord → lat/lng — referens MÅSTE matcha 2D vid spara-tillfället
    // (annars driftar markeringar relativt HPR-data, ~70 m för Järnemåla Rapp Au)
    const { mapCenter, mapZoom } = svgRefForObjekt(objekt)
    const scale = 156543.03392 * Math.cos(mapCenter.lat * Math.PI / 180) / Math.pow(2, mapZoom)
    const svgToLatLon = (x: number, y: number) => {
      const mPerDegLat = 111320
      const mPerDegLon = 111320 * Math.cos(mapCenter.lat * Math.PI / 180)
      return {
        lat: mapCenter.lat + (-y * scale) / mPerDegLat,
        lon: mapCenter.lng + (x * scale) / mPerDegLon,
      }
    }

    // Filtrera bort outlier-markeringar (>1000 SVG-units från objekt-centrum)
    // som annars syns som "streck genom kartan"
    const safeMarkers = markers
      .map(filterMarkerOutliers)
      .filter((m): m is Marker => m !== null)

    ;(async () => {
      // 1) Konvertera punkt-markeringar till lat/lng
      const pointMarkers: { m: Marker; lat: number; lon: number }[] = []
      for (const m of safeMarkers) {
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

      // 4) Rendera punkt-markeringar via addMarkerEntities-helpern (typ-specifika
      // 3D-former). Cylinder/ellipsoid/box stödjer inte heightReference — vi
      // skalar ground-höjden med VERTICAL_EXAG och passerar exH till helpern.
      for (let i = 0; i < pointMarkers.length; i++) {
        const { m, lat, lon } = pointMarkers[i]
        const exH = pointHeights[i] * VERTICAL_EXAG
        const labelOpt = m.comment ? makeLabel(m.comment) : undefined
        try {
          addMarkerEntities(viewer, m, lat, lon, exH, labelOpt)
        } catch (e) {
          console.error('[Körvy3D] Marker render fel:', m.id, e)
        }
      }

      // 4b) Pilar — triangulär polygon clampToGround, riktning från m.rotation
      for (const m of safeMarkers) {
        if (!m.isArrow) continue
        try {
          const ll = svgToLatLon(m.x, m.y)
          const labelOpt = m.comment ? makeLabel(m.comment) : undefined
          addArrowEntity(viewer, m, ll.lat, ll.lon, labelOpt)
        } catch (e) {
          console.error('[Körvy3D] Arrow render fel:', m.id, e)
        }
      }

      // 5) Linjer — clampToGround + matchar 2D-vyns färger/streckmönster
      // OBS: traktgräns-polygoner från 2D lagras med sista punkten = första
      // (closed loop). Cesium GroundPolylineGeometry hanterar inte den
      // duplicerade slut-punkten väl — segmentet [N-1]→[0] blir 0-längd och
      // tyst skippar hela primitiven. Filtrera därför bort sista pixel-
      // identiska punkten innan vi bygger Cartesian3-array. Geometriskt blir
      // polygonen ändå sluten via [N-2]→[0]-segmentet.
      for (const m of safeMarkers) {
        if (!m.isLine || !m.path || m.path.length <= 1) continue
        try {
          let pts = m.path
          if (pts.length >= 3) {
            const f = pts[0]
            const l = pts[pts.length - 1]
            if (f.x === l.x && f.y === l.y) pts = pts.slice(0, -1)
          }
          const positions: CesiumNS.Cartesian3[] = []
          for (const p of pts) {
            const ll = svgToLatLon(p.x, p.y)
            positions.push(Cesium.Cartesian3.fromDegrees(ll.lon, ll.lat))
          }
          const { material, width } = lineStyleFor(m.lineType)
          viewer.entities.add({
            id: `mk-${m.id}`,
            polyline: { positions, width, clampToGround: true, material },
          })
        } catch (e) {
          console.error('[Körvy3D] Line render fel:', m.id, e)
        }
      }

      // 6) Zoner — clampToGround, alpha 0.2 + solid outline (matchar 2D fill+outline)
      for (const m of safeMarkers) {
        if (!m.isZone || !m.path || m.path.length < 3) continue
        try {
          const hierarchy: CesiumNS.Cartesian3[] = []
          for (const p of m.path) {
            const ll = svgToLatLon(p.x, p.y)
            hierarchy.push(Cesium.Cartesian3.fromDegrees(ll.lon, ll.lat))
          }
          const zoneColor = zoneColorFor(m.zoneType)
          viewer.entities.add({
            id: `mk-${m.id}`,
            polygon: {
              hierarchy: new Cesium.PolygonHierarchy(hierarchy),
              material: Cesium.Color.fromCssColorString(zoneColor).withAlpha(0.2),
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              outline: true,
              outlineColor: Cesium.Color.fromCssColorString(zoneColor),
            },
          })
        } catch (e) {
          console.error('[Körvy3D] Zone render fel:', m.id, e)
        }
      }

      // Tunnelvision: hård hide bortom Synfält + 5 m för 3D-formade markörer
      // (cylinder/box/ellipsoid). ClampToGround-objekt fadeas naturligt
      // av tunnel-mask-overlayen.
      applyTunnelDDC(viewer, 'mk-', viewfieldDistance)

      console.log(
        '[Körvy3D]', pointMarkers.length, 'pelare,',
        safeMarkers.filter(m => m.isLine).length, 'linjer,',
        safeMarkers.filter(m => m.isZone).length, 'zoner renderade',
        markers.length - safeMarkers.length > 0 ? `(${markers.length - safeMarkers.length} outliers filtrerade)` : '',
      )
    })()

    return () => { cancelled = true }
  }, [ready, markers, objekt])

  // === HPR-högar (produktion + GROT) — fetch från Supabase, klustra, rendera ===
  // Datakällor:
  //  - hpr_filer: hittar senaste filen för objektet (högst stammar_count)
  //  - hpr_stammar: enskilda stammar med lat/lng/volym/trädslag/grot-flagga
  //  - skotning_uttag: redan skotade volymer som dras av globalt per trädslag
  //
  // Klustringen följer 2D-logik: stammar inom ~10 m grupperas till en hög,
  // separat per produktion vs GROT. Färgerna matchar 2D:
  //  - produktion: #1d9e75 grön
  //  - grot:       #f59e0b orange
  //
  // Cylinder-höjd skalas med volym (clamp 0.5–5 m) så större högar syns.
  // Toggling via overlays.produktionshogar / overlays.grothogar; data cachas
  // per objekt-id i hprCacheRef så att toggle inte triggar refetch.
  useEffect(() => {
    if (!ready || !viewerRef.current || !objekt) return
    const viewer = viewerRef.current
    let cancelled = false

    ;(async () => {
      // Stäng av båda → bara rensa
      const showProd = !!overlays.produktionshogar
      const showGrot = !!overlays.grothogar

      // 1) Fetch + cluster om inte cached för detta objekt
      if (hprCacheRef.current?.objektId !== objekt.id) {
        try {
          // a) Senaste hpr-filen
          const { data: filer } = await supabase
            .from('hpr_filer')
            .select('id, stammar_count')
            .eq('objekt_id', objekt.id)
            .order('stammar_count', { ascending: false })
            .limit(1)
          if (cancelled) return
          if (!filer || filer.length === 0) {
            hprCacheRef.current = { objektId: objekt.id, clusters: [] }
          } else {
            const filId = filer[0].id

            // b) Paginera stammar (1000 åt gången)
            const allStammar: any[] = []
            let offset = 0
            while (true) {
              const { data, error } = await supabase
                .from('hpr_stammar')
                .select('lat, lng, total_volym, tradslag, bio_energy_adaption, sortiment')
                .eq('hpr_fil_id', filId)
                .not('lat', 'is', null)
                .range(offset, offset + 999)
              if (cancelled) return
              if (error || !data || data.length === 0) break
              allStammar.push(...data)
              if (data.length < 1000) break
              offset += 1000
            }

            // c) Skotning_uttag (för subtraktion)
            const { data: uttag } = await supabase
              .from('skotning_uttag')
              .select('tradslag, volym')
              .eq('objekt_id', objekt.id)
            if (cancelled) return

            // d) Klustra inom ~10 m (0.00009° lat, 0.00016° lng på 56°N)
            type C = {
              lat: number; lng: number; isGrot: boolean
              volym: number; volymPerSlag: Record<string, number>; count: number
            }
            const LAT_T = 0.00009
            const LNG_T = 0.00016
            const clusters: C[] = []
            for (const s of allStammar) {
              const isGrot = !!s.bio_energy_adaption
              const vol = s.total_volym || 0
              const slag = s.tradslag || 'okänd'
              const c = clusters.find((cc) =>
                cc.isGrot === isGrot &&
                Math.abs(cc.lat - s.lat) < LAT_T &&
                Math.abs(cc.lng - s.lng) < LNG_T
              )
              if (c) {
                c.lat = (c.lat * c.count + s.lat) / (c.count + 1)
                c.lng = (c.lng * c.count + s.lng) / (c.count + 1)
                c.volym += vol
                c.volymPerSlag[slag] = (c.volymPerSlag[slag] || 0) + vol
                c.count += 1
              } else {
                clusters.push({
                  lat: s.lat, lng: s.lng, isGrot,
                  volym: vol,
                  volymPerSlag: { [slag]: vol },
                  count: 1,
                })
              }
            }

            // e) Subtrahera uttag globalt per trädslag (proportionellt mot kluster-andel)
            const totalPerSlag: Record<string, number> = {}
            for (const c of clusters) {
              for (const [s, v] of Object.entries(c.volymPerSlag)) {
                totalPerSlag[s] = (totalPerSlag[s] || 0) + v
              }
            }
            const uttagPerSlag: Record<string, number> = {}
            for (const u of (uttag || [])) {
              const s = u.tradslag || 'okänd'
              uttagPerSlag[s] = (uttagPerSlag[s] || 0) + (u.volym || 0)
            }
            for (const c of clusters) {
              let newTotal = 0
              for (const [s, v] of Object.entries(c.volymPerSlag)) {
                const total = totalPerSlag[s] || 1
                const fraction = v / total
                const sub = (uttagPerSlag[s] || 0) * fraction
                const remaining = Math.max(0, v - sub)
                c.volymPerSlag[s] = remaining
                newTotal += remaining
              }
              c.volym = newTotal
            }

            // f) Sampla terränghöjd för varje kluster (en batch)
            const carts = clusters.map((c) => Cesium.Cartographic.fromDegrees(c.lng, c.lat))
            let heights: number[] = clusters.map(() => groundHeightRef.current)
            if (carts.length > 0) {
              try {
                const sampled = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider as any, carts)
                if (cancelled) return
                heights = sampled.map((sc) => sc.height || groundHeightRef.current)
              } catch (e) {
                console.warn('[Körvy3D] HPR terrain sample fel:', e)
              }
            }

            hprCacheRef.current = {
              objektId: objekt.id,
              clusters: clusters.map((c, i) => ({
                lat: c.lat, lng: c.lng, volym: c.volym, isGrot: c.isGrot,
                exH: heights[i] * VERTICAL_EXAG,
                dominantSlag: dominantSlagFor(c.volymPerSlag),
              })),
            }
            console.log('[Körvy3D] HPR:', clusters.length, 'kluster (', clusters.filter((c) => c.isGrot).length, 'grot)')
          }
        } catch (e) {
          console.warn('[Körvy3D] HPR fetch fel:', e)
          hprCacheRef.current = { objektId: objekt.id, clusters: [] }
        }
      }

      // 2) Rensa befintliga hpr-entiteter
      const oldEnts = viewer.entities.values.filter((e: any) => e.id?.toString().startsWith('hpr-'))
      for (const e of oldEnts) viewer.entities.remove(e)

      // 3) Rendera enligt overlays-state
      const cache = hprCacheRef.current
      if (!cache) return

      const hprLabel = (text: string) => ({
        text,
        font: 'bold 14px -apple-system, "SF Pro Display", sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -16),
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('rgba(20,20,22,0.78)') as any,
        backgroundPadding: new Cesium.Cartesian2(6, 3),
        disableDepthTestDistance: 200,
      })

      for (let i = 0; i < cache.clusters.length; i++) {
        const c = cache.clusters[i]
        if (c.volym <= 0.01) continue
        if (c.isGrot && !showGrot) continue
        if (!c.isGrot && !showProd) continue

        // Dramatisk skalning så stora högar visuellt dominerar:
        //   radie  ∈ [0.5, 4.0] m, formel 0.5 + sqrt(volym/10)
        //   höjd   ∈ [0.4, 3.5] m, formel 0.4 + sqrt(volym/15)
        const radius = Math.min(Math.max(0.5 + Math.sqrt(c.volym / 10), 0.5), 4.0)
        const height = Math.min(Math.max(0.4 + Math.sqrt(c.volym / 15), 0.4), 3.5)
        // Färg = dominant trädslags färg (samma logik prod & grot — toggle skiljer)
        const color = colorForSlag(c.dominantSlag)
        const labelText = `${Math.round(c.volym)} m³`

        // Halvsfär: ellipsoid centrerad vid markhöjd → övre halvan synlig,
        // nedre halvan göms av terrängen. Mer organisk än cylinder.
        viewer.entities.add({
          id: `hpr-${c.isGrot ? 'g' : 'p'}-${i}`,
          position: Cesium.Cartesian3.fromDegrees(c.lng, c.lat, c.exH),
          ellipsoid: {
            radii: new Cesium.Cartesian3(radius, radius, height),
            material: Cesium.Color.fromCssColorString(color).withAlpha(0.95),
          },
          label: hprLabel(labelText),
        })
      }

      // Tunnelvision: hård hide bortom Synfält + 5 m för HPR-halvsfärerna
      applyTunnelDDC(viewer, 'hpr-', viewfieldDistance)

      viewer.scene.requestRender()
    })()

    return () => { cancelled = true }
  }, [ready, objekt, overlays.produktionshogar, overlays.grothogar])

  // === GPS-follow: smooth flyTo med terräng-sampling ===
  // Pausas när followGps=false (användaren snurrar/tiltar manuellt). Centrera-
  // knappen sätter followGps=true → effekten kör igen och snäpper kameran tillbaka.
  useEffect(() => {
    if (!ready || !viewerRef.current || !pos) return
    if (!followGps) return
    const viewer = viewerRef.current
    let cancelled = false

    // Vänta tills initial-setView har placerat kameran. Annars startar
    // flyTo från default Cesium-position (rakt ner mot Earth-mitten) och
    // hinner aldrig komma fram innan nästa pos-tick cancellerar den.
    if (!initialFlightDoneRef.current) return

    ;(async () => {
      // Heading: använd GPS:ns heading när det finns (hastighet ≥ 1 m/s),
      // annars sista kända så kameran inte snäpper till nord vid stopp.
      if (pos.heading != null) lastHeadingRef.current = pos.heading
      const heading = pos.heading != null ? pos.heading : lastHeadingRef.current

      // I dev-mock (2 Hz) hoppar vi över terrain-sample — den asynkrona
      // räntan cancellerar varje flyTo innan den hinner köra. Riktig GPS
      // (1 Hz) får tillräckligt med tid för sampling. Initial-vyn har redan
      // sampla:t terrängen och uppdaterat groundHeightRef.
      let groundH = groundHeightRef.current
      if (!isDevMock) {
        try {
          const cart = Cesium.Cartographic.fromDegrees(pos.lon, pos.lat)
          const sampled = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider as any, [cart])
          if (cancelled) return
          groundH = sampled[0].height || groundHeightRef.current
        } catch {}
      }

      // Kamera bakom föraren (motsatt heading), över exaggererad terräng.
      // Duration 1.0 s så animationen överlappar nästa GPS-tick (~1 Hz) och
      // ger kontinuerlig glidande rörelse istället för rycka-stå-rycka.
      const geom = computeCamGeometry(viewer, camBack, camPitchUser)
      const back = offsetLatLngByBearing(pos.lat, pos.lon, camBack, (heading + 180) % 360)
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(back[0], back[1], groundH * VERTICAL_EXAG + geom.camHeight),
        orientation: {
          heading: Cesium.Math.toRadians(heading),
          pitch: geom.pitch,
          roll: 0,
        },
        duration: 1.0,
      })
    })()

    return () => { cancelled = true }
  }, [ready, pos, followGps, camBack, camPitchUser])

  // === Maskin-pil — polygon med image material, klampad till terrängen ===
  // Drapas på marken som en målad pil på vägen istället för en stående
  // billboard. 5 m diameter romb (cardinal corners N/E/S/W) med Image-
  // MaterialProperty som visar vit cirkel + blå pil. polygon.stRotation
  // roterar texturen med maskinens heading. lastHeadingRef behåller
  // orienteringen vid stillastående.
  useEffect(() => {
    if (!ready || !viewerRef.current || !pos) return
    const viewer = viewerRef.current
    if (pos.heading != null) lastHeadingRef.current = pos.heading
    const heading = pos.heading != null ? pos.heading : lastHeadingRef.current

    // Rensa ev. gammal entity oavsett tidigare typ
    for (const id of ['machine-icon', 'machine-arrow']) {
      const e = viewer.entities.getById(id)
      if (e) viewer.entities.remove(e)
    }

    // Romb 5 m diameter — corners cardinal (N, E, S, W)
    const half = 2.5
    const corners = [
      offsetLatLngByBearing(pos.lat, pos.lon, half, 0),
      offsetLatLngByBearing(pos.lat, pos.lon, half, 90),
      offsetLatLngByBearing(pos.lat, pos.lon, half, 180),
      offsetLatLngByBearing(pos.lat, pos.lon, half, 270),
    ]
    const polyPositions = corners.map(([lon, lat]) =>
      Cesium.Cartesian3.fromDegrees(lon, lat),
    )

    viewer.entities.add({
      id: 'machine-arrow',
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(polyPositions),
        material: new Cesium.ImageMaterialProperty({
          image: getMachineIconCanvas(),
          transparent: true,
        }),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        // Bilden ritar pilen pekande "uppåt" (heading 0 = N). stRotation
        // roterar texturen med −heading så pilen följer maskinens kurs.
        stRotation: Cesium.Math.toRadians(-heading),
      },
    })
    viewer.scene.requestRender()
  }, [ready, pos])

  // === Tunnelvision-mask: gradient-mörkning runt maskinen ===
  // Stor ellipse (5000 m) följer GPS-position, drapas på marken med
  // ImageMaterialProperty från radial gradient-canvasen. Stop-positioner
  // beräknas dynamiskt från viewfieldDistance + viewfieldSoftness — bygger
  // om canvas vid varje slider-tick. Påverkar mark/imagery + clampToGround-
  // objekt; 3D-extruderade markörer hanteras separat via DDC.
  useEffect(() => {
    if (!ready || !viewerRef.current || !pos) return
    const viewer = viewerRef.current

    const existing = viewer.entities.getById('tunnel-mask')
    if (existing) viewer.entities.remove(existing)

    // Förskjut bubblans centrum 100 m framåt i färdriktningen så maskinen
    // hamnar i nedre delen av fokuszonen och föraren ser mer klart område
    // FRAMFÖR sig istället för bakom. lastHeadingRef behåller riktningen
    // vid stillastående så bubblan fortsätter peka åt det håll man körde.
    if (pos.heading != null) lastHeadingRef.current = pos.heading
    const bubbleHeading = pos.heading != null ? pos.heading : lastHeadingRef.current
    const [bubbleLon, bubbleLat] = offsetLatLngByBearing(pos.lat, pos.lon, 100, bubbleHeading)

    viewer.entities.add({
      id: 'tunnel-mask',
      position: Cesium.Cartesian3.fromDegrees(bubbleLon, bubbleLat),
      ellipse: {
        semiMajorAxis: 5000,
        semiMinorAxis: 5000,
        material: new Cesium.ImageMaterialProperty({
          image: buildTunnelMaskCanvas(viewfieldDistance, viewfieldSoftness),
          transparent: true,
        }),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    })
    viewer.scene.requestRender()
  }, [ready, pos, viewfieldDistance, viewfieldSoftness])

  // === Re-applicera DDC på alla 3D-markörer/HPR-pelare när Synfält ändras ===
  useEffect(() => {
    if (!ready || !viewerRef.current) return
    const viewer = viewerRef.current
    applyTunnelDDC(viewer, 'mk-', viewfieldDistance)
    applyTunnelDDC(viewer, 'hpr-', viewfieldDistance)
    viewer.scene.requestRender()
  }, [ready, viewfieldDistance])

  // === Nästa-kö: 3 närmaste markeringar inom 300 m ===
  useEffect(() => {
    if (!pos || markers.length === 0 || !objekt) { setNextItems([]); return }

    const { mapCenter, mapZoom } = svgRefForObjekt(objekt)
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
      if (isOutlierPoint(m)) continue   // skip outlier-markeringar (filterMarkerOutliers-spegel)
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

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* DEV-badge — visas bara i dev-mock-läget. Centrerad just under topbar. */}
      {isDevMock && (
        <div style={{
          position: 'fixed',
          top: 'calc(env(safe-area-inset-top, 0px) + 64px)',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '4px 12px',
          borderRadius: 8,
          background: '#ff453a',
          color: '#fff',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.8,
          zIndex: 1000,
          pointerEvents: 'none',
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
        }}>
          DEV · MOCK GPS
        </div>
      )}

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
        </div>
        <div style={{ width: 44, flexShrink: 0 }} />
      </div>

      {/* Akut varning (≤50 m) — minimal Apple-stil: 1px border, ingen aura,
          typografiskt "!" istället för färgad disk. Vibration + audio bär
          den emotionella tyngden. */}
      {acuteWarning && (
        <div style={{
          position: 'fixed',
          top: 'calc(env(safe-area-inset-top, 0px) + 80px)',
          left: 12, right: 12,
          padding: '14px 18px', borderRadius: 16,
          background: 'rgba(20,20,22,0.92)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          border: `1px solid ${acuteWarning.color}`,
          color: '#fff', zIndex: 110,
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <span style={{
            fontSize: 28, fontWeight: 700, color: acuteWarning.color,
            flexShrink: 0, lineHeight: 1, fontVariantNumeric: 'tabular-nums',
          }}>!</span>
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

      {/* Error-toast — visas bara vid fel. Debug-status (Cesium ✓ / GPS ✓ /
          mark / km-h) borttagen för att undvika debug-text åt slutanvändaren. */}
      {error && (
        <div style={{
          position: 'fixed', left: 12, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
          padding: '8px 14px', borderRadius: 12,
          background: 'rgba(20,20,22,0.78)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid #ff453a',
          color: '#ff453a', fontSize: 13,
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
          zIndex: 100, maxWidth: 'calc(100% - 24px)',
        }}>
          {error}
        </div>
      )}

      {/* CENTRERA-KNAPP (nere vänster) — bara synlig när GPS-följning är pausad */}
      {!followGps && (
        <button
          type="button"
          onClick={() => {
            if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10)
            setFollowGps(true)
          }}
          aria-label="Centrera på min position"
          style={{
            position: 'fixed',
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)',
            left: '16px',
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'rgba(20,20,22,0.72)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0a84ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" fill="#0a84ff" />
            <circle cx="12" cy="12" r="9" />
            <line x1="12" y1="1" x2="12" y2="4" />
            <line x1="12" y1="20" x2="12" y2="23" />
            <line x1="1" y1="12" x2="4" y2="12" />
            <line x1="20" y1="12" x2="23" y2="12" />
          </svg>
        </button>
      )}

      {/* PLUS-KNAPP (nere höger) — öppnar lager-menyn. Identisk styling som /planering. */}
      <button
        type="button"
        onClick={() => { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10); setLayerMenuOpen((o) => !o) }}
        aria-label={layerMenuOpen ? 'Stäng lager-meny' : 'Öppna lager-meny'}
        aria-expanded={layerMenuOpen}
        style={{
          position: 'fixed',
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
          right: '16px',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'rgba(20,20,22,0.72)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: '#fff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 200,
          transition: 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)',
          transform: layerMenuOpen ? 'rotate(45deg)' : 'rotate(0deg)',
        }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5 L12 19" />
          <path d="M5 12 L19 12" />
        </svg>
      </button>

      {/* === LAGER-MENY (overlay zIndex 500, samma struktur som /planering) === */}
      {layerMenuOpen && (
        <div style={{
          position: 'fixed', inset: 0,
          background: '#000',
          zIndex: 500,
          display: 'flex', flexDirection: 'column',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", sans-serif',
        }}>
          {/* Header */}
          <div style={{
            padding: '55px 20px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div
              onClick={() => setLayerMenuOpen(false)}
              style={{ padding: '8px', marginLeft: '-8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ opacity: 0.6 }}>
                <path d="M15 18l-6-6 6-6" />
              </svg>
              <span style={{ fontSize: '17px', opacity: 0.6 }}>Tillbaka</span>
            </div>
            <span style={{ fontSize: '17px', fontWeight: 600, color: '#fff' }}>Lager</span>
            <div style={{ width: '80px' }} />
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
            {/* Bakgrundskarta — 2 val i 3D */}
            <div style={{
              background: '#0a0a0a',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '20px',
              padding: '8px',
              marginBottom: '16px',
            }}>
              <div style={{ padding: '12px 16px 8px', fontSize: '13px', opacity: 0.4 }}>
                Bakgrundskarta
              </div>
              {([
                { id: 'cockpit' as const,        name: 'Mörk' },
                { id: 'satellite' as const,      name: 'Satellit' },
                { id: 'topo' as const,           name: 'Topo' },
                { id: 'topo_nedtonad' as const,  name: 'Topo nedtonad' },
              ]).map((type) => (
                <div
                  key={type.id}
                  onClick={() => setBgType(type.id)}
                  style={{
                    padding: '14px 16px',
                    display: 'flex', alignItems: 'center', gap: '16px',
                    borderRadius: '12px', cursor: 'pointer',
                  }}
                >
                  <div style={{
                    width: '24px', height: '24px', borderRadius: '50%',
                    border: bgType === type.id ? 'none' : '2px solid rgba(255,255,255,0.2)',
                    background: bgType === type.id ? '#30d158' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {bgType === type.id && (
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fff' }} />
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '15px', color: '#fff' }}>{type.name}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* WMS-lager grupperade — show3D-filtrerade */}
            {layerGroups3D.map((group) => (
              <div key={group.group} style={{
                background: '#0a0a0a',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '20px',
                padding: '8px',
                marginBottom: '16px',
              }}>
                <div style={{ padding: '12px 16px 8px', fontSize: '13px', opacity: 0.4 }}>
                  {group.group}
                </div>
                {group.layers.map((layer) => (
                  <div
                    key={layer.id}
                    onClick={() => setOverlays((prev) => ({ ...prev, [layer.id]: !prev[layer.id] }))}
                    style={{
                      padding: '14px 16px',
                      display: 'flex', alignItems: 'center', gap: '14px',
                      borderRadius: '12px', cursor: 'pointer',
                    }}
                  >
                    <div style={{
                      width: '10px', height: '10px', borderRadius: '50%',
                      background: layer.color, flexShrink: 0,
                      opacity: overlays[layer.id] ? 1 : 0.3,
                      transition: 'opacity 0.2s ease',
                    }} />
                    <span style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', color: '#fff' }}>{layer.name}</div>
                    </span>
                    <div style={{
                      width: '44px', height: '26px',
                      borderRadius: '13px',
                      background: overlays[layer.id] ? '#30d158' : 'rgba(255,255,255,0.1)',
                      padding: '2px',
                      transition: 'background 0.2s ease',
                    }}>
                      <div style={{
                        width: '22px', height: '22px',
                        borderRadius: '50%', background: '#fff',
                        transform: overlays[layer.id] ? 'translateX(18px)' : 'translateX(0)',
                        transition: 'transform 0.2s ease',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {/* Avancerat — kollapsbar sektion längst ner */}
            <div style={{
              background: '#0a0a0a',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '20px',
              padding: '8px',
              marginBottom: '16px',
            }}>
              <div
                onClick={() => setAdvancedOpen((o) => !o)}
                style={{
                  padding: '12px 16px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: 'pointer',
                  borderRadius: '12px',
                }}
              >
                <span style={{ fontSize: '13px', opacity: 0.6 }}>Avancerat</span>
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"
                  style={{
                    opacity: 0.5,
                    transform: advancedOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease',
                  }}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>

              {advancedOpen && (
                <div style={{ padding: '4px 16px 16px' }}>
                  {/* Synfält */}
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                      marginBottom: '8px',
                    }}>
                      <span style={{ fontSize: '15px', color: '#fff' }}>Synfält</span>
                      <span style={{ fontSize: '15px', color: '#0a84ff', fontVariantNumeric: 'tabular-nums' }}>
                        {viewfieldDistance} m
                      </span>
                    </div>
                    <input
                      type="range"
                      min={100} max={500} step={25}
                      value={viewfieldDistance}
                      onChange={(e) => setViewfieldDistance(parseInt(e.target.value, 10))}
                      style={{ width: '100%', accentColor: '#0a84ff', display: 'block' }}
                    />
                  </div>

                  {/* Mjukhet */}
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                      marginBottom: '4px',
                    }}>
                      <span style={{ fontSize: '15px', color: '#fff' }}>Mjukhet</span>
                      <span style={{ fontSize: '15px', color: '#0a84ff', fontVariantNumeric: 'tabular-nums' }}>
                        {viewfieldSoftness}%
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', opacity: 0.5, marginBottom: '8px' }}>
                      Andel av synfältet som fadeas
                    </div>
                    <input
                      type="range"
                      min={0} max={100} step={5}
                      value={viewfieldSoftness}
                      onChange={(e) => setViewfieldSoftness(parseInt(e.target.value, 10))}
                      style={{ width: '100%', accentColor: '#0a84ff', display: 'block' }}
                    />
                  </div>

                  {/* Avstånd från maskin (CAM_BACK) */}
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                      marginBottom: '8px',
                    }}>
                      <span style={{ fontSize: '15px', color: '#fff' }}>Avstånd från maskin</span>
                      <span style={{ fontSize: '15px', color: '#0a84ff', fontVariantNumeric: 'tabular-nums' }}>
                        {camBack} m
                      </span>
                    </div>
                    <input
                      type="range"
                      min={30} max={80} step={5}
                      value={camBack}
                      onChange={(e) => setCamBack(parseInt(e.target.value, 10))}
                      style={{ width: '100%', accentColor: '#0a84ff', display: 'block' }}
                    />
                  </div>

                  {/* Kameravinkel (pitch). 0 = Auto */}
                  <div>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                      marginBottom: '4px',
                    }}>
                      <span style={{ fontSize: '15px', color: '#fff' }}>Kameravinkel</span>
                      <span style={{ fontSize: '15px', color: '#0a84ff', fontVariantNumeric: 'tabular-nums' }}>
                        {camPitchUser === 0 ? 'Auto' : `${camPitchUser}°`}
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', opacity: 0.5, marginBottom: '8px' }}>
                      Auto = anpassas efter skärm. Mindre värde = mer ovanifrån.
                    </div>
                    <input
                      type="range"
                      min={-45} max={0} step={1}
                      value={camPitchUser}
                      onChange={(e) => setCamPitchUser(parseInt(e.target.value, 10))}
                      style={{ width: '100%', accentColor: '#0a84ff', display: 'block' }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
