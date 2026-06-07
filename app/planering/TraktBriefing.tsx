'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { ZONE_COLORS } from '@/lib/zone-colors'

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
  audioData?: string;
  notes?: { id: string; date: string; text?: string; audioData?: string }[];
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
  bbox?: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  // Kept for checklist compatibility
  tag?: 'danger' | 'caution' | 'info';
  tagText?: string;
  categoryColor?: string;
  photoData?: string;
  audioData?: string;
  notes?: { id: string; date: string; text?: string; audioData?: string }[];
}

interface SymbolCategory {
  name: string;
  bgColor?: string;
  symbols: { id: string; name: string }[];
}

// STEG 6a-3: en rad i objekt_kvittering (per objekt + roll). kvitterat_at satt = låst kvitto.
export type KvittRad = { checked_ids: string[]; kvitterat_av_id: string | null; kvitterat_av_namn: string | null; kvitterat_at: string | null };

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
  currentRole?: 'skordare' | 'skotare' | null;
  kvittSkordare?: KvittRad | null;
  kvittSkotare?: KvittRad | null;
  onKvittera?: (checkedIds: string[]) => void;
  isAdmin?: boolean;
  onNollstall?: (roll: 'skordare' | 'skotare') => void;
  mode?: 'briefing' | 'checklist';
  checkedStepIds?: string[];
  onChecklistChange?: (checkedIds: string[]) => void;
  onBriefingComplete?: (totalSteps: number) => void;
  onShowOnMap?: (itemId: string, center: { lat: number; lon: number }, markerId?: string, source?: 'checklist' | 'mandatory', extra?: { bbox?: [number,number,number,number]; zoom?: number; type?: string; comment?: string; audioData?: string; photoData?: string; title?: string; icon?: string }) => void;
}

// Accent
const A = '#8ab460';

// Icon backgrounds & outlines (must match page.tsx markerIconDefs)
const ICON_BG: Record<string, { bg: string; outline: string }> = {
  eternitytree: { bg: '#30d158', outline: '#ffffff' },
  naturecorner: { bg: '#30d158', outline: '#ffffff' },
  culturemonument: { bg: '#f59e0b', outline: 'rgba(0,0,0,0.8)' },
  culturestump: { bg: '#f59e0b', outline: 'rgba(0,0,0,0.8)' },
  warning: { bg: '#E53935', outline: '#ffffff' },
};
const ICON_BG_DEFAULT = { bg: 'rgba(0,0,0,0.9)', outline: '#ffffff' };

// SVG paths (must match page.tsx iconSvgPaths, viewBox 0 0 24 24, white)
const ICON_SVG: Record<string, string> = {
  eternitytree: '<path d="M12 3 Q4 6 4 12 Q4 16 12 16 Q20 16 20 12 Q20 6 12 3Z" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="16" x2="12" y2="22" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M9 22 Q12 20 15 22" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>',
  naturecorner: '<circle cx="8" cy="10" r="4" stroke="#fff" stroke-width="2" fill="none"/><circle cx="16" cy="10" r="4" stroke="#fff" stroke-width="2" fill="none"/><circle cx="12" cy="7" r="3" stroke="#fff" stroke-width="2" fill="none"/><path d="M3 20 Q12 16 21 20" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/><line x1="8" y1="14" x2="8" y2="17" stroke="#fff" stroke-width="2" stroke-linecap="round"/><line x1="16" y1="14" x2="16" y2="17" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
  culturemonument: '<text x="12" y="17" text-anchor="middle" font-size="16" font-weight="bold" font-family="Arial, sans-serif" fill="#fff">R</text>',
  culturestump: '<path d="M8 22 L8 14 Q8 11 12 11 Q16 11 16 14 L16 22" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 14 Q10 10 12 12 Q14 10 16 14" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/><text x="12" y="19" text-anchor="middle" font-size="7" font-weight="bold" font-family="Arial, sans-serif" fill="#fff">R</text>',
  highstump: '<path d="M9 22 L9 8 Q9 5 12 5 Q15 5 15 8 L15 22" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 8 L8 4 L10 6 L12 3 L14 6 L16 4 L15 8" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="5" y1="22" x2="5" y2="10" stroke="#fff" stroke-width="1.5" stroke-dasharray="3,3" stroke-linecap="round"/><path d="M4 10 L6 10" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/><path d="M4 22 L6 22" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>',
  landing: '<ellipse cx="6" cy="18" rx="4" ry="2" stroke="#fff" stroke-width="2" fill="none"/><ellipse cx="14" cy="18" rx="4" ry="2" stroke="#fff" stroke-width="2" fill="none"/><ellipse cx="18" cy="18" rx="4" ry="2" stroke="#fff" stroke-width="2" fill="none"/><ellipse cx="10" cy="13" rx="4" ry="2" stroke="#fff" stroke-width="2" fill="none"/><ellipse cx="14" cy="13" rx="4" ry="2" stroke="#fff" stroke-width="2" fill="none"/><ellipse cx="12" cy="8" rx="4" ry="2" stroke="#fff" stroke-width="2" fill="none"/>',
  brashpile: '<path d="M4 20 Q4 14 8 12 Q6 10 8 8 Q10 6 12 8 Q14 6 16 8 Q18 10 16 12 Q20 14 20 20 Z" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="10" y1="10" x2="8" y2="5" stroke="#fff" stroke-width="2" stroke-linecap="round"/><line x1="14" y1="10" x2="16" y2="4" stroke="#fff" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="12" x2="12" y2="6" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
  windfall: '<path d="M3 17 L5 14 L4 12 L6 13 L5 10" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="5" y1="15" x2="21" y2="9" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M9 14 L7 18" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M13 12 L11 17" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M17 10 L15 15" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
  manualfelling: '<line x1="5" y1="22" x2="13" y2="9" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/><path d="M11 11 L13 6 Q19 3 18 8 Q20 10 17 12 L13 10 Z" fill="#fff" stroke="#fff" stroke-width="1" stroke-linejoin="round"/>',
  powerline: '<path d="M13 2 L3 14 L10 14 L10 22 L21 10 L14 10 Z" fill="#fff"/>',
  road: '<path d="M8 22 L11 2" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M16 22 L13 2" stroke="#fff" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="20" x2="12" y2="15" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><line x1="12" y1="12" x2="12" y2="7" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><line x1="12" y1="5" x2="12" y2="2" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>',
  turningpoint: '<circle cx="12" cy="12" r="7" stroke="#fff" stroke-width="2" fill="none"/><path d="M12 5 A7 7 0 1 1 5 12" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M5 8 L5 12 L9 12" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  ditch: '<path d="M2 8 L8 16 L16 16 L22 8" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 14 Q12 12 15 14" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/><line x1="2" y1="8" x2="2" y2="5" stroke="#fff" stroke-width="2" stroke-linecap="round"/><line x1="22" y1="8" x2="22" y2="5" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
  bridge: '<path d="M2 17 L6 22 L18 22 L22 17" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 20 Q12 18 16 20" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/><rect x="4" y="11" width="16" height="4" rx="1" fill="#fff"/><line x1="6" y1="15" x2="6" y2="19" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><line x1="18" y1="15" x2="18" y2="19" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>',
  corduroy: '<line x1="3" y1="8" x2="21" y2="8" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/><line x1="3" y1="12" x2="21" y2="12" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/><line x1="3" y1="16" x2="21" y2="16" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>',
  wet: '<path d="M12 3 Q7 10 7 14 Q7 19 12 19 Q17 19 17 14 Q17 10 12 3Z" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 22 Q7 19 11 22 Q15 25 19 22" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>',
  steep: '<path d="M3 20 L12 5 L21 20 Z" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="7" y1="16" x2="17" y2="16" stroke="#fff" stroke-width="2" stroke-linecap="round"/><line x1="9" y1="12" x2="15" y2="12" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
  trail: '<ellipse cx="6" cy="19" rx="2.2" ry="3.5" fill="#fff"/><ellipse cx="14" cy="12" rx="2.2" ry="3.5" fill="#fff"/><ellipse cx="20" cy="5" rx="1.8" ry="2.8" fill="#fff"/>',
  warning: '<path d="M12 3 L22 21 L2 21 Z" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="9" x2="12" y2="14" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><circle cx="12" cy="17" r="1.2" fill="#fff"/>',
};

// Zone icon mapping (zones use a different icon type than their zoneType id)
const ZONE_ICON: Record<string, string> = {
  wet: 'wet', steep: 'steep', protected: 'naturecorner',
  culture: 'culturemonument', noentry: 'warning', fornlamning: 'culturemonument',
};

// Resolve marker type ID for SVG path lookup
function getMarkerTypeId(marker?: Marker): string {
  if (!marker) return 'default';
  if (marker.isZone && marker.zoneType) return ZONE_ICON[marker.zoneType] || marker.zoneType;
  return marker.type || 'default';
}

// Get bg/outline for a marker
function getMarkerIconColors(marker?: Marker): { bg: string; outline: string } {
  if (marker?.isZone && marker.zoneType) {
    const zc = ZONE_COLORS[marker.zoneType];
    if (zc) return { bg: zc, outline: '#ffffff' };
  }
  const typeId = marker?.type || 'default';
  return ICON_BG[typeId] || ICON_BG_DEFAULT;
}

// Render inline SVG matching the map icon (circle + path)
function MarkerIconSvg({ marker, fallbackEmoji, size = 28 }: { marker?: Marker; fallbackEmoji?: string; size?: number }) {
  const typeId = getMarkerTypeId(marker);
  const { bg, outline } = getMarkerIconColors(marker);
  const svgPath = ICON_SVG[typeId];
  const r = size / 2;
  if (!svgPath) {
    // Fallback: Material Symbol i en diskret cirkel
    return (
      <div style={{ width: size, height: size, borderRadius: r, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: size * 0.6, color: 'rgba(255,255,255,0.85)' }}>
          {fallbackEmoji || 'pin_drop'}
        </span>
      </div>
    );
  }
  // Scale inner SVG (24x24 viewBox) into the circle
  const innerScale = (size - 6) / 24;
  const innerOffset = 3;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0, borderRadius: r }}>
      <circle cx={r} cy={r} r={r - 1} fill={bg} stroke={outline} strokeWidth="1.5" />
      <g transform={`translate(${innerOffset}, ${innerOffset}) scale(${innerScale})`} dangerouslySetInnerHTML={{ __html: svgPath }} />
    </svg>
  );
}

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

// Returns Material Symbols Outlined-namn för marker-typ (renderas via .material-symbols-outlined span)
function getSymbolIcon(marker: Marker): string {
  if (marker.type === 'landing') return 'inventory_2';
  if (marker.type === 'eternitytree') return 'park';
  if (marker.type === 'naturecorner') return 'eco';
  if (marker.type === 'culturemonument') return 'museum';
  if (marker.type === 'culturestump') return 'forest';
  if (marker.type === 'highstump') return 'handyman';
  if (marker.type === 'brashpile') return 'grass';
  if (marker.type === 'windfall') return 'cyclone';
  if (marker.type === 'manualfelling') return 'handyman';
  if (marker.type === 'powerline') return 'bolt';
  if (marker.type === 'road') return 'route';
  if (marker.type === 'turningpoint') return 'loop';
  if (marker.type === 'ditch') return 'water_drop';
  if (marker.type === 'bridge') return 'directions_walk';
  if (marker.type === 'corduroy') return 'forest';
  if (marker.type === 'wet') return 'water';
  if (marker.type === 'steep') return 'terrain';
  if (marker.type === 'trail') return 'hiking';
  if (marker.type === 'warning') return 'warning';
  if (marker.isZone) {
    if (marker.zoneType === 'wet') return 'water';
    if (marker.zoneType === 'steep') return 'terrain';
    if (marker.zoneType === 'protected') return 'eco';
    if (marker.zoneType === 'culture') return 'museum';
    if (marker.zoneType === 'noentry') return 'block';
    if (marker.zoneType === 'fornlamning') return 'museum';
  }
  return 'pin_drop';
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
  currentRole = null, kvittSkordare = null, kvittSkotare = null, onKvittera,
  isAdmin = false, onNollstall,
  mode = 'briefing', checkedStepIds, onChecklistChange, onBriefingComplete, onShowOnMap,
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
  // Checklist state — EN lista (mandatory + Kvittering sammanslagna, STEG 6a-3)
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  // STEG 6e-1: kortvandring (briefing) — en sak i taget
  const [walkStarted, setWalkStarted] = useState(false);
  const [cardIndex, setCardIndex] = useState(0);
  const [resetConfirm, setResetConfirm] = useState<'skordare' | 'skotare' | null>(null);  // admin-nollställning (L3)
  const [panelHeight, setPanelHeight] = useState(50);
  const dragStartRef = useRef<{ y: number; h: number } | null>(null);

  // Aktuell rolls kvitto + checkad-set (härledd från checkedStepIds = minRolls checked_ids)
  const myKvitto: KvittRad | null = currentRole === 'skordare' ? kvittSkordare : currentRole === 'skotare' ? kvittSkotare : null;
  const kvitterat = !!myKvitto?.kvitterat_at;
  const checkedSet = new Set(checkedStepIds || []);
  // G4 + läsläge: efter kvitto, eller om man inte är tilldelad rollen, går inget att bocka.
  const toggleItem = (id: string) => {
    if (kvitterat || currentRole === null) return;
    const next = new Set(checkedSet);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChecklistChange?.(Array.from(next));
  };

  // === BUILD STEPS ===
  useEffect(() => {
    if (currentStep >= 0) return;
    const built: BriefingStep[] = [];

    const boundaries = markers.filter(m => m.isLine && m.lineType === 'boundary' && m.path && m.path.length > 2);
    const landings = markers.filter(m => m.isMarker && m.type === 'landing');
    const mainRoads = markers.filter(m => m.isLine && m.lineType === 'mainRoad' && m.path && m.path.length > 1);
    const symbolMarkers = markers.filter(m => (m.isMarker && m.type !== 'landing') || m.isZone);

    // STEG 6e-1 (kamera-fix v2): trakten = GRÄNSEN (alla gränspolygoner). Basvägar/avlägg/
    // symboler tas med BARA om de ligger NÄRA gränsen (inom ±50% av gränsens storlek) —
    // fjärran vägsvansar som leder in från långt håll ska inte blåsa upp överblicken.
    const boundaryPts: { lat: number; lon: number }[] = [];
    for (const b of boundaries) { if (b.path) for (const p of b.path) boundaryPts.push(svgToLatLon(p.x, p.y)); }
    const allPoints: { lat: number; lon: number }[] = [...boundaryPts];
    if (boundaryPts.length > 0) {
      let bMinLat = Infinity, bMaxLat = -Infinity, bMinLon = Infinity, bMaxLon = -Infinity;
      for (const p of boundaryPts) { if (p.lat < bMinLat) bMinLat = p.lat; if (p.lat > bMaxLat) bMaxLat = p.lat; if (p.lon < bMinLon) bMinLon = p.lon; if (p.lon > bMaxLon) bMaxLon = p.lon; }
      const rLat = Math.max((bMaxLat - bMinLat) * 0.5, 0.0015);
      const rLon = Math.max((bMaxLon - bMinLon) * 0.5, 0.0025);
      const near = (p: { lat: number; lon: number }) => p.lat >= bMinLat - rLat && p.lat <= bMaxLat + rLat && p.lon >= bMinLon - rLon && p.lon <= bMaxLon + rLon;
      for (const m of [...mainRoads, ...landings, ...symbolMarkers]) {
        const pts = (m.path && m.path.length > 0) ? m.path.map(p => svgToLatLon(p.x, p.y)) : (m.x !== undefined && m.y !== undefined ? [svgToLatLon(m.x, m.y)] : []);
        for (const p of pts) if (near(p)) allPoints.push(p);
      }
    } else {
      // Ingen gräns → fall tillbaka på alla markörer (kan inte definiera "trakten" annars).
      for (const m of markers) if (m.x !== undefined && m.y !== undefined) allPoints.push(svgToLatLon(m.x, m.y));
    }

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

    // 1. OVERVIEW — stilla helbild av trakten (fitBounds, ingen rörelse). STEG 6d-1.
    const ovPadLat = Math.max((maxLat - minLat) * 0.12, 0.0008);
    const ovPadLon = Math.max((maxLon - minLon) * 0.12, 0.0012);
    built.push({
      id: 'overview', type: 'overview', title: 'Hela trakten', icon: 'map',
      center: { lat: centerLat, lon: centerLon }, zoom: overviewZoom, pitch: 0,
      bbox: [minLon - ovPadLon, minLat - ovPadLat, maxLon + ovPadLon, maxLat + ovPadLat],
    });

    // 2. OM TRAKTEN — data hämtas direkt från boundary markers i checklistorna,
    //    ingår INTE som briefing-steg

    // 3. LANDINGS
    for (const m of landings) {
      const ll = svgToLatLon(m.x, m.y);
      built.push({
        id: `landing-${m.id}`, type: 'landing', title: 'Avlägg', icon: 'inventory_2',
        comment: m.comment || undefined,
        center: ll, zoom: 18, pitch: 62, marker: m,
        tag: 'info', tagText: 'AVLÄGG', categoryColor: A, photoData: m.photoData || undefined, audioData: m.audioData || undefined,
      });
    }

    // 4. MAIN ROADS
    for (const m of mainRoads) {
      const pathLL = m.path!.map(p => svgToLatLon(p.x, p.y));
      const mid = pathLL[Math.floor(pathLL.length / 2)];
      built.push({
        id: `mainroad-${m.id}`, type: 'mainroad', title: 'Basväg', icon: 'route',
        comment: m.comment || undefined,
        center: mid, zoom: 17, pitch: 60, path: pathLL, marker: m,
        tag: 'info', tagText: 'BASVÄG', categoryColor: A,
      });
    }

    // 5. PROPERTY BOUNDARY — always include if we have a boundary
    if (boundaries.length > 0) {
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
      // Bounding box with ~100m margin for pulse overlay
      const marginLat = 100 / 111320;
      const marginLon = 100 / (111320 * Math.cos(centerLat * Math.PI / 180));
      const propBbox: [number, number, number, number] = [
        minLon - marginLon, minLat - marginLat,
        maxLon + marginLon, maxLat + marginLat,
      ];
      built.push({
        id: 'property', type: 'property', title: 'Fastighetsgräns', icon: '📐',
        center: { lat: centerLat, lon: centerLon }, zoom: 16.5, pitch: 63,
        bearing: getBearing(propStart, propEnd), path: propPath,
        bbox: propBbox,
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
        photoData: m.photoData || undefined, audioData: m.audioData || undefined,
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

  // STEG 6e-1: rama in trakten STILLA på start-panelen (briefing) — kartan bakom kortet.
  useEffect(() => {
    if (mode === 'checklist' || walkStarted || steps.length === 0) return;
    const map = mapInstanceRef.current;
    const ov = steps.find(s => s.type === 'overview');
    if (!map || !ov?.bbox) return;
    // bottom = start-panelens faktiska höjd (~210 px) + luft → trakten centreras i den
    // SYNLIGA ytan OVANFÖR panelen (inte i hela viewporten → toppen klipps inte).
    map.fitBounds(ov.bbox, { padding: { top: 90, left: 70, right: 70, bottom: 250 }, pitch: 0, bearing: 0, maxZoom: 15.5, duration: 1200, essential: true });
  }, [steps.length, walkStarted, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rotationRef.current) { clearInterval(rotationRef.current); cancelAnimationFrame(rotationRef.current as any); }
      if (wmsPulseRef.current) { clearInterval(wmsPulseRef.current); wmsPulseRef.current = null; }
      const map = mapInstanceRef.current;
      if (map) {
        try { if (map.getLayer('briefing-fastighet-pulse-layer')) map.removeLayer('briefing-fastighet-pulse-layer'); } catch {}
        try { if (map.getSource('briefing-fastighet-pulse')) map.removeSource('briefing-fastighet-pulse'); } catch {}
        if (map.getLayer('wms-layer-fastighetsgranser')) {
          try { map.setPaintProperty('wms-layer-fastighetsgranser', 'raster-opacity', 0.7); } catch {}
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

    // Property step: show fastighetsgränser + pulsing overlay near tract
    const pulseSrc = 'briefing-fastighet-pulse';
    const pulseLayer = 'briefing-fastighet-pulse-layer';
    // Clean up previous pulse overlay
    try { if (map.getLayer(pulseLayer)) map.removeLayer(pulseLayer); } catch {}
    try { if (map.getSource(pulseSrc)) map.removeSource(pulseSrc); } catch {}

    if (step.type === 'property') {
      prevOverlaysRef.current = { ...overlays };
      // Show existing fastighetsgränser layer
      if (map.getLayer('wms-layer-fastighetsgranser')) {
        map.setLayoutProperty('wms-layer-fastighetsgranser', 'visibility', 'visible');
        map.setPaintProperty('wms-layer-fastighetsgranser', 'raster-opacity', 1.0);
      }
      setOverlays((prev: any) => ({ ...prev, fastighetsgranser: true }));

      // Create pulsing overlay — same WMS source bounded to tract area
      if (step.bbox) {
        const wmsUrl = 'https://minkarta.lantmateriet.se/map/fastighetsindelning/wms/v1.3'
          + '?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=granser&STYLES=morkbakgrund'
          + '&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256';
        map.addSource(pulseSrc, {
          type: 'raster',
          tiles: [wmsUrl],
          tileSize: 256,
          bounds: step.bbox,
        });
        map.addLayer({
          id: pulseLayer,
          type: 'raster',
          source: pulseSrc,
          paint: { 'raster-opacity': 1.0, 'raster-saturation': 1, 'raster-contrast': 0.8 },
        });
      }

      // Pulse overlay opacity between 1.0 and 0.0
      let pulseOn = true;
      wmsPulseRef.current = setInterval(() => {
        if (!mapInstanceRef.current) return;
        pulseOn = !pulseOn;
        try {
          if (mapInstanceRef.current.getLayer(pulseLayer)) {
            mapInstanceRef.current.setPaintProperty(pulseLayer, 'raster-opacity', pulseOn ? 1.0 : 0.0);
          }
        } catch {}
      }, 1000);
    } else if (prevOverlaysRef.current) {
      // Restore fastighetsgränser to previous state
      if (map.getLayer('wms-layer-fastighetsgranser')) {
        const wasOn = prevOverlaysRef.current.fastighetsgranser;
        map.setLayoutProperty('wms-layer-fastighetsgranser', 'visibility', wasOn ? 'visible' : 'none');
        map.setPaintProperty('wms-layer-fastighetsgranser', 'raster-opacity', 0.7);
      }
      setOverlays((prev: any) => ({ ...prev, fastighetsgranser: prevOverlaysRef.current?.fastighetsgranser ?? false }));
      prevOverlaysRef.current = null;
    }

    // STEG 6d-1: lugn kamera — stilla helbild (fitBounds, ingen orbit/vobbel) för
    // overview; enkel mjuk flyTo till feature för allt annat (ingen "res längs"-resa).
    if (step.type === 'overview' && step.bbox) {
      map.fitBounds(step.bbox, { padding: 50, pitch: 0, bearing: 0, duration: 1500, essential: true });
    } else if (step.center) {
      map.flyTo({ center: [step.center.lon, step.center.lat], zoom: step.zoom || 15, pitch: step.pitch || 60, bearing: step.bearing ?? 0, duration: 1500, essential: true });
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
      try { if (map.getLayer('briefing-fastighet-pulse-layer')) map.removeLayer('briefing-fastighet-pulse-layer'); } catch {}
      try { if (map.getSource('briefing-fastighet-pulse')) map.removeSource('briefing-fastighet-pulse'); } catch {}
      if (map.getLayer('wms-layer-fastighetsgranser')) {
        try { map.setPaintProperty('wms-layer-fastighetsgranser', 'raster-opacity', 0.7); } catch {}
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
    return () => { map.off('click', handleMapClick); };
  }, [checklistOpen, steps, mapInstanceRef, onActiveMarkerChange]);

  const tagBg: Record<string, string> = { danger: 'rgba(239,68,68,0.25)', caution: 'rgba(245,158,11,0.25)', info: 'rgba(138,180,96,0.2)' };
  const tagColor: Record<string, string> = { danger: '#ff453a', caution: '#f59e0b', info: '#8ab460' };

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
  };

  // ============================================================
  // === KVITTERING — EN lista, tre tillstånd (STEG 6a-3) ===
  // att göra → kvitterat → referens (låst). Två oberoende roller.
  // ============================================================
  if (checklistOpen) {
    const boundary = markers.find(m => m.isLine && m.lineType === 'boundary');
    const notes = boundary?.notes || [];
    const legacyComment = boundary?.comment;
    const legacyAudio = boundary?.audioData;
    const hasLegacy = !!(legacyComment || legacyAudio) && notes.length === 0;
    const listSteps = steps.filter(s => s.type !== 'overview' && s.type !== 'done' && s.type !== 'about');

    type Entry =
      | { kind: 'note'; id: string; note: { id: string; date: string; text?: string; audioData?: string } }
      | { kind: 'legacy'; id: string }
      | { kind: 'step'; id: string; step: BriefingStep };
    const entries: Entry[] = [
      ...notes.map((n): Entry => ({ kind: 'note', id: `about-note-${n.id}`, note: n })),
      ...(hasLegacy ? [{ kind: 'legacy', id: 'about' } as Entry] : []),
      ...listSteps.map((s): Entry => ({ kind: 'step', id: s.id, step: s })),
    ];

    const totalItems = entries.length;
    const checkedCount = entries.filter(e => checkedSet.has(e.id)).length;
    const allChecked = checkedCount === totalItems;            // 0===0 → tom lista tillåts (matchar gammalt)
    const lasläge = kvitterat || currentRole === null;          // referens / read-only
    const kanKora = allChecked && !kvitterat && currentRole !== null;  // G1: trippellåsets villkor
    const progressPct = totalItems > 0 ? Math.round((checkedCount / totalItems) * 100) : 100;

    const MÅN = ['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'];
    const fmtDate = (iso: string) => { const d = new Date(iso); return `${d.getDate()} ${MÅN[d.getMonth()]}`; };
    const fmtDateTime = (iso: string) => { const d = new Date(iso); return `${d.getDate()} ${MÅN[d.getMonth()]} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
    const toggleAudio = (id: string) => setExpandedItem(prev => prev === id ? null : id);

    // EN checkbox-form: rundad fyrkant, grön A. Låst i referens.
    const cbx = (isChecked: boolean): React.CSSProperties => ({
      width: '22px', height: '22px', borderRadius: '6px',
      border: isChecked ? 'none' : '2px solid rgba(255,255,255,0.12)',
      background: isChecked ? A : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, cursor: lasläge ? 'default' : 'pointer', transition: 'all 0.2s',
      opacity: lasläge && !isChecked ? 0.4 : 1,
    });
    // Radfärgstrimma från kartans färger (lib/zone-colors.ts + ICON_BG)
    const stripColor = (m?: Marker): string => {
      if (m?.isZone && m.zoneType) return ZONE_COLORS[m.zoneType] || A;
      if (m?.type && ICON_BG[m.type]) return ICON_BG[m.type].bg;
      return A;
    };

    const renderRow = (e: Entry, asNew: boolean) => {
      const isChecked = checkedSet.has(e.id);
      const audioId = `audio-${e.id}`;
      const audioOpen = expandedItem === audioId;
      const stepEntry = e.kind === 'step' ? e.step : null;
      const strip = stepEntry ? stripColor(stepEntry.marker) : A;
      const audioData = e.kind === 'note' ? e.note.audioData : e.kind === 'legacy' ? (legacyAudio || undefined) : stepEntry?.audioData;
      const photoData = stepEntry?.photoData;
      return (
        <div key={e.id} style={{ display: 'flex', marginBottom: '8px', borderRadius: '14px', overflow: 'hidden', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', opacity: isChecked && !asNew ? 0.5 : 1, transition: 'opacity 0.3s' }}>
          <div style={{ width: '3px', background: strip, flexShrink: 0 }} />
          <div style={{ flex: 1, padding: '14px 16px', minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              {asNew
                ? <div style={{ fontSize: '10px', fontWeight: '800', color: A, background: 'rgba(138,180,96,0.2)', padding: '3px 7px', borderRadius: '6px', flexShrink: 0, marginTop: '1px' }}>NY</div>
                : <div onClick={lasläge ? undefined : () => toggleItem(e.id)} style={{ ...cbx(isChecked), marginTop: '1px' }}>{isChecked && <span style={{ color: '#0a0f08', fontSize: '13px', fontWeight: '800' }}>&#10003;</span>}</div>}
              {stepEntry && <MarkerIconSvg marker={stepEntry.marker} fallbackEmoji={stepEntry.icon} size={32} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                {e.kind === 'note' && (
                  <>
                    <div style={{ fontSize: '12px', color: 'rgba(138,180,96,0.5)', fontWeight: '500', marginBottom: '4px' }}>{fmtDate(e.note.date)}</div>
                    {e.note.text
                      ? <div style={{ fontSize: '15px', fontWeight: '500', color: isChecked ? 'rgba(255,255,255,0.3)' : '#f0f4ec', textDecoration: isChecked && !asNew ? 'line-through' : 'none', lineHeight: '1.45', wordBreak: 'break-word' }}>{e.note.text}</div>
                      : <div style={{ fontSize: '15px', color: 'rgba(240,244,236,0.5)', fontStyle: 'italic' }}>Röstmeddelande</div>}
                  </>
                )}
                {e.kind === 'legacy' && (
                  legacyComment
                    ? <div style={{ fontSize: '15px', fontWeight: '500', color: isChecked ? 'rgba(255,255,255,0.3)' : '#f0f4ec', textDecoration: isChecked && !asNew ? 'line-through' : 'none', lineHeight: '1.45', wordBreak: 'break-word' }}>{legacyComment}</div>
                    : <div style={{ fontSize: '15px', color: 'rgba(240,244,236,0.5)' }}>Om trakten</div>
                )}
                {stepEntry && (
                  <>
                    <div style={{ fontSize: '15px', fontWeight: '600', color: isChecked ? 'rgba(255,255,255,0.3)' : '#f0f4ec', textDecoration: isChecked && !asNew ? 'line-through' : 'none' }}>{stepEntry.title}</div>
                    {stepEntry.comment && <div style={{ fontSize: '13px', color: 'rgba(240,244,236,0.4)', marginTop: '3px', lineHeight: '1.4', wordBreak: 'break-word' }}>{stepEntry.comment}</div>}
                  </>
                )}
                {audioData && (
                  <div style={{ marginTop: '8px' }}>
                    <button onClick={(ev) => { ev.stopPropagation(); toggleAudio(audioId); }} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '10px', background: audioOpen ? 'rgba(138,180,96,0.15)' : 'rgba(138,180,96,0.06)', border: `1px solid ${audioOpen ? 'rgba(138,180,96,0.25)' : 'rgba(138,180,96,0.1)'}`, color: A, fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                      <span style={{ fontSize: '13px' }}>{audioOpen ? '⏹' : '🎤'}</span>{audioOpen ? 'Stoppa' : 'Lyssna'}
                    </button>
                    {audioOpen && <div style={{ marginTop: '8px' }}><audio controls autoPlay src={audioData} style={{ width: '100%', height: '32px', borderRadius: '8px' }} /></div>}
                  </div>
                )}
                {photoData && <div style={{ marginTop: '8px' }}><img src={photoData} alt="" style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }} /></div>}
              </div>
              {stepEntry && stepEntry.center && (
                <button onClick={(ev) => { ev.stopPropagation(); if (onShowOnMap && stepEntry.center) onShowOnMap(stepEntry.id, stepEntry.center, stepEntry.marker?.id, 'checklist', { bbox: stepEntry.bbox, zoom: stepEntry.zoom, type: stepEntry.type, comment: stepEntry.comment, audioData: stepEntry.audioData, photoData: stepEntry.photoData, title: stepEntry.title, icon: stepEntry.icon }); }} style={{ width: '32px', height: '32px', borderRadius: '16px', background: 'rgba(138,180,96,0.06)', border: '1px solid rgba(138,180,96,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                  <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 16 }}>pin_drop</span>
                </button>
              )}
            </div>
          </div>
        </div>
      );
    };

    const roleRows: { roll: 'skordare' | 'skotare'; label: string; rad: KvittRad | null }[] = [
      { roll: 'skordare', label: 'Skördare', rad: kvittSkordare },
      { roll: 'skotare', label: 'Skotare', rad: kvittSkotare },
    ];
    const checkedEntries = entries.filter(e => checkedSet.has(e.id));
    const nyaEntries = entries.filter(e => !checkedSet.has(e.id));
    const noteEntries = entries.filter(e => e.kind === 'note' || e.kind === 'legacy');
    const stepEntries = entries.filter(e => e.kind === 'step');

    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 700, background: '#0c0f0a', display: 'flex', flexDirection: 'column' }}>
        {/* HEADER */}
        <div style={{ position: 'sticky', top: 0, zIndex: 10, flexShrink: 0, background: 'rgba(12,15,10,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', padding: '0 20px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ paddingTop: 'env(safe-area-inset-top)' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0 12px' }}>
            <div style={{ fontSize: '17px', fontWeight: '700', color: '#f0f4ec', letterSpacing: '-0.3px' }}>{lasläge ? 'Kvittering' : 'Gå igenom innan du kör'}</div>
            <div onClick={handleClose} style={{ width: '32px', height: '32px', borderRadius: '16px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round"><path d="M1 1L11 11"/><path d="M11 1L1 11"/></svg>
            </div>
          </div>
          {/* STATUS-STRIP: båda roller */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingBottom: '12px' }}>
            {roleRows.map(({ roll, label, rad }) => {
              const done = !!rad?.kvitterat_at;
              const isMe = currentRole === roll;
              return (
                <div key={roll} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', padding: '6px 10px', borderRadius: '8px', background: isMe ? 'rgba(138,180,96,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${isMe ? 'rgba(138,180,96,0.18)' : 'rgba(255,255,255,0.05)'}` }}>
                  <span style={{ fontWeight: '700', color: isMe ? A : 'rgba(240,244,236,0.6)', minWidth: '60px' }}>{label}</span>
                  {done
                    ? <span style={{ color: A, fontWeight: '600' }}>&#10003; Kvitterat · {rad?.kvitterat_av_namn || '—'}{rad?.kvitterat_at ? ` ${fmtDateTime(rad.kvitterat_at)}` : ''}</span>
                    : <span style={{ color: 'rgba(255,255,255,0.35)' }}>&#9675; Ej kvitterat</span>}
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    {isMe && <span style={{ fontSize: '11px', fontWeight: '700', color: A, background: 'rgba(138,180,96,0.15)', padding: '2px 7px', borderRadius: '8px' }}>du</span>}
                    {/* G3: admin-nollställning — syns ENBART för admin/chef när rollen är kvitterad */}
                    {isAdmin && done && (
                      resetConfirm === roll
                        ? <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button onClick={() => { onNollstall?.(roll); setResetConfirm(null); }} style={{ fontSize: '11px', fontWeight: '700', color: '#ff453a', background: 'rgba(255,69,58,0.15)', border: '1px solid rgba(255,69,58,0.3)', padding: '3px 8px', borderRadius: '8px', cursor: 'pointer' }}>Bekräfta</button>
                            <button onClick={() => setResetConfirm(null)} style={{ fontSize: '11px', fontWeight: '600', color: 'rgba(255,255,255,0.5)', background: 'transparent', border: 'none', padding: '3px 4px', cursor: 'pointer' }}>Avbryt</button>
                          </span>
                        : <button onClick={() => setResetConfirm(roll)} style={{ fontSize: '11px', fontWeight: '600', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '3px 8px', borderRadius: '8px', cursor: 'pointer' }}>Nollställ</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {/* PROGRESS — bara i att-göra */}
          {!lasläge && (
            <div style={{ paddingBottom: '12px' }}>
              <div style={{ fontSize: '13px', color: 'rgba(240,244,236,0.4)', marginBottom: '8px' }}>{checkedCount} av {totalItems} avklarade</div>
              <div style={{ height: '3px', borderRadius: '2px', background: 'rgba(255,255,255,0.06)' }}>
                <div style={{ height: '100%', borderRadius: '2px', background: A, width: `${progressPct}%`, transition: 'width 0.3s ease' }} />
              </div>
            </div>
          )}
        </div>

        {/* CONTENT — partition (kvitterat/tillkommet) BARA vid faktiskt kvitto; admin/ej-tilldelad
            (lasläge utan kvitto) får vanlig läslägeslista, inte allt under "Tillkommet" */}
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '16px 16px 20px' }}>
          {kvitterat ? (
            <>
              {checkedEntries.length > 0 && (
                <div style={{ marginBottom: nyaEntries.length > 0 ? '20px' : '0' }}>
                  {checkedEntries.map(e => renderRow(e, false))}
                </div>
              )}
              {nyaEntries.length > 0 && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: 'rgba(138,180,96,0.5)', padding: '0 4px 10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tillkommet efter kvittering</div>
                  {nyaEntries.map(e => renderRow(e, true))}
                </div>
              )}
              {totalItems === 0 && (
                <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '13px', padding: '40px 0' }}>Inga markeringar på trakten</div>
              )}
            </>
          ) : (
            <>
              {noteEntries.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 4px 10px' }}>
                    <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 15, color: 'rgba(138,180,96,0.7)' }}>edit_note</span>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: 'rgba(138,180,96,0.7)' }}>Från planeraren</span>
                  </div>
                  {noteEntries.map(e => renderRow(e, false))}
                </div>
              )}
              {stepEntries.length > 0 && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: 'rgba(255,255,255,0.3)', padding: '0 4px 10px' }}>Markeringar</div>
                  {stepEntries.map(e => renderRow(e, false))}
                </div>
              )}
              {totalItems === 0 && (
                <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '13px', padding: '40px 0' }}>Inga markeringar på trakten</div>
              )}
            </>
          )}
        </div>

        {/* FOOTER */}
        <div style={{ flexShrink: 0, padding: '16px 20px', paddingBottom: 'max(16px, env(safe-area-inset-bottom))', borderTop: '1px solid rgba(255,255,255,0.04)', background: '#0c0f0a' }}>
          {lasläge ? (
            <button onClick={handleClose} style={{ width: '100%', padding: '16px', borderRadius: '16px', border: 'none', background: 'rgba(255,255,255,0.06)', color: 'rgba(240,244,236,0.7)', fontSize: '15px', fontWeight: '700', cursor: 'pointer' }}>
              {currentRole === null ? 'Stäng' : 'Stäng – kvitterat'}
            </button>
          ) : (
            <>
              <button
                disabled={!kanKora}
                onClick={() => { if (!kanKora) return; onKvittera?.(Array.from(checkedSet)); handleClose(); }}
                style={{ width: '100%', padding: '16px', borderRadius: '16px', border: 'none', background: kanKora ? A : 'rgba(138,180,96,0.12)', color: kanKora ? '#0a0f08' : 'rgba(138,180,96,0.35)', fontSize: '16px', fontWeight: '700', cursor: kanKora ? 'pointer' : 'default', transition: 'all 0.3s ease' }}
              >
                Jag har tagit del av allt – börja köra
              </button>
              {currentRole === null && (
                <div style={{ textAlign: 'center', fontSize: '12px', color: 'rgba(255,255,255,0.25)', marginTop: '8px' }}>Du är inte tilldelad den här trakten</div>
              )}
              {currentRole !== null && !allChecked && (
                <div style={{ textAlign: 'center', fontSize: '12px', color: 'rgba(255,255,255,0.25)', marginTop: '8px' }}>Bocka av alla punkter ovan för att fortsätta</div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ============================================================
  // === KORTVANDRING (briefing) — en sak i taget, STEG 6e-1 ===
  // Bottenkort över stilla karta. "Sett – nästa" lägger id i checked_ids
  // (BARA checked_ids — kvitto + grind är 6e-2). Bakåt rör BARA vyn (cardIndex),
  // av-bockar aldrig (forward lägger till i ett Set → idempotent).
  // ============================================================
  {
    const cwBoundary = markers.find(m => m.isLine && m.lineType === 'boundary');
    const cwNotes = cwBoundary?.notes || [];
    const cwLegacyComment = cwBoundary?.comment;
    const cwLegacyAudio = cwBoundary?.audioData;
    const cwHasLegacy = !!(cwLegacyComment || cwLegacyAudio) && cwNotes.length === 0;
    const cwListSteps = steps.filter(s => s.type !== 'overview' && s.type !== 'done' && s.type !== 'about');
    type CardEntry =
      | { kind: 'note'; id: string; note: { id: string; date: string; text?: string; audioData?: string } }
      | { kind: 'legacy'; id: string }
      | { kind: 'step'; id: string; step: BriefingStep };
    const cwEntries: CardEntry[] = [
      ...cwNotes.map((n): CardEntry => ({ kind: 'note', id: `about-note-${n.id}`, note: n })),
      ...(cwHasLegacy ? [{ kind: 'legacy', id: 'about' } as CardEntry] : []),
      ...cwListSteps.map((s): CardEntry => ({ kind: 'step', id: s.id, step: s })),
    ];
    const cwTotal = cwEntries.length;
    const cwStripColor = (m?: Marker): string => {
      if (m?.isZone && m.zoneType) return ZONE_COLORS[m.zoneType] || A;
      if (m?.type && ICON_BG[m.type]) return ICON_BG[m.type].bg;
      return A;
    };
    const cwToggleAudio = (id: string) => setExpandedItem(prev => prev === id ? null : id);
    // Lugn glid till markeringen (not utan kartpunkt → ingen glid, kartan ligger kvar)
    const glideToEntry = (e?: CardEntry) => {
      const map = mapInstanceRef.current;
      if (e && e.kind === 'step' && e.step.center) {
        onActiveMarkerChange?.(e.step.marker?.id || null);
        if (map) {
          const c = e.step.center;
          // Rama markeringen med LUFT: zon/fastighet har egen bbox; punkt → liten bbox (~180 m).
          const r = 180;
          const dLat = r / 111320;
          const dLon = r / (111320 * Math.cos(c.lat * Math.PI / 180));
          const bbox = e.step.bbox || [c.lon - dLon, c.lat - dLat, c.lon + dLon, c.lat + dLat] as [number, number, number, number];
          // bottom-padding = bottenkortets yta → markeringen hamnar i SYNLIGA ytan OVANFÖR kortet.
          const cardPx = Math.round(window.innerHeight * 0.46);
          map.fitBounds(bbox, { padding: { top: 80, left: 50, right: 50, bottom: cardPx }, pitch: 0, maxZoom: 17, duration: 1200, essential: true });
        }
      } else {
        onActiveMarkerChange?.(null);
      }
    };

    // ── START-PANEL ──
    if (!walkStarted) {
      return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 700, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', pointerEvents: 'none' }}>
          <div style={{ pointerEvents: 'auto', background: 'rgba(10,15,8,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', padding: '28px 24px', paddingBottom: 'max(28px, env(safe-area-inset-bottom))', borderRadius: '24px 24px 0 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ maxWidth: '440px', margin: '0 auto' }}>
              <div style={{ fontSize: '22px', fontWeight: '700', color: '#f0f4ec', letterSpacing: '-0.4px', marginBottom: '4px' }}>{traktName || 'Trakt'}</div>
              <div style={{ fontSize: '15px', color: 'rgba(240,244,236,0.55)', marginBottom: '24px' }}>{cwTotal} {cwTotal === 1 ? 'sak' : 'saker'} att gå igenom</div>
              <button onClick={() => { setWalkStarted(true); setCardIndex(0); glideToEntry(cwEntries[0]); }} style={{ width: '100%', padding: '16px', borderRadius: '16px', border: 'none', background: A, color: '#0a0f08', fontSize: '16px', fontWeight: '700', cursor: 'pointer' }}>
                Börja genomgång
              </button>
            </div>
          </div>
        </div>
      );
    }

    // ── KORT (ett per entry) ──
    if (cardIndex < cwTotal) {
      const e = cwEntries[cardIndex];
      const stepEntry = e.kind === 'step' ? e.step : null;
      const strip = stepEntry ? cwStripColor(stepEntry.marker) : A;
      const cardTitle = e.kind === 'step' ? e.step.title : e.kind === 'note' ? 'Från planeraren' : 'Om trakten';
      const cardText = e.kind === 'step' ? e.step.comment : e.kind === 'note' ? e.note.text : cwLegacyComment;
      const audioData = e.kind === 'note' ? e.note.audioData : e.kind === 'legacy' ? (cwLegacyAudio || undefined) : stepEntry?.audioData;
      const photoData = stepEntry?.photoData;
      const audioId = `walk-audio-${e.id}`;
      const audioOpen = expandedItem === audioId;
      const hasBody = !!(cardText || photoData || audioData);
      return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 700, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', pointerEvents: 'none' }}>
          <div style={{ pointerEvents: 'auto', padding: '0 16px max(20px, env(safe-area-inset-bottom))' }}>
            <div style={{ maxWidth: '440px', margin: '0 auto' }}>
              {/* prick-progress */}
              <div style={{ display: 'flex', gap: '5px', justifyContent: 'center', marginBottom: '12px' }}>
                {cwEntries.map((_, i) => (
                  <div key={i} style={{ width: i === cardIndex ? '22px' : '6px', height: '6px', borderRadius: '3px', background: i === cardIndex ? A : i < cardIndex ? 'rgba(138,180,96,0.45)' : 'rgba(255,255,255,0.18)', transition: 'all 0.3s ease' }} />
                ))}
              </div>
              {/* kort */}
              <div style={{ display: 'flex', borderRadius: '20px', overflow: 'hidden', background: 'rgba(10,15,8,0.94)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ width: '4px', background: strip, flexShrink: 0 }} />
                <div style={{ flex: 1, padding: '18px 18px 16px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: hasBody ? '12px' : '0' }}>
                    {cardIndex > 0 && (
                      <button onClick={() => { const prev = cardIndex - 1; setCardIndex(prev); glideToEntry(cwEntries[prev]); }} aria-label="Förra kortet" style={{ width: '30px', height: '30px', borderRadius: '15px', flexShrink: 0, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(240,244,236,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '17px', lineHeight: 1 }}>‹</button>
                    )}
                    {stepEntry ? <MarkerIconSvg marker={stepEntry.marker} fallbackEmoji={stepEntry.icon} size={36} /> : <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 30, color: A }}>edit_note</span>}
                    <div style={{ flex: 1, minWidth: 0, fontSize: '18px', fontWeight: '700', color: '#f0f4ec', letterSpacing: '-0.3px' }}>{cardTitle}</div>
                  </div>
                  {cardText && <div style={{ fontSize: '15px', color: 'rgba(240,244,236,0.72)', lineHeight: '1.5', wordBreak: 'break-word', marginBottom: (photoData || audioData) ? '12px' : '0' }}>{cardText}</div>}
                  {photoData && <div style={{ marginBottom: audioData ? '12px' : '0' }}><img src={photoData} alt="" style={{ width: '100%', maxHeight: '220px', objectFit: 'cover', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }} /></div>}
                  {audioData && (
                    <div>
                      <button onClick={(ev) => { ev.stopPropagation(); cwToggleAudio(audioId); }} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '12px', background: audioOpen ? 'rgba(138,180,96,0.15)' : 'rgba(138,180,96,0.06)', border: `1px solid ${audioOpen ? 'rgba(138,180,96,0.25)' : 'rgba(138,180,96,0.1)'}`, color: A, fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                        <span style={{ fontSize: '14px' }}>{audioOpen ? '⏹' : '🎤'}</span>{audioOpen ? 'Stoppa' : 'Lyssna'}
                      </button>
                      {audioOpen && <div style={{ marginTop: '10px' }}><audio controls autoPlay src={audioData} style={{ width: '100%', height: '34px', borderRadius: '8px' }} /></div>}
                    </div>
                  )}
                </div>
              </div>
              {/* Sett – nästa: BARA checked_ids (Set → idempotent), rör ej kvitto/körläge */}
              <button
                onClick={() => {
                  onChecklistChange?.(checkedSet.has(e.id) ? Array.from(checkedSet) : [...Array.from(checkedSet), e.id]);
                  const next = cardIndex + 1;
                  setCardIndex(next);
                  if (next < cwTotal) glideToEntry(cwEntries[next]);
                }}
                style={{ width: '100%', marginTop: '12px', padding: '16px', borderRadius: '16px', border: 'none', background: A, color: '#0a0f08', fontSize: '16px', fontWeight: '700', cursor: 'pointer' }}
              >
                {cardIndex + 1 < cwTotal ? 'Sett – nästa' : 'Sett – klar'}
              </button>
            </div>
          </div>
        </div>
      );
    }

    // ── GENOMGÅNG KLAR — platshållare (underskrift + grind = 6e-2) ──
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 700, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: 'rgba(10,15,8,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', padding: '28px 24px', paddingBottom: 'max(28px, env(safe-area-inset-bottom))', borderRadius: '24px 24px 0 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ maxWidth: '440px', margin: '0 auto', textAlign: 'center' }}>
            <div style={{ fontSize: '22px', fontWeight: '700', color: '#f0f4ec', marginBottom: '6px' }}>&#10003; Genomgång klar</div>
            <div style={{ fontSize: '14px', color: 'rgba(240,244,236,0.5)', marginBottom: '20px' }}>Du har gått igenom alla {cwTotal} {cwTotal === 1 ? 'sak' : 'saker'}.</div>
            <div style={{ fontSize: '13px', color: 'rgba(138,180,96,0.7)', padding: '12px 14px', borderRadius: '12px', background: 'rgba(138,180,96,0.06)', border: '1px dashed rgba(138,180,96,0.25)' }}>
              "Börja köra" (underskrift + grind) byggs i nästa steg (6e-2).
            </div>
          </div>
        </div>
      </div>
    );
  }
}
