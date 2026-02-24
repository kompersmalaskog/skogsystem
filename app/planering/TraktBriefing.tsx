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
  type: 'overview' | 'landing' | 'mainroad' | 'property' | 'boundary' | 'symbol' | 'zone' | 'done';
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
  // Flyover bounds (overview step)
  flyoverSouth?: { lat: number; lon: number };
  flyoverNorth?: { lat: number; lon: number };
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

export default function TraktBriefing({
  markers, mapInstanceRef, svgToLatLon, symbolCategories,
  lineTypes, zoneTypes, overlays, setOverlays, traktName, onClose, onActiveMarkerChange,
}: Props) {
  const [currentStep, setCurrentStep] = useState(-1); // -1 = start screen
  const [steps, setSteps] = useState<BriefingStep[]>([]);
  const [fadeIn, setFadeIn] = useState(false);
  const rotationRef = useRef<any>(null);
  const prevOverlaysRef = useRef<Record<string, boolean> | null>(null);

  // Build steps from markers
  useEffect(() => {
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

    // 1. OVERVIEW — compute bounding box for flyover
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const p of allPoints) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lon < minLon) minLon = p.lon;
      if (p.lon > maxLon) maxLon = p.lon;
    }
    // Add ~20% padding outside the tract edges
    const latPad = (maxLat - minLat) * 0.2 || 0.001;
    built.push({
      id: 'overview',
      type: 'overview',
      title: 'Hela trakten',
      icon: '🗺️',
      tag: 'info',
      tagText: 'ÖVERFLYGNING',
      center: { lat: centerLat, lon: centerLon },
      zoom: 16,
      pitch: 68,
      bearing: 0,
      flyoverSouth: { lat: minLat - latPad, lon: centerLon },
      flyoverNorth: { lat: maxLat + latPad, lon: centerLon },
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
        zoom: 17.5,
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
        zoom: 16,
        pitch: 60,
        path: pathLL,
        marker: m,
        categoryColor: '#3b82f6',
      });
    }

    // 4. PROPERTY LINES (if overlay exists)
    if (overlays.fastighetsgranser !== undefined) {
      built.push({
        id: 'property',
        type: 'property',
        title: 'Fastighetsgränser',
        icon: '📐',
        tag: 'caution',
        tagText: 'FASTIGHETSGRÄNS',
        center: { lat: centerLat, lon: centerLon },
        zoom: 14.5,
        pitch: 45,
        categoryColor: '#e879f9',
      });
    }

    // 5. BOUNDARY
    for (const m of boundaries) {
      const pathLL = m.path!.map(p => svgToLatLon(p.x, p.y));
      built.push({
        id: `boundary-${m.id}`,
        type: 'boundary',
        title: 'Traktgräns',
        icon: '🔴',
        tag: 'caution',
        tagText: 'TRAKTGRÄNS',
        comment: m.comment || undefined,
        center: { lat: centerLat, lon: centerLon },
        zoom: 14.5,
        pitch: 50,
        path: pathLL,
        marker: m,
        categoryColor: '#ef4444',
      });
    }

    // 6. SYMBOLS sorted: danger first, then caution, then info
    const tagOrder = { danger: 0, caution: 1, info: 2 };
    const sorted = [...symbolMarkers].sort((a, b) => {
      const ta = getTag(a, symbolCategories);
      const tb = getTag(b, symbolCategories);
      return tagOrder[ta.tag] - tagOrder[tb.tag];
    });

    for (const m of sorted) {
      let ll: { lat: number; lon: number };
      let stepZoom = 17.5;
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
        // Adapt zoom: small zone (<30m) = 17, medium (<80m) = 16, large = 15
        if (maxDist < 30) stepZoom = 17;
        else if (maxDist < 80) stepZoom = 16;
        else if (maxDist < 200) stepZoom = 15.5;
        else stepZoom = 15;
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

    // 7. DONE
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
  }, [markers, svgToLatLon, symbolCategories, zoneTypes, overlays.fastighetsgranser]);

  // Stop animation on unmount
  useEffect(() => {
    return () => {
      if (rotationRef.current) { clearInterval(rotationRef.current); cancelAnimationFrame(rotationRef.current as any); }
      // Restore overlays
      if (prevOverlaysRef.current) {
        setOverlays(() => prevOverlaysRef.current!);
      }
    };
  }, [setOverlays]);

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

    // Property line effect
    if (step.type === 'property') {
      prevOverlaysRef.current = { ...overlays };
      setOverlays((prev: any) => ({ ...prev, fastighetsgranser: true }));
    } else if (prevOverlaysRef.current && overlays.fastighetsgranser && steps[stepIdx]?.type !== 'property') {
      // Only restore if we changed it
      setOverlays((prev: any) => ({ ...prev, fastighetsgranser: prevOverlaysRef.current?.fastighetsgranser ?? false }));
    }

    // Overview: straight south-to-north flyover
    if (step.type === 'overview' && step.flyoverSouth && step.flyoverNorth) {
      const south = step.flyoverSouth;
      const north = step.flyoverNorth;
      // Start camera at southern edge, facing north
      map.jumpTo({
        center: [south.lon, south.lat],
        zoom: step.zoom || 16,
        pitch: step.pitch || 68,
        bearing: 0,
      });
      // Animate northward over 12 seconds
      const duration = 12000;
      const startTime = performance.now();
      const tick = () => {
        if (!mapInstanceRef.current) return;
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        // Smooth easing (ease-in-out)
        const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        const lat = south.lat + (north.lat - south.lat) * ease;
        const lon = south.lon + (north.lon - south.lon) * ease;
        mapInstanceRef.current.jumpTo({ center: [lon, lat] });
        if (t < 1) {
          rotationRef.current = requestAnimationFrame(tick) as any;
        }
      };
      rotationRef.current = requestAnimationFrame(tick) as any;
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

    // Slow rotation for boundary/property/done
    if (['boundary', 'property', 'done'].includes(step.type)) {
      let bearing = 0;
      rotationRef.current = setInterval(() => {
        if (!mapInstanceRef.current) return;
        bearing += 0.5;
        mapInstanceRef.current.easeTo({ bearing, duration: 100 });
      }, 100);
    }

    // Animate along path for mainroad
    if (step.type === 'mainroad' && step.path && step.path.length > 1) {
      let idx = 0;
      const pathAnim = setInterval(() => {
        if (!mapInstanceRef.current || idx >= step.path!.length) {
          clearInterval(pathAnim);
          return;
        }
        const p = step.path![idx];
        mapInstanceRef.current.easeTo({
          center: [p.lon, p.lat],
          duration: 800,
          pitch: 60,
          zoom: 16.5,
        });
        idx += Math.max(1, Math.floor(step.path!.length / 10));
      }, 900);
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
    onActiveMarkerChange?.(null);
    onClose();
  }, [onClose, onActiveMarkerChange]);

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

          {/* Property line info */}
          {step.type === 'property' && (
            <div style={{
              padding: '14px 16px', borderRadius: '10px',
              background: 'rgba(232,121,249,0.08)',
              border: '1px solid rgba(232,121,249,0.15)',
              marginBottom: '12px',
            }}>
              <div style={{ fontSize: '12px', color: '#e879f9', fontWeight: '600', marginBottom: '4px' }}>
                📐 Fastighetsgränser
              </div>
              <div style={{ fontSize: '13px', color: '#e8f0e0', lineHeight: '1.5' }}>
                Rosa linjer visar fastighetsgränser. Kontrollera att avverkning sker inom rätt fastighet.
              </div>
            </div>
          )}

          {/* Boundary info */}
          {step.type === 'boundary' && (
            <div style={{
              padding: '14px 16px', borderRadius: '10px',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.15)',
              marginBottom: '12px',
            }}>
              <div style={{ fontSize: '13px', color: '#e8f0e0', lineHeight: '1.5' }}>
                Röd/gul streckad linje markerar traktens yttre gräns. Avverka inte utanför.
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
