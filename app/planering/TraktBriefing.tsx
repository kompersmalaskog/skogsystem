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
  type: 'overview' | 'about' | 'landing' | 'mainroad' | 'property' | 'symbol' | 'zone' | 'done';
  title: string;
  icon: string;
  comment?: string;
  center?: { lat: number; lon: number };
  zoom?: number;
  pitch?: number;
  bearing?: number;
  marker?: Marker;
  path?: { lat: number; lon: number }[];
  arcCDF?: number[];
  // Kept for checklist compatibility
  tag?: 'danger' | 'caution' | 'info';
  tagText?: string;
  categoryColor?: string;
  photoData?: string;
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
  onStartDriving?: () => void;
  boundaryCoordinates?: [number, number][];
  mode?: 'briefing' | 'checklist';
  checkedStepIds?: string[];
  onChecklistChange?: (checkedIds: string[]) => void;
  onBriefingComplete?: (totalSteps: number) => void;
}

// Accent
const A = '#8ab460';

// Tag for checklist compat
function getTag(marker: Marker, symbolCategories: SymbolCategory[]): { tag: 'danger' | 'caution' | 'info'; text: string } {
  if (marker.isZone) {
    const zt = marker.zoneType || '';
    if (['protected', 'culture', 'fornlamning', 'noentry'].includes(zt))
      return { tag: 'danger', text: 'KÖR INTE HÄR' };
    if (['wet', 'steep'].includes(zt))
      return { tag: 'caution', text: 'VAR FÖRSIKTIG' };
    return { tag: 'info', text: 'INFO' };
  }
  if (marker.isMarker) {
    const cat = symbolCategories.find(c => c.symbols.some(s => s.id === marker.type));
    if (cat) {
      const n = cat.name.toLowerCase();
      if (n.includes('naturv') || n.includes('kultur'))
        return { tag: 'danger', text: 'KÖR INTE HÄR' };
      if (n.includes('terr'))
        return { tag: 'caution', text: 'VAR FÖRSIKTIG' };
      if (n.includes('övr') || n.includes('ovrigt'))
        return { tag: 'danger', text: 'KÖR INTE HÄR' };
    }
    if (marker.type === 'landing')
      return { tag: 'info', text: 'AVLÄGG' };
  }
  return { tag: 'info', text: 'INFO' };
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
  onStartDriving, boundaryCoordinates,
  mode = 'briefing', checkedStepIds, onChecklistChange, onBriefingComplete,
}: Props) {
  const [currentStep, setCurrentStep] = useState(-1);
  const [steps, setSteps] = useState<BriefingStep[]>([]);
  const [fadeIn, setFadeIn] = useState(false);
  const [overviewBusy, setOverviewBusy] = useState(false);
  const overviewBusyRef = useRef(false);
  const [overviewPhase, setOverviewPhase] = useState<'orbit' | 'topdown'>('orbit');
  const rotationRef = useRef<any>(null);
  const wmsPulseRef = useRef<any>(null);
  const prevOverlaysRef = useRef<Record<string, boolean> | null>(null);
  // Checklist state (for toolbar compat)
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(() => new Set(checkedStepIds || []));
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [panelHeight, setPanelHeight] = useState(50);
  const dragStartRef = useRef<{ y: number; h: number } | null>(null);

  // === BUILD STEPS ===
  useEffect(() => {
    if (currentStep >= 0) return;
    const built: BriefingStep[] = [];

    const boundaries = markers.filter(m => m.isLine && m.lineType === 'boundary' && m.path && m.path.length > 2);
    const landings = markers.filter(m => m.isMarker && m.type === 'landing');
    const mainRoads = markers.filter(m => m.isLine && m.lineType === 'mainRoad' && m.path && m.path.length > 1);
    const symbolMarkers = markers.filter(m => (m.isMarker && m.type !== 'landing') || m.isZone);

    const allPoints = boundaries.length > 0
      ? boundaries[0].path!.map(p => svgToLatLon(p.x, p.y))
      : markers.filter(m => m.x !== undefined).map(m => svgToLatLon(m.x, m.y));

    let centerLat = 0, centerLon = 0;
    if (allPoints.length > 0) {
      for (const p of allPoints) { centerLat += p.lat; centerLon += p.lon; }
      centerLat /= allPoints.length; centerLon /= allPoints.length;
    }

    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const p of allPoints) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lon < minLon) minLon = p.lon;
      if (p.lon > maxLon) maxLon = p.lon;
    }
    const extentKm = Math.max(maxLat - minLat, (maxLon - minLon) * Math.cos(centerLat * Math.PI / 180)) * 111;
    const overviewZoom = extentKm < 0.5 ? 17 : extentKm < 1 ? 16.5 : extentKm < 2 ? 16 : 15.5;

    // 1. OVERVIEW — smooth organic arc orbit
    const rLat = (maxLat - minLat) * 0.45 + 0.001;
    const rLon = (maxLon - minLon) * 0.45 + 0.0015;
    const arcPoints: { lat: number; lon: number }[] = [];
    const arcCount = 60;
    for (let i = 0; i <= arcCount; i++) {
      const t = i / arcCount;
      const angleDeg = 270 - 360 * t;
      const angleRad = angleDeg * Math.PI / 180;
      const rVar = 1 + 0.15 * Math.sin(t * Math.PI * 3);
      arcPoints.push({
        lat: centerLat + rLat * rVar * Math.sin(angleRad),
        lon: centerLon + rLon * rVar * Math.cos(angleRad),
      });
    }
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
      id: 'overview', type: 'overview', title: 'Överflygning', icon: '🗺️',
      center: { lat: centerLat, lon: centerLon }, zoom: overviewZoom, pitch: 60,
      path: arcPoints, arcCDF,
    });

    // 2. OM TRAKTEN — if boundary marker has a comment
    const traktComment = boundaries.length > 0 ? boundaries[0].comment : undefined;
    if (traktComment) {
      built.push({
        id: 'about', type: 'about', title: 'Om trakten', icon: '📝',
        comment: traktComment,
        center: { lat: centerLat, lon: centerLon }, zoom: overviewZoom - 0.5, pitch: 0,
      });
    }

    // 3. LANDINGS
    for (const m of landings) {
      const ll = svgToLatLon(m.x, m.y);
      built.push({
        id: `landing-${m.id}`, type: 'landing', title: 'Avlägg', icon: '📦',
        comment: m.comment || undefined,
        center: ll, zoom: 18, pitch: 62, marker: m,
        tag: 'info', tagText: 'AVLÄGG', categoryColor: A, photoData: m.photoData || undefined,
      });
    }

    // 4. MAIN ROADS
    for (const m of mainRoads) {
      const pathLL = m.path!.map(p => svgToLatLon(p.x, p.y));
      const mid = pathLL[Math.floor(pathLL.length / 2)];
      built.push({
        id: `mainroad-${m.id}`, type: 'mainroad', title: 'Basväg', icon: '🛤️',
        comment: m.comment || undefined,
        center: mid, zoom: 17, pitch: 60, path: pathLL, marker: m,
        tag: 'info', tagText: 'BASVÄG', categoryColor: A,
      });
    }

    // 5. PROPERTY BOUNDARY
    const mapInst = mapInstanceRef.current;
    const hasPropertyWMS = mapInst && mapInst.getLayer && mapInst.getLayer('wms-layer-fastighetsgranser');
    if (hasPropertyWMS) {
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
      const ext = 0.15;
      const propStart = { lat: flyA.lat - (flyB.lat - flyA.lat) * ext, lon: flyA.lon - (flyB.lon - flyA.lon) * ext };
      const propEnd = { lat: flyB.lat + (flyB.lat - flyA.lat) * ext, lon: flyB.lon + (flyB.lon - flyA.lon) * ext };
      const propPath: { lat: number; lon: number }[] = [];
      for (let pi = 0; pi <= 20; pi++) {
        const pt = pi / 20;
        propPath.push({ lat: propStart.lat + (propEnd.lat - propStart.lat) * pt, lon: propStart.lon + (propEnd.lon - propStart.lon) * pt });
      }
      built.push({
        id: 'property', type: 'property', title: 'Fastighetsgräns', icon: '📐',
        center: { lat: centerLat, lon: centerLon }, zoom: 16.5, pitch: 63,
        bearing: getBearing(propStart, propEnd), path: propPath,
        tag: 'caution', tagText: 'FASTIGHETSGRÄNS', categoryColor: A,
      });
    }

    // 6. SYMBOLS — all markers/zones
    for (const m of symbolMarkers) {
      let ll: { lat: number; lon: number };
      let stepZoom = 18;
      if (m.isZone && m.path && m.path.length > 0) {
        let cx = 0, cy = 0;
        for (const p of m.path!) { cx += p.x; cy += p.y; }
        ll = svgToLatLon(cx / m.path!.length, cy / m.path!.length);
        const pts = m.path!.map(p => svgToLatLon(p.x, p.y));
        let maxDist = 0;
        for (const p of pts) {
          const d = Math.sqrt(((p.lat - ll.lat) * 111320) ** 2 + ((p.lon - ll.lon) * 111320 * Math.cos(ll.lat * Math.PI / 180)) ** 2);
          if (d > maxDist) maxDist = d;
        }
        if (maxDist < 30) stepZoom = 17.5;
        else if (maxDist < 80) stepZoom = 16.5;
        else if (maxDist < 200) stepZoom = 16;
        else stepZoom = 15.5;
      } else {
        ll = svgToLatLon(m.x, m.y);
      }
      const t = getTag(m, symbolCategories);
      built.push({
        id: `symbol-${m.id}`, type: m.isZone ? 'zone' : 'symbol',
        title: getSymbolName(m, symbolCategories, zoneTypes), icon: getSymbolIcon(m),
        comment: m.comment || undefined,
        center: ll, zoom: stepZoom, pitch: 62, marker: m,
        tag: t.tag, tagText: t.text, categoryColor: A,
        photoData: m.photoData || undefined,
      });
    }

    // 7. DONE
    built.push({
      id: 'done', type: 'done', title: 'Briefing klar', icon: '✅',
      center: { lat: centerLat, lon: centerLon }, zoom: overviewZoom - 1.5, pitch: 0, bearing: 0,
    });

    setSteps(built);
  }, [markers, svgToLatLon, symbolCategories, zoneTypes, currentStep]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open checklist when mounted in checklist mode
  useEffect(() => {
    if (mode === 'checklist' && steps.length > 0 && !checklistOpen) {
      setChecklistOpen(true);
    }
  }, [mode, steps.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rotationRef.current) { clearInterval(rotationRef.current); cancelAnimationFrame(rotationRef.current as any); }
      if (wmsPulseRef.current) { clearInterval(wmsPulseRef.current); wmsPulseRef.current = null; }
      const map = mapInstanceRef.current;
      if (map) {
        try { if (map.getLayer('briefing-red-line-layer')) map.removeLayer('briefing-red-line-layer'); } catch {}
        try { if (map.getSource('briefing-red-line')) map.removeSource('briefing-red-line'); } catch {}
        if (map.getLayer('wms-layer-fastighetsgranser')) {
          try {
            map.setPaintProperty('wms-layer-fastighetsgranser', 'raster-contrast', 0);
            map.setPaintProperty('wms-layer-fastighetsgranser', 'raster-brightness-max', 1);
          } catch {}
        }
      }
      if (prevOverlaysRef.current) setOverlays(() => prevOverlaysRef.current!);
    };
  }, [setOverlays, mapInstanceRef]);

  // === ANIMATE TO STEP ===
  const animateToStep = useCallback((stepIdx: number) => {
    const map = mapInstanceRef.current;
    if (!map || !steps[stepIdx]) return;
    const step = steps[stepIdx];

    onActiveMarkerChange?.(step.marker?.id || null);

    // Stop previous animation
    if (rotationRef.current) { clearInterval(rotationRef.current); cancelAnimationFrame(rotationRef.current as any); rotationRef.current = null; }
    if (wmsPulseRef.current) { clearInterval(wmsPulseRef.current); wmsPulseRef.current = null; }
    if (overviewBusyRef.current) { overviewBusyRef.current = false; setOverviewBusy(false); }
    setOverviewPhase('orbit');

    // Property step: show fastighetsgränser + red pulsing nearby boundaries
    const redLineLayer = 'briefing-red-line-layer';
    const redLineSrc = 'briefing-red-line';
    if (step.type === 'property') {
      prevOverlaysRef.current = { ...overlays };
      // Show fastighetsgränser (vector tile layer + WMS fallback)
      if (map.getLayer('vt-fastighet-line')) {
        map.setLayoutProperty('vt-fastighet-line', 'visibility', 'visible');
      }
      if (map.getLayer('wms-layer-fastighetsgranser')) {
        map.setLayoutProperty('wms-layer-fastighetsgranser', 'visibility', 'visible');
        map.setPaintProperty('wms-layer-fastighetsgranser', 'raster-opacity', 1.0);
      }
      setOverlays((prev: any) => ({ ...prev, fastighetsgranser: true }));

      // Find fastighetsgräns lines near the tract boundary from vector tiles
      try { if (map.getLayer(redLineLayer)) map.removeLayer(redLineLayer); } catch {}
      try { if (map.getSource(redLineSrc)) map.removeSource(redLineSrc); } catch {}

      // Query vector tile source for nearby fastighetsgräns features
      let nearbyFeatures: any[] = [];
      if (boundaryCoordinates && boundaryCoordinates.length > 1) {
        try {
          const vtFeats = map.querySourceFeatures('vt-fastighet', { sourceLayer: 'fastighetsindelning' });
          console.log('[Briefing] VT fastighetsgräns features loaded:', vtFeats.length);

          if (vtFeats.length > 0) {
            // Filter: keep features within ~50m of tract boundary
            const THRESHOLD_DEG = 50 / 111320; // ~50m in degrees
            const isNear = (coord: [number, number]) => {
              for (const bc of boundaryCoordinates!) {
                const dLon = coord[0] - bc[0];
                const dLat = coord[1] - bc[1];
                if (Math.abs(dLon) < THRESHOLD_DEG * 3 && Math.abs(dLat) < THRESHOLD_DEG * 3) {
                  const dist = Math.sqrt(dLon * dLon + dLat * dLat);
                  if (dist < THRESHOLD_DEG) return true;
                }
              }
              return false;
            };

            for (const f of vtFeats) {
              const geom = f.geometry;
              if (!geom) continue;
              let coords: [number, number][] = [];
              if (geom.type === 'LineString') coords = geom.coordinates as [number, number][];
              else if (geom.type === 'MultiLineString') coords = (geom.coordinates as [number, number][][]).flat();
              else if (geom.type === 'Polygon') coords = (geom.coordinates as [number, number][][])[0];
              else continue;
              if (coords.some(c => isNear(c))) {
                nearbyFeatures.push({ type: 'Feature', properties: {}, geometry: geom });
              }
            }
            console.log('[Briefing] Nearby fastighetsgräns features:', nearbyFeatures.length);
          }
        } catch (e) { console.warn('[Briefing] VT query failed:', e); }

        // Fallback: use tract boundary itself if no VT features found
        if (nearbyFeatures.length === 0) {
          console.log('[Briefing] No VT features, using tract boundary as red line');
          nearbyFeatures = [{
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: boundaryCoordinates },
          }];
        }
      }

      // Create red pulsing line
      if (nearbyFeatures.length > 0) {
        try {
          map.addSource(redLineSrc, {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: nearbyFeatures },
          });
          map.addLayer({
            id: redLineLayer,
            type: 'line',
            source: redLineSrc,
            paint: { 'line-color': '#ef4444', 'line-width': 10, 'line-opacity': 1 },
            layout: { 'line-cap': 'round', 'line-join': 'round' },
          });
          console.log('[Briefing] Red pulse layer created with', nearbyFeatures.length, 'features');
        } catch (e) { console.error('[Briefing] Red line layer failed:', e); }
      }

      // Pulse opacity
      let pulseOn = true;
      wmsPulseRef.current = setInterval(() => {
        if (!mapInstanceRef.current) return;
        pulseOn = !pulseOn;
        try {
          if (mapInstanceRef.current.getLayer(redLineLayer)) {
            mapInstanceRef.current.setPaintProperty(redLineLayer, 'line-opacity', pulseOn ? 1.0 : 0.2);
          }
        } catch {}
      }, 1000);
    } else if (prevOverlaysRef.current) {
      // Restore fastighetsgränser visibility
      const wasOn = prevOverlaysRef.current.fastighetsgranser;
      if (map.getLayer('vt-fastighet-line')) {
        map.setLayoutProperty('vt-fastighet-line', 'visibility', wasOn ? 'visible' : 'none');
      }
      if (map.getLayer('wms-layer-fastighetsgranser')) {
        map.setLayoutProperty('wms-layer-fastighetsgranser', 'visibility', wasOn ? 'visible' : 'none');
        map.setPaintProperty('wms-layer-fastighetsgranser', 'raster-opacity', 0.7);
      }
      // Remove red line
      try { if (map.getLayer(redLineLayer)) map.removeLayer(redLineLayer); } catch {}
      try { if (map.getSource(redLineSrc)) map.removeSource(redLineSrc); } catch {}
      setOverlays((prev: any) => ({ ...prev, fastighetsgranser: prevOverlaysRef.current?.fastighetsgranser ?? false }));
      prevOverlaysRef.current = null;
    }

    // OVERVIEW: smooth organic arc, 12s, pitch 55-65
    if (step.type === 'overview' && step.path && step.path.length > 1) {
      const arcPath = step.path;
      const arcCenter = step.center!;
      const baseZoom = step.zoom || 16;
      const cdf = step.arcCDF;
      const startBear = getBearing(arcPath[0], arcCenter);
      map.jumpTo({ center: [arcPath[0].lon, arcPath[0].lat], zoom: baseZoom, pitch: 60, bearing: startBear });
      const arcDuration = 12000;
      const startTime = performance.now();
      const mapTime = (t: number): number => {
        if (!cdf || cdf.length < 2) return t;
        let lo = 0, hi = cdf.length - 2;
        while (lo < hi) { const mid = (lo + hi) >> 1; cdf[mid + 1] < t ? lo = mid + 1 : hi = mid; }
        const segLen = cdf[lo + 1] - cdf[lo];
        return segLen > 0 ? (lo + (t - cdf[lo]) / segLen) / (cdf.length - 1) : lo / (cdf.length - 1);
      };
      overviewBusyRef.current = true;
      setOverviewBusy(true);
      const tick = () => {
        if (!mapInstanceRef.current) return;
        const elapsed = performance.now() - startTime;
        if (elapsed >= arcDuration) {
          setOverviewPhase('topdown');
          mapInstanceRef.current.flyTo({
            center: [arcCenter.lon, arcCenter.lat], zoom: baseZoom - 0.8, pitch: 0, bearing: 0, duration: 2000, essential: true,
          });
          rotationRef.current = setTimeout(() => { overviewBusyRef.current = false; setOverviewBusy(false); }, 4500) as any;
          return;
        }
        const rawT = elapsed / arcDuration;
        const eased = rawT < 0.5 ? 2 * rawT * rawT : 1 - (-2 * rawT + 2) ** 2 / 2;
        const arcT = mapTime(eased);
        const idx = arcT * (arcPath.length - 1);
        const i = Math.floor(idx);
        const frac = idx - i;
        const p0 = arcPath[Math.min(i, arcPath.length - 1)];
        const p1 = arcPath[Math.min(i + 1, arcPath.length - 1)];
        const lat = p0.lat + (p1.lat - p0.lat) * frac;
        const lon = p0.lon + (p1.lon - p0.lon) * frac;
        const baseBear = getBearing({ lat, lon }, arcCenter);
        const bearOff = 10 * Math.sin(arcT * Math.PI * 3);
        const zoomVar = 0.6 * Math.sin(arcT * Math.PI * 4);
        const pitch = 60 + 5 * Math.sin(arcT * Math.PI * 2);
        mapInstanceRef.current.jumpTo({ center: [lon, lat], bearing: baseBear + bearOff, zoom: baseZoom + zoomVar, pitch });
        rotationRef.current = requestAnimationFrame(tick) as any;
      };
      rotationRef.current = requestAnimationFrame(tick) as any;
    }
    // PROPERTY: fly straight
    else if (step.type === 'property' && step.path && step.path.length > 1) {
      const propPath = step.path;
      const propBearing = step.bearing || getBearing(propPath[0], propPath[propPath.length - 1]);
      map.flyTo({ center: [propPath[0].lon, propPath[0].lat], zoom: step.zoom || 16.5, pitch: step.pitch || 63, bearing: propBearing, duration: 2000, essential: true });
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
        mapInstanceRef.current.easeTo({ center: [p.lon, p.lat], bearing: getBearing(p, np), duration: propInterval - 50, pitch: step.pitch || 63, zoom: step.zoom || 16.5 });
      }, propInterval);
      rotationRef.current = propAnim;
    }
    // MAINROAD: animate along path
    else if (step.type === 'mainroad' && step.path && step.path.length > 1) {
      const pathPts = step.path;
      const totalPts = pathPts.length;
      const stepSize = Math.max(1, Math.floor(totalPts / 12));
      const interval = 900;
      let idx = 0;
      map.flyTo({ center: [pathPts[0].lon, pathPts[0].lat], zoom: step.zoom || 16.5, pitch: 60, bearing: 0, duration: 1500, essential: true });
      const pathAnim = setInterval(() => {
        if (!mapInstanceRef.current) { clearInterval(pathAnim); return; }
        idx += stepSize;
        if (idx >= totalPts) { clearInterval(pathAnim); return; }
        const p = pathPts[idx];
        mapInstanceRef.current.easeTo({ center: [p.lon, p.lat], duration: interval - 50, pitch: 60, zoom: step.zoom || 16.5 });
      }, interval);
      rotationRef.current = pathAnim;
    }
    // ALL OTHER: smooth flyTo
    else if (step.center) {
      map.flyTo({ center: [step.center.lon, step.center.lat], zoom: step.zoom || 15, pitch: step.pitch || 60, bearing: step.bearing ?? 0, duration: 1800, essential: true });
    }

    setFadeIn(false);
    requestAnimationFrame(() => { requestAnimationFrame(() => setFadeIn(true)); });
  }, [steps, mapInstanceRef, overlays, setOverlays, onActiveMarkerChange]);

  const goToStep = useCallback((idx: number) => {
    if (overviewBusyRef.current && idx !== 0) return;
    if (checklistOpen) return;
    setCurrentStep(idx);
    if (idx >= 0) animateToStep(idx);
  }, [animateToStep, checklistOpen]);

  const handleClose = useCallback(() => {
    if (rotationRef.current) { clearInterval(rotationRef.current); cancelAnimationFrame(rotationRef.current as any); rotationRef.current = null; }
    if (wmsPulseRef.current) { clearInterval(wmsPulseRef.current); wmsPulseRef.current = null; }
    const map = mapInstanceRef.current;
    if (map) {
      try { if (map.getLayer('briefing-red-line-layer')) map.removeLayer('briefing-red-line-layer'); } catch {}
      try { if (map.getSource('briefing-red-line')) map.removeSource('briefing-red-line'); } catch {}
      if (prevOverlaysRef.current) {
        if (map.getLayer('wms-layer-fastighetsgranser')) {
          try {
            map.setPaintProperty('wms-layer-fastighetsgranser', 'raster-contrast', 0);
            map.setPaintProperty('wms-layer-fastighetsgranser', 'raster-brightness-max', 1);
          } catch {}
        }
      }
    }
    onChecklistChange?.(Array.from(checkedItems));
    onActiveMarkerChange?.(null);
    onClose();
  }, [onClose, onActiveMarkerChange, mapInstanceRef, checkedItems, onChecklistChange]);

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

  // Checklist: map click handler (for toolbar compat)
  useEffect(() => {
    if (!checklistOpen) return;
    const map = mapInstanceRef.current;
    if (!map) return;
    const handleMapClick = (e: any) => {
      const cLat = e.lngLat.lat;
      const cLon = e.lngLat.lng;
      let best: BriefingStep | null = null;
      let bestDist = Infinity;
      for (const s of steps) {
        if (!s.center || s.type === 'overview' || s.type === 'done' || s.type === 'about') continue;
        const dLat = (s.center.lat - cLat) * 111320;
        const dLon = (s.center.lon - cLon) * 111320 * Math.cos(cLat * Math.PI / 180);
        const dist = Math.sqrt(dLat * dLat + dLon * dLon);
        if (dist < bestDist) { bestDist = dist; best = s; }
      }
      if (best && bestDist < 75) {
        setExpandedItem(prev => prev === best!.id ? null : best!.id);
        onActiveMarkerChange?.(best.marker?.id || null);
      } else {
        setExpandedItem(null);
        onActiveMarkerChange?.(null);
      }
    };
    map.on('click', handleMapClick);
    return () => { map.off('click', handleMapClick); onActiveMarkerChange?.(null); };
  }, [checklistOpen, steps, mapInstanceRef, onActiveMarkerChange]);

  const tagBg: Record<string, string> = { danger: 'rgba(239,68,68,0.25)', caution: 'rgba(245,158,11,0.25)', info: 'rgba(138,180,96,0.2)' };
  const tagColor: Record<string, string> = { danger: '#ef4444', caution: '#f59e0b', info: '#8ab460' };

  // Shared button style
  const glassBtnStyle: React.CSSProperties = {
    pointerEvents: 'auto',
    padding: '16px 40px',
    background: 'rgba(138,180,96,0.12)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    color: A,
    border: '1px solid rgba(138,180,96,0.2)',
    borderRadius: '16px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    letterSpacing: '0.3px',
  };

  // ============================================================
  // === START SCREEN — just map + button ===
  // ============================================================
  if (currentStep === -1 && !checklistOpen) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 700, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', pointerEvents: 'none' }}>
        <button onClick={() => goToStep(0)} style={{ ...glassBtnStyle, marginBottom: 'max(44px, env(safe-area-inset-bottom))' }}>
          ▶ Starta briefing
        </button>
      </div>
    );
  }

  // ============================================================
  // === CHECKLIST MODE (toolbar compat) ===
  // ============================================================
  if (checklistOpen) {
    const checklistSteps = steps.filter(s => s.type !== 'overview' && s.type !== 'done' && s.type !== 'about');
    const groups = [
      { tag: 'danger' as const, title: 'KÖR INTE HÄR', color: '#ef4444', items: checklistSteps.filter(s => s.tag === 'danger') },
      { tag: 'caution' as const, title: 'VAR FÖRSIKTIG', color: '#f59e0b', items: checklistSteps.filter(s => s.tag === 'caution') },
      { tag: 'info' as const, title: 'INFO', color: '#8ab460', items: checklistSteps.filter(s => s.tag === 'info') },
    ].filter(g => g.items.length > 0);
    const totalItems = checklistSteps.length;
    const checkedCount = checklistSteps.filter(s => checkedItems.has(s.id)).length;

    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 700, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', pointerEvents: 'none' }}>
        <div style={{ position: 'fixed', top: '16px', left: '16px', zIndex: 710, pointerEvents: 'auto' }}>
          <button onClick={handleClose} style={{ padding: '10px 18px', borderRadius: '24px', background: 'rgba(10,15,8,0.85)', color: 'rgba(138,180,96,0.6)', border: '1px solid rgba(255,255,255,0.06)', fontSize: '14px', fontWeight: '600', cursor: 'pointer', backdropFilter: 'blur(8px)' }}>
            Stäng
          </button>
        </div>
        <div style={{ pointerEvents: 'auto', height: `${panelHeight}vh`, background: 'rgba(10,15,8,0.97)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', border: '1px solid rgba(255,255,255,0.06)', borderBottom: 'none', display: 'flex', flexDirection: 'column', transition: dragStartRef.current ? 'none' : 'height 0.3s ease' }}>
          <div
            onPointerDown={(e) => { dragStartRef.current = { y: e.clientY, h: panelHeight }; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
            onPointerMove={(e) => { if (!dragStartRef.current) return; const dy = dragStartRef.current.y - e.clientY; const dPct = (dy / window.innerHeight) * 100; setPanelHeight(Math.max(10, Math.min(85, dragStartRef.current.h + dPct))); }}
            onPointerUp={() => { if (!dragStartRef.current) return; dragStartRef.current = null; setPanelHeight(h => h < 25 ? 10 : h < 60 ? 50 : 85); }}
            style={{ padding: '12px 0', cursor: 'grab', touchAction: 'none', flexShrink: 0 }}
          >
            <div style={{ width: '40px', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.15)', margin: '0 auto' }} />
          </div>
          <div style={{ padding: '0 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0 }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: 'rgba(232,240,224,0.6)' }}>
              {checkedCount} av {totalItems} kvitterade
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0', WebkitOverflowScrolling: 'touch' }}>
            {groups.map(group => (
              <div key={group.tag}>
                <div style={{ padding: '14px 20px 6px', fontSize: '11px', fontWeight: '800', letterSpacing: '1px', textTransform: 'uppercase', color: group.color, opacity: 0.6 }}>{group.title}</div>
                {group.items.map(item => {
                  const isChecked = checkedItems.has(item.id);
                  const isExpanded = expandedItem === item.id;
                  return (
                    <div key={item.id}>
                      <div
                        onClick={() => {
                          if (isExpanded) { setExpandedItem(null); onActiveMarkerChange?.(null); }
                          else {
                            setExpandedItem(item.id);
                            onActiveMarkerChange?.(item.marker?.id || null);
                            const m = mapInstanceRef.current;
                            if (m && item.center) m.flyTo({ center: [item.center.lon, item.center.lat], zoom: Math.max(m.getZoom(), item.zoom || 16), pitch: 50, duration: 1000, essential: true });
                          }
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 20px', opacity: isChecked ? 0.35 : 1, background: isExpanded ? 'rgba(138,180,96,0.06)' : 'transparent', cursor: 'pointer', transition: 'opacity 0.3s, background 0.2s' }}
                      >
                        <div
                          onClick={(e) => { e.stopPropagation(); setCheckedItems(prev => { const next = new Set(prev); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); onChecklistChange?.(Array.from(next)); return next; }); }}
                          style={{ width: '22px', height: '22px', borderRadius: '6px', border: isChecked ? 'none' : '2px solid rgba(255,255,255,0.15)', background: isChecked ? A : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}
                        >
                          {isChecked && <span style={{ color: '#0a0f08', fontSize: '13px', fontWeight: '700' }}>&#10003;</span>}
                        </div>
                        <div style={{ fontSize: '18px', flexShrink: 0 }}>{item.icon}</div>
                        <div style={{ flex: 1, fontSize: '14px', fontWeight: '600', color: isChecked ? 'rgba(255,255,255,0.25)' : '#e8f0e0' }}>{item.title}</div>
                      </div>
                      {isExpanded && (
                        <div style={{ padding: '4px 20px 12px 72px' }}>
                          {item.comment && (
                            <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)', marginBottom: '8px' }}>
                              <div style={{ fontSize: '13px', color: 'rgba(232,240,224,0.6)', lineHeight: '1.5' }}>{item.comment}</div>
                            </div>
                          )}
                          {!item.comment && <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>Ingen extra information</div>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const step = steps[currentStep];
  if (!step) return null;

  // ============================================================
  // === DONE SCREEN — just map + button ===
  // ============================================================
  if (step.type === 'done') {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 700, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', pointerEvents: 'none' }}>
        <button
          onClick={() => {
            const total = steps.filter(s => s.type !== 'overview' && s.type !== 'done' && s.type !== 'about').length;
            onBriefingComplete?.(total);
            onStartDriving?.();
            handleClose();
          }}
          style={{ ...glassBtnStyle, marginBottom: 'max(44px, env(safe-area-inset-bottom))' }}
        >
          Klar – börja köra 🌲
        </button>
      </div>
    );
  }

  // ============================================================
  // === STEP SCREEN — gradient + card ===
  // ============================================================
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 700, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', pointerEvents: 'none' }}>
      {/* Step counter */}
      <div style={{
        position: 'fixed', top: '16px', right: '16px', zIndex: 710, pointerEvents: 'auto',
        padding: '6px 14px', borderRadius: '20px',
        background: 'rgba(10,15,8,0.6)', color: 'rgba(138,180,96,0.5)',
        fontSize: '13px', fontWeight: '600', backdropFilter: 'blur(8px)',
      }}>
        {currentStep + 1} / {steps.length}
      </div>

      <div style={{
        pointerEvents: 'auto',
        background: 'linear-gradient(transparent, rgba(10,15,8,0.92) 35%)',
        padding: '80px 20px 32px',
        paddingBottom: 'max(32px, env(safe-area-inset-bottom))',
      }}>
        <div style={{
          maxWidth: '420px', margin: '0 auto',
          opacity: fadeIn ? 1 : 0,
          transform: fadeIn ? 'translateY(0)' : 'translateY(20px)',
          transition: 'opacity 0.4s ease, transform 0.4s ease',
        }}>
          {/* Progress dots — accent green */}
          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', marginBottom: '20px' }}>
            {steps.map((_, i) => (
              <div key={i} style={{
                width: i === currentStep ? '24px' : '6px', height: '6px', borderRadius: '3px',
                background: i === currentStep ? A : 'rgba(138,180,96,0.2)',
                transition: 'all 0.3s ease',
              }} />
            ))}
          </div>

          {/* Icon + title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ fontSize: '28px' }}>{step.icon}</div>
            <div style={{ fontSize: '18px', fontWeight: '600', color: '#e8f0e0' }}>
              {step.type === 'overview' ? (overviewPhase === 'orbit' ? 'Överflygning' : 'Hela trakten') : step.title}
            </div>
          </div>

          {/* Comment */}
          {step.comment && (
            <div style={{
              padding: '12px 16px', borderRadius: '10px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.05)',
              marginBottom: '16px',
            }}>
              <div style={{ fontSize: '14px', color: 'rgba(232,240,224,0.65)', lineHeight: '1.5' }}>
                {step.comment}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: 'flex', gap: '10px' }}>
            {currentStep > 0 && (
              <button
                onClick={() => goToStep(currentStep - 1)}
                style={{
                  flex: 1, padding: '14px',
                  background: 'rgba(255,255,255,0.03)',
                  color: 'rgba(138,180,96,0.45)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: '12px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                }}>
                ← Tillbaka
              </button>
            )}
            <button
              onClick={() => !overviewBusy && goToStep(currentStep + 1)}
              style={{
                flex: currentStep > 0 ? 1 : undefined,
                width: currentStep > 0 ? undefined : '100%',
                padding: '14px',
                background: overviewBusy ? 'rgba(138,180,96,0.15)' : A,
                color: overviewBusy ? 'rgba(255,255,255,0.3)' : '#0a0f08',
                border: 'none', borderRadius: '12px',
                fontSize: '14px', fontWeight: '700',
                cursor: overviewBusy ? 'default' : 'pointer',
                transition: 'background 0.5s ease, color 0.5s ease',
              }}>
              {overviewBusy ? 'Flygning pågår...' : 'Kör vidare →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
