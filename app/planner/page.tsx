'use client'
import { useState, useRef, useEffect } from 'react'

// === TYPES ===
interface Point {
  x: number;
  y: number;
}

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

interface Warning {
  id: string;
  type: string;
  icon: string;
  name: string;
  distance: number;
  comment?: string;
  photoData?: string;
  marker: Marker;
}

interface ChecklistItem {
  id: string;
  text: string;
  answer: boolean | null;
  fixed: boolean;
}

interface TraktData {
  volym: number;
  areal: number;
}

interface PrognosSettings {
  terpipirangSvar: number;
  barighetDalig: number;
}

interface ManuellPrognos {
  skordare: string;
  skotare: string;
}

export default function PlannerPage() {
  // === STATE ===
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [markerMenuOpen, setMarkerMenuOpen] = useState<string | null>(null);
  
  // Körläge
  const [drivingMode, setDrivingMode] = useState(false);
  const [acknowledgedWarnings, setAcknowledgedWarnings] = useState<string[]>([]); // IDs av kvitterade
  const [activeWarning, setActiveWarning] = useState<Warning | null>(null); // Markör som visar varning
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null); // Foto i fullskärm
  const WARNING_DISTANCE = 40; // meter - varning triggas
  const FADE_START_DISTANCE = 100; // meter - börjar synas starkare
  
  // Stickvägsavstånd
  const [stickvagMode, setStickvagMode] = useState(false); // Aktiv stickvägsvy
  const [stickvagOversikt, setStickvagOversikt] = useState(false); // Översiktsvy
  const [stickvagSettings, setStickvagSettings] = useState({
    targetDistance: 25, // Målvärde kant-kant i meter
    tolerance: 3, // ±3 meter
    vagbredd: 4, // Vägbredd i meter
  });
  const [stickvagWarningShown, setStickvagWarningShown] = useState(false); // Har vi varnat för detta utanför-tillfälle
  const previousStickvagRef = useRef<any>(null); // Senaste stickvägen att mäta mot
  
  // Prognos
  const [prognosOpen, setPrognosOpen] = useState(false);
  const [traktData, setTraktData] = useState<TraktData>({
    volym: 649, // m³fub - från VIDA
    areal: 2.0, // ha - från VIDA
  });
  const [editingField, setEditingField] = useState<string | null>(null); // 'volym', 'areal', 'skordare', 'skotare'
  const [editValue, setEditValue] = useState('');
  const [draggingSlider, setDraggingSlider] = useState<string | null>(null); // 'terrang' eller 'barighet'
  const [prognosSettings, setPrognosSettings] = useState<PrognosSettings>({
    terpipirangSvar: 0, // % svår terräng (från branta zoner)
    barighetDalig: 0, // % dålig bärighet (från blöta zoner)
  });
  const [manuellPrognos, setManuellPrognos] = useState<ManuellPrognos>({
    skordare: '', // Planerarens uppskattning
    skotare: '',
  });
  
  // Beräkna terräng/bärighet från zoner automatiskt
  const beraknaForhallanden = () => {
    const zonerTotal = markers.filter(m => m.isZone);
    const blotaZoner = zonerTotal.filter(m => m.zoneType === 'wet');
    const brantaZoner = zonerTotal.filter(m => m.zoneType === 'steep');
    
    // Enkel beräkning - räkna antal zoner som proxy för areal
    // I framtiden kan vi räkna faktisk area från path-punkter
    const totalZoner = zonerTotal.length || 1;
    const blottProcent = Math.round((blotaZoner.length / Math.max(totalZoner, 1)) * 100);
    const brantProcent = Math.round((brantaZoner.length / Math.max(totalZoner, 1)) * 100);
    
    return {
      brantProcent: brantProcent,
      blottProcent: blottProcent,
    };
  };
  
  // Checklista
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([
    // Fasta frågor
    { id: 'avlagg_huggas', text: 'Behöver avlägget huggas?', answer: null, fixed: true },
    { id: 'band', text: 'Behövs band?', answer: null, fixed: true },
    { id: 'breddat', text: 'Kan skotaren köra breddat?', answer: null, fixed: true },
    { id: 'basväg_snislad', text: 'Basväg snislad?', answer: null, fixed: true },
    { id: 'gränser', text: 'Gränser markerade?', answer: null, fixed: true },
    { id: 'naturvärden', text: 'Naturvärden utmärkta?', answer: null, fixed: true },
    { id: 'kulturlämningar', text: 'Kulturlämningar kontrollerade?', answer: null, fixed: true },
    { id: 'elledningar', text: 'El-ledningar markerade?', answer: null, fixed: true },
  ]);
  const [newChecklistItem, setNewChecklistItem] = useState('');
  
  // Foto
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingPhotoMarkerId, setPendingPhotoMarkerId] = useState<string | null>(null);
  
  // Ångra
  const [history, setHistory] = useState<Marker[][]>([]);
  const [showUndo, setShowUndo] = useState(false);
  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Flytta symboler (drag & drop)
  const [draggingMarker, setDraggingMarker] = useState<string | null>(null);
  const [hasMoved, setHasMoved] = useState(false);
  const [dragStart, setDragStart] = useState<Point>({ x: 0, y: 0 });
  const justEndedDrag = useRef(false);
  
  // Rotera pilar
  const [rotatingArrow, setRotatingArrow] = useState<string | null>(null);
  const [rotationCenter, setRotationCenter] = useState<Point>({ x: 0, y: 0 });
  
  // Snabbval (senast använda)
  const [recentSymbols, setRecentSymbols] = useState<string[]>([]);
  
  // Redigera
  const [editingMarker, setEditingMarker] = useState<Marker | null>(null);
  
  // Header
  const [headerExpanded, setHeaderExpanded] = useState(false);
  
  // Meny
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuTab, setMenuTab] = useState('symbols'); // symbols, lines, zones, arrows, settings
  const [subMenu, setSubMenu] = useState<string | null>(null); // För meny-i-meny
  const [menuHeight, setMenuHeight] = useState(0); // 0 = stängd, 300 = öppen, 600 = full
  
  // Rita
  const [isDrawMode, setIsDrawMode] = useState(false);
  const [drawType, setDrawType] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<Point[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawPaused, setDrawPaused] = useState(false); // Pausad mellan drag
  
  // Zoner
  const [isZoneMode, setIsZoneMode] = useState(false);
  const [zoneType, setZoneType] = useState<string | null>(null);
  
  // Pilar
  const [isArrowMode, setIsArrowMode] = useState(false);
  const [arrowType, setArrowType] = useState<string | null>(null);
  
  // Skala och mätning
  const [scale, setScale] = useState(1); // meter per pixel
  const [showMeasurements, setShowMeasurements] = useState(true);
  const [measureMode, setMeasureMode] = useState(false);
  const [measureAreaMode, setMeasureAreaMode] = useState(false); // Ytmätning
  const [measurePath, setMeasurePath] = useState<Point[]>([]);
  const [isMeasuring, setIsMeasuring] = useState(false);
  
  // GPS
  const [isTracking, setIsTracking] = useState(false);
  const [gpsPaused, setGpsPaused] = useState(false); // Paus för linjespårning
  const gpsPausedRef = useRef(false); // Ref för closure
  const [currentPosition, setCurrentPosition] = useState<GeolocationPosition | null>(null);
  const [gpsMapPosition, setGpsMapPosition] = useState<Point>({ x: 200, y: 300 }); // Var på kartan GPS-punkten är
  const [trackingPath, setTrackingPath] = useState<Point[]>([]);
  const [gpsLineType, setGpsLineType] = useState<string | null>(null); // Vilken linjetyp som spåras
  const [gpsPath, setGpsPath] = useState<Point[]>([]); // Spårad linje i kartkoordinater
  const [gpsStartPos, setGpsStartPos] = useState<{lat: number, lon: number, x: number, y: number} | null>(null); // Startposition för konvertering
  const watchIdRef = useRef<number | null>(null);
  const gpsMapPositionRef = useRef<Point>({ x: 200, y: 300 });
  const gpsPathRef = useRef<Point[]>([]);
  const gpsHistoryRef = useRef<Point[]>([]); // Senaste 5 positioner för medelvärde
  const lastConfirmedPosRef = useRef<Point>({ x: 200, y: 300 }); // Sista bekräftade position (efter minDistance-filter)
  
  // Karta
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });
  
  // Pinch-to-zoom och rotation
  const pinchRef = useRef({ initialDistance: 0, initialZoom: 1, initialPan: { x: 0, y: 0 }, center: { x: 0, y: 0 }, initialAngle: 0, initialRotation: 0 });
  const [isPinching, setIsPinching] = useState(false);
  const [mapRotation, setMapRotation] = useState(0); // Kartans rotation i grader
  
  // Kompass-rotation
  const [compassMode, setCompassMode] = useState(false);
  const [deviceHeading, setDeviceHeading] = useState(0);
  const lastHeadingRef = useRef(0); // För smooth rotation
  
  // Zoom funktioner - samma logik som pinch-zoom
  const zoomIn = () => {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    
    const newZoom = Math.min(zoom * 1.3, 4);
    const zoomRatio = newZoom / zoom;
    
    const newPanX = centerX - (centerX - pan.x) * zoomRatio;
    const newPanY = centerY - (centerY - pan.y) * zoomRatio;
    
    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  };
  
  const zoomOut = () => {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    
    const newZoom = Math.max(zoom / 1.3, 0.5);
    const zoomRatio = newZoom / zoom;
    
    const newPanX = centerX - (centerX - pan.x) * zoomRatio;
    const newPanY = centerY - (centerY - pan.y) * zoomRatio;
    
    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  };
  
  // Centrera på GPS-position
  const centerOnMe = () => {
    // Sätt zoom till en bekväm nivå
    const targetZoom = 1.5;
    setZoom(targetZoom);
    
    // Beräkna pan så att gpsMapPosition hamnar i mitten av skärmen
    const screenCenterX = window.innerWidth / 2;
    const screenCenterY = window.innerHeight / 2;
    
    const newPanX = screenCenterX - gpsMapPosition.x * targetZoom;
    const newPanY = screenCenterY - gpsMapPosition.y * targetZoom;
    
    setPan({ x: newPanX, y: newPanY });
  };
  
  // Kompass - rotera kartan efter enhetens riktning
  const toggleCompass = () => {
    if (!compassMode) {
      // Aktivera kompass - nollställ manuell rotation
      setMapRotation(0);
      lastHeadingRef.current = 0;
      
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        // iOS 13+ kräver tillstånd
        DeviceOrientationEvent.requestPermission()
          .then(permission => {
            if (permission === 'granted') {
              setCompassMode(true);
              window.addEventListener('deviceorientation', handleOrientation);
            }
          })
          .catch(console.error);
      } else {
        // Android och äldre iOS
        setCompassMode(true);
        window.addEventListener('deviceorientation', handleOrientation);
      }
    } else {
      // Stäng av kompass
      setCompassMode(false);
      setDeviceHeading(0);
      lastHeadingRef.current = 0;
      window.removeEventListener('deviceorientation', handleOrientation);
    }
  };
  
  const handleOrientation = (event) => {
    // webkitCompassHeading för iOS, alpha för Android
    let heading = event.webkitCompassHeading || (360 - event.alpha);
    if (heading !== null && !isNaN(heading)) {
      // Normalisera till 0-360
      heading = ((heading % 360) + 360) % 360;
      
      // Smooth rotation - hitta kortaste vägen
      let lastHeading = lastHeadingRef.current;
      // Normalisera lastHeading också
      const normalizedLast = ((lastHeading % 360) + 360) % 360;
      
      let diff = heading - normalizedLast;
      
      // Om skillnaden är mer än 180°, ta kortare vägen
      if (diff > 180) {
        diff -= 360;
      } else if (diff < -180) {
        diff += 360;
      }
      
      // Beräkna ny smooth heading
      const smoothHeading = lastHeading + diff;
      lastHeadingRef.current = smoothHeading;
      setDeviceHeading(smoothHeading);
    }
  };
  
  // Cleanup kompass vid unmount
  useEffect(() => {
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, []);
  
  // Synlighet
  const [visibleLines, setVisibleLines] = useState({
    boundary: true, mainRoad: true, sideRoadRed: true, 
    sideRoadYellow: true, sideRoadBlue: true, nature: true, ditch: true,
  });
  const [visibleZones, setVisibleZones] = useState({
    wet: true, steep: true, protected: true, culture: true, noentry: true,
  });
  const [visibleLayers, setVisibleLayers] = useState({
    symbols: true,
    arrows: true,
    zones: true,
    lines: true,
  });
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);

  // Drag för meny
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  // === DATA ===
  const tractInfo = {
    name: 'Stenshult 1:4',
    id: '880178',
    area: '12.4 ha',
    volume: '2,840 m³fub',
  };

  // Symboler grupperade för skogsbruk
  const symbolCategories = [
    {
      name: 'Terräng',
      symbols: [
        { id: 'wet', name: 'Fuktig mark', icon: '💧' },
        { id: 'steep', name: 'Brant', icon: '⛰️' },
        { id: 'windfall', name: 'Vindfällen', icon: '🌪️' },
      ]
    },
    {
      name: 'Infrastruktur',
      symbols: [
        { id: 'powerline', name: 'El-ledning', icon: '⚡' },
        { id: 'ditch', name: 'Dike', icon: '〰️' },
        { id: 'corduroy', name: 'Kavling', icon: '🪵' },
        { id: 'bridge', name: 'Bro', icon: '🌉' },
      ]
    },
    {
      name: 'Avverkning',
      symbols: [
        { id: 'brash', name: 'Risa', icon: '🌿' },
        { id: 'felling', name: 'Fällning', icon: '🪓' },
        { id: 'highstump', name: 'Högstubbe', icon: '🪵' },
        { id: 'landing', name: 'Avlägg', icon: '📦' },
      ]
    },
    {
      name: 'Naturvård',
      symbols: [
        { id: 'eternitytree', name: 'Evighetsträd', icon: '🌲' },
        { id: 'culturestump', name: 'Kulturstubbe', icon: '🪨' },
        { id: 'deadwood', name: 'Död ved', icon: '🪵' },
      ]
    },
    {
      name: 'Kulturminnen',
      symbols: [
        { id: 'cairn', name: 'Odlingsröse', icon: '🪨' },
        { id: 'tarpot', name: 'Tjärdal', icon: '⚫' },
        { id: 'ruin', name: 'Ruin/Grund', icon: '🏚️' },
      ]
    },
    {
      name: 'Övrigt',
      symbols: [
        { id: 'general', name: 'Allmän', icon: '📍' },
        { id: 'warning', name: 'Varning', icon: '⚠️' },
        { id: 'start', name: 'Startpunkt', icon: '▶️' },
      ]
    },
  ];

  // Platt lista för bakåtkompatibilitet
  const markerTypes = symbolCategories.flatMap(cat => cat.symbols);

  const lineTypes = [
    { id: 'boundary', name: 'Traktgräns', color: '#ef4444', color2: '#fbbf24', striped: true },
    { id: 'mainRoad', name: 'Basväg', color: '#3b82f6', color2: '#fbbf24', striped: true },
    { id: 'backRoadRed', name: 'Backväg Röd', color: '#ef4444', striped: false, isBackRoad: true },
    { id: 'backRoadYellow', name: 'Backväg Gul', color: '#fbbf24', striped: false, isBackRoad: true },
    { id: 'backRoadBlue', name: 'Backväg Blå', color: '#3b82f6', striped: false, isBackRoad: true },
    { id: 'sideRoadRed', name: 'Stickväg Röd', color: '#ef4444', striped: false },
    { id: 'sideRoadYellow', name: 'Stickväg Gul', color: '#fbbf24', striped: false },
    { id: 'sideRoadBlue', name: 'Stickväg Blå', color: '#3b82f6', striped: false },
    { id: 'nature', name: 'Naturvård', color: '#22c55e', color2: '#ef4444', striped: true },
    { id: 'ditch', name: 'Dike', color: '#06b6d4', color2: '#0e7490', striped: true },
  ];

  const zoneTypes = [
    { id: 'wet', name: 'Blött', color: '#3b82f6', icon: '💧' },
    { id: 'steep', name: 'Brant', color: '#f59e0b', icon: '⛰️' },
    { id: 'protected', name: 'Naturvård', color: '#22c55e', icon: '🌳' },
    { id: 'culture', name: 'Kulturmiljö', color: '#a855f7', icon: '🏛️' },
    { id: 'noentry', name: 'Ej framkomlig', color: '#ef4444', icon: '🚫' },
  ];

  const arrowTypes = [
    { id: 'felling', name: 'Fällriktning', color: '#22c55e', icon: '🌲' },
    { id: 'drive', name: 'Körriktning', color: '#3b82f6', icon: '🚜' },
  ];

  // === GPS ===
  // Konvertera GPS till kartkoordinater (relativ till startpunkt)
  const gpsToMap = (lat, lon, startLat, startLon, startX, startY) => {
    // Meter per grad (approximation för Sverige ~59°N)
    const mPerDegLat = 111320;
    const mPerDegLon = 111320 * Math.cos(startLat * Math.PI / 180);
    
    // Skillnad i meter
    const dxMeters = (lon - startLon) * mPerDegLon;
    const dyMeters = (lat - startLat) * mPerDegLat;
    
    // Konvertera till pixlar (scale = meter per pixel)
    const dx = dxMeters / scale;
    const dy = -dyMeters / scale; // Negativ för att Y ökar nedåt på skärmen
    
    return { x: startX + dx, y: startY + dy };
  };
  
  // Beräkna avstånd från punkt till en linje (path)
  const getDistanceToPath = (point: Point, path: Point[]): { distance: number, closestPoint: Point } => {
    let minDist = Infinity;
    let closestPoint = path[0];
    
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      
      // Vektor från a till b
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const abLen = Math.sqrt(abx * abx + aby * aby);
      
      if (abLen === 0) continue;
      
      // Projicera punkt på linjen
      const t = Math.max(0, Math.min(1, 
        ((point.x - a.x) * abx + (point.y - a.y) * aby) / (abLen * abLen)
      ));
      
      // Närmaste punkt på linjesegmentet
      const closest = {
        x: a.x + t * abx,
        y: a.y + t * aby
      };
      
      const dist = Math.sqrt(
        Math.pow(point.x - closest.x, 2) + 
        Math.pow(point.y - closest.y, 2)
      );
      
      if (dist < minDist) {
        minDist = dist;
        closestPoint = closest;
      }
    }
    
    return { distance: minDist * scale, closestPoint }; // Konvertera pixlar till meter
  };
  
  // Hitta närmaste stickväg (ignorerar backvägar och traktgräns)
  const findNearestStickvag = () => {
    const stickvägar = markers.filter(m => 
      m.isLine && 
      ['sideRoadRed', 'sideRoadYellow', 'sideRoadBlue'].includes(m.lineType) &&
      m.path && m.path.length > 1
    );
    
    if (stickvägar.length === 0) return null;
    
    let nearestRoad = null;
    let minDistance = Infinity;
    
    stickvägar.forEach(road => {
      const result = getDistanceToPath(gpsMapPositionRef.current, road.path);
      if (result.distance < minDistance) {
        minDistance = result.distance;
        nearestRoad = road;
      }
    });
    
    return nearestRoad;
  };
  
  // Hämta aktuellt avstånd till närmaste stickväg
  const getStickvagDistance = (): number | null => {
    if (!stickvagMode) return null;
    
    // Hitta närmaste stickväg dynamiskt
    const nearest = findNearestStickvag();
    if (!nearest?.path) return null;
    
    // Uppdatera referensen om den ändrats
    if (nearest.id !== previousStickvagRef.current?.id) {
      previousStickvagRef.current = nearest;
    }
    
    const result = getDistanceToPath(gpsMapPositionRef.current, nearest.path);
    return Math.round(result.distance);
  };
  
  // Spela varningsljud
  const playStickvagWarning = (tooClose: boolean) => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.frequency.value = tooClose ? 800 : 600;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.3);
    } catch(e) {}
    
    // Vibrera
    if (navigator.vibrate) {
      navigator.vibrate(200);
    }
  };
  
  const startGpsTracking = (lineType) => {
    if (!('geolocation' in navigator)) {
      alert('GPS stöds inte i denna enhet');
      return;
    }
    
    setGpsLineType(lineType);
    setGpsPath([]);
    gpsPathRef.current = [];
    setGpsStartPos(null);
    setMenuOpen(false);
    setMenuHeight(0);
    
    // Kolla om det är en stickväg och om det finns tidigare stickvägar
    const isStickväg = ['sideRoadRed', 'sideRoadYellow', 'sideRoadBlue'].includes(lineType);
    if (isStickväg) {
      // Hitta alla stickvägar (inte backvägar)
      const previousStickvägar = markers.filter(m => 
        m.isLine && ['sideRoadRed', 'sideRoadYellow', 'sideRoadBlue'].includes(m.lineType)
      );
      if (previousStickvägar.length > 0) {
        // Sätt närmaste stickväg som referens (uppdateras dynamiskt)
        previousStickvagRef.current = previousStickvägar[previousStickvägar.length - 1];
        setStickvagMode(true);
        setStickvagOversikt(false);
        setStickvagWarningShown(false);
      }
    }
    
    // Om GPS redan är igång, använd den
    if (isTracking && watchIdRef.current) {
      // Sätt startposition till nuvarande position
      const startX = gpsMapPositionRef.current.x;
      const startY = gpsMapPositionRef.current.y;
      setGpsStartPos({ 
        lat: currentPosition?.lat, 
        lon: currentPosition?.lon, 
        x: startX, 
        y: startY 
      });
      const firstPoint = { x: startX, y: startY };
      gpsPathRef.current = [firstPoint];
      setGpsPath([firstPoint]);
      return;
    }
    
    // Annars starta GPS
    setIsTracking(true);
    
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const newPos = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        const accuracy = pos.coords.accuracy; // meter
        
        // Ignorera väldigt osäkra positioner (över 30 meter)
        if (accuracy > 30) return;
        
        setCurrentPosition(newPos);
        setTrackingPath(prev => [...prev, newPos]);
        
        // Första punkten - sätt startposition
        setGpsStartPos(prev => {
          if (!prev) {
            const startPos = { 
              lat: newPos.lat, 
              lon: newPos.lon, 
              x: gpsMapPositionRef.current.x, 
              y: gpsMapPositionRef.current.y 
            };
            const firstPoint = { x: gpsMapPositionRef.current.x, y: gpsMapPositionRef.current.y };
            gpsPathRef.current = [firstPoint];
            setGpsPath([firstPoint]);
            lastConfirmedPosRef.current = firstPoint;
            gpsHistoryRef.current = [firstPoint];
            return startPos;
          }
          
          // Konvertera GPS till kartkoordinater
          const rawMapPos = gpsToMap(newPos.lat, newPos.lon, prev.lat, prev.lon, prev.x, prev.y);
          
          // Lägg till i historik för medelvärde (max 5 punkter)
          gpsHistoryRef.current = [...gpsHistoryRef.current.slice(-4), rawMapPos];
          
          // Beräkna medelvärde av senaste positionerna
          const history = gpsHistoryRef.current;
          const smoothedPos = {
            x: history.reduce((sum, p) => sum + p.x, 0) / history.length,
            y: history.reduce((sum, p) => sum + p.y, 0) / history.length
          };
          
          // Kolla avstånd från senast bekräftade position
          const distFromConfirmed = Math.sqrt(
            Math.pow(smoothedPos.x - lastConfirmedPosRef.current.x, 2) + 
            Math.pow(smoothedPos.y - lastConfirmedPosRef.current.y, 2)
          );
          
          // Minsta rörelse för att uppdatera pricken (ca 2 meter vid scale=1)
          const minPixelMove = 2 / scale; // 2 meter i pixlar
          
          if (distFromConfirmed > minPixelMove) {
            // Uppdatera bekräftad position
            lastConfirmedPosRef.current = smoothedPos;
            gpsMapPositionRef.current = smoothedPos;
            setGpsMapPosition(smoothedPos);
            
            // Lägg till punkt i spårad linje om vi rört oss tillräckligt (5 meter)
            // Men INTE om spårningen är pausad
            if (!gpsPausedRef.current) {
              const currentPath = gpsPathRef.current;
              if (currentPath.length === 0) {
                gpsPathRef.current = [smoothedPos];
                setGpsPath([smoothedPos]);
              } else {
                const lastPoint = currentPath[currentPath.length - 1];
                const distForLine = Math.sqrt(
                  Math.pow(smoothedPos.x - lastPoint.x, 2) + 
                  Math.pow(smoothedPos.y - lastPoint.y, 2)
                );
                const minLinePixels = 5 / scale; // 5 meter i pixlar
                if (distForLine > minLinePixels) {
                  const newPath = [...currentPath, smoothedPos];
                  gpsPathRef.current = newPath;
                  setGpsPath(newPath);
                }
              }
            }
          }
          
          return prev;
        });
      },
      (err) => console.log('GPS error:', err),
      { enableHighAccuracy: true, maximumAge: 2000 }
    );
  };
  
  const stopGpsTracking = (save = true) => {
    // Spara linjen om vi har tillräckligt med punkter
    if (save && gpsPathRef.current.length > 1 && gpsLineType) {
      saveToHistory([...markers]);
      const newLine = {
        id: Date.now(),
        lineType: gpsLineType,
        path: [...gpsPathRef.current],
        isLine: true,
        gpsRecorded: true,
      };
      setMarkers(prev => [...prev, newLine]);
    }
    
    // Nollställ linjespårning men BEHÅLL GPS-visning
    setGpsLineType(null);
    setGpsPath([]);
    gpsPathRef.current = [];
    setGpsStartPos(null);
    setGpsPaused(false);
    gpsPausedRef.current = false;
    
    // Stäng av stickvägsmode och översikt
    setStickvagMode(false);
    setStickvagOversikt(false);
    previousStickvagRef.current = null;
    
    // OBS: Vi stänger INTE av isTracking eller watchIdRef - GPS fortsätter visa position
  };
  
  const toggleGpsPause = () => {
    const newPaused = !gpsPaused;
    setGpsPaused(newPaused);
    gpsPausedRef.current = newPaused;
    
    // När vi återupptar, sätt nuvarande position som ny startpunkt för fortsättningen
    if (!newPaused && gpsPathRef.current.length > 0) {
      // Lägg till nuvarande position som ny punkt (hoppar över var vi var under pausen)
      const currentPos = gpsMapPositionRef.current;
      const newPath = [...gpsPathRef.current, currentPos];
      gpsPathRef.current = newPath;
      setGpsPath(newPath);
    }
  };
  
  const toggleTracking = () => {
    if (isTracking) {
      // Stoppa GPS helt
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsTracking(false);
      setGpsLineType(null);
      setGpsPath([]);
      gpsPathRef.current = [];
      gpsHistoryRef.current = [];
      setGpsStartPos(null);
      setTrackingPath([]);
      setHeaderExpanded(false);
      setGpsPaused(false);
      gpsPausedRef.current = false;
    } else {
      // Starta GPS-visning (utan linjespårning)
      if ('geolocation' in navigator) {
        setIsTracking(true);
        setGpsStartPos(null); // Återställ så första positionen blir startpunkt
        gpsHistoryRef.current = [];
        
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            const newPos = { lat: pos.coords.latitude, lon: pos.coords.longitude };
            const accuracy = pos.coords.accuracy;
            
            // Ignorera väldigt osäkra positioner
            if (accuracy > 30) return;
            
            setCurrentPosition(newPos);
            setTrackingPath(prev => [...prev, newPos]);
            
            // Uppdatera kartposition
            setGpsStartPos(prev => {
              if (!prev) {
                // Första punkten - spara som referens
                lastConfirmedPosRef.current = gpsMapPositionRef.current;
                gpsHistoryRef.current = [gpsMapPositionRef.current];
                return { 
                  lat: newPos.lat, 
                  lon: newPos.lon, 
                  x: gpsMapPositionRef.current.x, 
                  y: gpsMapPositionRef.current.y 
                };
              }
              
              // Beräkna ny kartposition
              const rawMapPos = gpsToMap(newPos.lat, newPos.lon, prev.lat, prev.lon, prev.x, prev.y);
              
              // Lägg till i historik för medelvärde
              gpsHistoryRef.current = [...gpsHistoryRef.current.slice(-4), rawMapPos];
              
              // Beräkna medelvärde
              const history = gpsHistoryRef.current;
              const smoothedPos = {
                x: history.reduce((sum, p) => sum + p.x, 0) / history.length,
                y: history.reduce((sum, p) => sum + p.y, 0) / history.length
              };
              
              // Kolla avstånd från senast bekräftade position
              const distFromConfirmed = Math.sqrt(
                Math.pow(smoothedPos.x - lastConfirmedPosRef.current.x, 2) + 
                Math.pow(smoothedPos.y - lastConfirmedPosRef.current.y, 2)
              );
              
              const minPixelMove = 2 / scale; // 2 meter
              
              if (distFromConfirmed > minPixelMove) {
                lastConfirmedPosRef.current = smoothedPos;
                gpsMapPositionRef.current = smoothedPos;
                setGpsMapPosition(smoothedPos);
              }
              
              return prev;
            });
          },
          (err) => console.log('GPS error:', err),
          { enableHighAccuracy: true, maximumAge: 2000 }
        );
      }
    }
  };

  // === MARKERING HANTERING ===
  const saveToHistory = (prevMarkers) => {
    setHistory(prev => [...prev.slice(-20), prevMarkers]); // Spara max 20 steg
    setShowUndo(true);
    
    // Göm ångra-knappen efter 5 sek
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    undoTimeoutRef.current = setTimeout(() => setShowUndo(false), 5000);
  };
  
  const undo = () => {
    if (history.length === 0) return;
    const previousState = history[history.length - 1];
    setMarkers(previousState);
    setHistory(prev => prev.slice(0, -1));
    
    // Förläng synligheten
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    if (history.length > 1) {
      undoTimeoutRef.current = setTimeout(() => setShowUndo(false), 5000);
    } else {
      setShowUndo(false);
    }
  };

  const deleteMarker = (id) => {
    saveToHistory([...markers]);
    setMarkers(prev => prev.filter(m => m.id !== id));
    setMarkerMenuOpen(null);
  };

  // Drag & drop för symboler
  const handleMarkerDragStart = (e, marker) => {
    if (!marker.isMarker && !marker.isArrow) {
      // Linjer och zoner - öppna meny direkt
      e.stopPropagation();
      setMarkerMenuOpen(marker.id);
      return;
    }
    e.stopPropagation();
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    setDraggingMarker(marker.id);
    setDragStart({ x: clientX, y: clientY });
    setHasMoved(false);
  };
  
  const handleMarkerDragMove = (e, rect) => {
    if (!draggingMarker) return;
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    // Kolla om vi har rört oss tillräckligt (5px tröskel)
    const dx = Math.abs(clientX - dragStart.x);
    const dy = Math.abs(clientY - dragStart.y);
    
    if (dx > 5 || dy > 5) {
      if (!hasMoved) {
        // Första gången vi rör oss - spara history
        saveToHistory([...markers]);
        setHasMoved(true);
      }
      
      const x = (clientX - rect.left - pan.x) / zoom;
      const y = (clientY - rect.top - pan.y) / zoom;
      
      setMarkers(prev => prev.map(m => 
        m.id === draggingMarker ? { ...m, x, y } : m
      ));
    }
  };
  
  const handleDragEnd = () => {
    if (!draggingMarker) return;
    
    const markerId = draggingMarker;
    const moved = hasMoved;
    
    setDraggingMarker(null);
    setHasMoved(false);
    
    if (!moved) {
      // Vi har inte flyttat - visa menyn
      justEndedDrag.current = true;
      setMarkerMenuOpen(markerId);
      setTimeout(() => { justEndedDrag.current = false; }, 100);
    }
  };
  
  // Rotera pil genom att dra
  const startRotatingArrow = (arrowId, centerX, centerY) => {
    saveToHistory([...markers]);
    setRotatingArrow(arrowId);
    setRotationCenter({ x: centerX, y: centerY });
    setMarkerMenuOpen(null);
  };
  
  const handleRotationMove = (e, rect) => {
    if (!rotatingArrow) return;
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    // Beräkna vinkel från pilens center till fingret
    const centerScreenX = rotationCenter.x * zoom + pan.x + rect.left;
    const centerScreenY = rotationCenter.y * zoom + pan.y + rect.top;
    
    const dx = clientX - centerScreenX;
    const dy = clientY - centerScreenY;
    
    // Konvertera till grader (0 = upp)
    let angle = Math.atan2(dx, -dy) * (180 / Math.PI);
    
    // Snäpp till 15-graders steg om man är nära
    const snappedAngle = Math.round(angle / 15) * 15;
    if (Math.abs(angle - snappedAngle) < 5) {
      angle = snappedAngle;
    }
    
    setMarkers(prev => prev.map(m => 
      m.id === rotatingArrow ? { ...m, rotation: angle } : m
    ));
  };
  
  const handleRotationEnd = () => {
    setRotatingArrow(null);
  };
  
  // Hantera foto från kamera
  const handlePhotoCapture = (e) => {
    const file = e.target.files?.[0];
    if (!file || !pendingPhotoMarkerId) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      saveToHistory([...markers]);
      setMarkers(prev => prev.map(m => 
        m.id === pendingPhotoMarkerId 
          ? { ...m, photoData: event.target?.result as string }
          : m
      ));
      // Öppna menyn igen för samma markör
      setMarkerMenuOpen(pendingPhotoMarkerId);
      setPendingPhotoMarkerId(null);
    };
    reader.readAsDataURL(file);
    
    // Reset input så man kan ta samma bild igen
    e.target.value = '';
  };
  
  // Klick på linjer/zoner (kan inte dras)
  const handleMarkerClick = (e, marker) => {
    e.stopPropagation();
    if (draggingMarker) return;
    
    if (markerMenuOpen === marker.id) {
      setMarkerMenuOpen(null);
    } else {
      setMarkerMenuOpen(marker.id);
    }
  };

  // === KARTA INTERAKTION ===
  const handleMapClick = (e) => {
    // Ignorera click om vi precis avslutade en drag (som öppnade menyn)
    if (justEndedDrag.current) {
      return;
    }
    
    // Stäng menyer om de är öppna
    if (markerMenuOpen) {
      setMarkerMenuOpen(null);
      return;
    }
    
    if (layerMenuOpen) {
      setLayerMenuOpen(false);
      return;
    }
    
    if (menuOpen) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const isTouch = e.type === 'touchend' || (e.nativeEvent && e.nativeEvent.changedTouches);
    const touchOffset = isTouch ? 50 : 0; // Offset uppåt för touch så symbolen hamnar ovanför fingret
    
    let clientX, clientY;
    if (isTouch && e.nativeEvent?.changedTouches?.[0]) {
      clientX = e.nativeEvent.changedTouches[0].clientX;
      clientY = e.nativeEvent.changedTouches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    const x = (clientX - rect.left - pan.x) / zoom;
    const y = ((clientY - touchOffset) - rect.top - pan.y) / zoom;

    // Placera symbol
    if (selectedSymbol) {
      saveToHistory([...markers]);
      const newMarker = {
        id: Date.now(),
        type: selectedSymbol,
        x, y,
        isMarker: true,
        comment: '',
      };
      setMarkers(prev => [...prev, newMarker]);
      
      // Lägg till i snabbval (max 4, senast först)
      setRecentSymbols(prev => {
        const filtered = prev.filter(s => s !== selectedSymbol);
        return [selectedSymbol, ...filtered].slice(0, 4);
      });
      
      setSelectedSymbol(null);
      return;
    }

    // Placera pil
    if (isArrowMode && arrowType) {
      saveToHistory([...markers]);
      const newArrow = {
        id: Date.now(),
        arrowType,
        x, y,
        rotation: 0,
        isArrow: true,
      };
      setMarkers(prev => [...prev, newArrow]);
      setIsArrowMode(false);
      setArrowType(null);
      return;
    }
  };

  const finishLine = () => {
    if (currentPath.length > 1 && drawType) {
      saveToHistory([...markers]);
      const newLine = {
        id: Date.now(),
        lineType: drawType,
        path: [...currentPath],
        isLine: true,
      };
      setMarkers(prev => [...prev, newLine]);
    }
    setCurrentPath([]);
    setIsDrawMode(false);
    setDrawType(null);
    setIsDrawing(false);
    setDrawPaused(false);
  };

  const finishZone = () => {
    if (currentPath.length > 2 && zoneType) {
      saveToHistory([...markers]);
      const newZone = {
        id: Date.now(),
        zoneType,
        path: [...currentPath],
        isZone: true,
      };
      setMarkers(prev => [...prev, newZone]);
    }
    setCurrentPath([]);
    setIsZoneMode(false);
    setZoneType(null);
    setIsDrawing(false);
    setDrawPaused(false);
  };

  // Dra-för-att-rita med offset
  const drawOffset = 60; // Pixlar ovanför fingret
  const [drawCursor, setDrawCursor] = useState(null); // Visar var linjen ritas
  
  const handleDrawStart = (e, rect) => {
    if (!isDrawMode && !isZoneMode && !measureMode && !measureAreaMode) return;
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    // Offset uppåt så man ser var man ritar
    const offsetY = e.touches ? drawOffset : 0; // Bara offset på touch
    
    // Mätningsläge (sträcka eller yta) - spara i SKÄRMKOORDINATER
    if (measureMode || measureAreaMode) {
      const screenX = clientX - rect.left;
      const screenY = clientY - rect.top - offsetY;
      
      // Kolla om vi börjar nära slutpunkten - då fortsätt därifrån
      if (measurePath.length > 1) {
        const lastPoint = measurePath[measurePath.length - 1];
        const distToEnd = Math.sqrt(Math.pow(screenX - lastPoint.x, 2) + Math.pow(screenY - lastPoint.y, 2));
        
        if (distToEnd < 40) {
          // Fortsätt från slutpunkten
          setIsMeasuring(true);
          setDrawCursor({ x: screenX, y: screenY });
          return;
        }
      }
      
      // Annars starta ny mätning
      setIsMeasuring(true);
      setMeasurePath([{ x: screenX, y: screenY }]);
      setDrawCursor({ x: screenX, y: screenY });
      return;
    }
    
    const x = (clientX - rect.left - pan.x) / zoom;
    const y = (clientY - rect.top - pan.y - offsetY) / zoom;
    
    setIsDrawing(true);
    setDrawPaused(false);
    setDrawCursor({ x, y });
    
    // Om vi redan har en path (pausad), lägg till mellanpunkter för smidig övergång
    if (currentPath.length > 0) {
      const lastPoint = currentPath[currentPath.length - 1];
      const dx = x - lastPoint.x;
      const dy = y - lastPoint.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // Om det är långt, lägg till mellanpunkter
      if (dist > 20) {
        const steps = Math.ceil(dist / 15);
        const newPoints = [];
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          newPoints.push({
            x: lastPoint.x + dx * t,
            y: lastPoint.y + dy * t
          });
        }
        setCurrentPath(prev => [...prev, ...newPoints]);
      } else {
        setCurrentPath(prev => [...prev, { x, y }]);
      }
    } else {
      setCurrentPath([{ x, y }]);
    }
  };
  
  const handleDrawMove = (e, rect) => {
    if (!isDrawing && !isMeasuring) return;
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    // Offset uppåt så man ser var man ritar
    const offsetY = e.touches ? drawOffset : 0;
    
    // Mätningsläge (sträcka eller yta) - spara i SKÄRMKOORDINATER
    if (isMeasuring) {
      const screenX = clientX - rect.left;
      const screenY = clientY - rect.top - offsetY;
      setDrawCursor({ x: screenX, y: screenY });
      
      const lastPoint = measurePath[measurePath.length - 1];
      if (lastPoint) {
        const dist = Math.sqrt(Math.pow(screenX - lastPoint.x, 2) + Math.pow(screenY - lastPoint.y, 2));
        if (dist > 5) {
          setMeasurePath(prev => [...prev, { x: screenX, y: screenY }]);
        }
      }
      return;
    }
    
    const x = (clientX - rect.left - pan.x) / zoom;
    const y = (clientY - rect.top - pan.y - offsetY) / zoom;
    
    // Uppdatera cursor-position
    setDrawCursor({ x, y });
    
    // Lägg bara till punkt om vi rört oss tillräckligt (undvik för många punkter)
    const lastPoint = currentPath[currentPath.length - 1];
    if (lastPoint) {
      const dist = Math.sqrt(Math.pow(x - lastPoint.x, 2) + Math.pow(y - lastPoint.y, 2));
      if (dist > 5) {
        setCurrentPath(prev => [...prev, { x, y }]);
      }
    }
  };
  
  const handleDrawEnd = () => {
    if (isMeasuring) {
      setIsMeasuring(false);
      setDrawCursor(null);
      // measurePath behålls för visning tills användaren stänger
      return;
    }
    
    if (!isDrawing) return;
    
    setDrawCursor(null);
    setIsDrawing(false);
    
    // Om vi har ritat något, pausa (inte spara)
    if (currentPath.length > 0) {
      setDrawPaused(true);
    }
  };
  
  // Ångra senaste segmentet medan man ritar
  const undoLastSegment = () => {
    if (currentPath.length <= 1) {
      // Bara en punkt - avbryt helt
      cancelDrawing();
      return;
    }
    // Ta bort ca 20% av punkterna (minst 3)
    const removeCount = Math.max(3, Math.floor(currentPath.length * 0.2));
    setCurrentPath(prev => prev.slice(0, -removeCount));
  };
  
  const cancelDrawing = () => {
    setCurrentPath([]);
    setIsDrawMode(false);
    setIsZoneMode(false);
    setDrawType(null);
    setZoneType(null);
    setIsDrawing(false);
    setDrawPaused(false);
    setDrawCursor(null);
  };

  // Pan
  const handleMouseDown = (e) => {
    if (e.button === 0 && !selectedSymbol && !isDrawMode && !isZoneMode && !isArrowMode) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Meny drag
  const handleMenuDragStart = (e) => {
    e.preventDefault();
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    dragStartY.current = clientY;
    dragStartHeight.current = menuHeight;
    
    const handleMove = (e) => {
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const delta = dragStartY.current - clientY;
      const newHeight = Math.max(0, Math.min(500, dragStartHeight.current + delta));
      setMenuHeight(newHeight);
      setMenuOpen(newHeight > 50);
    };
    
    const handleEnd = () => {
      // Snäpp till positioner - antingen stängd eller öppen
      const targetHeight = Math.min(window.innerHeight * 0.7, 500);
      if (menuHeight < 150) {
        setMenuHeight(0);
        setMenuOpen(false);
      } else {
        setMenuHeight(targetHeight);
        setMenuOpen(true);
      }
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);
    };
    
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleMove);
    document.addEventListener('touchend', handleEnd);
  };

  const openMenu = () => {
    // Öppna till 70% av skärmhöjden så allt innehåll syns
    const height = Math.min(window.innerHeight * 0.7, 500);
    setMenuHeight(height);
    setMenuOpen(true);
  };

  // === RENDER HELPERS ===
  
  // Beräkna längd på en path (i meter)
  const calculateLength = (path) => {
    if (!path || path.length < 2) return 0;
    let length = 0;
    for (let i = 1; i < path.length; i++) {
      const dx = path[i].x - path[i-1].x;
      const dy = path[i].y - path[i-1].y;
      length += Math.sqrt(dx * dx + dy * dy);
    }
    return length * scale;
  };
  
  // Beräkna area på en polygon (i m²)
  const calculateArea = (path) => {
    if (!path || path.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < path.length; i++) {
      const j = (i + 1) % path.length;
      area += path[i].x * path[j].y;
      area -= path[j].x * path[i].y;
    }
    return Math.abs(area / 2) * scale * scale;
  };
  
  // Formatera längd (m eller km)
  const formatLength = (meters) => {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(2)} km`;
    }
    return `${Math.round(meters)} m`;
  };
  
  // Formatera area (m² eller ha)
  const formatArea = (sqMeters) => {
    if (sqMeters >= 10000) {
      return `${(sqMeters / 10000).toFixed(2)} ha`;
    }
    return `${Math.round(sqMeters)} m²`;
  };
  
  // === KÖRLÄGE FUNKTIONER ===
  
  // Beräkna avstånd i meter mellan två punkter
  const calculateDistanceMeters = (p1, p2) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);
    return pixelDistance * scale;
  };
  
  // Beräkna opacity baserat på avstånd (för körläge)
  const getMarkerOpacity = (markerPos) => {
    if (!drivingMode) return 1;
    if (!gpsMapPosition) return 0.2;
    
    const distance = calculateDistanceMeters(gpsMapPosition, markerPos);
    const markerId = markerPos.id;
    
    // Kvitterade = alltid gröna och synliga
    if (acknowledgedWarnings.includes(markerId)) return 1;
    
    // Utanför fade-avstånd = svag
    if (distance > FADE_START_DISTANCE) return 0.2;
    
    // Inom varningsavstånd = full styrka
    if (distance <= WARNING_DISTANCE) return 1;
    
    // Gradvis fade mellan 100m och 40m
    const fadeRange = FADE_START_DISTANCE - WARNING_DISTANCE; // 60m
    const distanceIntoFade = FADE_START_DISTANCE - distance;
    const fadeProgress = distanceIntoFade / fadeRange; // 0 till 1
    
    return 0.2 + (fadeProgress * 0.8); // 0.2 till 1.0
  };
  
  // Hitta aktiva varningar (inom 40m)
  const getActiveWarnings = () => {
    if (!drivingMode || !gpsMapPosition) return [];
    
    const warnings = [];
    
    // Hjälpfunktion: hitta närmaste punkt på en linje
    const distanceToLine = (point, path) => {
      let minDist = Infinity;
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i];
        const b = path[i + 1];
        
        // Vektor från a till b
        const abx = b.x - a.x;
        const aby = b.y - a.y;
        const abLen = Math.sqrt(abx * abx + aby * aby);
        
        if (abLen === 0) continue;
        
        // Projicera punkt på linjen
        const t = Math.max(0, Math.min(1, 
          ((point.x - a.x) * abx + (point.y - a.y) * aby) / (abLen * abLen)
        ));
        
        // Närmaste punkt på linjesegmentet
        const closestX = a.x + t * abx;
        const closestY = a.y + t * aby;
        
        const dist = Math.sqrt(
          Math.pow(point.x - closestX, 2) + 
          Math.pow(point.y - closestY, 2)
        );
        
        if (dist < minDist) minDist = dist;
      }
      return minDist * scale; // Konvertera till meter
    };
    
    markers.forEach(m => {
      if (acknowledgedWarnings.includes(m.id)) return;
      
      let distance = null;
      let type = null;
      let icon = null;
      let name = null;
      
      if (m.isMarker) {
        const pos = { x: m.x, y: m.y };
        distance = calculateDistanceMeters(gpsMapPosition, pos);
        const markerType = markerTypes.find(t => t.id === m.type);
        type = 'symbol';
        icon = markerType?.icon || '📍';
        name = markerType?.name || 'Markering';
      } else if (m.isZone && m.path?.length > 0) {
        // Kolla avstånd till zonens kant (inte mittpunkt)
        distance = distanceToLine(gpsMapPosition, [...m.path, m.path[0]]); // Stäng polygonen
        const zoneType = zoneTypes.find(t => t.id === m.zoneType);
        type = 'zone';
        icon = zoneType?.icon || '⬡';
        name = zoneType?.name || 'Zon';
      } else if (m.isLine && m.path?.length > 1) {
        // Kolla avstånd till linjen
        distance = distanceToLine(gpsMapPosition, m.path);
        const lineType = lineTypes.find(t => t.id === m.lineType);
        type = 'line';
        icon = m.lineType === 'boundary' ? '🚧' : '━';
        name = lineType?.name || 'Linje';
      }
      
      if (distance !== null && distance <= WARNING_DISTANCE) {
        warnings.push({
          id: m.id,
          type,
          icon,
          name,
          distance: Math.round(distance),
          comment: m.comment,
          photoData: m.photoData,
          marker: m,
        });
      }
    });
    
    return warnings.sort((a, b) => a.distance - b.distance);
  };
  
  // Track vilka varningar som spelat ljud (för att undvika dubbletter)
  const playedWarningsRef = useRef<Set<string>>(new Set());
  
  // Kolla varningar när GPS uppdateras
  useEffect(() => {
    if (!drivingMode) return;
    
    const warnings = getActiveWarnings();
    if (warnings.length > 0 && !activeWarning) {
      const warning = warnings[0];
      
      // Kolla om vi redan spelat ljud för denna varning
      if (playedWarningsRef.current.has(warning.id)) {
        setActiveWarning(warning);
        return;
      }
      
      setActiveWarning(warning);
      playedWarningsRef.current.add(warning.id);
      
      // Vibrera kraftigt
      if (navigator.vibrate) {
        navigator.vibrate([500, 200, 500, 200, 500]);
      }
      
      // Spela varningsljud
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const playBeep = (freq: number, duration: number, delay: number) => {
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          oscillator.frequency.value = freq;
          oscillator.type = 'square';
          gainNode.gain.value = 0.3;
          oscillator.start(audioContext.currentTime + delay);
          oscillator.stop(audioContext.currentTime + delay + duration);
        };
        // 3 snabba varningsljud
        playBeep(800, 0.2, 0);
        playBeep(800, 0.2, 0.3);
        playBeep(800, 0.2, 0.6);
      } catch (e) {
        console.log('Audio not supported');
      }
    }
  }, [drivingMode, gpsMapPosition, markers, acknowledgedWarnings]);
  
  // Kvittera varning
  const acknowledgeWarning = () => {
    if (activeWarning) {
      setAcknowledgedWarnings(prev => [...prev, activeWarning.id]);
      setActiveWarning(null);
    }
  };
  
  // Beräkna prognos
  // Skapa smooth SVG path med cubic bezier curves
  const createSmoothPath = (points, closed = false) => {
    if (!points || points.length < 2) return '';
    if (points.length === 2) {
      return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
    }
    
    // För slutna former, lägg till första punkterna i slutet
    const pts = closed ? [...points, points[0], points[1]] : points;
    
    // Använd quadratic bezier för mjukare kurvor
    let d = `M ${pts[0].x} ${pts[0].y}`;
    
    for (let i = 1; i < pts.length - 1; i++) {
      const xc = (pts[i].x + pts[i + 1].x) / 2;
      const yc = (pts[i].y + pts[i + 1].y) / 2;
      d += ` Q ${pts[i].x} ${pts[i].y}, ${xc} ${yc}`;
    }
    
    // Sista punkten (om inte stängd)
    if (!closed) {
      const last = pts[pts.length - 1];
      d += ` L ${last.x} ${last.y}`;
    }
    
    return d;
  };
  
  const renderLine = (path, typeId, width = 6) => {
    if (!path || path.length < 2) return null;
    const type = lineTypes.find(t => t.id === typeId);
    if (!type) return null;
    
    // Använd smooth path
    const d = createSmoothPath(path);
    
    if (type.striped) {
      return (
        <g key={`line-${path[0]?.x}-${path[0]?.y}-${typeId}`}>
          <path d={d} fill="none" stroke={type.color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }} />
          <path d={d} fill="none" stroke={type.color2} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="20,20" />
        </g>
      );
    } else {
      return (
        <g key={`line-${path[0]?.x}-${path[0]?.y}-${typeId}`}>
          <path d={d} fill="none" stroke={type.color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="12,8" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }} />
        </g>
      );
    }
  };

  const renderZone = (marker) => {
    const path = marker.path;
    const typeId = marker.zoneType;
    if (!path || path.length < 3) return null;
    const zone = zoneTypes.find(t => t.id === typeId);
    if (!zone) return null;
    
    // Rak path - följer exakt ritningen
    const d = path.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
    const centerX = path.reduce((sum, p) => sum + p.x, 0) / path.length;
    const centerY = path.reduce((sum, p) => sum + p.y, 0) / path.length;
    
    // Körläge opacity
    const opacity = getMarkerOpacity({ x: centerX, y: centerY, id: marker.id });
    const isAcknowledged = acknowledgedWarnings.includes(marker.id);
    
    return (
      <g key={`zone-${marker.id}`} style={{ opacity: opacity, transition: 'opacity 0.3s ease' }}>
        {/* Fyllning */}
        <path 
          d={d} 
          fill={zone.color} 
          fillOpacity={0.2} 
          stroke="none"
        />
        {/* Streckad kant - samma stil som traktgränsen */}
        <path 
          d={d} 
          fill="none" 
          stroke={zone.color} 
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}
        />
        <path 
          d={d} 
          fill="none" 
          stroke="#fff" 
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="12,12"
        />
        {/* Grön ring om kvitterad */}
        {isAcknowledged && drivingMode && (
          <circle cx={centerX} cy={centerY} r={26} fill="none" stroke="#22c55e" strokeWidth={3} />
        )}
        {/* Ikon i mitten */}
        <circle cx={centerX} cy={centerY} r={18} fill="rgba(0,0,0,0.7)" stroke={zone.color} strokeWidth={2} />
        <text x={centerX} y={centerY} textAnchor="middle" dominantBaseline="central" fontSize="16" style={{ pointerEvents: 'none' }}>
          {zone.icon}
        </text>
      </g>
    );
  };

  // === STYLES ===
  const colors = {
    bg: '#000000',
    surface: '#1c1c1e',
    surfaceLight: '#2c2c2e',
    text: '#ffffff',
    textMuted: '#8e8e93',
    green: '#34c759',
    blue: '#0a84ff',
    red: '#ff453a',
    orange: '#ff9f0a',
  };

  return (
    <div style={{
      height: '100vh',
      width: '100vw',
      background: colors.bg,
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
      color: colors.text,
      overflow: 'hidden',
      position: 'relative',
      // Blockera textmarkering och kopiera-meny
      WebkitUserSelect: 'none',
      userSelect: 'none',
      WebkitTouchCallout: 'none',
      WebkitTapHighlightColor: 'transparent',
    }}>
      
      {/* === HEADER === */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        padding: '50px 20px 12px',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.8) 0%, transparent 100%)',
        zIndex: 100,
      }}>
        <div 
          onClick={toggleTracking}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px',
            cursor: 'pointer',
          }}
        >
          <span style={{ 
            fontSize: '20px', 
            fontWeight: '600',
            color: colors.text,
          }}>
            {tractInfo.name}
          </span>
          <span style={{ fontSize: '14px', color: colors.textMuted }}>
            {tractInfo.area}
          </span>
          
          {/* GPS-indikator - bara en färgad prick */}
          <span style={{ 
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: isTracking ? colors.green : colors.red,
            boxShadow: isTracking ? '0 0 8px rgba(52, 199, 89, 0.6)' : 'none',
            animation: isTracking ? 'pulse 1.5s infinite' : 'none',
          }} />
          
          {/* Körläge-indikator */}
          {drivingMode && (
            <span style={{
              marginLeft: '8px',
              padding: '4px 10px',
              borderRadius: '8px',
              background: 'rgba(34,197,94,0.3)',
              border: '1px solid #22c55e',
              color: '#22c55e',
              fontSize: '12px',
              fontWeight: '600',
            }}>
              🚜 KÖRLÄGE
            </span>
          )}
        </div>
      </div>

      {/* === KARTA === */}
      <svg 
        style={{ 
          position: 'absolute', 
          inset: 0, 
          width: '100%', 
          height: '100%',
          touchAction: 'none', // Förhindra browser-zoom
          background: `
            radial-gradient(ellipse at 30% 40%, rgba(52, 199, 89, 0.15) 0%, transparent 50%),
            radial-gradient(ellipse at 70% 60%, rgba(10, 132, 255, 0.2) 0%, transparent 45%),
            radial-gradient(ellipse at 50% 80%, rgba(10, 132, 255, 0.25) 0%, transparent 40%),
            linear-gradient(180deg, #1c1c1e 0%, #000000 100%)
          `,
          cursor: isPanning ? 'grabbing' : isDrawing || isMeasuring ? 'crosshair' : selectedSymbol || isDrawMode || isZoneMode || isArrowMode || measureMode || measureAreaMode ? 'crosshair' : 'grab',
        }}
        onClick={handleMapClick}
        onMouseDown={(e) => {
          handleMouseDown(e);
          if (isDrawMode || isZoneMode || measureMode || measureAreaMode) {
            const rect = e.currentTarget.getBoundingClientRect();
            handleDrawStart(e, rect);
          }
        }}
        onMouseMove={(e) => {
          handleMouseMove(e);
          if (draggingMarker) {
            const rect = e.currentTarget.getBoundingClientRect();
            handleMarkerDragMove(e, rect);
          }
          if (isDrawing || isMeasuring) {
            const rect = e.currentTarget.getBoundingClientRect();
            handleDrawMove(e, rect);
          }
          if (rotatingArrow) {
            const rect = e.currentTarget.getBoundingClientRect();
            handleRotationMove(e, rect);
          }
        }}
        onMouseUp={() => {
          handleMouseUp();
          handleDragEnd();
          handleDrawEnd();
          handleRotationEnd();
        }}
        onMouseLeave={() => {
          handleMouseUp();
          handleDragEnd();
          handleDrawEnd();
          handleRotationEnd();
        }}
        onTouchStart={(e) => {
          // Pinch-to-zoom och rotation med två fingrar
          if (e.touches.length === 2) {
            e.preventDefault();
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const distance = Math.sqrt(
              Math.pow(touch2.clientX - touch1.clientX, 2) + 
              Math.pow(touch2.clientY - touch1.clientY, 2)
            );
            const centerX = (touch1.clientX + touch2.clientX) / 2;
            const centerY = (touch1.clientY + touch2.clientY) / 2;
            
            // Beräkna initial vinkel mellan fingrarna
            const angle = Math.atan2(
              touch2.clientY - touch1.clientY,
              touch2.clientX - touch1.clientX
            ) * (180 / Math.PI);
            
            pinchRef.current = {
              initialDistance: distance,
              initialZoom: zoom,
              initialPan: { ...pan },
              center: { x: centerX, y: centerY },
              initialAngle: angle,
              initialRotation: mapRotation
            };
            setIsPinching(true);
            return;
          }
          
          // Rita/mäta med ett finger
          if (isDrawMode || isZoneMode || measureMode || measureAreaMode) {
            const rect = e.currentTarget.getBoundingClientRect();
            handleDrawStart(e, rect);
            return;
          }
          
          // Pan med ett finger (om inte i ritläge)
          if (e.touches.length === 1 && !selectedSymbol && !isArrowMode) {
            setIsPanning(true);
            setPanStart({ x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y });
          }
        }}
        onTouchMove={(e) => {
          // Pinch-to-zoom och rotation med två fingrar
          if (e.touches.length === 2 && isPinching) {
            e.preventDefault();
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const distance = Math.sqrt(
              Math.pow(touch2.clientX - touch1.clientX, 2) + 
              Math.pow(touch2.clientY - touch1.clientY, 2)
            );
            
            // Beräkna ny zoom baserat på pinch-avstånd
            const scale = distance / pinchRef.current.initialDistance;
            const newZoom = Math.min(Math.max(pinchRef.current.initialZoom * scale, 0.5), 4);
            
            // Beräkna ny pan så vi zoomar mot mittpunkten mellan fingrarna
            const centerX = (touch1.clientX + touch2.clientX) / 2;
            const centerY = (touch1.clientY + touch2.clientY) / 2;
            
            // Justera pan för att hålla mittpunkten stilla
            const zoomRatio = newZoom / pinchRef.current.initialZoom;
            const newPanX = centerX - (centerX - pinchRef.current.initialPan.x) * zoomRatio;
            const newPanY = centerY - (centerY - pinchRef.current.initialPan.y) * zoomRatio;
            
            // Beräkna rotation (bara om kompass är av)
            if (!compassMode) {
              const currentAngle = Math.atan2(
                touch2.clientY - touch1.clientY,
                touch2.clientX - touch1.clientX
              ) * (180 / Math.PI);
              const angleDiff = currentAngle - pinchRef.current.initialAngle;
              const newRotation = pinchRef.current.initialRotation + angleDiff;
              setMapRotation(newRotation);
            }
            
            setZoom(newZoom);
            setPan({ x: newPanX, y: newPanY });
            return;
          }
          
          // Pan med ett finger
          if (e.touches.length === 1 && isPanning && !isDrawing && !isMeasuring && !draggingMarker && !rotatingArrow) {
            e.preventDefault();
            setPan({ x: e.touches[0].clientX - panStart.x, y: e.touches[0].clientY - panStart.y });
            return;
          }
          
          if (draggingMarker) {
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            handleMarkerDragMove(e, rect);
          }
          if (isDrawing || isMeasuring) {
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            handleDrawMove(e, rect);
          }
          if (rotatingArrow) {
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            handleRotationMove(e, rect);
          }
        }}
        onTouchEnd={() => {
          setIsPinching(false);
          setIsPanning(false);
          handleDragEnd();
          handleDrawEnd();
          handleRotationEnd();
        }}
      >
        {/* Grid */}
        <defs>
          <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(132,204,22,0.05)" strokeWidth="1"/>
          </pattern>
          {/* Gradient för ljuskägla */}
          <radialGradient id="viewConeGradient" cx="0%" cy="0%" r="100%">
            <stop offset="0%" stopColor="#0a84ff" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#0a84ff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />

        {/* Rotation wrapper för kompass-läge */}
        <g style={{ 
          transform: compassMode ? `rotate(${-deviceHeading}deg)` : 'none',
          transformOrigin: '50% 50%',
          transition: compassMode ? 'transform 0.1s ease-out' : 'none',
        }}>
        {/* Kart-rotation från finger-gester */}
        <g style={{ 
          transform: `rotate(${mapRotation}deg)`,
          transformOrigin: '50% 50%',
        }}>
        <g style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
          
          {/* Zoner */}
          {visibleLayers.zones && markers.filter(m => m.isZone && visibleZones[m.zoneType]).map(m => 
            renderZone(m)
          )}
          
          {/* Pågående zon */}
          {isZoneMode && currentPath.length > 0 && (
            <g>
              {/* Fyllning */}
              <path
                d={currentPath.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + (currentPath.length > 2 ? ' Z' : '')}
                fill={zoneTypes.find(t => t.id === zoneType)?.color || '#fff'}
                fillOpacity={0.15}
                stroke="none"
              />
              {/* Streckad kant */}
              <path
                d={currentPath.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + (currentPath.length > 2 ? ' Z' : '')}
                fill="none"
                stroke={zoneTypes.find(t => t.id === zoneType)?.color || '#fff'}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={currentPath.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + (currentPath.length > 2 ? ' Z' : '')}
                fill="none"
                stroke="#fff"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="10,10"
              />
            </g>
          )}

          {/* Linjer */}
          {visibleLayers.lines && markers.filter(m => m.isLine && visibleLines[m.lineType]).map(m => 
            renderLine(m.path, m.lineType, m.lineType === 'mainRoad' ? 10 : m.lineType === 'boundary' ? 6 : 6)
          )}
          
          {/* Mått-labels för linjer */}
          {showMeasurements && visibleLayers.lines && markers.filter(m => m.isLine && visibleLines[m.lineType]).map(m => {
            const midIndex = Math.floor(m.path.length / 2);
            const midPoint = m.path[midIndex];
            const length = calculateLength(m.path);
            return (
              <g key={`measure-${m.id}`}>
                <rect
                  x={midPoint.x - 30}
                  y={midPoint.y - 25}
                  width={60}
                  height={20}
                  rx={10}
                  fill="rgba(0,0,0,0.8)"
                />
                <text
                  x={midPoint.x}
                  y={midPoint.y - 12}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="600"
                  fill="#fff"
                  style={{ pointerEvents: 'none' }}
                >
                  {formatLength(length)}
                </text>
              </g>
            );
          })}
          
          {/* Pågående linje */}
          {isDrawMode && currentPath.length > 0 && (
            <path
              d={createSmoothPath(currentPath)}
              fill="none"
              stroke={lineTypes.find(t => t.id === drawType)?.color || '#fff'}
              strokeWidth={4}
              strokeDasharray="8,8"
            />
          )}
          
          {/* Mätlinje - ritas nu utanför transform så den alltid syns där man drar */}
          
          {/* Markeringar (inte foton) */}
          {visibleLayers.symbols && markers.filter(m => m.isMarker).map(m => {
            const type = markerTypes.find(t => t.id === m.type);
            const isMenuOpen = markerMenuOpen === m.id;
            const isDragging = draggingMarker === m.id;
            const opacity = getMarkerOpacity({ x: m.x, y: m.y, id: m.id });
            const isAcknowledged = acknowledgedWarnings.includes(m.id);
            return (
              <g 
                key={m.id} 
                onMouseDown={(e) => handleMarkerDragStart(e, m)}
                onTouchStart={(e) => handleMarkerDragStart(e, m)}
                style={{ 
                  cursor: isDragging ? 'grabbing' : 'pointer',
                  opacity: opacity,
                  transition: 'opacity 0.3s ease',
                }}
              >
                {/* Skugga när man drar */}
                {isDragging && hasMoved && (
                  <circle cx={m.x} cy={m.y + 4} r={26} fill="rgba(0,0,0,0.3)" />
                )}
                {/* Grön ring om kvitterad */}
                {isAcknowledged && drivingMode && (
                  <circle cx={m.x} cy={m.y} r={30} fill="none" stroke="#22c55e" strokeWidth={3} />
                )}
                <circle 
                  cx={m.x} 
                  cy={m.y} 
                  r={isDragging && hasMoved ? 26 : 22} 
                  fill={isDragging && hasMoved ? colors.blue : isMenuOpen ? 'rgba(10,132,255,0.3)' : 'rgba(0,0,0,0.5)'} 
                  stroke={isDragging && hasMoved ? '#fff' : isMenuOpen ? colors.blue : 'transparent'} 
                  strokeWidth={2}
                  style={{ transition: isDragging ? 'none' : 'all 0.2s ease' }}
                />
                <text x={m.x} y={m.y} textAnchor="middle" dominantBaseline="central" fontSize={isDragging && hasMoved ? '28' : '24'} style={{ pointerEvents: 'none', transition: 'font-size 0.2s ease' }}>
                  {type?.icon || '📍'}
                </text>
                {/* Foto-indikator */}
                {m.photoData && (
                  <>
                    <circle cx={m.x + 16} cy={m.y - 16} r={10} fill="#22c55e" stroke="#fff" strokeWidth={2} />
                    <text x={m.x + 16} y={m.y - 16} textAnchor="middle" dominantBaseline="central" fontSize="10" style={{ pointerEvents: 'none' }}>
                      📷
                    </text>
                  </>
                )}
              </g>
            );
          })}
          
          {/* Pilar */}
          {visibleLayers.arrows && markers.filter(m => m.isArrow).map(m => {
            const arrow = arrowTypes.find(t => t.id === m.arrowType);
            const isDragging = draggingMarker === m.id;
            const opacity = getMarkerOpacity({ x: m.x, y: m.y, id: m.id });
            const isAcknowledged = acknowledgedWarnings.includes(m.id);
            return (
              <g key={m.id} style={{ opacity: opacity, transition: 'opacity 0.3s ease' }}>
                {/* Grön ring om kvitterad */}
                {isAcknowledged && drivingMode && (
                  <circle cx={m.x} cy={m.y} r={30} fill="none" stroke="#22c55e" strokeWidth={3} />
                )}
                <g 
                  transform={`translate(${m.x}, ${m.y}) rotate(${m.rotation || 0})`}
                  onMouseDown={(e) => handleMarkerDragStart(e, m)}
                  onTouchStart={(e) => handleMarkerDragStart(e, m)}
                  style={{ cursor: isDragging ? 'grabbing' : 'pointer' }}
                >
                  {isDragging && hasMoved && (
                    <circle cx={0} cy={0} r={35} fill="rgba(0,0,0,0.3)" />
                  )}
                  {/* Pilskaft */}
                  <line 
                    x1={0} y1={20} x2={0} y2={-10}
                    stroke={arrow?.color || '#fff'}
                    strokeWidth={isDragging && hasMoved ? 5 : 4}
                    strokeLinecap="round"
                  />
                  {/* Pilspets */}
                  <path 
                    d="M0,-20 L10,-5 L0,-10 L-10,-5 Z"
                    fill={arrow?.color || '#fff'}
                    stroke={isDragging && hasMoved ? '#fff' : 'rgba(0,0,0,0.5)'}
                    strokeWidth={1}
                    style={{ transform: isDragging && hasMoved ? 'scale(1.2)' : 'scale(1)', transition: isDragging ? 'none' : 'transform 0.2s ease' }}
                  />
                </g>
                {/* Foto-indikator (utanför rotation) */}
                {m.photoData && (
                  <>
                    <circle cx={m.x + 18} cy={m.y - 18} r={10} fill="#22c55e" stroke="#fff" strokeWidth={2} />
                    <text x={m.x + 18} y={m.y - 18} textAnchor="middle" dominantBaseline="central" fontSize="10" style={{ pointerEvents: 'none' }}>
                      📷
                    </text>
                  </>
                )}
              </g>
            );
          })}
          
          {/* Klickbara linjer (osynlig hitbox) */}
          {visibleLayers.lines && markers.filter(m => m.isLine && visibleLines[m.lineType]).map(m => (
            <path 
              key={`click-${m.id}`}
              d={m.path.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')} 
              fill="none" 
              stroke="transparent" 
              strokeWidth="30"
              style={{ cursor: 'pointer' }}
              onClick={(e) => handleMarkerClick(e, m)}
            />
          ))}
          
          {/* Klickbara zoner (osynlig hitbox) */}
          {visibleLayers.zones && markers.filter(m => m.isZone && visibleZones[m.zoneType]).map(m => (
            <path 
              key={`click-zone-${m.id}`}
              d={m.path.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'} 
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onClick={(e) => handleMarkerClick(e, m)}
            />
          ))}

          {/* GPS-spårad linje (live) */}
          {gpsLineType && gpsPath.length > 1 && (
            <path
              d={gpsPath.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
              fill="none"
              stroke={lineTypes.find(t => t.id === gpsLineType)?.color || '#fff'}
              strokeWidth={4}
              strokeDasharray="8,8"
              style={{ animation: 'pulse 1s infinite' }}
            />
          )}

          {/* GPS position med ljuskägla */}
          {isTracking && currentPosition && (
            <g>
              {/* Ljuskägla - visar riktning när kompass är på */}
              {compassMode && (
                <path
                  d={`M ${gpsMapPosition.x} ${gpsMapPosition.y} 
                      L ${gpsMapPosition.x + Math.sin((deviceHeading - 30) * Math.PI / 180) * 80} ${gpsMapPosition.y - Math.cos((deviceHeading - 30) * Math.PI / 180) * 80}
                      A 80 80 0 0 1 ${gpsMapPosition.x + Math.sin((deviceHeading + 30) * Math.PI / 180) * 80} ${gpsMapPosition.y - Math.cos((deviceHeading + 30) * Math.PI / 180) * 80}
                      Z`}
                  fill="url(#viewConeGradient)"
                  opacity={0.6}
                />
              )}
              {/* GPS-prick */}
              <circle 
                cx={gpsMapPosition.x} cy={gpsMapPosition.y} r={12} 
                fill={colors.blue} 
                stroke="#fff" 
                strokeWidth={3}
                style={{ animation: 'pulse 1.5s infinite' }}
              />
              {/* Riktningspil när kompass är på */}
              {compassMode && (
                <path
                  d={`M ${gpsMapPosition.x} ${gpsMapPosition.y - 18} 
                      L ${gpsMapPosition.x - 6} ${gpsMapPosition.y - 8} 
                      L ${gpsMapPosition.x + 6} ${gpsMapPosition.y - 8} Z`}
                  fill="#fff"
                  transform={`rotate(${deviceHeading}, ${gpsMapPosition.x}, ${gpsMapPosition.y})`}
                />
              )}
            </g>
          )}
          
          {/* Rotationsindikator */}
          {rotatingArrow && (() => {
            const arrow = markers.find(m => m.id === rotatingArrow);
            if (!arrow) return null;
            return (
              <g>
                {/* Yttre cirkel */}
                <circle 
                  cx={arrow.x} 
                  cy={arrow.y} 
                  r={60} 
                  fill="none"
                  stroke={colors.blue}
                  strokeWidth={2}
                  strokeDasharray="8,4"
                  opacity={0.5}
                />
                {/* Riktningslinje */}
                <line
                  x1={arrow.x}
                  y1={arrow.y}
                  x2={arrow.x + Math.sin((arrow.rotation || 0) * Math.PI / 180) * 55}
                  y2={arrow.y - Math.cos((arrow.rotation || 0) * Math.PI / 180) * 55}
                  stroke={colors.blue}
                  strokeWidth={3}
                  strokeLinecap="round"
                />
                {/* Center dot */}
                <circle 
                  cx={arrow.x} 
                  cy={arrow.y} 
                  r={6} 
                  fill={colors.blue}
                />
              </g>
            );
          })()}
          
          {/* Ritmarkör - visar var linjen ritas */}
          {isDrawing && drawCursor && (
            <g>
              {/* Yttre ring */}
              <circle 
                cx={drawCursor.x} 
                cy={drawCursor.y} 
                r={16} 
                fill="none"
                stroke={isDrawMode ? lineTypes.find(t => t.id === drawType)?.color : zoneTypes.find(t => t.id === zoneType)?.color}
                strokeWidth={2}
                opacity={0.8}
              />
              {/* Inre prick */}
              <circle 
                cx={drawCursor.x} 
                cy={drawCursor.y} 
                r={4} 
                fill={isDrawMode ? lineTypes.find(t => t.id === drawType)?.color : zoneTypes.find(t => t.id === zoneType)?.color}
              />
              {/* Linje från finger till markör (bara touch) */}
              <line
                x1={drawCursor.x}
                y1={drawCursor.y}
                x2={drawCursor.x}
                y2={drawCursor.y + drawOffset / zoom}
                stroke="rgba(255,255,255,0.3)"
                strokeWidth={1}
                strokeDasharray="4,4"
              />
            </g>
          )}
          
          {/* Mätmarkör - visar var man mäter */}
          {isMeasuring && drawCursor && (
            <g>
              {/* Yttre ring */}
              <circle 
                cx={drawCursor.x} 
                cy={drawCursor.y} 
                r={18} 
                fill="none"
                stroke={colors.blue}
                strokeWidth={3}
                opacity={0.9}
              />
              {/* Inre prick */}
              <circle 
                cx={drawCursor.x} 
                cy={drawCursor.y} 
                r={5} 
                fill={colors.blue}
              />
              {/* Linje från finger till markör */}
              <line
                x1={drawCursor.x}
                y1={drawCursor.y}
                x2={drawCursor.x}
                y2={drawCursor.y + drawOffset / zoom}
                stroke="rgba(255,255,255,0.4)"
                strokeWidth={2}
                strokeDasharray="6,4"
              />
            </g>
          )}
        </g>
        </g>
        </g>
      </svg>
      
      {/* === MÄTLINJE OVERLAY - ritas direkt på skärmen === */}
      {measureMode && measurePath.length > 0 && (
        <svg
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 100,
          }}
        >
          {/* Linjen */}
          {measurePath.length > 1 && (
            <path
              d={measurePath.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
              fill="none"
              stroke="#0a84ff"
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}
            />
          )}
          
          {/* Startpunkt */}
          <circle 
            cx={measurePath[0].x} 
            cy={measurePath[0].y} 
            r={12} 
            fill="#0a84ff" 
            stroke="#fff" 
            strokeWidth={3} 
          />
          
          {/* Slutpunkt + mått */}
          {measurePath.length > 1 && (() => {
            const end = measurePath[measurePath.length - 1];
            const len = calculateLength(measurePath);
            const txt = formatLength(len);
            return (
              <>
                {/* Pulsande ring runt slutpunkten - visar att man kan fortsätta */}
                {!isMeasuring && (
                  <circle 
                    cx={end.x} 
                    cy={end.y} 
                    r={25} 
                    fill="none"
                    stroke="#0a84ff"
                    strokeWidth={2}
                    opacity={0.5}
                    style={{ animation: 'pulse 1.5s infinite' }}
                  />
                )}
                <circle cx={end.x} cy={end.y} r={14} fill="#0a84ff" stroke="#fff" strokeWidth={3} />
                <rect
                  x={end.x - 50}
                  y={end.y - 48}
                  width={100}
                  height={32}
                  rx={16}
                  fill="#0a84ff"
                  style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))' }}
                />
                <text
                  x={end.x}
                  y={end.y - 27}
                  textAnchor="middle"
                  fontSize="18"
                  fontWeight="700"
                  fill="#fff"
                >
                  {txt}
                </text>
              </>
            );
          })()}
        </svg>
      )}

      {/* === YTMÄTNING OVERLAY === */}
      {measureAreaMode && measurePath.length > 0 && (
        <svg
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 100,
          }}
        >
          {/* Fylld polygon */}
          {measurePath.length > 2 && (
            <path
              d={measurePath.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'}
              fill="rgba(34, 197, 94, 0.3)"
              stroke="#22c55e"
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}
            />
          )}
          
          {/* Linje om bara 2 punkter */}
          {measurePath.length === 2 && (
            <path
              d={`M ${measurePath[0].x} ${measurePath[0].y} L ${measurePath[1].x} ${measurePath[1].y}`}
              fill="none"
              stroke="#22c55e"
              strokeWidth={4}
              strokeLinecap="round"
            />
          )}
          
          {/* Startpunkt */}
          <circle 
            cx={measurePath[0].x} 
            cy={measurePath[0].y} 
            r={12} 
            fill="#22c55e" 
            stroke="#fff" 
            strokeWidth={3} 
          />
          
          {/* Slutpunkt + area-mått */}
          {measurePath.length > 2 && (() => {
            // Beräkna area (Shoelace formula) - konvertera pixlar till meter
            const pixelArea = Math.abs(measurePath.reduce((sum, p, i) => {
              const next = measurePath[(i + 1) % measurePath.length];
              return sum + (p.x * next.y) - (next.x * p.y);
            }, 0) / 2);
            
            // Konvertera till m² och sedan till ha (1 ha = 10000 m²)
            // scale = meter per pixel
            const areaM2 = pixelArea * scale * scale;
            const areaHa = areaM2 / 10000;
            
            const txt = areaHa >= 0.01 ? `${areaHa.toFixed(2)} ha` : `${Math.round(areaM2)} m²`;
            
            // Hitta mittpunkt för att visa texten
            const centerX = measurePath.reduce((sum, p) => sum + p.x, 0) / measurePath.length;
            const centerY = measurePath.reduce((sum, p) => sum + p.y, 0) / measurePath.length;
            
            const end = measurePath[measurePath.length - 1];
            
            return (
              <>
                {/* Pulsande ring runt slutpunkten */}
                {!isMeasuring && (
                  <circle 
                    cx={end.x} 
                    cy={end.y} 
                    r={25} 
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth={2}
                    opacity={0.5}
                    style={{ animation: 'pulse 1.5s infinite' }}
                  />
                )}
                <circle cx={end.x} cy={end.y} r={14} fill="#22c55e" stroke="#fff" strokeWidth={3} />
                
                {/* Area-etikett i mitten */}
                <rect
                  x={centerX - 55}
                  y={centerY - 18}
                  width={110}
                  height={36}
                  rx={18}
                  fill="#22c55e"
                  style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))' }}
                />
                <text
                  x={centerX}
                  y={centerY + 6}
                  textAnchor="middle"
                  fontSize="18"
                  fontWeight="700"
                  fill="#fff"
                >
                  {txt}
                </text>
              </>
            );
          })()}
        </svg>
      )}
      {/* === ZOOM-KNAPPAR (behålls) === */}
      <div style={{
        position: 'absolute',
        top: '120px',
        left: '15px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        zIndex: 120,
      }}>
        <button
          onClick={zoomIn}
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            border: 'none',
            background: 'rgba(28,28,30,0.8)',
            color: '#fff',
            fontSize: '20px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(10px)',
          }}
        >
          +
        </button>
        <button
          onClick={zoomOut}
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            border: 'none',
            background: 'rgba(28,28,30,0.8)',
            color: '#fff',
            fontSize: '20px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(10px)',
          }}
        >
          −
        </button>
      </div>

      {/* === KOMPASS-WIDGET (vänster nere) === */}
      {compassMode && (
        <div style={{
          position: 'absolute',
          bottom: menuOpen ? menuHeight + 110 : 100,
          left: '15px',
          width: '56px',
          height: '56px',
          background: 'rgba(0,0,0,0.9)',
          borderRadius: '16px',
          border: '1px solid rgba(255,255,255,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
          zIndex: 150,
          transition: 'bottom 0.3s ease',
        }}>
          <svg 
            width="40" 
            height="40" 
            viewBox="0 0 24 24"
            style={{ 
              transform: `rotate(${-deviceHeading}deg)`,
              transition: 'transform 0.1s ease-out',
            }}
          >
            <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"/>
            <path d="M12 3 L14.5 12 L12 10 L9.5 12 Z" fill="#ef4444"/>
            <path d="M12 21 L14.5 12 L12 14 L9.5 12 Z" fill="rgba(255,255,255,0.5)"/>
            <circle cx="12" cy="12" r="2" fill="#0a84ff"/>
          </svg>
          <span style={{
            position: 'absolute',
            top: '4px',
            fontSize: '8px',
            color: '#ef4444',
            fontWeight: '700',
          }}>N</span>
        </div>
      )}

      {/* === ÅNGRA-KNAPP === */}
      {showUndo && history.length > 0 && (
        <button
          onClick={undo}
          style={{
            position: 'absolute',
            top: '120px',
            right: '15px',
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            border: 'none',
            background: 'rgba(28,28,30,0.8)',
            color: '#fff',
            fontSize: '18px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 15px rgba(0,0,0,0.4)',
            zIndex: 120,
            backdropFilter: 'blur(10px)',
          }}
        >
          ↩️
        </button>
      )}
      
      {/* === FLYTTA-INDIKATOR === */}
      {draggingMarker && hasMoved && (
        <div style={{
          position: 'absolute',
          top: '120px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: colors.blue,
          color: '#fff',
          padding: '10px 20px',
          borderRadius: '20px',
          fontSize: '14px',
          fontWeight: '600',
          zIndex: 150,
          animation: 'fadeIn 0.2s ease',
          boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
        }}>
          Släpp för att placera
        </div>
      )}
      
      {/* === ROTERA-INDIKATOR === */}
      {rotatingArrow && (
        <div style={{
          position: 'absolute',
          top: '120px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: colors.blue,
          color: '#fff',
          padding: '12px 24px',
          borderRadius: '20px',
          fontSize: '14px',
          fontWeight: '600',
          zIndex: 150,
          animation: 'fadeIn 0.2s ease',
          boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '24px', marginBottom: '4px' }}>
            {Math.round(((markers.find(m => m.id === rotatingArrow)?.rotation || 0) % 360 + 360) % 360)}°
          </div>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>Dra runt pilen • Släpp för att spara</div>
        </div>
      )}

      {/* === MARKERING MENY (popup) === */}
      {markerMenuOpen && (() => {
        const marker = markers.find(m => m.id === markerMenuOpen);
        if (!marker) return null;
        
        const getMarkerName = () => {
          if (marker.isMarker) return markerTypes.find(t => t.id === marker.type)?.name || 'Markering';
          if (marker.isLine) return lineTypes.find(t => t.id === marker.lineType)?.name || 'Linje';
          if (marker.isZone) return zoneTypes.find(t => t.id === marker.zoneType)?.name || 'Zon';
          if (marker.isArrow) return arrowTypes.find(t => t.id === marker.arrowType)?.name || 'Pil';
          return 'Objekt';
        };
        
        const getMarkerIcon = () => {
          if (marker.isMarker) return markerTypes.find(t => t.id === marker.type)?.icon || '📍';
          if (marker.isZone) return zoneTypes.find(t => t.id === marker.zoneType)?.icon || '⬡';
          if (marker.isArrow) return arrowTypes.find(t => t.id === marker.arrowType)?.icon || '➡️';
          return '📍';
        };
        
        return (
          <div 
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 300,
            }}
            onClick={() => setMarkerMenuOpen(null)}
          >
            <div 
              style={{
                background: '#000',
                borderRadius: '24px',
                padding: '28px',
                width: '90%',
                maxWidth: '340px',
                boxShadow: '0 12px 60px rgba(0,0,0,0.9)',
                border: '1px solid rgba(255,255,255,0.15)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header med ikon och namn */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                marginBottom: '20px',
              }}>
                <span style={{ fontSize: '32px' }}>{getMarkerIcon()}</span>
                <span style={{ fontSize: '20px', fontWeight: '600', color: '#fff' }}>{getMarkerName()}</span>
              </div>
              
              {/* Foto - klickbart för fullskärm */}
              {marker.photoData && (
                <div style={{
                  marginBottom: '16px',
                  borderRadius: '16px',
                  overflow: 'hidden',
                }}>
                  <img 
                    src={marker.photoData} 
                    alt="Foto"
                    onClick={() => setFullscreenPhoto(marker.photoData || null)}
                    style={{
                      width: '100%',
                      maxHeight: '220px',
                      objectFit: 'cover',
                      display: 'block',
                      cursor: 'pointer',
                    }}
                  />
                </div>
              )}
            
            {/* Kommentar */}
            {marker.comment ? (
              <div style={{ 
                fontSize: '18px', 
                color: '#fff',
                fontWeight: '500',
                textAlign: 'center',
                padding: '16px',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: '12px',
                lineHeight: '1.5',
              }}>
                {marker.comment}
              </div>
            ) : (
              <div style={{ 
                fontSize: '16px', 
                color: 'rgba(255,255,255,0.3)',
                textAlign: 'center',
                fontStyle: 'italic',
              }}>
                Ingen kommentar
              </div>
            )}
            
            {/* Åtgärder */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '16px',
              marginTop: '24px',
              paddingTop: '20px',
              borderTop: '1px solid rgba(255,255,255,0.08)',
            }}>
              {/* Rotera - bara för pilar */}
              {marker.isArrow && (
                <button
                  onClick={() => startRotatingArrow(marker.id, marker.x, marker.y)}
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '24px',
                    border: 'none',
                    background: 'rgba(255,255,255,0.08)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2">
                    <path d="M23 4v6h-6M1 20v-6h6" />
                    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                  </svg>
                </button>
              )}
              
              {/* Förläng - bara för linjer */}
              {marker.isLine && (
                <button
                  onClick={() => {
                    setCurrentPath([...marker.path]);
                    setDrawType(marker.lineType);
                    setIsDrawMode(true);
                    setDrawPaused(true);
                    saveToHistory([...markers]);
                    setMarkers(prev => prev.filter(m => m.id !== marker.id));
                    setMarkerMenuOpen(null);
                  }}
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '24px',
                    border: 'none',
                    background: 'rgba(255,255,255,0.08)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              )}
              
              {/* Ta foto - för alla typer */}
              <button
                onClick={() => {
                  setPendingPhotoMarkerId(marker.id);
                  fileInputRef.current?.click();
                }}
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '24px',
                  border: 'none',
                  background: marker.photoData ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.08)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={marker.photoData ? '#22c55e' : 'rgba(255,255,255,0.5)'} strokeWidth="2">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </button>
              
              {/* Redigera kommentar */}
              <button
                onClick={() => {
                  setEditingMarker({ ...marker });
                  setMarkerMenuOpen(null);
                }}
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '24px',
                  border: 'none',
                  background: 'rgba(255,255,255,0.08)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2">
                  <path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </button>
              
              {/* Radera */}
              <button
                onClick={() => deleteMarker(marker.id)}
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '24px',
                  border: 'none',
                  background: 'rgba(255,255,255,0.08)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.6)" strokeWidth="2">
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* === MÄTNINGS-INDIKATOR === */}
      {measureMode && !isMeasuring && (
        <div style={{
          position: 'absolute',
          bottom: menuHeight + 130,
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#0a84ff',
          padding: '14px 24px',
          borderRadius: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          zIndex: 200,
        }}>
          <span style={{ fontSize: '13px', color: '#fff' }}>
            📏 {measurePath.length > 1 ? 'Dra från ● för att fortsätta' : 'Dra för att mäta'}
          </span>
          {measurePath.length > 1 && (
            <button
              onClick={() => setMeasurePath([])}
              style={{
                padding: '8px 12px',
                borderRadius: '10px',
                border: 'none',
                background: 'rgba(255,255,255,0.15)',
                color: '#fff',
                fontWeight: '600',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Börja om
            </button>
          )}
          <button
            onClick={() => {
              setMeasureMode(false);
              setMeasurePath([]);
              setIsMeasuring(false);
            }}
            style={{
              padding: '8px 16px',
              borderRadius: '10px',
              border: 'none',
              background: 'rgba(255,255,255,0.25)',
              color: '#fff',
              fontWeight: '600',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Klar
          </button>
        </div>
      )}

      {/* === YTMÄTNINGS-INDIKATOR === */}
      {measureAreaMode && !isMeasuring && (
        <div style={{
          position: 'absolute',
          bottom: menuHeight + 130,
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#22c55e',
          padding: '14px 24px',
          borderRadius: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          zIndex: 200,
        }}>
          <span style={{ fontSize: '13px', color: '#fff' }}>
            📐 {measurePath.length > 2 ? 'Dra från ● för att fortsätta' : 'Dra för att mäta yta'}
          </span>
          {measurePath.length > 2 && (
            <button
              onClick={() => setMeasurePath([])}
              style={{
                padding: '8px 12px',
                borderRadius: '10px',
                border: 'none',
                background: 'rgba(255,255,255,0.15)',
                color: '#fff',
                fontWeight: '600',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Börja om
            </button>
          )}
          <button
            onClick={() => {
              setMeasureAreaMode(false);
              setMeasurePath([]);
              setIsMeasuring(false);
            }}
            style={{
              padding: '8px 16px',
              borderRadius: '10px',
              border: 'none',
              background: 'rgba(255,255,255,0.25)',
              color: '#fff',
              fontWeight: '600',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Klar
          </button>
        </div>
      )}

      {/* === GPS-SPÅRNINGS-INDIKATOR === */}
      {gpsLineType && isTracking && (
        <div style={{
          position: 'absolute',
          bottom: menuHeight + 130,
          left: '50%',
          transform: 'translateX(-50%)',
          background: gpsPaused ? colors.orange : lineTypes.find(t => t.id === gpsLineType)?.color || colors.blue,
          padding: '14px 24px',
          borderRadius: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          zIndex: 200,
        }}>
          <span style={{ 
            fontSize: '13px', 
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <span style={{ 
              width: '10px', 
              height: '10px', 
              borderRadius: gpsPaused ? '2px' : '50%', 
              background: '#fff',
              animation: gpsPaused ? 'none' : 'pulse 1s infinite',
            }} />
            {gpsPaused ? 'Pausad' : `Spårar ${lineTypes.find(t => t.id === gpsLineType)?.name}`} ({gpsPath.length} punkter)
          </span>
          <button
            onClick={toggleGpsPause}
            style={{
              padding: '8px 14px',
              borderRadius: '10px',
              border: 'none',
              background: gpsPaused ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.15)',
              color: '#fff',
              fontWeight: '600',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {gpsPaused ? '▶' : '⏸'} {gpsPaused ? 'Fortsätt' : 'Paus'}
          </button>
          <button
            onClick={() => stopGpsTracking(false)}
            style={{
              padding: '8px 12px',
              borderRadius: '10px',
              border: 'none',
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              fontWeight: '600',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Avbryt
          </button>
          <button
            onClick={() => stopGpsTracking(true)}
            style={{
              padding: '8px 16px',
              borderRadius: '10px',
              border: 'none',
              background: 'rgba(255,255,255,0.25)',
              color: '#fff',
              fontWeight: '600',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            ✓ Spara
          </button>
        </div>
      )}

      {/* === AKTIV RITNING INDIKATOR === */}
      {(isDrawMode || isZoneMode || isArrowMode || selectedSymbol) && !isDrawing && (
        <div style={{
          position: 'absolute',
          bottom: menuHeight + 130,
          left: '50%',
          transform: 'translateX(-50%)',
          background: drawPaused ? colors.blue : colors.surface,
          padding: '12px 20px',
          borderRadius: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}>
          {/* Instruktion */}
          <span style={{ fontSize: '14px', color: drawPaused ? '#fff' : colors.textMuted }}>
            {selectedSymbol && `Tryck för att placera`}
            {(isDrawMode || isZoneMode) && !drawPaused && currentPath.length === 0 && `Dra för att rita`}
            {(isDrawMode || isZoneMode) && drawPaused && `Fortsätt eller`}
            {isArrowMode && `Tryck för att placera`}
          </span>
          
          {/* Ångra senaste bit - visas när man har ritat något */}
          {(isDrawMode || isZoneMode) && currentPath.length > 1 && (
            <button
              onClick={undoLastSegment}
              style={{
                padding: '8px 12px',
                borderRadius: '12px',
                border: 'none',
                background: drawPaused ? 'rgba(255,255,255,0.2)' : colors.surfaceLight,
                color: drawPaused ? '#fff' : colors.text,
                fontWeight: '600',
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              ↩
            </button>
          )}
          
          {/* Klar-knapp när man har en linje */}
          {(isDrawMode || isZoneMode) && currentPath.length > 1 && (
            <button
              onClick={() => isDrawMode ? finishLine() : finishZone()}
              style={{
                padding: '8px 16px',
                borderRadius: '12px',
                border: 'none',
                background: colors.green,
                color: '#000',
                fontWeight: '600',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              ✓
            </button>
          )}
          
          {/* Avbryt-knapp */}
          <button
            onClick={cancelDrawing}
            style={{
              padding: '8px 12px',
              borderRadius: '12px',
              border: 'none',
              background: drawPaused ? 'rgba(255,255,255,0.2)' : colors.surfaceLight,
              color: drawPaused ? '#fff' : colors.text,
              fontWeight: '600',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
      )}
      
      {/* === RITAR JUST NU === */}
      {isDrawing && (
        <div style={{
          position: 'absolute',
          top: '120px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: colors.green,
          color: '#000',
          padding: '10px 20px',
          borderRadius: '20px',
          fontSize: '14px',
          fontWeight: '600',
          zIndex: 150,
          boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
          textAlign: 'center',
        }}>
          <div>Ritar ovanför fingret ↑</div>
          <div style={{ fontSize: '12px', fontWeight: '400', opacity: 0.8 }}>Släpp för att avsluta</div>
        </div>
      )}
      
      {/* === MÄTER JUST NU === */}
      {isMeasuring && (
        <div style={{
          position: 'absolute',
          top: '120px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: colors.blue,
          color: '#fff',
          padding: '12px 24px',
          borderRadius: '20px',
          fontSize: '14px',
          fontWeight: '600',
          zIndex: 150,
          boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '28px', fontWeight: '700', marginBottom: '4px' }}>
            {formatLength(calculateLength(measurePath))}
          </div>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>Släpp för att mäta</div>
        </div>
      )}

      {/* === BOTTOM SHEET MENY === */}
      <div style={{
        position: 'absolute',
        bottom: 30,
        left: 0,
        right: 0,
        height: menuHeight + 50,
        background: menuOpen ? '#000' : 'transparent',
        borderRadius: '24px 24px 0 0',
        transition: 'height 0.3s ease',
        zIndex: 200,
        borderTop: menuOpen ? '1px solid rgba(255,255,255,0.1)' : 'none',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
        {/* Handtag / Pil */}
        <div 
          onClick={(e) => {
            e.stopPropagation();
            if (menuOpen) {
              setMenuHeight(0);
              setMenuOpen(false);
            } else {
              openMenu();
            }
          }}
          style={{
            height: '50px',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {/* Gradient-linje när stängd */}
          {!menuOpen && (
            <div style={{
              width: '100%',
              height: '1px',
              background: 'linear-gradient(90deg, transparent 10%, rgba(255,255,255,0.25) 50%, transparent 90%)',
              position: 'absolute',
              top: 0,
            }} />
          )}
          
          {menuOpen ? (
            // Pil ner för att stänga - tydlig
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          ) : (
            // Pil upp - synlig
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 15l6-6 6 6" />
            </svg>
          )}
        </div>

        {/* Meny innehåll */}
        {menuOpen && (
          <div style={{ padding: '0 20px', overflow: 'auto', height: menuHeight - 20 }}>
            
            {/* Tabs - med ikoner */}
            <div style={{
              display: 'flex',
              gap: '4px',
              marginBottom: '16px',
              paddingBottom: '12px',
              borderBottom: '1px solid rgba(255,255,255,0.1)',
            }}>
              {[
                { id: 'symbols', name: 'Symboler', icon: '📍' },
                { id: 'lines', name: 'Linjer', icon: '〰️' },
                { id: 'zones', name: 'Zoner', icon: '⬡' },
                { id: 'arrows', name: 'Pilar', icon: '➡️' },
                { id: 'tools', name: 'Verktyg', icon: '⚙️' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setMenuTab(tab.id);
                    setSubMenu(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '8px 4px',
                    border: 'none',
                    background: menuTab === tab.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '3px',
                  }}
                >
                  <span style={{ fontSize: '16px' }}>{tab.icon}</span>
                  <span style={{ 
                    fontSize: '10px', 
                    color: menuTab === tab.id ? '#fff' : 'rgba(255,255,255,0.4)',
                    fontWeight: menuTab === tab.id ? '600' : '400',
                  }}>
                    {tab.name}
                  </span>
                </button>
              ))}
            </div>

            {/* Symboler - meny i meny */}
            {menuTab === 'symbols' && !subMenu && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {symbolCategories.map(category => (
                  <button
                    key={category.name}
                    onClick={() => setSubMenu(category.name)}
                    style={{
                      padding: '14px 16px',
                      background: 'rgba(255,255,255,0.06)',
                      borderRadius: '14px',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                    }}
                  >
                    <div style={{
                      width: '44px',
                      height: '44px',
                      background: 'rgba(255,255,255,0.08)',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '22px',
                    }}>
                      {category.symbols[0]?.icon || '📍'}
                    </div>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontSize: '15px', color: '#fff', fontWeight: '500' }}>
                        {category.name}
                      </div>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                        {category.symbols.length} symboler
                      </div>
                    </div>
                    <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '20px' }}>›</span>
                  </button>
                ))}
              </div>
            )}

            {/* Symboler - vald kategori */}
            {menuTab === 'symbols' && subMenu && (
              <div>
                {/* Bakåt-knapp */}
                <button
                  onClick={() => setSubMenu(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 0',
                    marginBottom: '12px',
                    background: 'none',
                    border: 'none',
                    color: '#0a84ff',
                    fontSize: '14px',
                    cursor: 'pointer',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                  Tillbaka
                </button>
                
                {/* Kategori-titel */}
                <div style={{ 
                  fontSize: '16px', 
                  fontWeight: '600', 
                  color: '#fff',
                  marginBottom: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}>
                  <span>{symbolCategories.find(c => c.name === subMenu)?.symbols[0]?.icon}</span>
                  {subMenu}
                </div>
                
                {/* Symbol-grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  {symbolCategories.find(c => c.name === subMenu)?.symbols.map(type => (
                    <button
                      key={type.id}
                      onClick={() => {
                        setSelectedSymbol(type.id);
                        setMenuOpen(false);
                        setMenuHeight(0);
                        setSubMenu(null);
                      }}
                      style={{
                        padding: '14px 8px',
                        borderRadius: '12px',
                        border: 'none',
                        background: 'rgba(255,255,255,0.06)',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <span style={{ fontSize: '26px' }}>{type.icon}</span>
                      <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>{type.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Linjer - meny i meny */}
            {menuTab === 'lines' && !subMenu && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  onClick={() => setSubMenu('gps-lines')}
                  style={{
                    padding: '14px 16px',
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: '14px',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <div style={{
                    width: '44px',
                    height: '44px',
                    background: 'rgba(34,197,94,0.2)',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                  }}>
                    📍
                  </div>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontSize: '15px', color: '#fff', fontWeight: '500' }}>
                      Spåra med GPS
                    </div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                      Gå och rita linje
                    </div>
                  </div>
                  <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '20px' }}>›</span>
                </button>
                
                <button
                  onClick={() => setSubMenu('draw-lines')}
                  style={{
                    padding: '14px 16px',
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: '14px',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <div style={{
                    width: '44px',
                    height: '44px',
                    background: 'rgba(10,132,255,0.2)',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                  }}>
                    ✏️
                  </div>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontSize: '15px', color: '#fff', fontWeight: '500' }}>
                      Rita manuellt
                    </div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                      Rita på kartan
                    </div>
                  </div>
                  <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '20px' }}>›</span>
                </button>
              </div>
            )}

            {/* Linjer - GPS-spåra */}
            {menuTab === 'lines' && subMenu === 'gps-lines' && (
              <div>
                <button
                  onClick={() => setSubMenu(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 0',
                    marginBottom: '12px',
                    background: 'none',
                    border: 'none',
                    color: '#0a84ff',
                    fontSize: '14px',
                    cursor: 'pointer',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                  Tillbaka
                </button>
                
                <div style={{ fontSize: '16px', fontWeight: '600', color: '#fff', marginBottom: '14px' }}>
                  📍 Spåra med GPS
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {lineTypes.map(type => (
                    <button
                      key={`gps-${type.id}`}
                      onClick={() => {
                        startGpsTracking(type.id);
                        setSubMenu(null);
                      }}
                      style={{
                        padding: '14px 16px',
                        borderRadius: '12px',
                        background: 'rgba(255,255,255,0.06)',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                      }}
                    >
                      <div style={{
                        width: '28px',
                        height: '4px',
                        borderRadius: '2px',
                        background: type.striped 
                          ? `repeating-linear-gradient(90deg, ${type.color} 0px, ${type.color} 4px, ${type.color2} 4px, ${type.color2} 8px)`
                          : type.color,
                      }} />
                      <span style={{ fontSize: '15px', color: '#fff' }}>{type.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Linjer - Rita manuellt */}
            {menuTab === 'lines' && subMenu === 'draw-lines' && (
              <div>
                <button
                  onClick={() => setSubMenu(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 0',
                    marginBottom: '12px',
                    background: 'none',
                    border: 'none',
                    color: '#0a84ff',
                    fontSize: '14px',
                    cursor: 'pointer',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                  Tillbaka
                </button>
                
                <div style={{ fontSize: '16px', fontWeight: '600', color: '#fff', marginBottom: '14px' }}>
                  ✏️ Rita manuellt
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {lineTypes.map(type => (
                    <button
                      key={type.id}
                      onClick={() => {
                        setDrawType(type.id);
                        setIsDrawMode(true);
                        setMenuOpen(false);
                        setMenuHeight(0);
                        setSubMenu(null);
                      }}
                      style={{
                        padding: '14px 16px',
                        borderRadius: '12px',
                        background: 'rgba(255,255,255,0.06)',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                      }}
                    >
                      <div style={{
                        width: '28px',
                        height: '4px',
                        borderRadius: '2px',
                        background: type.striped 
                          ? `repeating-linear-gradient(90deg, ${type.color} 0px, ${type.color} 4px, ${type.color2} 4px, ${type.color2} 8px)`
                          : type.color,
                      }} />
                      <span style={{ fontSize: '15px', color: '#fff' }}>{type.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Zoner */}
            {menuTab === 'zones' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {zoneTypes.map(type => (
                  <button
                    key={type.id}
                    onClick={() => {
                      setZoneType(type.id);
                      setIsZoneMode(true);
                      setMenuOpen(false);
                      setMenuHeight(0);
                    }}
                    style={{
                      padding: '16px',
                      borderRadius: '12px',
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: 'rgba(255,255,255,0.05)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                    }}
                  >
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: `${type.color}30`,
                      border: `2px solid ${type.color}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '16px',
                    }}>
                      {type.icon}
                    </div>
                    <span style={{ fontSize: '14px', color: '#fff' }}>{type.name}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Pilar */}
            {menuTab === 'arrows' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {arrowTypes.map(type => (
                  <button
                    key={type.id}
                    onClick={() => {
                      setArrowType(type.id);
                      setIsArrowMode(true);
                      setMenuOpen(false);
                      setMenuHeight(0);
                    }}
                    style={{
                      padding: '16px',
                      borderRadius: '12px',
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: 'rgba(255,255,255,0.05)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                    }}
                  >
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                      {/* Pilskaft */}
                      <line 
                        x1="6" y1="22" x2="20" y2="8" 
                        stroke={type.color} 
                        strokeWidth="2.5" 
                        strokeLinecap="round"
                      />
                      {/* Pilspets */}
                      <path 
                        d="M20 8 L20 15 M20 8 L13 8" 
                        stroke={type.color} 
                        strokeWidth="2.5" 
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span style={{ fontSize: '14px', color: '#fff' }}>{type.name}</span>
                  </button>
                ))}
              </div>
            )}

            {/* === VERKTYG-TAB === */}
            {menuTab === 'tools' && !subMenu && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                {/* Prognos */}
                <button
                  onClick={() => {
                    setPrognosOpen(true);
                    setMenuOpen(false);
                    setMenuHeight(0);
                    setSubMenu(null);
                  }}
                  style={{
                    padding: '16px 8px',
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: '14px',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <span style={{ fontSize: '24px' }}>📊</span>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>Prognos</span>
                </button>

                {/* Checklista med cirkel */}
                <button
                  onClick={() => {
                    setChecklistOpen(true);
                    setMenuOpen(false);
                    setMenuHeight(0);
                    setSubMenu(null);
                  }}
                  style={{
                    padding: '16px 8px',
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: '14px',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <div style={{ position: 'relative', width: '28px', height: '28px' }}>
                    <svg width="28" height="28" viewBox="0 0 28 28" style={{ transform: 'rotate(-90deg)' }}>
                      <circle cx="14" cy="14" r="11" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2.5"/>
                      <circle 
                        cx="14" cy="14" r="11" fill="none" 
                        stroke={checklistItems.every(i => i.answer !== null) ? '#22c55e' : 
                                checklistItems.some(i => i.answer !== null) ? '#fbbf24' : 'rgba(255,255,255,0.3)'}
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeDasharray={`${(checklistItems.filter(i => i.answer !== null).length / checklistItems.length) * 69} 69`}
                      />
                    </svg>
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                    }}>
                      {checklistItems.every(i => i.answer !== null) ? '✓' : '📋'}
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>Checklista</span>
                </button>

                {/* Körläge */}
                <button
                  onClick={() => {
                    setDrivingMode(!drivingMode);
                    if (!drivingMode) {
                      setAcknowledgedWarnings([]);
                      playedWarningsRef.current.clear();
                    }
                    setMenuOpen(false);
                    setMenuHeight(0);
                  }}
                  style={{
                    padding: '16px 8px',
                    background: drivingMode ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)',
                    borderRadius: '14px',
                    border: drivingMode ? '2px solid #22c55e' : 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <span style={{ fontSize: '24px' }}>🚜</span>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>Körläge</span>
                </button>

                {/* Kompass */}
                <button
                  onClick={() => {
                    toggleCompass();
                  }}
                  style={{
                    padding: '16px 8px',
                    background: compassMode ? 'rgba(10,132,255,0.2)' : 'rgba(255,255,255,0.06)',
                    borderRadius: '14px',
                    border: compassMode ? '2px solid #0a84ff' : 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <span style={{ fontSize: '24px' }}>🧭</span>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>Kompass</span>
                </button>

                {/* Mät */}
                <button
                  onClick={() => setSubMenu('measure')}
                  style={{
                    padding: '16px 8px',
                    background: (measureMode || measureAreaMode) ? 'rgba(10,132,255,0.2)' : 'rgba(255,255,255,0.06)',
                    borderRadius: '14px',
                    border: (measureMode || measureAreaMode) ? '2px solid #0a84ff' : 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <span style={{ fontSize: '24px' }}>📏</span>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>Mät</span>
                </button>

                {/* Lager */}
                <button
                  onClick={() => setLayerMenuOpen(!layerMenuOpen)}
                  style={{
                    padding: '16px 8px',
                    background: layerMenuOpen ? 'rgba(10,132,255,0.2)' : 'rgba(255,255,255,0.06)',
                    borderRadius: '14px',
                    border: layerMenuOpen ? '2px solid #0a84ff' : 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <span style={{ fontSize: '24px' }}>👁️</span>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>Lager</span>
                </button>

                {/* Stickvägsavstånd */}
                <button
                  onClick={() => setSubMenu('stickvag')}
                  style={{
                    padding: '16px 8px',
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: '14px',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <span style={{ fontSize: '24px' }}>↔️</span>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>Avstånd</span>
                </button>
              </div>
            )}

            {/* === STICKVÄG INSTÄLLNINGAR SUBMENY === */}
            {menuTab === 'tools' && subMenu === 'stickvag' && (
              <div>
                {/* Bakåt-knapp */}
                <button
                  onClick={() => setSubMenu(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'none',
                    border: 'none',
                    color: '#0a84ff',
                    fontSize: '14px',
                    padding: '0 0 15px 0',
                    cursor: 'pointer',
                  }}
                >
                  ← Tillbaka
                </button>
                
                <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '15px' }}>
                  Stickvägsavstånd
                </div>
                
                {/* Målvärde */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)' }}>Avstånd kant-kant</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                      onClick={() => setStickvagSettings(prev => ({ ...prev, targetDistance: Math.max(15, prev.targetDistance - 1) }))}
                      style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer' }}
                    >-</button>
                    <span style={{ fontWeight: '600', minWidth: '50px', textAlign: 'center' }}>{stickvagSettings.targetDistance}m</span>
                    <button
                      onClick={() => setStickvagSettings(prev => ({ ...prev, targetDistance: Math.min(40, prev.targetDistance + 1) }))}
                      style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer' }}
                    >+</button>
                  </div>
                </div>
                
                {/* Tolerans */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)' }}>Tolerans</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                      onClick={() => setStickvagSettings(prev => ({ ...prev, tolerance: Math.max(1, prev.tolerance - 1) }))}
                      style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer' }}
                    >-</button>
                    <span style={{ fontWeight: '600', minWidth: '50px', textAlign: 'center' }}>±{stickvagSettings.tolerance}m</span>
                    <button
                      onClick={() => setStickvagSettings(prev => ({ ...prev, tolerance: Math.min(10, prev.tolerance + 1) }))}
                      style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer' }}
                    >+</button>
                  </div>
                </div>
                
                {/* Vägbredd */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)' }}>Vägbredd</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                      onClick={() => setStickvagSettings(prev => ({ ...prev, vagbredd: Math.max(3, prev.vagbredd - 0.5) }))}
                      style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer' }}
                    >-</button>
                    <span style={{ fontWeight: '600', minWidth: '50px', textAlign: 'center' }}>{stickvagSettings.vagbredd}m</span>
                    <button
                      onClick={() => setStickvagSettings(prev => ({ ...prev, vagbredd: Math.min(6, prev.vagbredd + 0.5) }))}
                      style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer' }}
                    >+</button>
                  </div>
                </div>
                
                {/* Godkänt intervall */}
                <div style={{
                  marginTop: '15px',
                  padding: '12px',
                  background: 'rgba(34,197,94,0.1)',
                  borderRadius: '10px',
                  textAlign: 'center',
                }}>
                  <div style={{ color: '#22c55e', fontSize: '13px' }}>Godkänt intervall</div>
                  <div style={{ fontSize: '20px', fontWeight: '700', color: '#22c55e', marginTop: '5px' }}>
                    {stickvagSettings.targetDistance - stickvagSettings.tolerance}m - {stickvagSettings.targetDistance + stickvagSettings.tolerance}m
                  </div>
                </div>
              </div>
            )}

            {/* === MÄT SUBMENY === */}
            {menuTab === 'tools' && subMenu === 'measure' && (
              <div>
                {/* Bakåt-knapp */}
                <button
                  onClick={() => setSubMenu(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 0',
                    marginBottom: '12px',
                    background: 'none',
                    border: 'none',
                    color: '#0a84ff',
                    fontSize: '14px',
                    cursor: 'pointer',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                  Tillbaka
                </button>
                
                <div style={{ fontSize: '16px', fontWeight: '600', color: '#fff', marginBottom: '14px' }}>
                  📏 Mät
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* Mät sträcka */}
                  <button
                    onClick={() => {
                      setMeasureMode(true);
                      setMeasureAreaMode(false);
                      setMeasurePath([]);
                      setMenuOpen(false);
                      setMenuHeight(0);
                      setSubMenu(null);
                    }}
                    style={{
                      padding: '16px',
                      background: measureMode ? 'rgba(10,132,255,0.2)' : 'rgba(255,255,255,0.06)',
                      borderRadius: '14px',
                      border: measureMode ? '2px solid #0a84ff' : 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                    }}
                  >
                    <div style={{
                      width: '44px',
                      height: '44px',
                      background: 'rgba(255,255,255,0.08)',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2">
                        <line x1="4" y1="20" x2="20" y2="4" />
                        <circle cx="4" cy="20" r="2" fill="rgba(255,255,255,0.8)" />
                        <circle cx="20" cy="4" r="2" fill="rgba(255,255,255,0.8)" />
                      </svg>
                    </div>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontSize: '15px', color: '#fff', fontWeight: '500' }}>Mät sträcka</div>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>Mät avstånd mellan punkter</div>
                    </div>
                  </button>
                  
                  {/* Mät yta */}
                  <button
                    onClick={() => {
                      setMeasureAreaMode(true);
                      setMeasureMode(false);
                      setMeasurePath([]);
                      setMenuOpen(false);
                      setMenuHeight(0);
                      setSubMenu(null);
                    }}
                    style={{
                      padding: '16px',
                      background: measureAreaMode ? 'rgba(10,132,255,0.2)' : 'rgba(255,255,255,0.06)',
                      borderRadius: '14px',
                      border: measureAreaMode ? '2px solid #0a84ff' : 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                    }}
                  >
                    <div style={{
                      width: '44px',
                      height: '44px',
                      background: 'rgba(255,255,255,0.08)',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.8)" strokeWidth="2">
                        <polygon points="4,4 20,4 20,20 4,20" />
                      </svg>
                    </div>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontSize: '15px', color: '#fff', fontWeight: '500' }}>Mät yta</div>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>Mät area av ett område</div>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* === GPS & CENTRERA (alltid synligt) === */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '16px',
              marginTop: '16px',
              paddingTop: '14px',
              borderTop: '1px solid rgba(255,255,255,0.1)',
            }}>
              {/* GPS */}
              <button
                onClick={toggleTracking}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  background: isTracking ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)',
                  borderRadius: '12px',
                  border: isTracking ? '2px solid #22c55e' : 'none',
                  cursor: 'pointer',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isTracking ? '#22c55e' : 'rgba(255,255,255,0.6)'} strokeWidth="2">
                  <circle cx="12" cy="12" r="3" fill={isTracking ? '#22c55e' : 'none'} />
                  <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                </svg>
                <span style={{ fontSize: '13px', color: isTracking ? '#22c55e' : '#fff' }}>
                  {isTracking ? 'GPS på' : 'GPS'}
                </span>
              </button>

              {/* Centrera */}
              <button
                onClick={centerOnMe}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  background: 'rgba(255,255,255,0.06)',
                  borderRadius: '12px',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: '16px' }}>🎯</span>
                <span style={{ fontSize: '13px', color: '#fff' }}>Centrera</span>
              </button>
            </div>
          </div>
        )}

        {/* === LAGER-POPUP (i menyn) === */}
        {layerMenuOpen && menuOpen && (
          <div 
            style={{
              position: 'absolute',
              bottom: '100%',
              right: '20px',
              marginBottom: '10px',
              background: '#000',
              borderRadius: '16px',
              padding: '16px',
              boxShadow: '0 8px 40px rgba(0,0,0,0.8)',
              border: '1px solid rgba(255,255,255,0.15)',
              zIndex: 250,
              minWidth: '180px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ 
              fontSize: '11px', 
              color: 'rgba(255,255,255,0.4)', 
              marginBottom: '12px',
              textTransform: 'uppercase',
              letterSpacing: '1px',
            }}>
              Visa/dölj lager
            </div>
            
            {[
              { key: 'symbols', label: 'Symboler', icon: '📍' },
              { key: 'arrows', label: 'Pilar', icon: '➡️' },
              { key: 'zones', label: 'Zoner', icon: '⬡' },
              { key: 'lines', label: 'Linjer', icon: '〰️' },
            ].map(layer => (
              <button
                key={layer.key}
                onClick={() => setVisibleLayers(prev => ({ ...prev, [layer.key]: !prev[layer.key] }))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '10px',
                  marginBottom: '4px',
                  borderRadius: '10px',
                  border: 'none',
                  background: visibleLayers[layer.key] ? 'rgba(255,255,255,0.1)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: '16px', opacity: visibleLayers[layer.key] ? 1 : 0.3 }}>
                  {layer.icon}
                </span>
                <span style={{ 
                  fontSize: '14px', 
                  color: visibleLayers[layer.key] ? '#fff' : 'rgba(255,255,255,0.3)',
                  flex: 1,
                  textAlign: 'left',
                }}>
                  {layer.label}
                </span>
                <div style={{
                  width: '32px',
                  height: '18px',
                  borderRadius: '9px',
                  background: visibleLayers[layer.key] ? '#22c55e' : 'rgba(255,255,255,0.2)',
                  position: 'relative',
                }}>
                  <div style={{
                    position: 'absolute',
                    top: '2px',
                    left: visibleLayers[layer.key] ? '16px' : '2px',
                    width: '14px',
                    height: '14px',
                    borderRadius: '7px',
                    background: '#fff',
                    transition: 'left 0.2s ease',
                  }} />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* === REDIGERA-DIALOG === */}
      {editingMarker && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 300,
        }}
          onClick={() => setEditingMarker(null)}
        >
          <div 
            style={{
              background: '#000',
              borderRadius: '24px',
              padding: '28px',
              width: '90%',
              maxWidth: '320px',
              boxShadow: '0 12px 60px rgba(0,0,0,0.9)',
              border: '1px solid rgba(255,255,255,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Foto - klickbart för fullskärm */}
            {editingMarker.photoData && (
              <img 
                src={editingMarker.photoData} 
                alt="Foto" 
                onClick={() => setFullscreenPhoto(editingMarker.photoData || null)}
                style={{
                  width: '100%',
                  height: '150px',
                  objectFit: 'cover',
                  borderRadius: '16px',
                  marginBottom: '16px',
                  cursor: 'pointer',
                  border: '2px solid rgba(255,255,255,0.1)',
                }}
              />
            )}
            
            {/* Kommentar */}
            <textarea
              value={editingMarker.comment || ''}
              onChange={(e) => setEditingMarker(prev => prev ? { ...prev, comment: e.target.value } : null)}
              placeholder="Skriv kommentar..."
              autoFocus
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: '16px',
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.05)',
                color: '#fff',
                fontSize: '18px',
                resize: 'none',
                height: '100px',
                fontFamily: 'inherit',
                textAlign: 'center',
                outline: 'none',
              }}
            />
            
            {/* Knappar */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center',
              gap: '16px', 
              marginTop: '24px',
              paddingTop: '20px',
              borderTop: '1px solid rgba(255,255,255,0.08)',
            }}>
              <button
                onClick={() => setEditingMarker(null)}
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '24px',
                  border: 'none',
                  background: 'rgba(255,255,255,0.08)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
              <button
                onClick={() => {
                  saveToHistory([...markers]);
                  setMarkers(prev => prev.map(m => 
                    m.id === editingMarker.id ? { ...editingMarker } : m
                  ));
                  // Öppna symbol-menyn igen
                  setMarkerMenuOpen(editingMarker.id);
                  setEditingMarker(null);
                }}
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '24px',
                  border: 'none',
                  background: 'rgba(255,255,255,0.08)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === STICKVÄGSVY (ENKEL) === */}
      {stickvagMode && gpsLineType && previousStickvagRef.current && !stickvagOversikt && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: '#000',
          zIndex: 500,
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Header med inställningar */}
          <div style={{
            padding: '55px 20px 15px',
            background: 'rgba(0,0,0,0.95)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '10px',
                height: '10px',
                background: '#ef4444',
                borderRadius: '50%',
                animation: 'pulse 1s infinite',
              }} />
              <span style={{ fontSize: '15px', fontWeight: '600' }}>
                Spårar {lineTypes.find(t => t.id === gpsLineType)?.name}
              </span>
            </div>
            <div style={{
              background: 'rgba(255,255,255,0.1)',
              padding: '6px 12px',
              borderRadius: '15px',
              fontSize: '12px',
              color: '#888',
            }}>
              Mål: {stickvagSettings.targetDistance}m | Väg: {stickvagSettings.vagbredd}m
            </div>
          </div>
          
          {/* Kartvy - visar bara förra vägen och din position */}
          <div style={{ flex: 1, position: 'relative', background: '#1a1a1a' }}>
            <svg viewBox="0 0 400 600" style={{ width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid meet">
              
              {/* Förra vägen (tjock, färgkodad) */}
              {previousStickvagRef.current?.path && (() => {
                const prevColor = lineTypes.find(t => t.id === previousStickvagRef.current.lineType)?.color || '#ef4444';
                return (
                  <path
                    d={previousStickvagRef.current.path.map((p, i) => {
                      const relX = 120 + (p.x - gpsMapPositionRef.current.x) * 0.6;
                      const relY = 300 + (p.y - gpsMapPositionRef.current.y) * 0.6;
                      return `${i === 0 ? 'M' : 'L'} ${relX} ${relY}`;
                    }).join(' ')}
                    fill="none"
                    stroke={prevColor}
                    strokeWidth={10}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              })()}
              
              {/* Avståndslinje till förra vägen */}
              {(() => {
                const dist = getStickvagDistance();
                if (!dist || !previousStickvagRef.current?.path) return null;
                const result = getDistanceToPath(gpsMapPositionRef.current, previousStickvagRef.current.path);
                const closestX = 120 + (result.closestPoint.x - gpsMapPositionRef.current.x) * 0.6;
                const closestY = 300 + (result.closestPoint.y - gpsMapPositionRef.current.y) * 0.6;
                
                const { targetDistance, tolerance } = stickvagSettings;
                const minOk = targetDistance - tolerance;
                const maxOk = targetDistance + tolerance;
                let lineColor = 'rgba(34,197,94,0.6)';
                if (dist < minOk || dist > maxOk) {
                  lineColor = dist < minOk - 2 || dist > maxOk + 2 ? 'rgba(239,68,68,0.6)' : 'rgba(251,191,36,0.6)';
                }
                
                return (
                  <line
                    x1={closestX} y1={closestY}
                    x2={280} y2={300}
                    stroke={lineColor}
                    strokeWidth={3}
                    strokeDasharray="10, 6"
                  />
                );
              })()}
              
              {/* Din nuvarande väg (streckad) */}
              {gpsPath.length > 0 && (() => {
                const currentColor = lineTypes.find(t => t.id === gpsLineType)?.color || '#fbbf24';
                return (
                  <path
                    d={gpsPath.map((p, i) => {
                      const relX = 280 + (p.x - gpsMapPositionRef.current.x) * 0.6;
                      const relY = 300 + (p.y - gpsMapPositionRef.current.y) * 0.6;
                      return `${i === 0 ? 'M' : 'L'} ${relX} ${relY}`;
                    }).join(' ')}
                    fill="none"
                    stroke={currentColor}
                    strokeWidth={6}
                    strokeDasharray="12, 8"
                    strokeLinecap="round"
                  />
                );
              })()}
              
              {/* GPS-punkt (du) */}
              <circle cx={280} cy={300} r={35} fill="none" stroke="rgba(10,132,255,0.3)" strokeWidth={3}>
                <animate attributeName="r" from="18" to="45" dur="1.5s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.8" to="0" dur="1.5s" repeatCount="indefinite" />
              </circle>
              <circle cx={280} cy={300} r={18} fill="#0a84ff" style={{ filter: 'drop-shadow(0 0 15px rgba(10,132,255,0.8))' }} />
              
              {/* Riktningspil */}
              <path d="M 280,265 L 268,285 L 292,285 Z" fill="rgba(255,255,255,0.7)" />
              
              {/* Labels */}
              <text x={80} y={350} fill="#666" fontSize={13}>Förra vägen</text>
            </svg>
          </div>
          
          {/* Varningslogik */}
          {(() => {
            const dist = getStickvagDistance();
            if (!dist) return null;
            const { targetDistance, tolerance } = stickvagSettings;
            const isOutside = dist < targetDistance - tolerance || dist > targetDistance + tolerance;
            
            if (isOutside && !stickvagWarningShown) {
              setStickvagWarningShown(true);
              playStickvagWarning(dist < targetDistance - tolerance);
            } else if (!isOutside && stickvagWarningShown) {
              setStickvagWarningShown(false);
            }
            return null;
          })()}
          
          {/* Avståndsvisning - STOR */}
          <div style={{
            padding: '25px 20px',
            background: '#000',
            textAlign: 'center',
          }}>
            {(() => {
              const dist = getStickvagDistance();
              const { targetDistance, tolerance } = stickvagSettings;
              const minOk = targetDistance - tolerance;
              const maxOk = targetDistance + tolerance;
              
              let statusColor = '#22c55e';
              let statusText = '✓ Bra avstånd';
              
              if (dist !== null) {
                if (dist < minOk - 2 || dist > maxOk + 2) {
                  statusColor = '#ef4444';
                  statusText = dist < minOk ? '⚠ För nära!' : '⚠ För långt!';
                } else if (dist < minOk || dist > maxOk) {
                  statusColor = '#fbbf24';
                  statusText = dist < minOk ? '→ Gå längre bort' : '← Gå närmare';
                }
              }
              
              return (
                <>
                  <div style={{ fontSize: '100px', fontWeight: '700', letterSpacing: '-4px', color: statusColor, lineHeight: 1 }}>
                    {dist ?? '--'}
                  </div>
                  <div style={{ fontSize: '28px', color: '#666', marginTop: '-5px' }}>meter kant-kant</div>
                  <div style={{ fontSize: '20px', fontWeight: '600', marginTop: '10px', color: statusColor }}>
                    {statusText}
                  </div>
                </>
              );
            })()}
          </div>
          
          {/* Knappar - mer padding längst ner */}
          <div style={{
            padding: '15px 20px 50px',
            background: '#000',
            display: 'flex',
            gap: '12px',
          }}>
            <button
              onClick={toggleGpsPause}
              style={{
                flex: 1,
                padding: '18px',
                borderRadius: '14px',
                border: 'none',
                background: gpsPaused ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.15)',
                color: '#fff',
                fontSize: '17px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              {gpsPaused ? '▶ Fortsätt' : '⏸ Paus'}
            </button>
            <button
              onClick={() => setStickvagOversikt(true)}
              style={{
                padding: '18px 22px',
                borderRadius: '14px',
                border: 'none',
                background: 'rgba(59,130,246,0.3)',
                color: '#3b82f6',
                fontSize: '17px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              🗺
            </button>
            <button
              onClick={() => stopGpsTracking(true)}
              style={{
                flex: 1,
                padding: '18px',
                borderRadius: '14px',
                border: 'none',
                background: 'rgba(34,197,94,0.3)',
                color: '#22c55e',
                fontSize: '17px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              ✓ Spara
            </button>
          </div>
        </div>
      )}

      {/* === STICKVÄGSVY ÖVERSIKT === */}
      {stickvagMode && stickvagOversikt && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: '#000',
          zIndex: 501,
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Header */}
          <div style={{
            padding: '55px 20px 15px',
            background: 'rgba(0,0,0,0.95)',
          }}>
            <div style={{ fontSize: '20px', fontWeight: '600' }}>🗺 Översikt</div>
            <div style={{ fontSize: '14px', color: '#888', marginTop: '4px' }}>
              Alla snitslade vägar
            </div>
          </div>
          
          {/* Kartvy med alla vägar */}
          <div style={{ flex: 1, position: 'relative', background: '#1a1a1a' }}>
            <svg viewBox="0 0 400 500" style={{ width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid meet">
              
              {/* Alla sparade vägar */}
              {markers.filter(m => m.isLine).map((line, idx) => {
                const lineType = lineTypes.find(t => t.id === line.lineType);
                const color = lineType?.color || '#888';
                const isBackRoad = lineType?.isBackRoad;
                const isBoundary = line.lineType === 'boundary';
                
                if (!line.path || line.path.length < 2) return null;
                
                // Beräkna bounds för alla vägar
                const allPaths = markers.filter(m => m.isLine && m.path);
                let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                allPaths.forEach(l => {
                  l.path?.forEach(p => {
                    minX = Math.min(minX, p.x);
                    maxX = Math.max(maxX, p.x);
                    minY = Math.min(minY, p.y);
                    maxY = Math.max(maxY, p.y);
                  });
                });
                
                const centerX = (minX + maxX) / 2;
                const centerY = (minY + maxY) / 2;
                const scaleX = (maxX - minX) > 0 ? 350 / (maxX - minX) : 1;
                const scaleY = (maxY - minY) > 0 ? 400 / (maxY - minY) : 1;
                const viewScale = Math.min(scaleX, scaleY, 1) * 0.8;
                
                return (
                  <path
                    key={line.id}
                    d={line.path.map((p, i) => {
                      const x = 200 + (p.x - centerX) * viewScale;
                      const y = 250 + (p.y - centerY) * viewScale;
                      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                    }).join(' ')}
                    fill="none"
                    stroke={color}
                    strokeWidth={isBoundary ? 3 : (isBackRoad ? 5 : 4)}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={isBoundary ? '8,4' : 'none'}
                  />
                );
              })}
              
              {/* Nuvarande väg (streckad) */}
              {gpsPath.length > 0 && (() => {
                const allPaths = markers.filter(m => m.isLine && m.path);
                let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                allPaths.forEach(l => {
                  l.path?.forEach(p => {
                    minX = Math.min(minX, p.x);
                    maxX = Math.max(maxX, p.x);
                    minY = Math.min(minY, p.y);
                    maxY = Math.max(maxY, p.y);
                  });
                });
                gpsPath.forEach(p => {
                  minX = Math.min(minX, p.x);
                  maxX = Math.max(maxX, p.x);
                  minY = Math.min(minY, p.y);
                  maxY = Math.max(maxY, p.y);
                });
                
                const centerX = (minX + maxX) / 2;
                const centerY = (minY + maxY) / 2;
                const scaleX = (maxX - minX) > 0 ? 350 / (maxX - minX) : 1;
                const scaleY = (maxY - minY) > 0 ? 400 / (maxY - minY) : 1;
                const viewScale = Math.min(scaleX, scaleY, 1) * 0.8;
                
                const currentColor = lineTypes.find(t => t.id === gpsLineType)?.color || '#fbbf24';
                
                return (
                  <path
                    d={gpsPath.map((p, i) => {
                      const x = 200 + (p.x - centerX) * viewScale;
                      const y = 250 + (p.y - centerY) * viewScale;
                      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                    }).join(' ')}
                    fill="none"
                    stroke={currentColor}
                    strokeWidth={4}
                    strokeDasharray="10, 6"
                    strokeLinecap="round"
                  />
                );
              })()}
              
              {/* GPS-position */}
              {(() => {
                const allPaths = markers.filter(m => m.isLine && m.path);
                let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                allPaths.forEach(l => {
                  l.path?.forEach(p => {
                    minX = Math.min(minX, p.x);
                    maxX = Math.max(maxX, p.x);
                    minY = Math.min(minY, p.y);
                    maxY = Math.max(maxY, p.y);
                  });
                });
                if (minX === Infinity) return null;
                
                const centerX = (minX + maxX) / 2;
                const centerY = (minY + maxY) / 2;
                const scaleX = (maxX - minX) > 0 ? 350 / (maxX - minX) : 1;
                const scaleY = (maxY - minY) > 0 ? 400 / (maxY - minY) : 1;
                const viewScale = Math.min(scaleX, scaleY, 1) * 0.8;
                
                const gpsX = 200 + (gpsMapPositionRef.current.x - centerX) * viewScale;
                const gpsY = 250 + (gpsMapPositionRef.current.y - centerY) * viewScale;
                
                return (
                  <>
                    <circle cx={gpsX} cy={gpsY} r={10} fill="none" stroke="rgba(10,132,255,0.4)" strokeWidth={2}>
                      <animate attributeName="r" from="8" to="20" dur="1.5s" repeatCount="indefinite" />
                      <animate attributeName="opacity" from="0.8" to="0" dur="1.5s" repeatCount="indefinite" />
                    </circle>
                    <circle cx={gpsX} cy={gpsY} r={8} fill="#0a84ff" />
                  </>
                );
              })()}
            </svg>
          </div>
          
          {/* Legend */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '15px',
            padding: '12px',
            background: 'rgba(255,255,255,0.05)',
            flexWrap: 'wrap',
          }}>
            {[...new Set(markers.filter(m => m.isLine).map(m => m.lineType))].map(lt => {
              const lineType = lineTypes.find(t => t.id === lt);
              if (!lineType) return null;
              return (
                <div key={lt} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#aaa' }}>
                  <div style={{ width: '16px', height: '4px', background: lineType.color, borderRadius: '2px' }} />
                  <span>{lineType.name}</span>
                </div>
              );
            })}
          </div>
          
          {/* Statistik */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-around',
            padding: '15px',
            background: 'rgba(255,255,255,0.05)',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '22px', fontWeight: '700' }}>
                {markers.filter(m => m.isLine && ['sideRoadRed', 'sideRoadYellow', 'sideRoadBlue'].includes(m.lineType)).length}
              </div>
              <div style={{ fontSize: '11px', color: '#888' }}>Stickvägar</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '22px', fontWeight: '700' }}>
                {markers.filter(m => m.isLine && ['backRoadRed', 'backRoadYellow', 'backRoadBlue'].includes(m.lineType)).length}
              </div>
              <div style={{ fontSize: '11px', color: '#888' }}>Backvägar</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '22px', fontWeight: '700' }}>
                {stickvagSettings.targetDistance}m
              </div>
              <div style={{ fontSize: '11px', color: '#888' }}>Mål</div>
            </div>
          </div>
          
          {/* Knapp - mer padding längst ner */}
          <div style={{ padding: '15px 20px 50px', background: '#000' }}>
            <button
              onClick={() => setStickvagOversikt(false)}
              style={{
                width: '100%',
                padding: '18px',
                borderRadius: '14px',
                border: 'none',
                background: 'rgba(255,255,255,0.15)',
                color: '#fff',
                fontSize: '17px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              ← Tillbaka till snitslande
            </button>
          </div>
        </div>
      )}

      {/* === KÖRLÄGE VARNING === */}
      {drivingMode && activeWarning && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            background: '#dc2626',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'warningFlash 0.5s ease-in-out infinite alternate',
          }}
        >
          {/* VARNING text överst */}
          <div style={{ 
            fontSize: '28px', 
            fontWeight: '900', 
            color: '#fff',
            letterSpacing: '10px',
            marginBottom: '30px',
            textShadow: '0 2px 10px rgba(0,0,0,0.5)',
          }}>
            ⚠️ VARNING ⚠️
          </div>
          
          {/* Stor ikon */}
          <div style={{ 
            fontSize: '120px', 
            marginBottom: '20px',
            filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.5))',
          }}>
            {activeWarning.icon}
          </div>
          
          {/* Namn */}
          <div style={{ 
            fontSize: '42px', 
            fontWeight: '900', 
            color: '#fff',
            marginBottom: '10px',
            textShadow: '0 2px 10px rgba(0,0,0,0.5)',
            textTransform: 'uppercase',
          }}>
            {activeWarning.name}
          </div>
          
          {/* Avstånd */}
          <div style={{ 
            fontSize: '80px', 
            fontWeight: '900', 
            color: '#fff',
            marginBottom: '20px',
            textShadow: '0 4px 20px rgba(0,0,0,0.5)',
          }}>
            {activeWarning.distance}m
          </div>
          
          {/* Kommentar */}
          {activeWarning.comment && (
            <div style={{ 
              fontSize: '22px', 
              fontWeight: '600',
              color: '#fff',
              marginBottom: '20px',
              padding: '16px 24px',
              background: 'rgba(0,0,0,0.4)',
              borderRadius: '12px',
              maxWidth: '85%',
              textAlign: 'center',
            }}>
              {activeWarning.comment}
            </div>
          )}
          
          {/* Foto - klickbart för fullskärm */}
          {activeWarning.photoData && (
            <img 
              src={activeWarning.photoData} 
              alt="Foto" 
              onClick={() => setFullscreenPhoto(activeWarning.photoData || null)}
              style={{
                width: '85%',
                maxWidth: '320px',
                maxHeight: '180px',
                objectFit: 'cover',
                borderRadius: '16px',
                marginBottom: '20px',
                border: '4px solid #fff',
                cursor: 'pointer',
              }}
            />
          )}
          
          {/* Kvittera-knapp */}
          <button
            onClick={acknowledgeWarning}
            style={{
              padding: '28px 100px',
              borderRadius: '24px',
              border: 'none',
              background: '#fff',
              color: '#dc2626',
              fontSize: '28px',
              fontWeight: '900',
              cursor: 'pointer',
              marginTop: '20px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
              textTransform: 'uppercase',
            }}
          >
            ✓ KVITTERA
          </button>
        </div>
      )}

      {/* === CHECKLISTA === */}
      {checklistOpen && (
        <div 
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 300,
          }}
          onClick={() => setChecklistOpen(false)}
        >
          <div 
            style={{
              background: '#000',
              borderRadius: '28px',
              padding: '28px',
              width: '90%',
              maxWidth: '400px',
              maxHeight: '80vh',
              overflow: 'auto',
              boxShadow: '0 12px 60px rgba(0,0,0,0.9)',
              border: '1px solid rgba(255,255,255,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '24px',
            }}>
              <div style={{ fontSize: '20px', fontWeight: '600', color: '#fff' }}>
                Checklista
              </div>
              <div style={{ 
                fontSize: '14px', 
                color: checklistItems.every(i => i.answer !== null) ? '#22c55e' : '#fbbf24',
                fontWeight: '500',
              }}>
                {checklistItems.filter(i => i.answer !== null).length} / {checklistItems.length}
              </div>
            </div>
            
            {/* Progress bar */}
            <div style={{
              height: '4px',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '2px',
              marginBottom: '24px',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${(checklistItems.filter(i => i.answer !== null).length / checklistItems.length) * 100}%`,
                background: checklistItems.every(i => i.answer !== null) ? '#22c55e' : '#fbbf24',
                transition: 'width 0.3s ease',
              }} />
            </div>
            
            {/* Frågor */}
            {checklistItems.map((item, index) => (
              <div 
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '16px',
                  marginBottom: '8px',
                  borderRadius: '12px',
                  background: item.answer !== null ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
                  border: item.answer === null ? '1px solid rgba(251,191,36,0.3)' : '1px solid transparent',
                }}
              >
                <div style={{ flex: 1, fontSize: '15px', color: '#fff' }}>
                  {item.text}
                </div>
                
                {/* Ja/Nej knappar */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setChecklistItems(prev => prev.map(i => 
                      i.id === item.id ? { ...i, answer: true } : i
                    ))}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      border: 'none',
                      background: item.answer === true ? '#22c55e' : 'rgba(255,255,255,0.1)',
                      color: item.answer === true ? '#fff' : 'rgba(255,255,255,0.5)',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    Ja
                  </button>
                  <button
                    onClick={() => setChecklistItems(prev => prev.map(i => 
                      i.id === item.id ? { ...i, answer: false } : i
                    ))}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      border: 'none',
                      background: item.answer === false ? '#ef4444' : 'rgba(255,255,255,0.1)',
                      color: item.answer === false ? '#fff' : 'rgba(255,255,255,0.5)',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    Nej
                  </button>
                </div>
                
                {/* Ta bort egen fråga */}
                {!item.fixed && (
                  <button
                    onClick={() => setChecklistItems(prev => prev.filter(i => i.id !== item.id))}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      border: 'none',
                      background: 'transparent',
                      color: 'rgba(255,255,255,0.3)',
                      fontSize: '18px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            
            {/* Lägg till egen fråga */}
            <div style={{
              display: 'flex',
              gap: '8px',
              marginTop: '16px',
              paddingTop: '16px',
              borderTop: '1px solid rgba(255,255,255,0.1)',
            }}>
              <input
                type="text"
                value={newChecklistItem}
                onChange={(e) => setNewChecklistItem(e.target.value)}
                placeholder="Lägg till egen fråga..."
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#fff',
                  fontSize: '14px',
                  outline: 'none',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newChecklistItem.trim()) {
                    setChecklistItems(prev => [...prev, {
                      id: `custom_${Date.now()}`,
                      text: newChecklistItem.trim(),
                      answer: null,
                      fixed: false,
                    }]);
                    setNewChecklistItem('');
                  }
                }}
              />
              <button
                onClick={() => {
                  if (newChecklistItem.trim()) {
                    setChecklistItems(prev => [...prev, {
                      id: `custom_${Date.now()}`,
                      text: newChecklistItem.trim(),
                      answer: null,
                      fixed: false,
                    }]);
                    setNewChecklistItem('');
                  }
                }}
                style={{
                  padding: '12px 20px',
                  borderRadius: '12px',
                  border: 'none',
                  background: newChecklistItem.trim() ? colors.blue : 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: newChecklistItem.trim() ? 'pointer' : 'default',
                  opacity: newChecklistItem.trim() ? 1 : 0.5,
                }}
              >
                +
              </button>
            </div>
            
            {/* Stäng-knapp */}
            <button
              onClick={() => setChecklistOpen(false)}
              style={{
                width: '100%',
                padding: '16px',
                marginTop: '24px',
                borderRadius: '12px',
                border: 'none',
                background: checklistItems.every(i => i.answer !== null) ? '#22c55e' : 'rgba(255,255,255,0.1)',
                color: '#fff',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              {checklistItems.every(i => i.answer !== null) ? '✓ Klar' : 'Stäng'}
            </button>
            
            {/* Reset-knapp */}
            <button
              onClick={() => setChecklistItems(prev => prev.map(i => ({ ...i, answer: null })))}
              style={{
                width: '100%',
                padding: '12px',
                marginTop: '8px',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'transparent',
                color: 'rgba(255,255,255,0.4)',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Återställ alla svar
            </button>
          </div>
        </div>
      )}

      {/* === PROGNOS === */}
      {prognosOpen && (
        <div 
          style={{
            position: 'absolute',
            inset: 0,
            background: '#000',
            zIndex: 300,
            overflowY: 'auto',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '20px 24px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ fontSize: '18px', fontWeight: '500', color: '#fff' }}>
              Prognos
            </div>
            <button
              onClick={() => setPrognosOpen(false)}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '18px',
                border: 'none',
                background: 'rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.6)',
                fontSize: '18px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ×
            </button>
          </div>
          
          <div style={{ padding: '24px' }}>
            {/* Tid-sektion */}
            <div style={{
              background: 'rgba(255,255,255,0.04)',
              borderRadius: '16px',
              padding: '20px',
              marginBottom: '16px',
            }}>
              <div style={{ 
                fontSize: '12px', 
                color: 'rgba(255,255,255,0.4)', 
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '20px',
              }}>
                Uppskattad tid
              </div>
              
              {/* Skördare */}
              <div 
                onClick={() => { setEditingField('skordare'); setEditValue(manuellPrognos.skordare || ''); }}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  marginBottom: '16px',
                  paddingBottom: '16px',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  cursor: 'pointer',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '20px' }}>🌲</span>
                  <span style={{ fontSize: '15px', color: 'rgba(255,255,255,0.8)' }}>Skördare</span>
                </div>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'baseline', 
                  gap: '6px',
                  background: 'rgba(255,255,255,0.06)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                }}>
                  <span style={{ fontSize: '18px', fontWeight: '600', color: manuellPrognos.skordare ? '#fff' : 'rgba(255,255,255,0.3)' }}>
                    {manuellPrognos.skordare || '–'}
                  </span>
                  <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)' }}>h</span>
                </div>
              </div>
              
              {/* Skotare */}
              <div 
                onClick={() => { setEditingField('skotare'); setEditValue(manuellPrognos.skotare || ''); }}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '20px' }}>🚛</span>
                  <span style={{ fontSize: '15px', color: 'rgba(255,255,255,0.8)' }}>Skotare</span>
                </div>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'baseline', 
                  gap: '6px',
                  background: 'rgba(255,255,255,0.06)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                }}>
                  <span style={{ fontSize: '18px', fontWeight: '600', color: manuellPrognos.skotare ? '#fff' : 'rgba(255,255,255,0.3)' }}>
                    {manuellPrognos.skotare || '–'}
                  </span>
                  <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)' }}>h</span>
                </div>
              </div>
            </div>
            
            {/* Traktdata */}
            <div style={{
              background: 'rgba(255,255,255,0.04)',
              borderRadius: '16px',
              padding: '20px',
              marginBottom: '16px',
            }}>
              <div style={{ 
                fontSize: '12px', 
                color: 'rgba(255,255,255,0.4)', 
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '20px',
              }}>
                Traktdata
              </div>
              
              <div style={{ display: 'flex', gap: '12px' }}>
                <div 
                  onClick={() => { setEditingField('volym'); setEditValue(String(traktData.volym) || ''); }}
                  style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }}
                >
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginBottom: '6px' }}>Volym</div>
                  <div style={{
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: '8px',
                    padding: '12px 8px',
                  }}>
                    <span style={{ fontSize: '18px', fontWeight: '600', color: '#fff' }}>
                      {traktData.volym || '–'}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '4px' }}>m³fub</div>
                </div>
                
                <div 
                  onClick={() => { setEditingField('areal'); setEditValue(String(traktData.areal) || ''); }}
                  style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }}
                >
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginBottom: '6px' }}>Areal</div>
                  <div style={{
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: '8px',
                    padding: '12px 8px',
                  }}>
                    <span style={{ fontSize: '18px', fontWeight: '600', color: '#fff' }}>
                      {traktData.areal || '–'}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '4px' }}>ha</div>
                </div>
              </div>
            </div>
            
            {/* Förhållanden */}
            {(() => {
              const forhallanden = beraknaForhallanden();
              return (
                <div style={{
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: '16px',
                  padding: '20px',
                  marginBottom: '24px',
                }}>
                  <div style={{ 
                    fontSize: '12px', 
                    color: 'rgba(255,255,255,0.4)', 
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    marginBottom: '20px',
                  }}>
                    Förhållanden
                  </div>
                  
                  {/* Svår terräng */}
                  <div style={{ marginBottom: '24px', position: 'relative' }}>
                    {/* Stor siffra när man drar */}
                    {draggingSlider === 'terrang' && (
                      <div style={{
                        position: 'absolute',
                        top: '-55px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'rgba(0,0,0,0.95)',
                        borderRadius: '14px',
                        padding: '10px 20px',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        zIndex: 10,
                      }}>
                        <span style={{ fontSize: '32px', fontWeight: '700', color: '#fff' }}>
                          {prognosSettings.terpipirangSvar || forhallanden.brantProcent}%
                        </span>
                      </div>
                    )}
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      marginBottom: '12px' 
                    }}>
                      <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>
                        Svår terräng
                      </span>
                      <span style={{ 
                        fontSize: '14px', 
                        fontWeight: '600', 
                        color: '#fff',
                        background: 'rgba(255,255,255,0.06)',
                        padding: '4px 10px',
                        borderRadius: '6px',
                      }}>
                        {prognosSettings.terpipirangSvar || forhallanden.brantProcent}%
                      </span>
                    </div>
                    {/* Custom expanderande slider */}
                    <div 
                      style={{
                        position: 'relative',
                        width: '100%',
                        height: draggingSlider === 'terrang' ? '24px' : '6px',
                        borderRadius: draggingSlider === 'terrang' ? '12px' : '3px',
                        background: 'rgba(255,255,255,0.1)',
                        cursor: 'pointer',
                        transition: 'height 0.15s ease, border-radius 0.15s ease',
                      }}
                      onTouchStart={(e) => {
                        setDraggingSlider('terrang');
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.touches[0].clientX - rect.left;
                        const percent = Math.round(Math.max(0, Math.min(100, (x / rect.width) * 100)) / 5) * 5;
                        setPrognosSettings(prev => ({ ...prev, terpipirangSvar: percent }));
                      }}
                      onTouchMove={(e) => {
                        if (draggingSlider === 'terrang') {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const x = e.touches[0].clientX - rect.left;
                          const percent = Math.round(Math.max(0, Math.min(100, (x / rect.width) * 100)) / 5) * 5;
                          setPrognosSettings(prev => ({ ...prev, terpipirangSvar: percent }));
                        }
                      }}
                      onTouchEnd={() => setDraggingSlider(null)}
                      onMouseDown={(e) => {
                        setDraggingSlider('terrang');
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const percent = Math.round(Math.max(0, Math.min(100, (x / rect.width) * 100)) / 5) * 5;
                        setPrognosSettings(prev => ({ ...prev, terpipirangSvar: percent }));
                      }}
                      onMouseMove={(e) => {
                        if (draggingSlider === 'terrang' && e.buttons === 1) {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const x = e.clientX - rect.left;
                          const percent = Math.round(Math.max(0, Math.min(100, (x / rect.width) * 100)) / 5) * 5;
                          setPrognosSettings(prev => ({ ...prev, terpipirangSvar: percent }));
                        }
                      }}
                      onMouseUp={() => setDraggingSlider(null)}
                      onMouseLeave={() => setDraggingSlider(null)}
                    >
                      {/* Fill */}
                      <div style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        height: '100%',
                        width: `${prognosSettings.terpipirangSvar || forhallanden.brantProcent}%`,
                        background: draggingSlider === 'terrang' 
                          ? 'linear-gradient(90deg, rgba(10,132,255,0.6), rgba(10,132,255,0.8))'
                          : 'rgba(255,255,255,0.3)',
                        borderRadius: 'inherit',
                        transition: 'background 0.15s ease',
                      }} />
                      {/* Thumb */}
                      <div style={{
                        position: 'absolute',
                        left: `${prognosSettings.terpipirangSvar || forhallanden.brantProcent}%`,
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: draggingSlider === 'terrang' ? '36px' : '20px',
                        height: draggingSlider === 'terrang' ? '36px' : '20px',
                        borderRadius: '50%',
                        background: '#fff',
                        boxShadow: draggingSlider === 'terrang' 
                          ? '0 4px 16px rgba(0,0,0,0.4)'
                          : '0 2px 8px rgba(0,0,0,0.3)',
                        transition: 'width 0.15s ease, height 0.15s ease, box-shadow 0.15s ease',
                      }} />
                    </div>
                  </div>
                  
                  {/* Dålig bärighet */}
                  <div style={{ position: 'relative' }}>
                    {/* Stor siffra när man drar */}
                    {draggingSlider === 'barighet' && (
                      <div style={{
                        position: 'absolute',
                        top: '-55px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'rgba(0,0,0,0.95)',
                        borderRadius: '14px',
                        padding: '10px 20px',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        zIndex: 10,
                      }}>
                        <span style={{ fontSize: '32px', fontWeight: '700', color: '#fff' }}>
                          {prognosSettings.barighetDalig || forhallanden.blottProcent}%
                        </span>
                      </div>
                    )}
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      marginBottom: '12px' 
                    }}>
                      <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>
                        Dålig bärighet
                      </span>
                      <span style={{ 
                        fontSize: '14px', 
                        fontWeight: '600', 
                        color: '#fff',
                        background: 'rgba(255,255,255,0.06)',
                        padding: '4px 10px',
                        borderRadius: '6px',
                      }}>
                        {prognosSettings.barighetDalig || forhallanden.blottProcent}%
                      </span>
                    </div>
                    {/* Custom expanderande slider */}
                    <div 
                      style={{
                        position: 'relative',
                        width: '100%',
                        height: draggingSlider === 'barighet' ? '24px' : '6px',
                        borderRadius: draggingSlider === 'barighet' ? '12px' : '3px',
                        background: 'rgba(255,255,255,0.1)',
                        cursor: 'pointer',
                        transition: 'height 0.15s ease, border-radius 0.15s ease',
                      }}
                      onTouchStart={(e) => {
                        setDraggingSlider('barighet');
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.touches[0].clientX - rect.left;
                        const percent = Math.round(Math.max(0, Math.min(100, (x / rect.width) * 100)) / 5) * 5;
                        setPrognosSettings(prev => ({ ...prev, barighetDalig: percent }));
                      }}
                      onTouchMove={(e) => {
                        if (draggingSlider === 'barighet') {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const x = e.touches[0].clientX - rect.left;
                          const percent = Math.round(Math.max(0, Math.min(100, (x / rect.width) * 100)) / 5) * 5;
                          setPrognosSettings(prev => ({ ...prev, barighetDalig: percent }));
                        }
                      }}
                      onTouchEnd={() => setDraggingSlider(null)}
                      onMouseDown={(e) => {
                        setDraggingSlider('barighet');
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const percent = Math.round(Math.max(0, Math.min(100, (x / rect.width) * 100)) / 5) * 5;
                        setPrognosSettings(prev => ({ ...prev, barighetDalig: percent }));
                      }}
                      onMouseMove={(e) => {
                        if (draggingSlider === 'barighet' && e.buttons === 1) {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const x = e.clientX - rect.left;
                          const percent = Math.round(Math.max(0, Math.min(100, (x / rect.width) * 100)) / 5) * 5;
                          setPrognosSettings(prev => ({ ...prev, barighetDalig: percent }));
                        }
                      }}
                      onMouseUp={() => setDraggingSlider(null)}
                      onMouseLeave={() => setDraggingSlider(null)}
                    >
                      {/* Fill */}
                      <div style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        height: '100%',
                        width: `${prognosSettings.barighetDalig || forhallanden.blottProcent}%`,
                        background: draggingSlider === 'barighet' 
                          ? 'linear-gradient(90deg, rgba(10,132,255,0.6), rgba(10,132,255,0.8))'
                          : 'rgba(255,255,255,0.3)',
                        borderRadius: 'inherit',
                        transition: 'background 0.15s ease',
                      }} />
                      {/* Thumb */}
                      <div style={{
                        position: 'absolute',
                        left: `${prognosSettings.barighetDalig || forhallanden.blottProcent}%`,
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: draggingSlider === 'barighet' ? '36px' : '20px',
                        height: draggingSlider === 'barighet' ? '36px' : '20px',
                        borderRadius: '50%',
                        background: '#fff',
                        boxShadow: draggingSlider === 'barighet' 
                          ? '0 4px 16px rgba(0,0,0,0.4)'
                          : '0 2px 8px rgba(0,0,0,0.3)',
                        transition: 'width 0.15s ease, height 0.15s ease, box-shadow 0.15s ease',
                      }} />
                    </div>
                  </div>
                </div>
              );
            })()}
            
            {/* Spara-knapp */}
            <button
              onClick={() => setPrognosOpen(false)}
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: '12px',
                border: 'none',
                background: (manuellPrognos.skordare && manuellPrognos.skotare) ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.08)',
                color: (manuellPrognos.skordare && manuellPrognos.skotare) ? '#000' : 'rgba(255,255,255,0.5)',
                fontSize: '15px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              {(manuellPrognos.skordare && manuellPrognos.skotare) ? 'Spara' : 'Stäng'}
            </button>
          </div>
          
          {/* Edit Modal */}
          {editingField && (
            <div 
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,0,0,0.95)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
              }}
              onClick={() => setEditingField(null)}
            >
              <div 
                style={{ textAlign: 'center', padding: '40px' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ 
                  fontSize: '14px', 
                  color: 'rgba(255,255,255,0.5)', 
                  marginBottom: '20px',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                }}>
                  {editingField === 'skordare' && 'Skördare (timmar)'}
                  {editingField === 'skotare' && 'Skotare (timmar)'}
                  {editingField === 'volym' && 'Volym (m³fub)'}
                  {editingField === 'areal' && 'Areal (ha)'}
                </div>
                
                <input
                  type="number"
                  step={editingField === 'areal' ? '0.1' : '1'}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  autoFocus
                  style={{
                    width: '200px',
                    background: 'rgba(255,255,255,0.06)',
                    border: '2px solid rgba(255,255,255,0.2)',
                    borderRadius: '12px',
                    padding: '20px',
                    color: '#fff',
                    fontSize: '48px',
                    fontWeight: '700',
                    textAlign: 'center',
                    outline: 'none',
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (editingField === 'skordare') {
                        setManuellPrognos(prev => ({ ...prev, skordare: editValue }));
                      } else if (editingField === 'skotare') {
                        setManuellPrognos(prev => ({ ...prev, skotare: editValue }));
                      } else if (editingField === 'volym') {
                        setTraktData(prev => ({ ...prev, volym: parseInt(editValue) || 0 }));
                      } else if (editingField === 'areal') {
                        setTraktData(prev => ({ ...prev, areal: parseFloat(editValue) || 0 }));
                      }
                      setEditingField(null);
                    }
                  }}
                />
                
                <div style={{ marginTop: '30px', display: 'flex', gap: '12px', justifyContent: 'center' }}>
                  <button
                    onClick={() => setEditingField(null)}
                    style={{
                      padding: '14px 28px',
                      borderRadius: '10px',
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: 'transparent',
                      color: 'rgba(255,255,255,0.6)',
                      fontSize: '15px',
                      cursor: 'pointer',
                    }}
                  >
                    Avbryt
                  </button>
                  <button
                    onClick={() => {
                      if (editingField === 'skordare') {
                        setManuellPrognos(prev => ({ ...prev, skordare: editValue }));
                      } else if (editingField === 'skotare') {
                        setManuellPrognos(prev => ({ ...prev, skotare: editValue }));
                      } else if (editingField === 'volym') {
                        setTraktData(prev => ({ ...prev, volym: parseInt(editValue) || 0 }));
                      } else if (editingField === 'areal') {
                        setTraktData(prev => ({ ...prev, areal: parseFloat(editValue) || 0 }));
                      }
                      setEditingField(null);
                    }}
                    style={{
                      padding: '14px 28px',
                      borderRadius: '10px',
                      border: 'none',
                      background: 'rgba(255,255,255,0.9)',
                      color: '#000',
                      fontSize: '15px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    OK
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* === DOLD KAMERA INPUT === */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhotoCapture}
        style={{ display: 'none' }}
      />

      {/* === FULLSKÄRM FOTO === */}
      {fullscreenPhoto && (
        <div 
          onClick={() => setFullscreenPhoto(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0,0,0,0.95)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <img 
            src={fullscreenPhoto} 
            alt="Foto" 
            style={{
              maxWidth: '95vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              borderRadius: '8px',
            }}
          />
          <div style={{
            position: 'absolute',
            top: '50px',
            right: '20px',
            color: '#fff',
            fontSize: '16px',
            opacity: 0.6,
          }}>
            Tryck för att stänga
          </div>
        </div>
      )}

      {/* === ANIMATIONS === */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes warningFlash {
          0% { background: #dc2626; }
          100% { background: #991b1b; }
        }
        /* Dölja number input spinners */
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type=number] {
          -moz-appearance: textfield;
        }
      `}</style>
    </div>
  );
}
