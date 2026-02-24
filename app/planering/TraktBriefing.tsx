'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

// === Types ===
interface Point { x: number; y: number }

interface Marker {
  id: string;
  x: number;
  y: number;
  type?: string;
  isMarker?: boolean;
  isArrow?: boolean;
  isZone?: boolean;
  isLine?: boolean;
  arrowType?: string;
  zoneType?: string;
  lineType?: string;
  rotation?: number;
  path?: Point[];
  comment?: string;
  photoData?: string;
}

interface BriefingStep {
  id: string;
  type: 'overview' | 'landing' | 'mainroad' | 'property' | 'symbol' | 'zone' | 'done';
  title: string;
  icon: string;
  tag?: 'danger' | 'caution' | 'info';
  tagText?: string;
  comment?: string;
  photoData?: string;
  center?: { lat: number; lon: number };
  zoom?: number;
  pitch?: number;
  bearing?: number;
  marker?: Marker;
  path?: { lat: number; lon: number }[];
  categoryColor?: string;
  arcCDF?: number[];
}

interface SymbolCategory {
  name: string;
  bgColor?: string;
  symbols: { id: string; name: string }[];
}

interface Props {
  markers: Marker[];
  mapInstanceRef: React.MutableRefObject<any>;
  svgToLatLon: (x: number, y: number) => { lat: number; lon: number };
  symbolCategories: SymbolCategory[];
  lineTypes: { id: string; name: string; color: string }[];
  zoneTypes: { id: string; name: string; color: string; icon: string }[];
  overlays: Record<string, boolean>;
  setOverlays: (fn: (prev: any) => any) => void;
  traktName?: string;
  onClose: () => void;
  onActiveMarkerChange?: (markerId: string | null) => void;
}

// Tag mappings
function getTag(marker: Marker, symbolCategories: SymbolCategory[]): { tag: 'danger' | 'caution' | 'info'; text: string; color: string } {
  if (marker.isZone) {
    const zt = marker.zoneType || '';
    if (['protected', 'culture', 'fornlamning', 'noentry'].includes(zt))
      return { tag: 'danger', text: 'KÖR INTE HÄR', color: '#ef4444' };
    if (['wet', 'steep'].includes(zt))
      return { tag: 'caution', text: 'VAR FÖRSIKTIG', color: '#f59e0b' };
    return { tag: 'info', text: 'INFO', color: '#8ab460' };
  }
  if (marker.isMarker) {
    const cat = symbolCategories.find(c => c.symbols.some(s => s.id === marker.type));
    if (cat) {
      const n = cat.name.toLowerCase();
      if (n.includes('naturv') || n.includes('kultur'))
        return { tag: 'danger', text: 'KÖR INTE HÄR', color: '#ef4444' };
      if (n.includes('terr'))
        return { tag: 'caution', text: 'VAR FÖRSIKTIG', color: '#f59e0b' };
      if (n.includes('övr') || n.includes('ovrigt'))
        return { tag: 'danger', text: 'KÖR INTE HÄR', color: '#ef4444' };
    }
    if (marker.type === 'landing')
      return { tag: 'info', text: 'AVLÄGG', color: '#8ab460' };
  }
  return { tag: 'info', text: 'INFO', color: '#8ab460' };
}

function getSymbolName(marker: Marker, symbolCategories: SymbolCategory[], zoneTypes: { id: string; name: string }[]): string {
  if (marker.isMarker) {
    for (const cat of symbolCategories) {
      const s = cat.symbols.find(s => s.id === marker.type);
      if (s) return s.name;
    }
    return marker.type || 'Symbol';
  }
  if (marker.isZone) {
    const z = zoneTypes.find(z => z.id === marker.zoneType);
    return z ? z.name : 'Zon';
  }
  return 'Markering';
}

function getSymbolIcon(marker: Marker): string {
  if (marker.type === 'landing') return '📦';
  if (marker.type === 'eternitytree') return '🌳';
  if (marker.type === 'naturecorner') return '🌿';
  if (marker.type === 'culturemonument') return '🏛️';
  if (marker.type === 'culturestump') return '🪵';
  if (marker.type === 'highstump') return '🪓';
  if (marker.type === 'brashpile') return '🪹';
  if (marker.type === 'windfall') return '🌪️';
  if (marker.type === 'manualfelling') return '🪓';
  if (marker.type === 'powerline') return '⚡';
  if (marker.type === 'road') return '🛤️';
  if (marker.type === 'turningpoint') return '🔄';
  if (marker.type === 'ditch') return '💧';
  if (marker.type === 'bridge') return '🌉';
  if (marker.type === 'corduroy') return '🪵';
  if (marker.type === 'wet') return '💦';
  if (marker.type === 'steep') return '⛰️';
  if (marker.type === 'trail') return '🥾';
  if (marker.type === 'warning') return '⚠️';
  if (marker.isZone) {
    if (marker.zoneType === 'wet') return '💦';
    if (marker.zoneType === 'steep') return '⛰️';
    if (marker.zoneType === 'protected') return '🌿';
    if (marker.zoneType === 'culture') return '🏛️';
    if (marker.zoneType === 'noentry') return '🚫';
    if (marker.zoneType === 'fornlamning') return '🏛️';
  }
  return '📍';
}

function getBearing(from: {lat:number;lon:number}, to: {lat:number;lon:number}) {
  const dLon = (to.lon - from.lon) * Math.PI / 180;
  const lat1 = from.lat * Math.PI / 180;
  const lat2 = to.lat * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

export default function TraktBriefing({
  markers, mapInstanceRef, svgToLatLon, symbolCategories,
  lineTypes, zoneTypes, overlays, setOverlays, traktName, onClose, onActiveMarkerChange,
}: Props) {
  const [currentStep, setCurrentStep] = useState(-1); // -1 = start screen
  const [steps, setSteps] = useState<BriefingStep[]>([]);
  const [fadeIn, setFadeIn] = useState(false);
  const rotationRef = useRef<any>(null);
  const wmsPulseRef = useRef<any>(null);
  const prevOverlaysRef = useRef<Record<string, boolean> | null>(null);

  // Build steps from markers — only rebuild before briefing starts (currentStep === -1)
  // Once briefing is active, steps are locked to prevent "jumping" from mid-briefing rebuilds
  useEffect(() => {
    if (currentStep >= 0) return;

    const built: BriefingStep[] = [];

    // Collect data
    const boundaries = markers.filter(m => m.isLine && m.lineType === 'boundary' && m.path && m.path.length > 2);
    const landings = markers.filter(m => m.isMarker && m.type === 'landing');
    const mainRoads = markers.filter(m => m.isLine && m.lineType === 'mainRoad' && m.path && m.path.length > 1);
    const symbolMarkers = markers.filter(m =>
      (m.isMarker && m.type !== 'landing') || m.isZone
    );

    // Compute tract center from boundary or all markers
    const allPoints = boundaries.length > 0
      ? boundaries[0].path!.map(p => svgToLatLon(p.x, p.y))
      : markers.filter(m => m.x !== undefined).map(m => svgToLatLon(m.x, m.y));

    let centerLat = 0, centerLon = 0;
    if (allPoints.length > 0) {
      for (const p of allPoints) { centerLat += p.lat; centerLon += p.lon; }
      centerLat /= allPoints.length;
      centerLon /= allPoints.length;
    }

    // 1. OVERVIEW — dynamic 360° flyover orbit with zoom/pitch/bearing/speed variation
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const p of allPoints) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lon < minLon) minLon = p.lon;
      if (p.lon > maxLon) maxLon = p.lon;
    }
    const extentKm = Math.max(maxLat - minLat, (maxLon - minLon) * Math.cos(centerLat * Math.PI / 180)) * 111;
    const overviewZoom = extentKm < 0.5 ? 17 : extentKm < 1 ? 16.5 : extentKm < 2 ? 16 : 15.5;
    // Tight orbit radius for closer detail
    const rLat = (maxLat - minLat) * 0.45 + 0.001;
    const rLon = (maxLon - minLon) * 0.45 + 0.0015;
    // Full 360° orbit — starts and ends at same position (South)
    const arcPoints: { lat: number; lon: number }[] = [];
    const arcCount = 60;
    for (let i = 0; i <= arcCount; i++) {
      const t = i / arcCount;
      const angleDeg = 270 - 360 * t;
      const angleRad = angleDeg * Math.PI / 180;
      arcPoints.push({
        lat: centerLat + rLat * Math.sin(angleRad),
        lon: centerLon + rLon * Math.cos(angleRad),
      });
    }
    // Compute symbol/landing angles for speed variation (slower near interesting points)
    const interestMarkers = [...landings, ...symbolMarkers];
    const symAngles: number[] = [];
    for (const m of interestMarkers) {
      let sll: { lat: number; lon: number };
      if (m.isZone && m.path && m.path.length > 0) {
        let cx = 0, cy = 0;
        for (const p of m.path!) { cx += p.x; cy += p.y; }
        sll = svgToLatLon(cx / m.path!.length, cy / m.path!.length);
      } else {
        sll = svgToLatLon(m.x, m.y);
      }
      symAngles.push(Math.atan2(sll.lat - centerLat, sll.lon - centerLon) * 180 / Math.PI);
    }
    // Build CDF: weight each arc segment by proximity to symbols (more time near symbols)
    const arcWeightsArr: number[] = [];
    for (let i = 0; i < arcCount; i++) {
      const segAngle = 270 - 360 * (i + 0.5) / arcCount;
      let w = 1.0;
      for (const sa of symAngles) {
        const diff = Math.abs(((segAngle - sa + 540) % 360) - 180);
        if (diff < 30) w += 1.5 * (1 - diff / 30);
      }
      arcWeightsArr.push(w);
    }
    const wTotal = arcWeightsArr.reduce((a, b) => a + b, 0);
    const arcCDF = [0];
    for (let i = 0; i < arcCount; i++) {
      arcCDF.push(arcCDF[i] + arcWeightsArr[i] / wTotal);
    }
    built.push({
      id: 'overview',
      type: 'overview',
      title: 'Hela trakten',
      icon: '🗺️',
      tag: 'info',
      tagText: 'ÖVERFLYGNING',
      center: { lat: centerLat, lon: centerLon },
      zoom: overviewZoom,
      pitch: 57,
      path: arcPoints,
      arcCDF,
    });

    // 2. LANDINGS
    for (const m of landings) {
      const ll = svgToLatLon(m.x, m.y);
      built.push({
        id: `landing-${m.id}`,
        type: 'landing',
        title: 'Avlägg',
        icon: '📦',
        tag: 'info',
        tagText: 'AVLÄGG',
        comment: m.comment || undefined,
        photoData: m.photoData || undefined,
        center: ll,
        zoom: 18,
        pitch: 62,
        marker: m,
        categoryColor: '#8ab460',
      });
    }

    // 3. MAIN ROAD
    for (const m of mainRoads) {
      const pathLL = m.path!.map(p => svgToLatLon(p.x, p.y));
      const mid = pathLL[Math.floor(pathLL.length / 2)];
      built.push({
        id: `mainroad-${m.id}`,
        type: 'mainroad',
        title: 'Basväg',
        icon: '🛤️',
        tag: 'info',
        tagText: 'BASVÄG',
        comment: m.comment || undefined,
        center: mid,
        zoom: 17,
        pitch: 60,
        path: pathLL,
        marker: m,
        categoryColor: '#3b82f6',
      });
    }

    // 4. PROPERTY BOUNDARY — fly over tract to show Lantmäteriet WMS fastighetsgräns
    // WMS is raster — can't extract vector geometry for a colored overlay line.
    // Instead: fly straight across the tract at low altitude, WMS pulsed for emphasis,
    // tract boundary (line-boundary-*) hidden during this step to avoid confusion.
    const mapInst = mapInstanceRef.current;
    const hasPropertyWMS = mapInst && mapInst.getLayer && mapInst.getLayer('wms-layer-fastighetsgranser');
    if (hasPropertyWMS) {
      // Compute longest axis of tract for straight flyover path
      let maxAxisDist = 0;
      let flyA = allPoints[0] || { lat: centerLat, lon: centerLon };
      let flyB = allPoints.length > 1 ? allPoints[allPoints.length - 1] : flyA;
      for (let ai = 0; ai < allPoints.length; ai++) {
        for (let bi = ai + 1; bi < allPoints.length; bi++) {
          const dLat = allPoints[bi].lat - allPoints[ai].lat;
          const dLon = (allPoints[bi].lon - allPoints[ai].lon) * Math.cos(centerLat * Math.PI / 180);
          const d = dLat * dLat + dLon * dLon;
          if (d > maxAxisDist) { maxAxisDist = d; flyA = allPoints[ai]; flyB = allPoints[bi]; }
        }
      }
      if (maxAxisDist < 1e-10) {
        flyA = { lat: centerLat, lon: centerLon - 0.002 };
        flyB = { lat: centerLat, lon: centerLon + 0.002 };
      }
      // Extend path slightly beyond tract edges for context
      const ext = 0.15;
      const propStart = {
        lat: flyA.lat - (flyB.lat - flyA.lat) * ext,
        lon: flyA.lon - (flyB.lon - flyA.lon) * ext,
      };
      const propEnd = {
        lat: flyB.lat + (flyB.lat - flyA.lat) * ext,
        lon: flyB.lon + (flyB.lon - flyA.lon) * ext,
      };
      const propPath: { lat: number; lon: number }[] = [];
      const propPts = 20;
      for (let pi = 0; pi <= propPts; pi++) {
        const pt = pi / propPts;
        propPath.push({
          lat: propStart.lat + (propEnd.lat - propStart.lat) * pt,
          lon: propStart.lon + (propEnd.lon - propStart.lon) * pt,
        });
      }
      built.push({
        id: 'property',
        type: 'property',
        title: 'Fastighetsgräns / Markägargräns',
        icon: '📐',
        tag: 'caution',
        tagText: 'VAR FÖRSIKTIG',
        center: { lat: centerLat, lon: centerLon },
        zoom: 16.5,
        pitch: 63,
        bearing: getBearing(propStart, propEnd),
        path: propPath,
        categoryColor: '#e879f9',
      });
    }

    // 5. SYMBOLS sorted: danger first, then caution, then info
    const tagOrder = { danger: 0, caution: 1, info: 2 };
    const sorted = [...symbolMarkers].sort((a, b) => {
      const ta = getTag(a, symbolCategories);
      const tb = getTag(b, symbolCategories);
      return tagOrder[ta.tag] - tagOrder[tb.tag];
    });

    for (const m of sorted) {
      let ll: { lat: number; lon: number };
      let stepZoom = 18;
      if (m.isZone && m.path && m.path.length > 0) {
        let cx = 0, cy = 0;
        for (const p of m.path!) { cx += p.x; cy += p.y; }
        ll = svgToLatLon(cx / m.path!.length, cy / m.path!.length);
        // Compute zone radius in meters to set zoom
        const pts = m.path!.map(p => svgToLatLon(p.x, p.y));
        let maxDist = 0;
        for (const p of pts) {
          const d = Math.sqrt(((p.lat - ll.lat) * 111320) ** 2 + ((p.lon - ll.lon) * 111320 * Math.cos(ll.lat * Math.PI / 180)) ** 2);
          if (d > maxDist) maxDist = d;
        }
        // Adapt zoom: small zone (<30m) = 17.5, medium (<80m) = 16.5, large = 16
        if (maxDist < 30) stepZoom = 17.5;
        else if (maxDist < 80) stepZoom = 16.5;
        else if (maxDist < 200) stepZoom = 16;
        else stepZoom = 15.5;
      } else {
        ll = svgToLatLon(m.x, m.y);
      }
      const t = getTag(m, symbolCategories);
      built.push({
        id: `symbol-${m.id}`,
        type: m.isZone ? 'zone' : 'symbol',
        title: getSymbolName(m, symbolCategories, zoneTypes),
        icon: getSymbolIcon(m),
        tag: t.tag,
        tagText: t.text,
        comment: m.comment || undefined,
        photoData: m.photoData || undefined,
        center: ll,
        zoom: stepZoom,
        pitch: 62,
        marker: m,
        categoryColor: t.color,
      });
    }

    // 6. DONE
    built.push({
      id: 'done',
      type: 'done',
      title: 'Briefing klar',
      icon: '✅',
      center: { lat: centerLat, lon: centerLon },
      zoom: 14.5,
      pitch: 55,
      bearing: 0,
    });

    setSteps(built);
  }, [markers, svgToLatLon, symbolCategories, zoneTypes, currentStep]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stop animation on unmount
  useEffect(() => {
    return () => {
      if (rotationRef.current) { clearInterval(rotationRef.current); cancelAnimationFrame(rotationRef.current as any); }
      if (wmsPulseRef.current) { clearInterval(wmsPulseRef.current); wmsPulseRef.current = null; }
      // Restore boundary layers and WMS state
      const map = mapInstanceRef.current;
      if (map) {
        ['line-boundary-base', 'line-boundary-stripe', 'line-boundary-casing', 'line-boundary-glow'].forEach(id => {
          if (map.getLayer(id)) map.setPaintProperty(id, 'line-opacity', 1);
        });
        if (map.getLayer('wms-layer-fastighetsgranser')) {
          map.setPaintProperty('wms-layer-fastighetsgranser', 'raster-contrast', 0);
          map.setPaintProperty('wms-layer-fastighetsgranser', 'raster-brightness-max', 1);
        }
      }
      if (prevOverlaysRef.current) {
        setOverlays(() => prevOverlaysRef.current!);
      }
    };
  }, [setOverlays, mapInstanceRef]);

  // Animate to step
  const animateToStep = useCallback((stepIdx: number) => {
    const map = mapInstanceRef.current;
    if (!map || !steps[stepIdx]) return;
    const step = steps[stepIdx];

    // Notify parent which marker is active (for highlight effect)
    onActiveMarkerChange?.(step.marker?.id || null);

    // Stop previous animation (interval or requestAnimationFrame)
    if (rotationRef.current) {
      clearInterval(rotationRef.current);
      cancelAnimationFrame(rotationRef.current as any);
      rotationRef.current = null;
    }
    if (wmsPulseRef.current) {
      clearInterval(wmsPulseRef.current);
      wmsPulseRef.current = null;
    }

    // Property boundary: WMS layer + hide tract boundary + pulse for emphasis
    // Fastighetsgräns = Lantmäteriet WMS raster (wms-layer-fastighetsgranser)
    // Traktgräns = drawn boundary lines (line-boundary-*) — DIFFERENT thing, hide during this step
    const boundaryLayerIds = ['line-boundary-base', 'line-boundary-stripe', 'line-boundary-casing', 'line-boundary-glow'];
    if (step.type === 'property') {
      prevOverlaysRef.current = { ...overlays };
      // Enable WMS fastighetsgräns with enhanced visibility
      if (map.getLayer('wms-layer-fastighetsgranser')) {
        map.setLayoutProperty('wms-layer-fastighetsgranser', 'visibility', 'visible');
        map.setPaintProperty('wms-layer-fastighetsgranser', 'raster-opacity', 1.0);
        map.setPaintProperty('wms-layer-fastighetsgranser', 'raster-contrast', 0.4);
        map.setPaintProperty('wms-layer-fastighetsgranser', 'raster-brightness-max', 1.3);
      }
      setOverlays((prev: any) => ({ ...prev, fastighetsgranser: true }));
      // Hide tract boundary so only fastighetsgräns is visible
      boundaryLayerIds.forEach(id => {
        if (map.getLayer(id)) map.setPaintProperty(id, 'line-opacity', 0);
      });
      // Pulse WMS layer opacity for emphasis (sine wave 0.5 → 1.0)
      let pulseT = 0;
      wmsPulseRef.current = setInterval(() => {
        if (!mapInstanceRef.current) return;
        pulseT += 0.08;
        const op = 0.75 + 0.25 * Math.sin(pulseT);
        if (mapInstanceRef.current.getLayer('wms-layer-fastighetsgranser')) {
          mapInstanceRef.current.setPaintProperty('wms-layer-fastighetsgranser', 'raster-opacity', op);
        }
      }, 50);
    } else if (prevOverlaysRef.current) {
      // Restore: WMS layer, boundary layers, overlay state
      const wasOn = prevOverlaysRef.current.fastighetsgranser;
      if (map.getLayer('wms-layer-fastighetsgranser')) {
        map.setLayoutProperty('wms-layer-fastighetsgranser', 'visibility', wasOn ? 'visible' : 'none');
        map.setPaintProperty('wms-layer-fastighetsgranser', 'raster-opacity', 0.7);
        map.setPaintProperty('wms-layer-fastighetsgranser', 'raster-contrast', 0);
        map.setPaintProperty('wms-layer-fastighetsgranser', 'raster-brightness-max', 1);
      }
      // Restore tract boundary visibility
      boundaryLayerIds.forEach(id => {
        if (map.getLayer(id)) map.setPaintProperty(id, 'line-opacity', 1);
      });
      setOverlays((prev: any) => ({ ...prev, fastighetsgranser: prevOverlaysRef.current?.fastighetsgranser ?? false }));
      prevOverlaysRef.current = null;
    }

    // Overview: dynamic 360° orbit — zoom dips, bearing oscillation, speed varies near symbols
    if (step.type === 'overview' && step.path && step.path.length > 1) {
      const arcPath = step.path;
      const arcCenter = step.center!;
      const baseZoom = step.zoom || 16;
      const cdf = step.arcCDF;
      const startBear = getBearing(arcPath[0], arcCenter);
      map.jumpTo({
        center: [arcPath[0].lon, arcPath[0].lat],
        zoom: baseZoom,
        pitch: step.pitch || 57,
        bearing: startBear,
      });
      const arcDuration = 18000;
      const startTime = performance.now();
      // Inverse CDF: map uniform time → arc position (slower near symbols)
      const mapTime = (t: number): number => {
        if (!cdf || cdf.length < 2) return t;
        let lo = 0, hi = cdf.length - 2;
        while (lo < hi) { const mid = (lo + hi) >> 1; cdf[mid + 1] < t ? lo = mid + 1 : hi = mid; }
        const segLen = cdf[lo + 1] - cdf[lo];
        return segLen > 0 ? (lo + (t - cdf[lo]) / segLen) / (cdf.length - 1) : lo / (cdf.length - 1);
      };
      const tick = () => {
        if (!mapInstanceRef.current) return;
        const elapsed = performance.now() - startTime;
        if (elapsed >= arcDuration) {
          // End exactly at start position (full loop)
          const endPt = arcPath[0];
          const endBear = getBearing(endPt, arcCenter);
          mapInstanceRef.current.jumpTo({ center: [endPt.lon, endPt.lat], bearing: endBear, zoom: baseZoom, pitch: 57 });
          return;
        }
        const rawT = elapsed / arcDuration;
        // Ease in/out for smooth start and landing
        const eased = rawT < 0.5 ? 2 * rawT * rawT : 1 - (-2 * rawT + 2) ** 2 / 2;
        // Remap through CDF for speed variation near symbols
        const arcT = mapTime(eased);
        const idx = arcT * (arcPath.length - 1);
        const i = Math.floor(idx);
        const frac = idx - i;
        const p0 = arcPath[Math.min(i, arcPath.length - 1)];
        const p1 = arcPath[Math.min(i + 1, arcPath.length - 1)];
        const lat = p0.lat + (p1.lat - p0.lat) * frac;
        const lon = p0.lon + (p1.lon - p0.lon) * frac;
        // Bearing: look toward center + gentle oscillation
        const baseBear = getBearing({ lat, lon }, arcCenter);
        const bearOff = 12 * Math.sin(arcT * Math.PI * 3);
        // Zoom: dip closer twice during orbit
        const zoomVar = 0.7 * Math.sin(arcT * Math.PI * 4);
        // Pitch: subtle variation
        const pitch = 57 + 5 * Math.sin(arcT * Math.PI * 2);
        mapInstanceRef.current.jumpTo({
          center: [lon, lat],
          bearing: baseBear + bearOff,
          zoom: baseZoom + zoomVar,
          pitch,
        });
        rotationRef.current = requestAnimationFrame(tick) as any;
      };
      rotationRef.current = requestAnimationFrame(tick) as any;
    } else if (step.type === 'property' && step.path && step.path.length > 1) {
      // Property: fly straight across the tract at low altitude, bearing-aligned
      const propPath = step.path;
      const propBearing = step.bearing || getBearing(propPath[0], propPath[propPath.length - 1]);
      map.flyTo({
        center: [propPath[0].lon, propPath[0].lat],
        zoom: step.zoom || 16.5,
        pitch: step.pitch || 63,
        bearing: propBearing,
        duration: 2000,
        essential: true,
      });
      const totalPropPts = propPath.length;
      const propInterval = 700;
      let propIdx = 0;
      const propStepSz = Math.max(1, Math.floor(totalPropPts / 15));
      const propAnim = setInterval(() => {
        if (!mapInstanceRef.current) { clearInterval(propAnim); return; }
        propIdx += propStepSz;
        if (propIdx >= totalPropPts) { clearInterval(propAnim); return; }
        const p = propPath[propIdx];
        const nextI = Math.min(propIdx + propStepSz, totalPropPts - 1);
        const np = propPath[nextI];
        mapInstanceRef.current.easeTo({
          center: [p.lon, p.lat],
          bearing: getBearing(p, np),
          duration: propInterval - 50,
          pitch: step.pitch || 63,
          zoom: step.zoom || 16.5,
        });
      }, propInterval);
      rotationRef.current = propAnim;
    } else if (step.center) {
      // All other steps: smooth flyTo
      map.flyTo({
        center: [step.center.lon, step.center.lat],
        zoom: step.zoom || 15,
        pitch: step.pitch || 60,
        bearing: step.bearing ?? 0,
        duration: 1800,
        essential: true,
      });
    }

    // Slow rotation for done step
    if (step.type === 'done') {
      let bearing = 0;
      rotationRef.current = setInterval(() => {
        if (!mapInstanceRef.current) return;
        bearing += 0.5;
        mapInstanceRef.current.easeTo({ bearing, duration: 100 });
      }, 100);
    }

    // Animate camera along path for mainroad
    if (step.type === 'mainroad' && step.path && step.path.length > 1) {
      const isProperty = false;
      const pathPts = step.path!;
      const totalPts = pathPts.length;
      const sampleCount = Math.min(totalPts, isProperty ? 25 : 12);
      const stepSize = Math.max(1, Math.floor(totalPts / sampleCount));
      const interval = isProperty ? 700 : 900;
      const pathZoom = step.zoom || 16.5;
      let idx = 0;

      const startPt = pathPts[0];
      const nextPt = pathPts[Math.min(stepSize, totalPts - 1)];
      const startBearing = isProperty ? getBearing(startPt, nextPt) : 0;
      map.flyTo({
        center: [startPt.lon, startPt.lat],
        zoom: pathZoom,
        pitch: 60,
        bearing: startBearing,
        duration: 1500,
        essential: true,
      });

      const pathAnim = setInterval(() => {
        if (!mapInstanceRef.current) { clearInterval(pathAnim); return; }
        idx += stepSize;
        if (idx >= totalPts) { clearInterval(pathAnim); return; }
        const p = pathPts[idx];
        const nextIdx = Math.min(idx + stepSize, totalPts - 1);
        const np = pathPts[nextIdx];
        const bear = isProperty ? getBearing(p, np) : undefined;
        mapInstanceRef.current.easeTo({
          center: [p.lon, p.lat],
          duration: interval - 50,
          pitch: 60,
          zoom: pathZoom,
          ...(bear !== undefined ? { bearing: bear } : {}),
        });
      }, interval);
      rotationRef.current = pathAnim;
    }

    // Trigger fade-in animation
    setFadeIn(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setFadeIn(true));
    });
  }, [steps, mapInstanceRef, overlays, setOverlays, onActiveMarkerChange]);

  const goToStep = useCallback((idx: number) => {
    setCurrentStep(idx);
    if (idx >= 0) animateToStep(idx);
  }, [animateToStep]);

  const handleClose = useCallback(() => {
    if (rotationRef.current) {
      clearInterval(rotationRef.current);
      cancelAnimationFrame(rotationRef.current as any);
      rotationRef.current = null;
    }
    if (wmsPulseRef.current) {
      clearInterval(wmsPulseRef.current);
      wmsPulseRef.current = null;
    }
    // Restore boundary + WMS state if we were on property step
    const map = mapInstanceRef.current;
    if (map && prevOverlaysRef.current) {
      ['line-boundary-base', 'line-boundary-stripe', 'line-boundary-casing', 'line-boundary-glow'].forEach(id => {
        if (map.getLayer(id)) map.setPaintProperty(id, 'line-opacity', 1);
      });
      if (map.getLayer('wms-layer-fastighetsgranser')) {
        map.setPaintProperty('wms-layer-fastighetsgranser', 'raster-contrast', 0);
        map.setPaintProperty('wms-layer-fastighetsgranser', 'raster-brightness-max', 1);
      }
    }
    onActiveMarkerChange?.(null);
    onClose();
  }, [onClose, onActiveMarkerChange, mapInstanceRef]);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
      if (e.key === 'ArrowRight' && currentStep < steps.length - 1) goToStep(currentStep + 1);
      if (e.key === 'ArrowLeft' && currentStep > 0) goToStep(currentStep - 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleClose, currentStep, steps.length, goToStep]);

  // Count warnings for start screen
  const dangerCount = steps.filter(s => s.tag === 'danger').length;
  const cautionCount = steps.filter(s => s.tag === 'caution').length;
  const totalSymbols = steps.filter(s => ['symbol', 'zone'].includes(s.type)).length;

  const tagBg = { danger: 'rgba(239,68,68,0.25)', caution: 'rgba(245,158,11,0.25)', info: 'rgba(138,180,96,0.2)' };
  const tagColor = { danger: '#ef4444', caution: '#f59e0b', info: '#8ab460' };

  // === START SCREEN ===
  if (currentStep === -1) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 700,
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        pointerEvents: 'none',
      }}>
        <div style={{
          pointerEvents: 'auto',
          background: 'linear-gradient(transparent, rgba(10,15,8,0.94) 30%)',
          padding: '60px 20px 32px',
          paddingBottom: 'max(32px, env(safe-area-inset-bottom))',
        }}>
          <div style={{
            maxWidth: '420px', margin: '0 auto',
            background: 'rgba(10,15,8,0.96)',
            borderRadius: '16px',
            border: '1px solid rgba(138,180,96,0.15)',
            padding: '28px 24px',
          }}>
            <div style={{ fontSize: '13px', color: '#8a9a78', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '6px' }}>
              Traktbriefing
            </div>
            <div style={{ fontSize: '22px', fontWeight: '700', color: '#e8f0e0', marginBottom: '16px' }}>
              {traktName || 'Trakt'}
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
              <span style={{
                padding: '4px 12px', borderRadius: '10px', fontSize: '13px', fontWeight: '600',
                background: 'rgba(255,255,255,0.06)', color: '#8a9a78',
              }}>
                {totalSymbols} punkter
              </span>
              {dangerCount > 0 && (
                <span style={{
                  padding: '4px 12px', borderRadius: '10px', fontSize: '13px', fontWeight: '600',
                  background: tagBg.danger, color: tagColor.danger,
                }}>
                  {dangerCount}× KÖR INTE HÄR
                </span>
              )}
              {cautionCount > 0 && (
                <span style={{
                  padding: '4px 12px', borderRadius: '10px', fontSize: '13px', fontWeight: '600',
                  background: tagBg.caution, color: tagColor.caution,
                }}>
                  {cautionCount}× VAR FÖRSIKTIG
                </span>
              )}
            </div>

            <button
              onClick={() => goToStep(0)}
              style={{
                width: '100%', padding: '16px',
                background: '#8ab460', color: '#0a0f08',
                border: 'none', borderRadius: '12px',
                fontSize: '16px', fontWeight: '700',
                cursor: 'pointer',
              }}>
              Starta briefing
            </button>

            <button
              onClick={handleClose}
              style={{
                width: '100%', padding: '12px', marginTop: '10px',
                background: 'transparent', color: '#8a9a78',
                border: '1px solid rgba(138,180,96,0.2)', borderRadius: '12px',
                fontSize: '14px', cursor: 'pointer',
              }}>
              Avbryt
            </button>
          </div>
        </div>
      </div>
    );
  }

  const step = steps[currentStep];
  if (!step) return null;

  // === DONE SCREEN ===
  if (step.type === 'done') {
    const warningSteps = steps.filter(s => s.tag === 'danger' || s.tag === 'caution');
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 700,
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        pointerEvents: 'none',
      }}>
        {/* Step counter */}
        <div style={{
          position: 'fixed', top: '16px', right: '16px', zIndex: 710,
          pointerEvents: 'auto',
          padding: '6px 14px', borderRadius: '20px',
          background: 'rgba(10,15,8,0.8)', color: '#8a9a78',
          fontSize: '13px', fontWeight: '600',
        }}>
          {currentStep + 1} / {steps.length}
        </div>

        <div style={{
          pointerEvents: 'auto',
          background: 'linear-gradient(transparent, rgba(10,15,8,0.94) 30%)',
          padding: '60px 20px 32px',
          paddingBottom: 'max(32px, env(safe-area-inset-bottom))',
        }}>
          <div style={{
            maxWidth: '420px', margin: '0 auto',
            background: 'rgba(10,15,8,0.96)',
            borderRadius: '16px',
            border: '1px solid rgba(138,180,96,0.15)',
            padding: '28px 24px',
            maxHeight: '50vh', overflowY: 'auto',
          }}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '8px' }}>✅</div>
              <div style={{ fontSize: '20px', fontWeight: '700', color: '#e8f0e0' }}>Briefing klar</div>
            </div>

            {warningSteps.length > 0 && (
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px',
                marginBottom: '20px',
              }}>
                {warningSteps.map(s => (
                  <div key={s.id} style={{
                    padding: '10px 12px', borderRadius: '10px',
                    background: s.tag === 'danger' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                    borderLeft: `3px solid ${s.tag === 'danger' ? '#ef4444' : '#f59e0b'}`,
                  }}>
                    <div style={{ fontSize: '16px', marginBottom: '2px' }}>{s.icon}</div>
                    <div style={{ fontSize: '12px', color: '#e8f0e0', fontWeight: '500' }}>{s.title}</div>
                    <div style={{
                      fontSize: '10px', fontWeight: '700', marginTop: '2px',
                      color: s.tag === 'danger' ? '#ef4444' : '#f59e0b',
                    }}>{s.tagText}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => goToStep(0)}
                style={{
                  flex: 1, padding: '14px',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#8a9a78', border: '1px solid rgba(138,180,96,0.15)',
                  borderRadius: '12px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                }}>
                ← Visa igen
              </button>
              <button
                onClick={handleClose}
                style={{
                  flex: 1, padding: '14px',
                  background: '#8ab460', color: '#0a0f08',
                  border: 'none', borderRadius: '12px',
                  fontSize: '14px', fontWeight: '700', cursor: 'pointer',
                }}>
                Klar – börja köra 🌲
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // === STEP SCREEN ===
  const stepColor = step.categoryColor || tagColor[step.tag || 'info'];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 700,
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      pointerEvents: 'none',
    }}>
      {/* Step counter */}
      <div style={{
        position: 'fixed', top: '16px', right: '16px', zIndex: 710,
        pointerEvents: 'auto',
        padding: '6px 14px', borderRadius: '20px',
        background: 'rgba(10,15,8,0.8)', color: '#8a9a78',
        fontSize: '13px', fontWeight: '600',
      }}>
        {currentStep + 1} / {steps.length}
      </div>

      <div style={{
        pointerEvents: 'auto',
        background: 'linear-gradient(transparent, rgba(10,15,8,0.94) 30%)',
        padding: '60px 20px 32px',
        paddingBottom: 'max(32px, env(safe-area-inset-bottom))',
      }}>
        <div style={{
          maxWidth: '420px', margin: '0 auto',
          background: 'rgba(10,15,8,0.96)',
          borderRadius: '16px',
          border: '1px solid rgba(138,180,96,0.15)',
          padding: '24px 20px',
          maxHeight: '50vh', overflowY: 'auto',
          opacity: fadeIn ? 1 : 0,
          transform: fadeIn ? 'translateY(0)' : 'translateY(24px)',
          transition: 'opacity 0.4s ease, transform 0.4s ease',
        }}>
          {/* Progress dots */}
          <div style={{
            display: 'flex', gap: '4px', justifyContent: 'center',
            marginBottom: '16px',
          }}>
            {steps.map((_, i) => (
              <div key={i} style={{
                width: i === currentStep ? '24px' : '6px',
                height: '6px',
                borderRadius: '3px',
                background: i === currentStep ? stepColor : 'rgba(255,255,255,0.15)',
                transition: 'all 0.3s ease',
              }} />
            ))}
          </div>

          {/* Tag badge */}
          {step.tagText && (
            <div style={{
              display: 'inline-block',
              padding: '4px 12px', borderRadius: '10px',
              fontSize: '11px', fontWeight: '800', letterSpacing: '0.5px',
              background: tagBg[step.tag || 'info'],
              color: tagColor[step.tag || 'info'],
              marginBottom: '12px',
            }}>
              {step.tagText}
            </div>
          )}

          {/* Icon + title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ fontSize: '32px' }}>{step.icon}</div>
            <div style={{ fontSize: '20px', fontWeight: '700', color: '#e8f0e0' }}>{step.title}</div>
          </div>

          {/* Comment */}
          {step.comment && (
            <div style={{
              padding: '14px 16px', borderRadius: '10px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
              marginBottom: '12px',
            }}>
              <div style={{ fontSize: '12px', color: '#8a9a78', fontWeight: '600', marginBottom: '6px' }}>
                💬 Planerarens kommentarer
              </div>
              <div style={{ fontSize: '14px', color: '#e8f0e0', lineHeight: '1.5' }}>
                {step.comment}
              </div>
            </div>
          )}

          {/* Photo */}
          {step.photoData && (
            <div style={{
              padding: '14px 16px', borderRadius: '10px',
              background: 'rgba(138,180,96,0.06)',
              border: '1px solid rgba(138,180,96,0.12)',
              marginBottom: '12px',
            }}>
              <div style={{ fontSize: '12px', color: '#8a9a78', fontWeight: '600', marginBottom: '8px' }}>
                🎯 Målbild
              </div>
              <img
                src={step.photoData}
                alt="Målbild"
                style={{ width: '100%', borderRadius: '8px', maxHeight: '200px', objectFit: 'cover' }}
              />
            </div>
          )}

          {/* Property boundary info */}
          {step.type === 'property' && (
            <div style={{
              padding: '14px 16px', borderRadius: '10px',
              background: 'rgba(232,121,249,0.08)',
              border: '1px solid rgba(232,121,249,0.15)',
              marginBottom: '12px',
            }}>
              <div style={{ fontSize: '12px', color: '#e879f9', fontWeight: '600', marginBottom: '4px' }}>
                📐 Fastighetsgräns (Lantmäteriet)
              </div>
              <div style={{ fontSize: '13px', color: '#e8f0e0', lineHeight: '1.5' }}>
                Kameran flyger över trakten. Linjerna i kartan visar var det byter markägare. Kontrollera att avverkning sker inom rätt fastighet.
              </div>
            </div>
          )}

          {/* Overview info */}
          {step.type === 'overview' && (
            <div style={{ fontSize: '14px', color: '#8a9a78', lineHeight: '1.5' }}>
              Kameran visar hela trakten ovanifrån. Tryck Kör vidare för att gå igenom alla punkter.
            </div>
          )}

          {/* Navigation buttons */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            {currentStep > 0 && (
              <button
                onClick={() => goToStep(currentStep - 1)}
                style={{
                  flex: 1, padding: '14px',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#8a9a78', border: '1px solid rgba(138,180,96,0.15)',
                  borderRadius: '12px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                }}>
                ← Tillbaka
              </button>
            )}
            <button
              onClick={() => goToStep(currentStep + 1)}
              style={{
                flex: currentStep > 0 ? 1 : undefined,
                width: currentStep > 0 ? undefined : '100%',
                padding: '14px',
                background: stepColor,
                color: step.tag === 'info' ? '#0a0f08' : '#fff',
                border: 'none', borderRadius: '12px',
                fontSize: '14px', fontWeight: '700', cursor: 'pointer',
              }}>
              Kör vidare →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
