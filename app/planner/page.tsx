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
  
  // === KARTA ===
  const [screenSize, setScreenSize] = useState({ width: 800, height: 600 });
  const [mapCenter, setMapCenter] = useState({ lat: 57.1052, lng: 14.8261 }); // Stenshult ungefär
  const [mapZoom, setMapZoom] = useState(16);
  const [showMap, setShowMap] = useState(true);
  const [mapType, setMapType] = useState<'osm' | 'satellite' | 'terrain'>('osm');
  
  // Overlay-lager
  const [overlays, setOverlays] = useState({
    propertyLines: false,  // Fastighetsgränser
    moisture: false,       // Markfuktighet (kräver konto)
    contours: false,       // Höjdkurvor
    wetlands: false,       // Sumpskog (öppet)
  });
  
  // Hämta skärmstorlek på klienten
  useEffect(() => {
    setScreenSize({ width: window.innerWidth, height: window.innerHeight });
    const handleResize = () => setScreenSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
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
  const [showSavedPopup, setShowSavedPopup] = useState(false); // Popup efter sparande
  const [savedVagColor, setSavedVagColor] = useState<string | null>(null); // Sparad färg för highlight
  
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
  const [activeCategory, setActiveCategory] = useState<string | null>(null); // Ny fullskärmsmeny
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [detectedColor, setDetectedColor] = useState<any>(null);
  const [selectedVagType, setSelectedVagType] = useState('stickvag');
  const [selectedVagColor, setSelectedVagColor] = useState<any>(null);
  
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
  // Beräkna meter per pixel baserat på kartans zoom-nivå och latitud
  // Formel: 156543.03392 * cos(lat * PI / 180) / (2^zoom)
  const scale = 156543.03392 * Math.cos(mapCenter.lat * Math.PI / 180) / Math.pow(2, mapZoom);
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
  
  // Beräkna begränsad storlek för symboler (så de inte blir enorma vid inzoomning)
  const getConstrainedSize = (baseSize: number) => {
    // När zoom ökar, minska storleken så visuell storlek förblir ~konstant
    // Min: 50% av basStorlek vid utzoom, Max: 100% av basStorlek vid inzoom
    const scaledSize = baseSize / zoom;
    const minSize = baseSize * 0.5;
    const maxSize = baseSize;
    return Math.max(minSize, Math.min(maxSize, scaledSize));
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
  // === SVG IKONER (Tesla-stil) ===
  const renderIcon = (iconId: string, size: number = 24, color: string = '#fff') => {
    const icons: Record<string, any> = {
      // NATURVÅRD
      'eternitytree': (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3 Q4 6 4 12 Q4 16 12 16 Q20 16 20 12 Q20 6 12 3Z" />
          <line x1="12" y1="16" x2="12" y2="22" />
          <path d="M9 22 Q12 20 15 22" />
        </svg>
      ),
      'naturecorner': (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="10" r="4" />
          <circle cx="16" cy="10" r="4" />
          <circle cx="12" cy="7" r="3" />
          <path d="M3 20 Q12 16 21 20" />
          <line x1="8" y1="14" x2="8" y2="17" />
          <line x1="16" y1="14" x2="16" y2="17" />
        </svg>
      ),
      // KULTUR
      'culturemonument': (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <text x="12" y="17" textAnchor="middle" fontSize="16" fontWeight="bold" fontFamily="Arial, sans-serif" fill={color}>R</text>
        </svg>
      ),
      'culturestump': (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 22 L8 14 Q8 11 12 11 Q16 11 16 14 L16 22" />
          <path d="M8 14 Q10 10 12 12 Q14 10 16 14" />
          <text x="12" y="19" textAnchor="middle" fontSize="7" fontWeight="bold" fontFamily="Arial, sans-serif" fill={color} stroke="none">R</text>
        </svg>
      ),
      // AVVERKNING
      'highstump': (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 22 L9 8 Q9 5 12 5 Q15 5 15 8 L15 22" />
          <path d="M9 8 L8 4 L10 6 L12 3 L14 6 L16 4 L15 8" />
          <line x1="5" y1="22" x2="5" y2="10" strokeDasharray="3,3" strokeWidth="1.5" />
          <path d="M4 10 L6 10" strokeWidth="1.5" />
          <path d="M4 22 L6 22" strokeWidth="1.5" />
        </svg>
      ),
      'landing': (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="6" cy="18" rx="4" ry="2" />
          <ellipse cx="14" cy="18" rx="4" ry="2" />
          <ellipse cx="18" cy="18" rx="4" ry="2" />
          <ellipse cx="10" cy="13" rx="4" ry="2" />
          <ellipse cx="14" cy="13" rx="4" ry="2" />
          <ellipse cx="12" cy="8" rx="4" ry="2" />
        </svg>
      ),
      'brashpile': (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 20 Q4 14 8 12 Q6 10 8 8 Q10 6 12 8 Q14 6 16 8 Q18 10 16 12 Q20 14 20 20 Z" />
          <line x1="10" y1="10" x2="8" y2="5" />
          <line x1="14" y1="10" x2="16" y2="4" />
          <line x1="12" y1="12" x2="12" y2="6" />
        </svg>
      ),
      'windfall': (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 17 L5 14 L4 12 L6 13 L5 10" />
          <line x1="5" y1="15" x2="21" y2="9" strokeWidth="3" />
          <path d="M9 14 L7 18" />
          <path d="M13 12 L11 17" />
          <path d="M17 10 L15 15" />
        </svg>
      ),
      'manualfelling': (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <line x1="5" y1="22" x2="13" y2="9" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M11 11 L13 6 Q19 3 18 8 Q20 10 17 12 L13 10 Z" fill={color} stroke={color} strokeWidth="1" strokeLinejoin="round" />
        </svg>
      ),
      // INFRASTRUKTUR
      'powerline': (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
          <path d="M13 2 L3 14 L10 14 L10 22 L21 10 L14 10 Z" />
        </svg>
      ),
      'road': (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 22 L11 2" />
          <path d="M16 22 L13 2" />
          <line x1="12" y1="20" x2="12" y2="15" strokeWidth="2.5" />
          <line x1="12" y1="12" x2="12" y2="7" strokeWidth="2.5" />
          <line x1="12" y1="5" x2="12" y2="2" strokeWidth="2.5" />
        </svg>
      ),
      'turningpoint': (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="7" />
          <path d="M12 5 A7 7 0 1 1 5 12" strokeWidth="2.5" />
          <path d="M5 8 L5 12 L9 12" strokeWidth="2" />
        </svg>
      ),
      // TERRÄNG
      'ditch': (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 8 L8 16 L16 16 L22 8" />
          <path d="M9 14 Q12 12 15 14" />
          <line x1="2" y1="8" x2="2" y2="5" />
          <line x1="22" y1="8" x2="22" y2="5" />
        </svg>
      ),
      'bridge': (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 17 L6 22 L18 22 L22 17" />
          <path d="M8 20 Q12 18 16 20" />
          <rect x="4" y="11" width="16" height="4" rx="1" fill={color} stroke="none" />
          <line x1="6" y1="15" x2="6" y2="19" strokeWidth="2.5" />
          <line x1="18" y1="15" x2="18" y2="19" strokeWidth="2.5" />
        </svg>
      ),
      'corduroy': (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="8" x2="21" y2="8" strokeWidth="3.5" />
          <line x1="3" y1="12" x2="21" y2="12" strokeWidth="3.5" />
          <line x1="3" y1="16" x2="21" y2="16" strokeWidth="3.5" />
          <path d="M12 3 L12 5 M10 4 L12 2 L14 4" strokeWidth="1.5" />
          <path d="M12 21 L12 19 M10 20 L12 22 L14 20" strokeWidth="1.5" />
        </svg>
      ),
      'wet': (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3 Q7 10 7 14 Q7 19 12 19 Q17 19 17 14 Q17 10 12 3Z" />
          <path d="M3 22 Q7 19 11 22 Q15 25 19 22" />
        </svg>
      ),
      'steep': (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 20 L12 5 L21 20 Z" />
          <line x1="7" y1="16" x2="17" y2="16" />
          <line x1="9" y1="12" x2="15" y2="12" />
        </svg>
      ),
      'trail': (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
          <ellipse cx="6" cy="19" rx="2.2" ry="3.5" />
          <ellipse cx="4.5" cy="14.5" rx="0.9" ry="1.1" />
          <ellipse cx="5.8" cy="14" rx="0.8" ry="1" />
          <ellipse cx="7" cy="14.2" rx="0.7" ry="0.9" />
          <ellipse cx="8" cy="14.8" rx="0.6" ry="0.8" />
          <ellipse cx="14" cy="12" rx="2.2" ry="3.5" />
          <ellipse cx="12.5" cy="7.5" rx="0.9" ry="1.1" />
          <ellipse cx="13.8" cy="7" rx="0.8" ry="1" />
          <ellipse cx="15" cy="7.2" rx="0.7" ry="0.9" />
          <ellipse cx="16" cy="7.8" rx="0.6" ry="0.8" />
          <ellipse cx="20" cy="5" rx="1.8" ry="2.8" />
          <ellipse cx="18.8" cy="1.8" rx="0.7" ry="0.8" />
          <ellipse cx="19.8" cy="1.5" rx="0.6" ry="0.7" />
        </svg>
      ),
      // ÖVRIGT
      'warning': (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3 L22 21 L2 21 Z" />
          <line x1="12" y1="9" x2="12" y2="14" strokeWidth="2.5" />
          <circle cx="12" cy="17" r="1.2" fill={color} />
        </svg>
      ),
      // PILAR
      'fellingdirection': (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="20" x2="12" y2="6" />
          <path d="M6 12 L12 4 L18 12" />
        </svg>
      ),
      'drivedirection': (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="12" x2="18" y2="12" />
          <path d="M12 6 L20 12 L12 18" />
        </svg>
      ),
      // MENY-IKONER (Tesla-stil, tunna linjer)
      'menu-symbols': (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="10" r="2.5" />
          <path d="M12 12.5 L12 16" />
        </svg>
      ),
      'menu-lines': (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
          <path d="M4 16 Q12 6 20 14" />
        </svg>
      ),
      'menu-zones': (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 4 L20 8.5 L20 15.5 L12 20 L4 15.5 L4 8.5 Z" />
        </svg>
      ),
      'menu-arrows': (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12" />
          <path d="M14 7 L19 12 L14 17" />
        </svg>
      ),
      'menu-measure': (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 20 L20 4" />
          <path d="M4 20 L4 15" />
          <path d="M4 20 L9 20" />
          <path d="M20 4 L20 9" />
          <path d="M20 4 L15 4" />
        </svg>
      ),
      'menu-gallring': (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="8" x2="8" y2="20" />
          <line x1="16" y1="8" x2="16" y2="20" />
          <circle cx="8" cy="6" r="2.5" />
          <circle cx="16" cy="6" r="2.5" />
        </svg>
      ),
      'menu-checklist': (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M7 12 L10 15 L17 8" />
        </svg>
      ),
      'menu-prognos': (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 18 L9 13 L13 15 L20 6" />
          <path d="M16 6 L20 6 L20 10" />
        </svg>
      ),
      'menu-settings': (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2 L12 5" />
          <path d="M12 19 L12 22" />
          <path d="M2 12 L5 12" />
          <path d="M19 12 L22 12" />
          <path d="M4.93 4.93 L7.05 7.05" />
          <path d="M16.95 16.95 L19.07 19.07" />
          <path d="M4.93 19.07 L7.05 16.95" />
          <path d="M16.95 7.05 L19.07 4.93" />
        </svg>
      ),
    };
    return icons[iconId] || (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" fill={color} />
      </svg>
    );
  };

  // Bakgrundsfärg för ikoner
  const getIconBackground = (symbolId: string): string => {
    const greenIcons = ['eternitytree', 'naturecorner'];
    const orangeIcons = ['culturemonument', 'culturestump'];
    if (greenIcons.includes(symbolId)) return '#22c55e';
    if (orangeIcons.includes(symbolId)) return '#f59e0b';
    return 'rgba(0,0,0,0.6)';
  };

  const getIconBorder = (symbolId: string): string => {
    const greenIcons = ['eternitytree', 'naturecorner'];
    const orangeIcons = ['culturemonument', 'culturestump'];
    if (greenIcons.includes(symbolId)) return '#4ade80';
    if (orangeIcons.includes(symbolId)) return '#fbbf24';
    return 'rgba(255,255,255,0.15)';
  };

  const symbolCategories = [
    {
      name: 'Naturvård',
      bgColor: '#22c55e',
      symbols: [
        { id: 'eternitytree', name: 'Evighetsträd' },
        { id: 'naturecorner', name: 'Naturhörna' },
      ]
    },
    {
      name: 'Kultur',
      bgColor: '#f59e0b',
      symbols: [
        { id: 'culturemonument', name: 'Kulturminne' },
        { id: 'culturestump', name: 'Kulturstubbe' },
      ]
    },
    {
      name: 'Avverkning',
      symbols: [
        { id: 'highstump', name: 'Högstubbe' },
        { id: 'landing', name: 'Avlägg' },
        { id: 'brashpile', name: 'Rishög' },
        { id: 'windfall', name: 'Vindfälle' },
        { id: 'manualfelling', name: 'Manuell fällning' },
      ]
    },
    {
      name: 'Infrastruktur',
      symbols: [
        { id: 'powerline', name: 'El-ledning' },
        { id: 'road', name: 'Väg' },
        { id: 'turningpoint', name: 'Vändplats' },
      ]
    },
    {
      name: 'Terräng',
      symbols: [
        { id: 'ditch', name: 'Dike' },
        { id: 'bridge', name: 'Bro' },
        { id: 'corduroy', name: 'Kavling' },
        { id: 'wet', name: 'Fuktig mark' },
        { id: 'steep', name: 'Brant' },
        { id: 'trail', name: 'Stig / Led' },
      ]
    },
    {
      name: 'Övrigt',
      symbols: [
        { id: 'warning', name: 'Varning' },
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
    { id: 'stickvag', name: 'Test-stickväg', color: '#ff00ff', striped: false },
    { id: 'nature', name: 'Naturvård', color: '#22c55e', color2: '#ef4444', striped: true },
    { id: 'ditch', name: 'Dike', color: '#06b6d4', color2: '#0e7490', striped: true },
    { id: 'trail', name: 'Stig/Led', color: '#ffffff', striped: false, dashed: true },
  ];

  const zoneTypes = [
    { id: 'wet', name: 'Blött', color: '#3b82f6', icon: 'wet' },
    { id: 'steep', name: 'Brant', color: '#a855f7', icon: 'steep' },
    { id: 'protected', name: 'Naturvård', color: '#22c55e', icon: 'naturecorner' },
    { id: 'culture', name: 'Kulturmiljö', color: '#f59e0b', icon: 'culturemonument' },
    { id: 'noentry', name: 'Ej framkomlig', color: '#ef4444', icon: 'warning' },
  ];

  const arrowTypes = [
    { id: 'fellingdirection', name: 'Fällriktning', color: '#22c55e' },
    { id: 'drivedirection', name: 'Körriktning', color: '#3b82f6' },
  ];

  // Färger för stickvägar/backvägar (Gallring)
  const vagColors = [
    { id: 'rod', name: 'Röd', color: '#ef4444' },
    { id: 'gul', name: 'Gul', color: '#fbbf24' },
    { id: 'bla', name: 'Blå', color: '#3b82f6' },
    { id: 'gron', name: 'Grön', color: '#22c55e' },
    { id: 'orange', name: 'Orange', color: '#f97316' },
    { id: 'vit', name: 'Vit', color: '#ffffff' },
    { id: 'svart', name: 'Svart', color: '#1f2937' },
    { id: 'rosa', name: 'Rosa', color: '#ec4899' },
  ];

  // Meny-kategorier för fullskärmsmenyn
  const menuCategories = [
    { id: 'symbols', name: 'Symboler', desc: 'Placera markeringar', icon: 'menu-symbols' },
    { id: 'lines', name: 'Linjer', desc: 'Rita linjer och gränser', icon: 'menu-lines' },
    { id: 'zones', name: 'Zoner', desc: 'Markera områden', icon: 'menu-zones' },
    { id: 'arrows', name: 'Pilar', desc: 'Visa riktningar', icon: 'menu-arrows' },
    { id: 'measure', name: 'Mätning', desc: 'Mät avstånd på kartan', icon: 'menu-measure' },
    { id: 'gallring', name: 'Gallring', desc: 'Snitsla stickvägar', icon: 'menu-gallring' },
    { id: 'checklist', name: 'Checklista', desc: 'Kontrollera punkter', icon: 'menu-checklist' },
    { id: 'prognos', name: 'Prognos', desc: 'Produktivitetsberäkning', icon: 'menu-prognos' },
    { id: 'settings', name: 'Inställningar', desc: 'Anpassa appen', icon: 'menu-settings' },
  ];

  // === GPS ===
  // Konvertera lat/lon till SVG-koordinater (relativt till mapCenter)
  const latLonToSvg = (lat: number, lon: number) => {
    // Meter per grad (approximation för Sverige ~57°N)
    const mPerDegLat = 111320;
    const mPerDegLon = 111320 * Math.cos(mapCenter.lat * Math.PI / 180);
    
    // Skillnad från kartcentrum i meter
    const dxMeters = (lon - mapCenter.lng) * mPerDegLon;
    const dyMeters = (lat - mapCenter.lat) * mPerDegLat;
    
    // Konvertera till pixlar (scale = meter per pixel)
    // SVG-koordinater där (0,0) = mapCenter
    const x = dxMeters / scale;
    const y = -dyMeters / scale; // Negativ för att Y ökar nedåt
    
    return { x, y };
  };
  
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
  const findNearestStickvag = (pos = gpsMapPosition) => {
    const stickvägar = markers.filter(m => 
      m.isLine && 
      (m.lineType === 'stickvag' || ['sideRoadRed', 'sideRoadYellow', 'sideRoadBlue'].includes(m.lineType || '')) &&
      m.path && m.path.length > 1
    );
    
    if (stickvägar.length === 0) return null;
    
    let nearestRoad = null;
    let minDistance = Infinity;
    
    stickvägar.forEach(road => {
      const result = getDistanceToPath(pos, road.path!);
      if (result.distance < minDistance) {
        minDistance = result.distance;
        nearestRoad = road;
      }
    });
    
    return nearestRoad;
  };
  
  // Hämta aktuellt avstånd till närmaste stickväg
  const getStickvagDistance = (pos = gpsMapPosition): number | null => {
    // Hitta närmaste stickväg dynamiskt
    const nearest = findNearestStickvag(pos);
    if (!nearest?.path) return null;
    
    // Uppdatera referensen om den ändrats
    if (nearest.id !== previousStickvagRef.current?.id) {
      previousStickvagRef.current = nearest;
    }
    
    const result = getDistanceToPath(pos, nearest.path);
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
            // Beräkna SVG-koordinater från lat/lon
            const svgPos = latLonToSvg(newPos.lat, newPos.lon);
            gpsMapPositionRef.current = svgPos;
            setGpsMapPosition(svgPos);
            const startPos = { 
              lat: newPos.lat, 
              lon: newPos.lon, 
              x: svgPos.x, 
              y: svgPos.y 
            };
            const firstPoint = { x: svgPos.x, y: svgPos.y };
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
  
  // Spara väg och visa popup för att välja nästa färg
  const saveAndShowPopup = () => {
    if (gpsPathRef.current.length > 1 && gpsLineType) {
      saveToHistory([...markers]);
      const newLine = {
        id: Date.now(),
        lineType: gpsLineType,
        path: [...gpsPathRef.current],
        isLine: true,
        gpsRecorded: true,
      };
      setMarkers(prev => [...prev, newLine]);
      const lineType = lineTypes.find(t => t.id === gpsLineType);
      setSavedVagColor(lineType?.color || '#fff');
    }
    setGpsLineType(null);
    setGpsPath([]);
    gpsPathRef.current = [];
    setGpsStartPos(null);
    setGpsPaused(false);
    gpsPausedRef.current = false;
    setShowSavedPopup(true);
  };

  // Fortsätt snitslande med vald färg
  const continueWithColor = (colorId: string) => {
    const colorMap: Record<string, string> = {
      'rod': 'sideRoadRed',
      'gul': 'sideRoadYellow',
      'bla': 'sideRoadBlue',
    };
    setShowSavedPopup(false);
    startGpsTracking(colorMap[colorId] || 'sideRoadRed');
    setStickvagMode(true);
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
                // Första punkten - beräkna SVG-koordinater från lat/lon
                const svgPos = latLonToSvg(newPos.lat, newPos.lon);
                gpsMapPositionRef.current = svgPos;
                setGpsMapPosition(svgPos);
                lastConfirmedPosRef.current = svgPos;
                gpsHistoryRef.current = [svgPos];
                return { 
                  lat: newPos.lat, 
                  lon: newPos.lon, 
                  x: svgPos.x, 
                  y: svgPos.y 
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
    if (e.button === 0 && !selectedSymbol && !isDrawMode && !isZoneMode && !isArrowMode && !measureMode && !measureAreaMode) {
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
    } else if (type.dashed) {
      // Streckad linje (t.ex. Stig/Led)
      return (
        <g key={`line-${path[0]?.x}-${path[0]?.y}-${typeId}`}>
          <path d={d} fill="none" stroke={type.color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="15,10" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }} />
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
    
    // Begränsad storlek för zon-ikoner
    const iconRadius = getConstrainedSize(18);
    const iconFontSize = getConstrainedSize(16);
    const ringRadius = getConstrainedSize(26);
    const strokeW = getConstrainedSize(3);
    const borderWidth = getConstrainedSize(4);
    
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
          strokeWidth={borderWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}
        />
        <path 
          d={d} 
          fill="none" 
          stroke="#fff" 
          strokeWidth={borderWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="12,12"
        />
        {/* Grön ring om kvitterad */}
        {isAcknowledged && drivingMode && (
          <circle cx={centerX} cy={centerY} r={ringRadius} fill="none" stroke="#22c55e" strokeWidth={strokeW} />
        )}
        {/* Ikon i mitten */}
        <circle cx={centerX} cy={centerY} r={iconRadius} fill="rgba(0,0,0,0.7)" stroke={zone.color} strokeWidth={getConstrainedSize(2)} />
        <g transform={`translate(${centerX - iconFontSize/2}, ${centerY - iconFontSize/2})`} style={{ pointerEvents: 'none' }}>
          {renderIcon(zone.icon, iconFontSize, '#fff')}
        </g>
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

      {/* === KARTBAKGRUND MED TILES === */}
      {showMap && screenSize.width > 0 && (
        <div 
          style={{ 
            position: 'absolute', 
            inset: 0, 
            zIndex: 0,
            overflow: 'hidden',
            background: '#e8e4d9',
            pointerEvents: 'none',
          }}
        >
          {(() => {
            const tileSize = 256;
            const lat = mapCenter.lat;
            const lng = mapCenter.lng;
            const z = mapZoom;
            
            // Konvertera lat/lng till tile-koordinater
            const n = Math.pow(2, z);
            const centerTileX = Math.floor((lng + 180) / 360 * n);
            const latRad = lat * Math.PI / 180;
            const centerTileY = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
            
            // Beräkna pixel-offset inom tile
            const tileXFloat = (lng + 180) / 360 * n;
            const tileYFloat = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;
            const offsetX = (tileXFloat - centerTileX) * tileSize;
            const offsetY = (tileYFloat - centerTileY) * tileSize;
            
            // Beräkna hur många tiles vi behöver
            const tilesNeededX = Math.ceil(screenSize.width / tileSize / zoom) + 4;
            const tilesNeededY = Math.ceil(screenSize.height / tileSize / zoom) + 4;
            const tilesAround = Math.max(tilesNeededX, tilesNeededY, 8);
            
            const tiles: any[] = [];
            
            // Basposition för tiles (i SVG-koordinater, dvs före zoom/pan transform)
            // Vi placerar tiles så att kartan centreras vid (0,0) i SVG-koordinater
            const basePosX = -offsetX;
            const basePosY = -offsetY;
            
            for (let dx = -tilesAround; dx <= tilesAround; dx++) {
              for (let dy = -tilesAround; dy <= tilesAround; dy++) {
                const tileX = centerTileX + dx;
                const tileY = centerTileY + dy;
                
                // Position i "SVG-koordinater" (samma som ritningarna)
                const svgX = basePosX + dx * tileSize;
                const svgY = basePosY + dy * tileSize;
                
                // Applicera samma transform som SVG: pan + scale
                const screenX = pan.x + svgX * zoom;
                const screenY = pan.y + svgY * zoom;
                
                // Hoppa över tiles som är utanför skärmen
                const scaledSize = tileSize * zoom;
                if (screenX < -scaledSize * 2 || screenX > screenSize.width + scaledSize) continue;
                if (screenY < -scaledSize * 2 || screenY > screenSize.height + scaledSize) continue;
                
                // Bakgrundskarta URL
                let url: string;
                if (mapType === 'satellite') {
                  url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${tileY}/${tileX}`;
                } else if (mapType === 'terrain') {
                  url = `https://tile.opentopomap.org/${z}/${tileX}/${tileY}.png`;
                } else {
                  url = `https://tile.openstreetmap.org/${z}/${tileX}/${tileY}.png`;
                }
                
                tiles.push(
                  <img
                    key={`tile-${tileX}-${tileY}-${z}`}
                    src={url}
                    alt=""
                    crossOrigin="anonymous"
                    style={{
                      position: 'absolute',
                      left: screenX,
                      top: screenY,
                      width: tileSize * zoom,
                      height: tileSize * zoom,
                    }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.opacity = '0.3';
                    }}
                  />
                );
                
                // Overlay: Höjdkurvor (visas på satellit eller vanlig karta)
                if (overlays.contours && mapType !== 'terrain') {
                  tiles.push(
                    <img
                      key={`contour-${tileX}-${tileY}-${z}`}
                      src={`https://tile.opentopomap.org/${z}/${tileX}/${tileY}.png`}
                      alt=""
                      style={{
                        position: 'absolute',
                        left: screenX,
                        top: screenY,
                        width: tileSize * zoom,
                        height: tileSize * zoom,
                        opacity: mapType === 'satellite' ? 0.5 : 0.3,
                        mixBlendMode: mapType === 'satellite' ? 'normal' : 'multiply',
                      }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  );
                }
              }
            }
            
            // WMS Overlay: Sumpskog från Skogsstyrelsen
            if (overlays.wetlands && screenSize.width > 0) {
              // Beräkna bounding box för synlig vy
              const centerLat = mapCenter.lat;
              const centerLng = mapCenter.lng;
              
              // Uppskatta synligt område baserat på zoom
              const metersPerPixel = 156543.03392 * Math.cos(centerLat * Math.PI / 180) / Math.pow(2, z);
              const viewWidthMeters = screenSize.width * metersPerPixel / zoom;
              const viewHeightMeters = screenSize.height * metersPerPixel / zoom;
              
              // Konvertera till lat/lng offset
              const latOffset = (viewHeightMeters / 111320) / 2;
              const lngOffset = (viewWidthMeters / (111320 * Math.cos(centerLat * Math.PI / 180))) / 2;
              
              const bbox = `${centerLng - lngOffset},${centerLat - latOffset},${centerLng + lngOffset},${centerLat + latOffset}`;
              
              const wmsUrl = `https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaSumpskog/MapServer/WmsServer?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=0&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:4326&BBOX=${bbox}&WIDTH=${Math.round(screenSize.width)}&HEIGHT=${Math.round(screenSize.height)}`;
              
              tiles.push(
                <img
                  key={`wms-sumpskog-${Math.round(centerLat*100)}-${Math.round(centerLng*100)}`}
                  src={wmsUrl}
                  alt=""
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: screenSize.width,
                    height: screenSize.height,
                    opacity: 0.7,
                    pointerEvents: 'none',
                  }}
                  onError={(e) => {
                    console.log('Sumpskog WMS failed to load');
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              );
            }
            
            return tiles;
          })()}
        </div>
      )}

      {/* === KARTA === */}
      <svg 
        style={{ 
          position: 'absolute', 
          inset: 0, 
          width: '100%', 
          height: '100%',
          touchAction: 'none',
          background: showMap ? 'transparent' : `
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
          
          // Pan med ett finger (om inte i ritläge eller mätläge)
          if (e.touches.length === 1 && !selectedSymbol && !isArrowMode && !measureMode && !measureAreaMode && !isDrawMode && !isZoneMode) {
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
            // Finger-rotation avstängd - kartan pekar alltid norrut
            
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

        {/* Rotation wrapper - avstängd, kartan pekar alltid norrut */}
        <g style={{ 
          transform: 'none',
          transformOrigin: '50% 50%',
        }}>
        {/* Kart-rotation från finger-gester - avstängd */}
        <g style={{ 
          transform: 'none',
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
            // Begränsad storlek för mått-labels
            const labelWidth = getConstrainedSize(60);
            const labelHeight = getConstrainedSize(20);
            const labelFontSize = getConstrainedSize(11);
            const labelRadius = getConstrainedSize(10);
            const labelOffsetY = getConstrainedSize(25);
            return (
              <g key={`measure-${m.id}`}>
                <rect
                  x={midPoint.x - labelWidth/2}
                  y={midPoint.y - labelOffsetY}
                  width={labelWidth}
                  height={labelHeight}
                  rx={labelRadius}
                  fill="rgba(0,0,0,0.8)"
                />
                <text
                  x={midPoint.x}
                  y={midPoint.y - labelOffsetY + labelHeight/2 + 1}
                  textAnchor="middle"
                  fontSize={labelFontSize}
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
            
            // === ZOOM-BASERAD SYNLIGHET ===
            // Viktiga kategorier (visas alltid): naturvård och kultur
            const importantTypes = ['eternitytree', 'naturecorner', 'culturemonument', 'culturestump'];
            const isImportant = importantTypes.includes(m.type || '');
            
            // Vid utzoom (< 15): visa bara viktiga kategorier
            // Vid inzoom (≥ 15): visa allt
            const isZoomedOut = mapZoom < 15;
            const shouldShow = isImportant || !isZoomedOut;
            
            // Storlek baserat på zoom
            // Utzoomad: mindre (14px radie, 12px ikon)
            // Inzoomad: normal (19px radie, 17px ikon)
            const baseRadius = isZoomedOut ? 14 : 19;
            const baseIconSize = isZoomedOut ? 12 : 17;
            
            const symbolRadius = getConstrainedSize(isDragging && hasMoved ? baseRadius + 4 : baseRadius);
            const iconSize = getConstrainedSize(isDragging && hasMoved ? baseIconSize + 3 : baseIconSize);
            const photoRadius = getConstrainedSize(isZoomedOut ? 7 : 9);
            const photoOffset = getConstrainedSize(isZoomedOut ? 11 : 14);
            const photoFontSize = getConstrainedSize(isZoomedOut ? 7 : 9);
            const ringRadius = getConstrainedSize(isZoomedOut ? 20 : 27);
            const strokeW = getConstrainedSize(3);
            const bgColor = getIconBackground(m.type || '');
            const borderColor = getIconBorder(m.type || '');
            // Mörkare bakgrund för bättre kontrast (0.9 istället för 0.6)
            const darkBg = bgColor === 'rgba(0,0,0,0.6)' ? 'rgba(0,0,0,0.9)' : bgColor;
            
            // Returnera null om symbolen inte ska visas
            if (!shouldShow) return null;
            
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
                  <circle cx={m.x} cy={m.y + 4} r={symbolRadius} fill="rgba(0,0,0,0.3)" />
                )}
                {/* Grön ring om kvitterad */}
                {isAcknowledged && drivingMode && (
                  <circle cx={m.x} cy={m.y} r={ringRadius} fill="none" stroke="#22c55e" strokeWidth={strokeW} />
                )}
                {/* Bakgrundscirkel med kant */}
                <circle 
                  cx={m.x} 
                  cy={m.y} 
                  r={symbolRadius} 
                  fill={isDragging && hasMoved ? colors.blue : isMenuOpen ? 'rgba(10,132,255,0.3)' : darkBg} 
                  stroke={isDragging && hasMoved ? '#fff' : isMenuOpen ? colors.blue : 'rgba(255,255,255,0.7)'} 
                  strokeWidth={getConstrainedSize(2)}
                  style={{ transition: isDragging ? 'none' : 'all 0.2s ease' }}
                />
                {/* SVG-ikon med glow-effekt */}
                <g 
                  transform={`translate(${m.x - iconSize/2}, ${m.y - iconSize/2})`} 
                  style={{ 
                    pointerEvents: 'none',
                    filter: 'drop-shadow(0 0 3px rgba(255,255,255,0.8))',
                  }}
                >
                  {renderIcon(m.type || 'default', iconSize, '#fff')}
                </g>
                {/* Foto-indikator */}
                {m.photoData && (
                  <>
                    <circle cx={m.x + photoOffset} cy={m.y - photoOffset} r={photoRadius} fill="#22c55e" stroke="#fff" strokeWidth={getConstrainedSize(2)} />
                    <text x={m.x + photoOffset} y={m.y - photoOffset} textAnchor="middle" dominantBaseline="central" fontSize={photoFontSize} style={{ pointerEvents: 'none' }}>
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
            // Begränsad storlek för pilar
            const arrowScale = getConstrainedSize(1);
            const ringRadius = getConstrainedSize(30);
            const photoRadius = getConstrainedSize(10);
            const photoOffset = getConstrainedSize(18);
            const photoFontSize = getConstrainedSize(10);
            return (
              <g key={m.id} style={{ opacity: opacity, transition: 'opacity 0.3s ease' }}>
                {/* Grön ring om kvitterad */}
                {isAcknowledged && drivingMode && (
                  <circle cx={m.x} cy={m.y} r={ringRadius} fill="none" stroke="#22c55e" strokeWidth={getConstrainedSize(3)} />
                )}
                <g 
                  transform={`translate(${m.x}, ${m.y}) rotate(${m.rotation || 0}) scale(${arrowScale})`}
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
                    <circle cx={m.x + photoOffset} cy={m.y - photoOffset} r={photoRadius} fill="#22c55e" stroke="#fff" strokeWidth={getConstrainedSize(2)} />
                    <text x={m.x + photoOffset} y={m.y - photoOffset} textAnchor="middle" dominantBaseline="central" fontSize={photoFontSize} style={{ pointerEvents: 'none' }}>
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
          {isTracking && (
            <g>
              {/* Ljuskägla - visar riktning när kompass är på */}
              {compassMode && isTracking && (() => {
                const coneRadius = getConstrainedSize(80);
                return (
                  <path
                    d={`M ${gpsMapPosition.x} ${gpsMapPosition.y} 
                        L ${gpsMapPosition.x + Math.sin((deviceHeading - 30) * Math.PI / 180) * coneRadius} ${gpsMapPosition.y - Math.cos((deviceHeading - 30) * Math.PI / 180) * coneRadius}
                        A ${coneRadius} ${coneRadius} 0 0 1 ${gpsMapPosition.x + Math.sin((deviceHeading + 30) * Math.PI / 180) * coneRadius} ${gpsMapPosition.y - Math.cos((deviceHeading + 30) * Math.PI / 180) * coneRadius}
                        Z`}
                    fill="url(#viewConeGradient)"
                    opacity={0.6}
                  />
                );
              })()}
              {/* GPS-prick - begränsad storlek */}
              <circle 
                cx={gpsMapPosition.x} cy={gpsMapPosition.y} r={getConstrainedSize(12)} 
                fill={colors.blue} 
                stroke="#fff" 
                strokeWidth={getConstrainedSize(3)}
                style={{ animation: 'pulse 1.5s infinite' }}
              />
              {/* Riktningspil när kompass är på */}
              {compassMode && (() => {
                const arrowScale = getConstrainedSize(1);
                return (
                  <path
                    d={`M ${gpsMapPosition.x} ${gpsMapPosition.y - 18 * arrowScale} 
                        L ${gpsMapPosition.x - 6 * arrowScale} ${gpsMapPosition.y - 8 * arrowScale} 
                        L ${gpsMapPosition.x + 6 * arrowScale} ${gpsMapPosition.y - 8 * arrowScale} Z`}
                    fill="#fff"
                    transform={`rotate(${deviceHeading}, ${gpsMapPosition.x}, ${gpsMapPosition.y})`}
                  />
                );
              })()}
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

      {/* === GPS-KNAPP (höger nere) === */}
      <button
        onClick={() => {
          if (isTracking) {
            // GPS är redan på - centrera kartan på nuvarande GPS-position
            const screenCenterX = screenSize.width / 2;
            const screenCenterY = screenSize.height / 2;
            setPan({ x: screenCenterX - gpsMapPosition.x * zoom, y: screenCenterY - gpsMapPosition.y * zoom });
          } else {
            // Starta GPS-tracking
            toggleTracking();
          }
        }}
        style={{
          position: 'absolute',
          bottom: menuOpen ? menuHeight + 110 : 100,
          right: '15px',
          width: '48px',
          height: '48px',
          borderRadius: '12px',
          border: isTracking ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.1)',
          background: isTracking ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 150,
          transition: 'all 0.3s ease',
          cursor: 'pointer',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="5" fill={isTracking ? '#22c55e' : 'rgba(255,255,255,0.4)'}/>
        </svg>
      </button>

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
        
        const getMarkerIconId = () => {
          if (marker.isMarker) return marker.type || 'default';
          if (marker.isZone) return zoneTypes.find(t => t.id === marker.zoneType)?.icon || 'default';
          if (marker.isArrow) return marker.arrowType || 'default';
          return 'default';
        };

        const getMarkerBgColor = () => {
          if (marker.isMarker) return getIconBackground(marker.type || '');
          if (marker.isZone) return zoneTypes.find(t => t.id === marker.zoneType)?.color || 'rgba(0,0,0,0.6)';
          if (marker.isArrow) return arrowTypes.find(t => t.id === marker.arrowType)?.color || 'rgba(0,0,0,0.6)';
          return 'rgba(0,0,0,0.6)';
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
                <div style={{
                  width: '52px',
                  height: '52px',
                  background: getMarkerBgColor(),
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: `2px solid ${getIconBorder(marker.type || '')}`,
                }}>
                  {renderIcon(getMarkerIconId(), 28, '#fff')}
                </div>
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
          background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          zIndex: 200,
        }}>
          {measurePath.length > 1 ? (
            <>
              {/* Börja om */}
              <button
                onClick={() => setMeasurePath([])}
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  border: 'none',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#fff',
                  fontSize: '18px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ↩
              </button>
              {/* Klar */}
              <button
                onClick={() => {
                  setMeasureMode(false);
                  setMeasurePath([]);
                  setIsMeasuring(false);
                }}
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  border: 'none',
                  background: '#22c55e',
                  color: '#fff',
                  fontSize: '18px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ✓
              </button>
            </>
          ) : (
            <>
              <span style={{ fontSize: '14px', opacity: 0.6, padding: '0 12px' }}>Dra för att mäta</span>
            </>
          )}
          {/* Stäng */}
          <button
            onClick={() => {
              setMeasureMode(false);
              setMeasurePath([]);
              setIsMeasuring(false);
            }}
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              border: 'none',
              background: 'rgba(255,255,255,0.06)',
              color: '#fff',
              fontSize: '18px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
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
          background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          zIndex: 200,
        }}>
          {measurePath.length > 2 ? (
            <>
              {/* Börja om */}
              <button
                onClick={() => setMeasurePath([])}
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  border: 'none',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#fff',
                  fontSize: '18px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ↩
              </button>
              {/* Klar */}
              <button
                onClick={() => {
                  setMeasureAreaMode(false);
                  setMeasurePath([]);
                  setIsMeasuring(false);
                }}
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  border: 'none',
                  background: '#22c55e',
                  color: '#fff',
                  fontSize: '18px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ✓
              </button>
            </>
          ) : (
            <span style={{ fontSize: '14px', opacity: 0.6, padding: '0 12px' }}>Dra för att mäta yta</span>
          )}
          {/* Stäng */}
          <button
            onClick={() => {
              setMeasureAreaMode(false);
              setMeasurePath([]);
              setIsMeasuring(false);
            }}
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              border: 'none',
              background: 'rgba(255,255,255,0.06)',
              color: '#fff',
              fontSize: '18px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
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
          background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          zIndex: 200,
        }}>
          {/* Status-indikator */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '0 12px',
          }}>
            <span style={{ 
              width: '8px', 
              height: '8px', 
              borderRadius: '50%', 
              background: gpsPaused ? '#f59e0b' : '#22c55e',
              animation: gpsPaused ? 'none' : 'pulse 1s infinite',
            }} />
            <span style={{ fontSize: '13px', opacity: 0.6 }}>
              {gpsPath.length}
            </span>
          </div>
          
          {/* Paus/Fortsätt */}
          <button
            onClick={toggleGpsPause}
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              border: 'none',
              background: gpsPaused ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.06)',
              color: gpsPaused ? '#f59e0b' : '#fff',
              fontSize: '18px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {gpsPaused ? '▶' : '⏸'}
          </button>
          
          {/* Spara */}
          <button
            onClick={() => stopGpsTracking(true)}
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              border: 'none',
              background: '#22c55e',
              color: '#fff',
              fontSize: '18px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✓
          </button>
          
          {/* Avbryt */}
          <button
            onClick={() => stopGpsTracking(false)}
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              border: 'none',
              background: 'rgba(255,255,255,0.06)',
              color: '#fff',
              fontSize: '18px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* === AKTIV RITNING INDIKATOR === */}
      {(isDrawMode || isZoneMode) && !isDrawing && currentPath.length > 1 && (
        <div style={{
          position: 'absolute',
          bottom: menuHeight + 130,
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}>
          {/* Ångra */}
          <button
            onClick={undoLastSegment}
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              border: 'none',
              background: 'rgba(255,255,255,0.06)',
              color: '#fff',
              fontSize: '18px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ↩
          </button>
          
          {/* Klar */}
          <button
            onClick={() => isDrawMode ? finishLine() : finishZone()}
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              border: 'none',
              background: '#22c55e',
              color: '#fff',
              fontSize: '18px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✓
          </button>
          
          {/* Avbryt */}
          <button
            onClick={cancelDrawing}
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              border: 'none',
              background: 'rgba(255,255,255,0.06)',
              color: '#fff',
              fontSize: '18px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>
      )}
      
      {/* Dra för att rita - visas innan man börjat */}
      {(isDrawMode || isZoneMode) && !isDrawing && currentPath.length === 0 && (
        <div style={{
          position: 'absolute',
          bottom: menuHeight + 130,
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}>
          <span style={{ fontSize: '14px', opacity: 0.6, padding: '0 12px' }}>Dra för att rita</span>
          <button
            onClick={cancelDrawing}
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              border: 'none',
              background: 'rgba(255,255,255,0.06)',
              color: '#fff',
              fontSize: '18px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>
      )}
      
      {/* Placera symbol/pil */}
      {(isArrowMode || selectedSymbol) && (
        <div style={{
          position: 'absolute',
          bottom: menuHeight + 130,
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}>
          <span style={{ fontSize: '14px', opacity: 0.6, padding: '0 12px' }}>Tryck för att placera</span>
          <button
            onClick={cancelDrawing}
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              border: 'none',
              background: 'rgba(255,255,255,0.06)',
              color: '#fff',
              fontSize: '18px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>
      )}
      
      {/* === MÄTER JUST NU === */}
      {isMeasuring && (
        <div style={{
          position: 'absolute',
          top: '120px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
          color: '#fff',
          padding: '16px 24px',
          borderRadius: '16px',
          zIndex: 150,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '32px', fontWeight: '300', opacity: 0.9 }}>
            {formatLength(calculateLength(measurePath))}
          </div>
          <div style={{ fontSize: '12px', opacity: 0.5, marginTop: '4px' }}>Släpp för att mäta</div>
        </div>
      )}

      {/* === LAGER-MENY === */}
      {layerMenuOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: '#000',
          zIndex: 500,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", sans-serif',
        }}>
          {/* Header */}
          <div style={{
            padding: '55px 20px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div 
              onClick={() => setLayerMenuOpen(false)}
              style={{ 
                padding: '8px', 
                marginLeft: '-8px', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ opacity: 0.6 }}>
                <path d="M15 18l-6-6 6-6"/>
              </svg>
              <span style={{ fontSize: '17px', opacity: 0.6 }}>Tillbaka</span>
            </div>
            <span style={{ fontSize: '17px', fontWeight: '600', color: '#fff' }}>Lager</span>
            <div style={{ width: '80px' }} />
          </div>

          {/* Content */}
          <div style={{ 
            flex: 1, 
            overflowY: 'auto',
            padding: '12px',
          }}>
            {/* Bakgrundskarta */}
            <div style={{
              background: '#0a0a0a', 
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '20px',
              padding: '8px',
              marginBottom: '16px',
            }}>
              <div style={{ 
                padding: '12px 16px 8px', 
                fontSize: '11px', 
                opacity: 0.4, 
                textTransform: 'uppercase', 
                letterSpacing: '1px' 
              }}>
                Bakgrundskarta
              </div>
              {[
                { id: 'osm', name: 'Karta', desc: 'OpenStreetMap' },
                { id: 'satellite', name: 'Satellit', desc: 'Flygfoto' },
                { id: 'terrain', name: 'Terräng', desc: 'Höjdkurvor & detaljer' },
              ].map(type => (
                <div
                  key={type.id}
                  onClick={() => setMapType(type.id as 'osm' | 'satellite' | 'terrain')}
                  style={{
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    border: mapType === type.id ? 'none' : '2px solid rgba(255,255,255,0.2)',
                    background: mapType === type.id ? '#22c55e' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {mapType === type.id && (
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fff' }} />
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '15px', color: '#fff' }}>{type.name}</div>
                    <div style={{ fontSize: '12px', opacity: 0.5, marginTop: '2px' }}>{type.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Overlay-lager */}
            <div style={{
              background: '#0a0a0a', 
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '20px',
              padding: '8px',
              marginBottom: '16px',
            }}>
              <div style={{ 
                padding: '12px 16px 8px', 
                fontSize: '11px', 
                opacity: 0.4, 
                textTransform: 'uppercase', 
                letterSpacing: '1px' 
              }}>
                Overlay
              </div>
              {[
                { id: 'wetlands', name: 'Sumpskog', desc: 'Blöta skogsområden', enabled: true },
                { id: 'contours', name: 'Höjdkurvor', desc: 'Terräng ovanpå karta/satellit', enabled: true },
                { id: 'moisture', name: 'Markfuktighet', desc: 'Kräver Skogsstyrelsen-konto', enabled: false },
                { id: 'propertyLines', name: 'Fastighetsgränser', desc: 'Kommer snart', enabled: false },
              ].map(overlay => (
                <div
                  key={overlay.id}
                  onClick={() => overlay.enabled && setOverlays(prev => ({ ...prev, [overlay.id]: !prev[overlay.id] }))}
                  style={{
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    borderRadius: '12px',
                    cursor: overlay.enabled ? 'pointer' : 'not-allowed',
                    opacity: overlay.enabled ? 1 : 0.4,
                  }}
                >
                  <span style={{ flex: 1 }}>
                    <div style={{ fontSize: '15px', color: '#fff' }}>{overlay.name}</div>
                    <div style={{ fontSize: '12px', opacity: 0.5, marginTop: '2px' }}>{overlay.desc}</div>
                  </span>
                  <div style={{
                    width: '44px',
                    height: '26px',
                    borderRadius: '13px',
                    background: overlays[overlay.id] ? '#22c55e' : 'rgba(255,255,255,0.1)',
                    padding: '2px',
                    transition: 'background 0.2s ease',
                  }}>
                    <div style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      background: '#fff',
                      transform: overlays[overlay.id] ? 'translateX(18px)' : 'translateX(0)',
                      transition: 'transform 0.2s ease',
                    }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Dina markeringar */}
            <div style={{
              background: '#0a0a0a', 
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '20px',
              padding: '8px',
              marginBottom: '16px',
            }}>
              <div style={{ 
                padding: '12px 16px 8px', 
                fontSize: '11px', 
                opacity: 0.4, 
                textTransform: 'uppercase', 
                letterSpacing: '1px' 
              }}>
                Dina markeringar
              </div>
              {[
                { id: 'symbols', name: 'Symboler', icon: '●' },
                { id: 'lines', name: 'Linjer', icon: '━' },
                { id: 'zones', name: 'Zoner', icon: '▢' },
                { id: 'arrows', name: 'Pilar', icon: '→' },
              ].map(layer => (
                <div
                  key={layer.id}
                  onClick={() => setVisibleLayers(prev => ({ ...prev, [layer.id]: !prev[layer.id] }))}
                  style={{
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: '20px', opacity: 0.6, width: '28px', textAlign: 'center' }}>
                    {layer.icon}
                  </span>
                  <span style={{ flex: 1, fontSize: '15px', color: '#fff' }}>{layer.name}</span>
                  <div style={{
                    width: '44px',
                    height: '26px',
                    borderRadius: '13px',
                    background: visibleLayers[layer.id] ? '#22c55e' : 'rgba(255,255,255,0.1)',
                    padding: '2px',
                    transition: 'background 0.2s ease',
                  }}>
                    <div style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      background: '#fff',
                      transform: visibleLayers[layer.id] ? 'translateX(18px)' : 'translateX(0)',
                      transition: 'transform 0.2s ease',
                    }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Zontyper - visas om zoner är på */}
            {visibleLayers.zones && (
              <div style={{
                background: '#0a0a0a', 
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '20px',
                padding: '8px',
                marginBottom: '16px',
              }}>
                <div style={{ 
                  padding: '12px 16px 8px', 
                  fontSize: '11px', 
                  opacity: 0.4, 
                  textTransform: 'uppercase', 
                  letterSpacing: '1px' 
                }}>
                  Zontyper
                </div>
                {zoneTypes.map(zone => (
                  <div
                    key={zone.id}
                    onClick={() => setVisibleZones(prev => ({ ...prev, [zone.id]: !prev[zone.id] }))}
                    style={{
                      padding: '14px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '6px',
                      background: `${zone.color}30`,
                      border: `2px solid ${zone.color}`,
                    }} />
                    <span style={{ flex: 1, fontSize: '15px', color: '#fff' }}>{zone.name}</span>
                    <div style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      border: visibleZones[zone.id] ? 'none' : '2px solid rgba(255,255,255,0.2)',
                      background: visibleZones[zone.id] ? '#22c55e' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {visibleZones[zone.id] && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                          <path d="M5 12 L10 17 L19 8" />
                        </svg>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Linjetyper - visas om linjer är på */}
            {visibleLayers.lines && (
              <div style={{
                background: '#0a0a0a', 
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '20px',
                padding: '8px',
                marginBottom: '16px',
              }}>
                <div style={{ 
                  padding: '12px 16px 8px', 
                  fontSize: '11px', 
                  opacity: 0.4, 
                  textTransform: 'uppercase', 
                  letterSpacing: '1px' 
                }}>
                  Linjetyper
                </div>
                {lineTypes.filter(l => !l.id.includes('sideRoad') && !l.id.includes('backRoad') && l.id !== 'stickvag').map(line => (
                  <div
                    key={line.id}
                    onClick={() => setVisibleLines(prev => ({ ...prev, [line.id]: !prev[line.id] }))}
                    style={{
                      padding: '14px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ 
                      width: '36px', 
                      height: '4px', 
                      borderRadius: '2px',
                      background: line.striped 
                        ? `repeating-linear-gradient(90deg, ${line.color} 0px, ${line.color} 4px, ${line.color2} 4px, ${line.color2} 8px)`
                        : line.color,
                    }} />
                    <span style={{ flex: 1, fontSize: '15px', color: '#fff' }}>{line.name}</span>
                    <div style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      border: visibleLines[line.id] ? 'none' : '2px solid rgba(255,255,255,0.2)',
                      background: visibleLines[line.id] ? '#22c55e' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {visibleLines[line.id] && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                          <path d="M5 12 L10 17 L19 8" />
                        </svg>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}


      {/* === FULLSKÄRMSMENY === */}
      {menuOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: '#000',
          zIndex: 500,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", sans-serif',
        }}>
          {/* Header */}
          <div style={{
            padding: '55px 20px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div 
              onClick={() => {
                if (showCamera) {
                  setShowCamera(false);
                  setDetectedColor(null);
                } else if (showColorPicker) {
                  if (selectedVagColor) {
                    setSelectedVagColor(null);
                  } else {
                    setShowColorPicker(false);
                  }
                } else if (subMenu) {
                  setSubMenu(null);
                } else if (activeCategory) {
                  setActiveCategory(null);
                } else {
                  setMenuOpen(false);
                  setMenuHeight(0);
                }
              }}
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#fff',
                opacity: 0.6,
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                {activeCategory || showCamera || showColorPicker || subMenu ? (
                  <path d="M15 18 L9 12 L15 6" />
                ) : (
                  <>
                    <path d="M18 6 L6 18" />
                    <path d="M6 6 L18 18" />
                  </>
                )}
              </svg>
            </div>
            
            <div style={{ 
              fontSize: '16px', 
              fontWeight: '500',
              flex: 1,
              textAlign: 'center',
              color: '#fff',
              opacity: 0.9,
              letterSpacing: '-0.3px',
            }}>
              {showCamera ? 'Fota snitsel' :
               showColorPicker && selectedVagColor ? `${selectedVagColor.name} väg` :
               showColorPicker ? 'Välj färg' :
               subMenu ? (
                 activeCategory === 'symbols' ? symbolCategories.find(c => c.name === subMenu)?.name :
                 subMenu === 'gps-lines' ? 'Spåra med GPS' :
                 subMenu === 'draw-lines' ? 'Rita manuellt' :
                 subMenu
               ) :
               activeCategory ? menuCategories.find(c => c.id === activeCategory)?.name :
               'Meny'}
            </div>
            
            <div style={{ width: '44px' }} />
          </div>

          {/* Innehåll */}
          <div style={{ 
            flex: 1, 
            overflowY: 'auto',
            paddingBottom: '30px',
            color: '#fff',
          }}>
            
            {/* === HUVUDMENY (3x3 grid) === */}
            {!activeCategory && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
                padding: '20px 16px',
              }}>
                {menuCategories.map(cat => (
                  <div
                    key={cat.id}
                    onClick={() => {
                      if (cat.id === 'checklist') {
                        setChecklistOpen(true);
                        setMenuOpen(false);
                        setMenuHeight(0);
                      } else if (cat.id === 'prognos') {
                        setPrognosOpen(true);
                        setMenuOpen(false);
                        setMenuHeight(0);
                      } else {
                        setActiveCategory(cat.id);
                      }
                    }}
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      borderRadius: '16px',
                      padding: '20px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '10px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ opacity: 0.7 }}>
                      {renderIcon(cat.icon, 28, '#fff')}
                    </div>
                    <span style={{ 
                      fontSize: '11px', 
                      fontWeight: '500', 
                      color: '#fff',
                      textAlign: 'center',
                    }}>
                      {cat.name}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* === SYMBOLER === */}
            {activeCategory === 'symbols' && !subMenu && (
              <div style={{ padding: '12px' }}>
                <div style={{
                  background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '20px',
                  padding: '8px',
                }}>
                  {symbolCategories.map((category) => (
                    <div
                      key={category.name}
                      onClick={() => setSubMenu(category.name)}
                      style={{
                        padding: '16px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                        borderRadius: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: category.bgColor || 'rgba(0,0,0,0.6)',
                        border: '2px solid rgba(255,255,255,0.7)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                      }}>
                        <div style={{ filter: 'drop-shadow(0 0 2px rgba(255,255,255,0.6))' }}>
                          {renderIcon(category.symbols[0]?.id || 'default', 18, '#fff')}
                        </div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '15px', color: '#fff' }}>{category.name}</div>
                        <div style={{ fontSize: '12px', opacity: 0.5, marginTop: '2px' }}>{category.symbols.length} symboler</div>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" style={{ opacity: 0.3 }}>
                        <path d="M9 6 L15 12 L9 18" />
                      </svg>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Symboler - vald kategori */}
            {activeCategory === 'symbols' && subMenu && (
              <div style={{ padding: '12px' }}>
                <div style={{
                  background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '20px',
                  padding: '20px',
                }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '16px',
                  }}>
                    {symbolCategories.find(c => c.name === subMenu)?.symbols.map(type => {
                      const bgColor = getIconBackground(type.id);
                      return (
                        <div
                          key={type.id}
                          onClick={() => {
                            setSelectedSymbol(type.id);
                            setMenuOpen(false);
                            setMenuHeight(0);
                            setSubMenu(null);
                            setActiveCategory(null);
                          }}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '16px 8px',
                            borderRadius: '12px',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '50%',
                            background: bgColor,
                            border: '2px solid rgba(255,255,255,0.7)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                          }}>
                            <div style={{ filter: 'drop-shadow(0 0 3px rgba(255,255,255,0.8))' }}>
                              {renderIcon(type.id, 24, '#fff')}
                            </div>
                          </div>
                          <span style={{ fontSize: '11px', opacity: 0.6, textAlign: 'center' }}>
                            {type.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* === LINJER === */}
            {activeCategory === 'lines' && !subMenu && (
              <div style={{ padding: '12px' }}>
                <div style={{
                  background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '20px',
                  padding: '8px',
                }}>
                  <div
                    onClick={() => setSubMenu('gps-lines')}
                    style={{
                      padding: '18px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ opacity: 0.6 }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <circle cx="12" cy="12" r="8" />
                        <line x1="12" y1="2" x2="12" y2="4" />
                        <line x1="12" y1="20" x2="12" y2="22" />
                        <line x1="2" y1="12" x2="4" y2="12" />
                        <line x1="20" y1="12" x2="22" y2="12" />
                      </svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', color: '#fff' }}>Spåra med GPS</div>
                      <div style={{ fontSize: '12px', opacity: 0.5, marginTop: '2px' }}>Gå längs linjen</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" style={{ opacity: 0.3 }}>
                      <path d="M9 6 L15 12 L9 18" />
                    </svg>
                  </div>
                  
                  <div
                    onClick={() => setSubMenu('draw-lines')}
                    style={{
                      padding: '18px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ opacity: 0.6 }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20 L4 20 Q4 12 12 12 Q20 12 20 4" />
                      </svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', color: '#fff' }}>Rita manuellt</div>
                      <div style={{ fontSize: '12px', opacity: 0.5, marginTop: '2px' }}>Tryck för punkter</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" style={{ opacity: 0.3 }}>
                      <path d="M9 6 L15 12 L9 18" />
                    </svg>
                  </div>
                </div>
              </div>
            )}

            {/* Linjer - GPS */}
            {activeCategory === 'lines' && subMenu === 'gps-lines' && (
              <div style={{ padding: '12px' }}>
                <div style={{
                  background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '20px',
                  padding: '16px',
                }}>
                  {lineTypes.filter(t => !t.id.includes('sideRoad') && !t.id.includes('backRoad') && t.id !== 'stickvag').map(type => (
                    <div
                      key={type.id}
                      onClick={() => {
                        startGpsTracking(type.id);
                        setSubMenu(null);
                        setActiveCategory(null);
                      }}
                      style={{
                        padding: '14px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                        borderRadius: '10px',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ 
                        width: '48px', 
                        height: '6px', 
                        borderRadius: '3px',
                        overflow: 'hidden',
                      }}>
                        {type.dashed ? (
                          <svg width="48" height="6">
                            <line x1="0" y1="3" x2="48" y2="3" 
                              stroke={type.color} 
                              strokeWidth="4" 
                              strokeDasharray="8,6" 
                              strokeLinecap="round"
                            />
                          </svg>
                        ) : (
                          <div style={{
                            width: '100%',
                            height: '100%',
                            background: type.striped 
                              ? `repeating-linear-gradient(90deg, ${type.color} 0px, ${type.color} 6px, ${type.color2} 6px, ${type.color2} 12px)`
                              : type.color,
                          }} />
                        )}
                      </div>
                      <span style={{ fontSize: '14px', opacity: 0.8 }}>{type.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Linjer - Rita */}
            {activeCategory === 'lines' && subMenu === 'draw-lines' && (
              <div style={{ padding: '12px' }}>
                <div style={{
                  background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '20px',
                  padding: '16px',
                }}>
                  {lineTypes.filter(t => !t.id.includes('sideRoad') && !t.id.includes('backRoad') && t.id !== 'stickvag').map(type => (
                    <div
                      key={type.id}
                      onClick={() => {
                        setDrawType(type.id);
                        setIsDrawMode(true);
                        setMenuOpen(false);
                        setMenuHeight(0);
                        setSubMenu(null);
                        setActiveCategory(null);
                      }}
                      style={{
                        padding: '14px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                        borderRadius: '10px',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ 
                        width: '48px', 
                        height: '6px', 
                        borderRadius: '3px',
                        overflow: 'hidden',
                      }}>
                        {type.dashed ? (
                          <svg width="48" height="6">
                            <line x1="0" y1="3" x2="48" y2="3" 
                              stroke={type.color} 
                              strokeWidth="4" 
                              strokeDasharray="8,6" 
                              strokeLinecap="round"
                            />
                          </svg>
                        ) : (
                          <div style={{
                            width: '100%',
                            height: '100%',
                            background: type.striped 
                              ? `repeating-linear-gradient(90deg, ${type.color} 0px, ${type.color} 6px, ${type.color2} 6px, ${type.color2} 12px)`
                              : type.color,
                          }} />
                        )}
                      </div>
                      <span style={{ fontSize: '14px', opacity: 0.8 }}>{type.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* === ZONER === */}
            {activeCategory === 'zones' && (
              <div style={{ padding: '12px' }}>
                <div style={{
                  background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '20px',
                  padding: '16px',
                }}>
                  {zoneTypes.map(type => (
                    <div
                      key={type.id}
                      onClick={() => {
                        setZoneType(type.id);
                        setIsZoneMode(true);
                        setMenuOpen(false);
                        setMenuHeight(0);
                        setActiveCategory(null);
                      }}
                      style={{
                        padding: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                        borderRadius: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '10px',
                        background: `${type.color}15`,
                        border: `1.5px solid ${type.color}50`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <div style={{
                          width: '20px',
                          height: '20px',
                          background: `${type.color}30`,
                          borderRadius: '4px',
                        }} />
                      </div>
                      <span style={{ fontSize: '15px', color: '#fff' }}>{type.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* === PILAR === */}
            {activeCategory === 'arrows' && (
              <div style={{ padding: '12px' }}>
                <div style={{
                  background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '20px',
                  padding: '20px',
                }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '12px',
                  }}>
                    {arrowTypes.map(type => (
                      <div
                        key={type.id}
                        onClick={() => {
                          setArrowType(type.id);
                          setIsArrowMode(true);
                          setMenuOpen(false);
                          setMenuHeight(0);
                          setActiveCategory(null);
                        }}
                        style={{
                          padding: '24px 16px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '14px',
                          borderRadius: '16px',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{
                          width: '56px',
                          height: '56px',
                          borderRadius: '50%',
                          background: `${type.color}15`,
                          border: `1.5px solid ${type.color}40`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          {renderIcon(type.id, 28, type.color)}
                        </div>
                        <span style={{ fontSize: '13px', opacity: 0.7 }}>{type.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* === MÄTNING === */}
            {activeCategory === 'measure' && (
              <div style={{ padding: '12px' }}>
                <div style={{
                  background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '20px',
                  padding: '8px',
                }}>
                  <div
                    onClick={() => {
                      setMeasureMode(true);
                      setMeasureAreaMode(false);
                      setMeasurePath([]);
                      setMenuOpen(false);
                      setMenuHeight(0);
                      setActiveCategory(null);
                    }}
                    style={{
                      padding: '18px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ opacity: 0.6 }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 20 L20 4" />
                        <path d="M4 20 L4 15" />
                        <path d="M4 20 L9 20" />
                        <path d="M20 4 L20 9" />
                        <path d="M20 4 L15 4" />
                      </svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', color: '#fff' }}>Mät avstånd</div>
                      <div style={{ fontSize: '12px', opacity: 0.5, marginTop: '2px' }}>Punkt till punkt</div>
                    </div>
                  </div>

                  <div
                    onClick={() => {
                      setMeasureAreaMode(true);
                      setMeasureMode(false);
                      setMeasurePath([]);
                      setMenuOpen(false);
                      setMenuHeight(0);
                      setActiveCategory(null);
                    }}
                    style={{
                      padding: '18px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ opacity: 0.6 }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 4 L20 4 L20 20 L4 20 Z" />
                        <path d="M4 4 L20 20" strokeDasharray="3,3" />
                      </svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', color: '#fff' }}>Mät area</div>
                      <div style={{ fontSize: '12px', opacity: 0.5, marginTop: '2px' }}>Rita område</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* === GALLRING === */}
            {activeCategory === 'gallring' && !showColorPicker && !showCamera && !subMenu && (
              <div style={{ padding: '12px' }}>
                {/* Huvudval */}
                <div style={{
                  background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '20px',
                  padding: '8px',
                  marginBottom: '16px',
                }}>
                  {/* Snitsla ny stickväg */}
                  <div
                    onClick={() => setShowColorPicker(true)}
                    style={{
                      padding: '18px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ opacity: 0.6 }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M12 5v14M5 12h14"/>
                      </svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', color: '#fff' }}>Snitsla ny stickväg</div>
                      <div style={{ fontSize: '12px', opacity: 0.5, marginTop: '2px' }}>Välj färg och starta GPS</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" style={{ opacity: 0.3 }}>
                      <path d="M9 6 L15 12 L9 18" />
                    </svg>
                  </div>

                  {/* Stickvägsavstånd */}
                  <div
                    onClick={() => {
                      setStickvagMode(true);
                      setMenuOpen(false);
                      setMenuHeight(0);
                      setActiveCategory(null);
                      
                      // Starta GPS-spårning om inte redan igång
                      if (!isTracking && !watchIdRef.current) {
                        navigator.geolocation.watchPosition(
                          (pos) => {
                            const newPos = { lat: pos.coords.latitude, lon: pos.coords.longitude };
                            setCurrentPosition(newPos);
                            
                            setGpsStartPos(prev => {
                              if (!prev) {
                                // Beräkna SVG-koordinater från lat/lon
                                const svgPos = latLonToSvg(newPos.lat, newPos.lon);
                                gpsMapPositionRef.current = svgPos;
                                setGpsMapPosition(svgPos);
                                return { 
                                  lat: newPos.lat, 
                                  lon: newPos.lon, 
                                  x: svgPos.x, 
                                  y: svgPos.y 
                                };
                              }
                              
                              const rawMapPos = gpsToMap(newPos.lat, newPos.lon, prev.lat, prev.lon, prev.x, prev.y);
                              gpsMapPositionRef.current = rawMapPos;
                              setGpsMapPosition(rawMapPos);
                              return prev;
                            });
                          },
                          (err) => console.log('GPS error:', err),
                          { enableHighAccuracy: true, maximumAge: 2000 }
                        );
                      }
                    }}
                    style={{
                      padding: '18px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ opacity: 0.6 }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M4 20 L20 4" />
                        <path d="M4 20 L4 15" />
                        <path d="M4 20 L9 20" />
                        <path d="M20 4 L20 9" />
                        <path d="M20 4 L15 4" />
                      </svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', color: '#fff' }}>Stickvägsavstånd</div>
                      <div style={{ fontSize: '12px', opacity: 0.5, marginTop: '2px' }}>Se avstånd till närmaste väg</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" style={{ opacity: 0.3 }}>
                      <path d="M9 6 L15 12 L9 18" />
                    </svg>
                  </div>
                </div>

                {/* Inställningar */}
                <div style={{
                  background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '20px',
                  padding: '8px',
                  marginBottom: '16px',
                }}>
                  {/* Avståndsinställningar */}
                  <div
                    onClick={() => setSubMenu('stickvag-settings')}
                    style={{
                      padding: '16px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ opacity: 0.6 }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5">
                        <circle cx="12" cy="12" r="3"/>
                        <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
                      </svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', color: '#fff' }}>Inställningar</div>
                      <div style={{ fontSize: '12px', opacity: 0.5, marginTop: '2px' }}>
                        Mål: {stickvagSettings.targetDistance}m (±{stickvagSettings.tolerance}m)
                      </div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" style={{ opacity: 0.3 }}>
                      <path d="M9 6 L15 12 L9 18" />
                    </svg>
                  </div>

                  {/* Översikt */}
                  <div
                    onClick={() => {
                      setStickvagOversikt(true);
                      setMenuOpen(false);
                      setMenuHeight(0);
                      setActiveCategory(null);
                    }}
                    style={{
                      padding: '16px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ opacity: 0.6 }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <path d="M3 9h18M9 3v18"/>
                      </svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', color: '#fff' }}>Översikt</div>
                      <div style={{ fontSize: '12px', opacity: 0.5, marginTop: '2px' }}>Se alla snitslade vägar</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" style={{ opacity: 0.3 }}>
                      <path d="M9 6 L15 12 L9 18" />
                    </svg>
                  </div>
                </div>

                {/* Statistik */}
                <div style={{
                  background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '20px',
                  padding: '20px',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: '11px', opacity: 0.3, textTransform: 'uppercase', letterSpacing: '1px' }}>
                    Sparade stickvägar
                  </div>
                  <div style={{ fontSize: '36px', fontWeight: '300', marginTop: '8px', opacity: 0.9 }}>
                    {markers.filter(m => m.isLine && (m.lineType?.startsWith('sideRoad') || m.lineType?.startsWith('backRoad'))).length}
                  </div>
                </div>
              </div>
            )}

            {/* Gallring - Färgval */}
            {activeCategory === 'gallring' && showColorPicker && !selectedVagColor && !showCamera && (
              <div style={{ padding: '12px' }}>
                {/* Fota snitsel */}
                <div style={{
                  background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '20px',
                  padding: '8px',
                  marginBottom: '16px',
                }}>
                  <div
                    onClick={() => setShowCamera(true)}
                    style={{
                      padding: '18px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ opacity: 0.6 }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5">
                        <rect x="3" y="6" width="18" height="14" rx="2"/>
                        <circle cx="12" cy="13" r="4"/>
                        <path d="M8 6V4h8v2"/>
                      </svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', color: '#fff' }}>Fota snitsel</div>
                      <div style={{ fontSize: '12px', opacity: 0.5, marginTop: '2px' }}>Appen känner igen färgen</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" style={{ opacity: 0.3 }}>
                      <path d="M9 6 L15 12 L9 18" />
                    </svg>
                  </div>
                </div>

                {/* Färgval */}
                <div style={{
                  background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '20px',
                  padding: '16px',
                }}>
                  {vagColors.map((color) => (
                    <div
                      key={color.id}
                      onClick={() => setSelectedVagColor(color)}
                      style={{
                        padding: '14px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                        borderRadius: '10px',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: color.color,
                        border: color.id === 'vit' ? '2px solid rgba(255,255,255,0.3)' : 'none',
                      }} />
                      <span style={{ fontSize: '15px', opacity: 0.8 }}>{color.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Gallring - Kamera (simulerad) */}
            {activeCategory === 'gallring' && showCamera && !detectedColor && (
              <div style={{ padding: '20px' }}>
                <div 
                  onClick={() => {
                    // Simulera färgdetektering
                    const colors = ['rod', 'gul', 'bla', 'gron', 'orange', 'vit'];
                    const randomColor = colors[Math.floor(Math.random() * colors.length)];
                    setDetectedColor(vagColors.find(c => c.id === randomColor));
                  }}
                  style={{
                    background: 'linear-gradient(180deg, #1a1a1a 0%, #2a2a2a 100%)',
                    borderRadius: '20px',
                    height: '300px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '20px',
                    cursor: 'pointer',
                    border: '2px dashed rgba(255,255,255,0.2)',
                  }}
                >
                  <div style={{ fontSize: '60px', marginBottom: '16px' }}>📷</div>
                  <div style={{ fontSize: '16px', opacity: 0.7 }}>Tryck för att fota snitsel</div>
                  <div style={{ fontSize: '13px', opacity: 0.4, marginTop: '8px' }}>(Simulerar i prototyp)</div>
                </div>

                <button
                  onClick={() => {
                    setShowCamera(false);
                    setShowColorPicker(true);
                  }}
                  style={{
                    width: '100%',
                    padding: '16px',
                    borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: 'transparent',
                    color: '#fff',
                    fontSize: '15px',
                    cursor: 'pointer',
                  }}
                >
                  Välj färg manuellt istället
                </button>
              </div>
            )}

            {/* Gallring - Hittad färg */}
            {activeCategory === 'gallring' && showCamera && detectedColor && (
              <div style={{ padding: '20px' }}>
                <div style={{
                  background: 'rgba(255,255,255,0.06)',
                  borderRadius: '20px',
                  padding: '30px',
                  textAlign: 'center',
                  marginBottom: '20px',
                }}>
                  <div style={{ fontSize: '16px', opacity: 0.6, marginBottom: '16px' }}>Appen hittade:</div>
                  <div style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    background: detectedColor.color,
                    margin: '0 auto 16px',
                    border: detectedColor.id === 'vit' ? '3px solid #ccc' : '3px solid rgba(255,255,255,0.3)',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                  }} />
                  <div style={{ fontSize: '24px', fontWeight: '700' }}>{detectedColor.name}</div>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={() => {
                      setSelectedVagColor(detectedColor);
                      setShowCamera(false);
                      setShowColorPicker(true);
                      setDetectedColor(null);
                    }}
                    style={{
                      flex: 1,
                      padding: '18px',
                      borderRadius: '14px',
                      border: 'none',
                      background: '#22c55e',
                      color: '#fff',
                      fontSize: '16px',
                      fontWeight: '700',
                      cursor: 'pointer',
                    }}
                  >
                    ✓ RÄTT
                  </button>
                  <button
                    onClick={() => {
                      setDetectedColor(null);
                      setShowCamera(false);
                      setShowColorPicker(true);
                    }}
                    style={{
                      flex: 1,
                      padding: '18px',
                      borderRadius: '14px',
                      border: '2px solid rgba(255,255,255,0.3)',
                      background: 'transparent',
                      color: '#fff',
                      fontSize: '16px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    ✕ ÄNDRA
                  </button>
                </div>
              </div>
            )}

            {/* Gallring - Välj typ (Stickväg/Backväg) */}
            {activeCategory === 'gallring' && showColorPicker && selectedVagColor && (
              <div style={{ padding: '12px' }}>
                {/* Vald färg */}
                <div style={{
                  background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '20px',
                  padding: '20px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                }}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    background: selectedVagColor.color,
                    border: selectedVagColor.id === 'vit' ? '2px solid rgba(255,255,255,0.3)' : 'none',
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '15px', color: '#fff' }}>{selectedVagColor.name} väg</div>
                    <div style={{ fontSize: '12px', opacity: 0.5, marginTop: '2px' }}>Vald färg</div>
                  </div>
                </div>

                {/* Välj typ */}
                <div style={{
                  background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '20px',
                  padding: '8px',
                  marginBottom: '16px',
                }}>
                  <div
                    onClick={() => setSelectedVagType('stickvag')}
                    style={{
                      padding: '16px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ opacity: 0.6 }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M4 12 Q8 8 12 12 Q16 16 20 12" />
                      </svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', color: '#fff' }}>Stickväg</div>
                      <div style={{ fontSize: '12px', opacity: 0.5, marginTop: '2px' }}>Snitsla ny stickväg</div>
                    </div>
                    <div style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      border: selectedVagType === 'stickvag' ? 'none' : '2px solid rgba(255,255,255,0.2)',
                      background: selectedVagType === 'stickvag' ? '#22c55e' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {selectedVagType === 'stickvag' && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                          <path d="M5 12 L10 17 L19 8" />
                        </svg>
                      )}
                    </div>
                  </div>

                  <div
                    onClick={() => setSelectedVagType('backvag')}
                    style={{
                      padding: '16px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ opacity: 0.6 }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M19 12 L5 12" />
                        <path d="M10 7 L5 12 L10 17" />
                      </svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', color: '#fff' }}>Backväg</div>
                      <div style={{ fontSize: '12px', opacity: 0.5, marginTop: '2px' }}>Markera backväg</div>
                    </div>
                    <div style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      border: selectedVagType === 'backvag' ? 'none' : '2px solid rgba(255,255,255,0.2)',
                      background: selectedVagType === 'backvag' ? '#22c55e' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {selectedVagType === 'backvag' && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                          <path d="M5 12 L10 17 L19 8" />
                        </svg>
                      )}
                    </div>
                  </div>
                </div>

                {/* Starta-knapp */}
                <div style={{
                  background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '20px',
                  padding: '8px',
                }}>
                  <div
                    onClick={() => {
                      const lineId = selectedVagType === 'backvag' 
                        ? `backRoad${selectedVagColor.name}` 
                        : `sideRoad${selectedVagColor.name}`;
                      startGpsTracking(lineId);
                      setStickvagMode(true);
                      setShowColorPicker(false);
                      setSelectedVagColor(null);
                      setActiveCategory(null);
                    }}
                    style={{
                      padding: '18px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      background: 'rgba(34,197,94,0.15)',
                    }}
                  >
                    <div style={{ color: '#22c55e' }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <circle cx="12" cy="12" r="8" />
                        <line x1="12" y1="2" x2="12" y2="4" />
                        <line x1="12" y1="20" x2="12" y2="22" />
                        <line x1="2" y1="12" x2="4" y2="12" />
                        <line x1="20" y1="12" x2="22" y2="12" />
                      </svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', color: '#fff', color: '#22c55e' }}>Starta GPS-spårning</div>
                      <div style={{ fontSize: '12px', opacity: 0.5, marginTop: '2px' }}>Börja gå längs stickvägen</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.5" style={{ opacity: 0.6 }}>
                      <path d="M9 6 L15 12 L9 18" />
                    </svg>
                  </div>
                </div>
              </div>
            )}

            {/* Gallring - Avståndsinställningar */}
            {activeCategory === 'gallring' && subMenu === 'stickvag-settings' && (
              <div style={{ padding: '20px' }}>
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '14px', opacity: 0.6, marginBottom: '8px' }}>Målavstånd</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button
                      onClick={() => setStickvagSettings(s => ({ ...s, targetDistance: Math.max(10, s.targetDistance - 1) }))}
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        border: 'none',
                        background: 'rgba(255,255,255,0.1)',
                        color: '#fff',
                        fontSize: '24px',
                        cursor: 'pointer',
                      }}
                    >
                      -
                    </button>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <span style={{ fontSize: '36px', fontWeight: '700' }}>{stickvagSettings.targetDistance}</span>
                      <span style={{ fontSize: '18px', opacity: 0.6 }}> m</span>
                    </div>
                    <button
                      onClick={() => setStickvagSettings(s => ({ ...s, targetDistance: Math.min(50, s.targetDistance + 1) }))}
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        border: 'none',
                        background: 'rgba(255,255,255,0.1)',
                        color: '#fff',
                        fontSize: '24px',
                        cursor: 'pointer',
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '14px', opacity: 0.6, marginBottom: '8px' }}>Tolerans (±)</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button
                      onClick={() => setStickvagSettings(s => ({ ...s, tolerance: Math.max(1, s.tolerance - 1) }))}
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        border: 'none',
                        background: 'rgba(255,255,255,0.1)',
                        color: '#fff',
                        fontSize: '24px',
                        cursor: 'pointer',
                      }}
                    >
                      -
                    </button>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <span style={{ fontSize: '36px', fontWeight: '700' }}>±{stickvagSettings.tolerance}</span>
                      <span style={{ fontSize: '18px', opacity: 0.6 }}> m</span>
                    </div>
                    <button
                      onClick={() => setStickvagSettings(s => ({ ...s, tolerance: Math.min(10, s.tolerance + 1) }))}
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        border: 'none',
                        background: 'rgba(255,255,255,0.1)',
                        color: '#fff',
                        fontSize: '24px',
                        cursor: 'pointer',
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div style={{
                  background: 'rgba(34,197,94,0.15)',
                  border: '1px solid rgba(34,197,94,0.3)',
                  borderRadius: '12px',
                  padding: '16px',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: '14px', opacity: 0.7 }}>Godkänt avstånd:</div>
                  <div style={{ fontSize: '20px', fontWeight: '700', color: '#22c55e' }}>
                    {stickvagSettings.targetDistance - stickvagSettings.tolerance} - {stickvagSettings.targetDistance + stickvagSettings.tolerance} m
                  </div>
                </div>
              </div>
            )}

            {/* === INSTÄLLNINGAR === */}
            {activeCategory === 'settings' && (
              <div style={{ padding: '12px' }}>
                {/* Lägen */}
                <div style={{
                  background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '20px',
                  padding: '8px',
                  marginBottom: '16px',
                }}>
                  {/* Körläge */}
                  <div
                    onClick={() => {
                      setDrivingMode(!drivingMode);
                      if (!drivingMode) {
                        setAcknowledgedWarnings([]);
                        playedWarningsRef.current.clear();
                      }
                    }}
                    style={{
                      padding: '16px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ opacity: 0.6 }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5">
                        <rect x="1" y="6" width="15" height="10" rx="1" />
                        <path d="M16 10 L20 10 L22 14 L22 16 L16 16 L16 10" />
                        <circle cx="6" cy="18" r="2" />
                        <circle cx="18" cy="18" r="2" />
                      </svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', color: '#fff' }}>Körläge</div>
                      <div style={{ fontSize: '12px', opacity: 0.5, marginTop: '2px' }}>Varningar och navigation</div>
                    </div>
                    <div style={{
                      width: '44px',
                      height: '26px',
                      borderRadius: '13px',
                      background: drivingMode ? '#22c55e' : 'rgba(255,255,255,0.1)',
                      padding: '2px',
                      transition: 'background 0.2s ease',
                    }}>
                      <div style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        background: '#fff',
                        transform: drivingMode ? 'translateX(18px)' : 'translateX(0)',
                        transition: 'transform 0.2s ease',
                      }} />
                    </div>
                  </div>

                  {/* Kompass */}
                  <div
                    onClick={() => toggleCompass()}
                    style={{
                      padding: '16px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ opacity: 0.6 }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M16.24 7.76 L14.12 14.12 L7.76 16.24 L9.88 9.88 Z" fill="#fff" />
                      </svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', color: '#fff' }}>Kompass</div>
                      <div style={{ fontSize: '12px', opacity: 0.5, marginTop: '2px' }}>Rotera kartan</div>
                    </div>
                    <div style={{
                      width: '44px',
                      height: '26px',
                      borderRadius: '13px',
                      background: compassMode ? '#22c55e' : 'rgba(255,255,255,0.1)',
                      padding: '2px',
                      transition: 'background 0.2s ease',
                    }}>
                      <div style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        background: '#fff',
                        transform: compassMode ? 'translateX(18px)' : 'translateX(0)',
                        transition: 'transform 0.2s ease',
                      }} />
                    </div>
                  </div>
                </div>

                {/* Karta */}
                <div style={{
                  background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '20px',
                  padding: '8px',
                }}>
                  {/* Lager */}
                  <div
                    onClick={() => {
                      setLayerMenuOpen(!layerMenuOpen);
                      setMenuOpen(false);
                      setMenuHeight(0);
                      setActiveCategory(null);
                    }}
                    style={{
                      padding: '16px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ opacity: 0.6 }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5">
                        <path d="M12 3 L2 8 L12 13 L22 8 Z" />
                        <path d="M2 12 L12 17 L22 12" />
                        <path d="M2 16 L12 21 L22 16" />
                      </svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', color: '#fff' }}>Lager</div>
                      <div style={{ fontSize: '12px', opacity: 0.5, marginTop: '2px' }}>Visa/dölj element</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" style={{ opacity: 0.3 }}>
                      <path d="M9 6 L15 12 L9 18" />
                    </svg>
                  </div>
                  
                  {/* Karttyp */}
                  <div
                    onClick={() => {
                      if (mapType === 'osm') setMapType('satellite');
                      else if (mapType === 'satellite') setMapType('terrain');
                      else setMapType('osm');
                    }}
                    style={{
                      padding: '16px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ opacity: 0.6 }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="3,6 9,3 15,6 21,3 21,18 15,21 9,18 3,21" />
                        <line x1="9" y1="3" x2="9" y2="18" />
                        <line x1="15" y1="6" x2="15" y2="21" />
                      </svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', color: '#fff' }}>Karttyp</div>
                      <div style={{ fontSize: '12px', opacity: 0.5, marginTop: '2px' }}>
                        {mapType === 'osm' ? 'Karta' : mapType === 'satellite' ? 'Satellit' : 'Terräng'}
                      </div>
                    </div>
                  </div>

                  {/* Visa karta */}
                  <div
                    onClick={() => setShowMap(!showMap)}
                    style={{
                      padding: '16px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ opacity: 0.6 }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5">
                        <circle cx="12" cy="12" r="9" />
                        <ellipse cx="12" cy="12" rx="9" ry="4" />
                        <line x1="12" y1="3" x2="12" y2="21" />
                      </svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', color: '#fff' }}>Visa karta</div>
                      <div style={{ fontSize: '12px', opacity: 0.5, marginTop: '2px' }}>{showMap ? 'På' : 'Av'}</div>
                    </div>
                    <div style={{
                      width: '44px',
                      height: '26px',
                      borderRadius: '13px',
                      background: showMap ? '#22c55e' : 'rgba(255,255,255,0.1)',
                      padding: '2px',
                      transition: 'background 0.2s ease',
                    }}>
                      <div style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        background: '#fff',
                        transform: showMap ? 'translateX(18px)' : 'translateX(0)',
                        transition: 'transform 0.2s ease',
                      }} />
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Meny-knapp (när stängd) */}
      {!menuOpen && (
        <div 
          onClick={() => {
            setMenuOpen(true);
            setMenuHeight(400);
          }}
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '80px',
            background: 'linear-gradient(0deg, rgba(0,0,0,0.95) 0%, transparent 100%)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            cursor: 'pointer',
            zIndex: 200,
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          <div style={{
            width: '50px',
            height: '6px',
            background: 'rgba(255,255,255,0.6)',
            borderRadius: '3px',
          }} />
        </div>
      )}


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

      {/* === STICKVÄGSAVSTÅND (bara titta) === */}
      {stickvagMode && !gpsLineType && !stickvagOversikt && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: '#000',
          zIndex: 500,
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Kartvy */}
          <div style={{ flex: 1, position: 'relative', background: '#1a1a1a' }}>
            <svg viewBox="0 0 400 600" style={{ width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid meet">
              <defs>
                <filter id="terrain-avstand">
                  <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="4" seed="42"/>
                  <feDiffuseLighting lightingColor="#444" surfaceScale="2">
                    <feDistantLight azimuth="315" elevation="40"/>
                  </feDiffuseLighting>
                </filter>
              </defs>
              <rect width="400" height="600" fill="#1a1a1a"/>
              <rect width="400" height="600" filter="url(#terrain-avstand)" opacity="0.3"/>

              {/* Alla stickvägar */}
              {markers.filter(m => m.isLine && m.path && m.path.length > 1).map((line) => {
                const lineType = lineTypes.find(t => t.id === line.lineType);
                const color = lineType?.color || '#888';
                const isBoundary = line.lineType === 'boundary';
                const isStickvag = ['sideRoadRed', 'sideRoadYellow', 'sideRoadBlue', 'stickvag'].includes(line.lineType || '');
                
                return (
                  <path key={line.id}
                    d={line.path!.map((p, i) => {
                      const relX = 200 + (p.x - gpsMapPosition.x) * 0.5;
                      const relY = 300 + (p.y - gpsMapPosition.y) * 0.5;
                      return `${i === 0 ? 'M' : 'L'} ${relX} ${relY}`;
                    }).join(' ')}
                    fill="none" 
                    stroke={color} 
                    strokeWidth={isStickvag ? 4 : isBoundary ? 2 : 3}
                    strokeLinecap="round" 
                    strokeDasharray={isBoundary ? '6,3' : 'none'} 
                    opacity={isStickvag ? 0.9 : 0.4}
                  />
                );
              })}

              {/* Linje till närmaste stickväg */}
              {(() => {
                const nearest = findNearestStickvag();
                if (!nearest?.path) return null;
                const result = getDistanceToPath(gpsMapPosition, nearest.path);
                if (!result.closestPoint) return null;
                
                const fromX = 200;
                const fromY = 300;
                const toX = 200 + (result.closestPoint.x - gpsMapPosition.x) * 0.5;
                const toY = 300 + (result.closestPoint.y - gpsMapPosition.y) * 0.5;
                
                return (
                  <line 
                    x1={fromX} y1={fromY} 
                    x2={toX} y2={toY}
                    stroke="rgba(255,255,255,0.3)" 
                    strokeWidth="1" 
                    strokeDasharray="4,4"
                  />
                );
              })()}

              {/* GPS-position (du) */}
              <circle cx={200} cy={300} r={8} fill="#fff"/>
              <circle cx={200} cy={300} r={16} fill="none" stroke="#fff" strokeWidth={1} opacity={0.4}>
                <animate attributeName="r" from="8" to="24" dur="1.5s" repeatCount="indefinite"/>
                <animate attributeName="opacity" from="0.5" to="0" dur="1.5s" repeatCount="indefinite"/>
              </circle>
            </svg>
          </div>

          {/* GPS status uppe till vänster */}
          <div style={{
            position: 'absolute',
            top: '50px',
            left: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 12px',
            borderRadius: '10px',
            background: 'rgba(0,0,0,0.5)',
          }}>
            <div style={{
              width: '6px', height: '6px',
              background: '#22c55e',
              borderRadius: '50%',
            }} />
            <span style={{ fontSize: '11px', color: '#fff', opacity: 0.6 }}>GPS</span>
          </div>

          {/* Stäng-knapp */}
          <button
            onClick={() => setStickvagMode(false)}
            style={{
              position: 'absolute',
              top: '50px',
              right: '14px',
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              border: 'none',
              background: 'rgba(0,0,0,0.5)',
              color: '#fff',
              fontSize: '18px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>

          {/* Avståndspanel längst ner */}
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '24px 24px 0 0',
            padding: '24px 20px 40px',
          }}>
            {(() => {
              const dist = getStickvagDistance();
              const stickvägar = markers.filter(m => 
                m.isLine && 
                ['sideRoadRed', 'sideRoadYellow', 'sideRoadBlue', 'stickvag'].includes(m.lineType || '')
              );
              
              if (stickvägar.length === 0) {
                return (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '17px', opacity: 0.5, marginBottom: '8px' }}>
                      Inga stickvägar
                    </div>
                    <div style={{ fontSize: '14px', opacity: 0.3 }}>
                      Snitsla din första stickväg för att se avstånd
                    </div>
                  </div>
                );
              }
              
              const { targetDistance, tolerance } = stickvagSettings;
              const minOk = targetDistance - tolerance;
              const maxOk = targetDistance + tolerance;
              const isOk = dist !== null && dist >= minOk && dist <= maxOk;
              const isTooClose = dist !== null && dist < minOk;
              const isTooFar = dist !== null && dist > maxOk;
              
              return (
                <>
                  {/* Avstånd */}
                  <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                    <div style={{ 
                      fontSize: '64px', 
                      fontWeight: '300',
                      color: isOk ? '#22c55e' : isTooClose ? '#ef4444' : '#f59e0b',
                      lineHeight: 1,
                    }}>
                      {dist !== null ? dist : '--'}
                    </div>
                    <div style={{ fontSize: '18px', opacity: 0.4, marginTop: '4px' }}>
                      meter till närmaste stickväg
                    </div>
                  </div>
                  
                  {/* Status */}
                  <div style={{
                    padding: '12px 16px',
                    borderRadius: '12px',
                    background: isOk ? 'rgba(34,197,94,0.15)' : isTooClose ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                    textAlign: 'center',
                  }}>
                    <span style={{ 
                      fontSize: '15px',
                      color: isOk ? '#22c55e' : isTooClose ? '#ef4444' : '#f59e0b',
                    }}>
                      {isOk ? '✓ Perfekt avstånd' : isTooClose ? '⚠ För nära' : '⚠ För långt'}
                    </span>
                    <span style={{ fontSize: '13px', opacity: 0.5, marginLeft: '8px' }}>
                      (mål: {targetDistance}m ±{tolerance}m)
                    </span>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* === STICKVÄGSVY (TESLA-STIL) === */}
      {stickvagMode && gpsLineType && previousStickvagRef.current && !stickvagOversikt && !showSavedPopup && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: '#000',
          zIndex: 500,
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Header med GPS-knapp som öppnar översikt */}
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0,
            padding: '50px 14px 10px',
            background: 'linear-gradient(180deg, rgba(0,0,0,0.8) 0%, transparent 100%)',
            zIndex: 10,
          }}>
            <button
              onClick={() => setStickvagOversikt(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 12px',
                borderRadius: '10px',
                border: 'none',
                background: 'rgba(255,255,255,0.08)',
                cursor: 'pointer',
              }}
            >
              <div style={{
                width: '6px', height: '6px',
                background: gpsPaused ? '#666' : '#22c55e',
                borderRadius: '50%',
              }} />
              <span style={{ fontSize: '11px', color: '#fff', opacity: 0.6 }}>GPS</span>
            </button>
          </div>
          
          {/* Kartvy */}
          <div style={{ flex: 1, position: 'relative', background: '#1a1a1a' }}>
            <svg viewBox="0 0 400 600" style={{ width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid meet">
              <defs>
                <filter id="terrain-stickvag">
                  <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="4" seed="42"/>
                  <feDiffuseLighting lightingColor="#444" surfaceScale="2">
                    <feDistantLight azimuth="315" elevation="40"/>
                  </feDiffuseLighting>
                </filter>
              </defs>
              <rect width="400" height="600" fill="#1a1a1a"/>
              <rect width="400" height="600" filter="url(#terrain-stickvag)" opacity="0.3"/>
              <ellipse cx="80" cy="450" rx="40" ry="60" fill="#1e40af" opacity="0.2"/>
              <ellipse cx="350" cy="200" rx="35" ry="50" fill="#1e40af" opacity="0.15"/>
              
              {/* Förra vägen */}
              {previousStickvagRef.current?.path && (() => {
                const prevColor = lineTypes.find(t => t.id === previousStickvagRef.current.lineType)?.color || '#ef4444';
                return (
                  <path
                    d={previousStickvagRef.current.path.map((p, i) => {
                      const relX = 120 + (p.x - gpsMapPositionRef.current.x) * 0.6;
                      const relY = 300 + (p.y - gpsMapPositionRef.current.y) * 0.6;
                      return `${i === 0 ? 'M' : 'L'} ${relX} ${relY}`;
                    }).join(' ')}
                    fill="none" stroke={prevColor} strokeWidth={8}
                    strokeLinecap="round" strokeLinejoin="round" opacity={0.8}
                  />
                );
              })()}
              
              {/* Avståndslinje */}
              {(() => {
                const dist = getStickvagDistance();
                if (!dist || !previousStickvagRef.current?.path) return null;
                const result = getDistanceToPath(gpsMapPositionRef.current, previousStickvagRef.current.path);
                const closestX = 120 + (result.closestPoint.x - gpsMapPositionRef.current.x) * 0.6;
                const closestY = 300 + (result.closestPoint.y - gpsMapPositionRef.current.y) * 0.6;
                return (
                  <>
                    <line x1={closestX} y1={closestY} x2={280} y2={300}
                      stroke="rgba(255,255,255,0.4)" strokeWidth={1} strokeDasharray="5, 4"/>
                    <g transform={`translate(${(closestX + 280) / 2}, ${(closestY + 300) / 2 - 14})`}>
                      <rect x="-20" y="-12" width="40" height="20" rx="6" fill="rgba(0,0,0,0.7)"/>
                      <text x="0" y="3" fill="#fff" fontSize="12" textAnchor="middle" fontWeight="500">{dist}m</text>
                    </g>
                  </>
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
                    fill="none" stroke={currentColor} strokeWidth={5}
                    strokeDasharray="8, 6" opacity={0.6} strokeLinecap="round"
                  />
                );
              })()}
              
              {/* GPS-punkt (du) */}
              <circle cx={280} cy={300} r={30} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={1}>
                <animate attributeName="r" from="12" to="35" dur="2s" repeatCount="indefinite"/>
                <animate attributeName="opacity" from="0.3" to="0" dur="2s" repeatCount="indefinite"/>
              </circle>
              <circle cx={280} cy={300} r={12} fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.2)" strokeWidth={1}/>
              <circle cx={280} cy={300} r={5} fill="#fff"/>
              <path d="M 280,278 L 274,290 L 286,290 Z" fill="rgba(255,255,255,0.8)"/>
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
          
          {/* Status och knappar */}
          <div style={{
            position: 'absolute',
            bottom: 0, left: 0, right: 0,
            background: 'linear-gradient(0deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.7) 70%, transparent 100%)',
            padding: '50px 14px 30px',
            textAlign: 'center',
          }}>
            {(() => {
              const dist = getStickvagDistance();
              const { targetDistance, tolerance } = stickvagSettings;
              let status: 'good' | 'close' | 'far' = 'good';
              if (dist !== null) {
                if (dist < targetDistance - tolerance) status = 'close';
                else if (dist > targetDistance + tolerance) status = 'far';
              }
              return (
                <>
                  {status === 'good' ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '14px' }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5">
                        <circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/>
                      </svg>
                      <span style={{ fontSize: '16px', color: '#fff', opacity: 0.9 }}>Markera här</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '14px' }}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" 
                        stroke={status === 'close' ? '#f59e0b' : '#ef4444'} strokeWidth="1.5"
                        style={{ transform: status === 'close' ? 'rotate(0)' : 'rotate(180deg)' }}>
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                      </svg>
                      <span style={{ fontSize: '16px', color: status === 'close' ? '#f59e0b' : '#ef4444' }}>
                        {status === 'close' ? 'Längre bort' : 'Gå tillbaka'}
                      </span>
                    </div>
                  )}
                </>
              );
            })()}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={toggleGpsPause} style={{
                flex: 1, padding: '14px', borderRadius: '10px', border: 'none',
                background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '13px', opacity: 0.7, cursor: 'pointer',
              }}>
                {gpsPaused ? '▶ Fortsätt' : '⏸ Paus'}
              </button>
              <button onClick={saveAndShowPopup} style={{
                flex: 1, padding: '14px', borderRadius: '10px', border: 'none',
                background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px', opacity: 0.9, cursor: 'pointer',
              }}>
                ✓ Spara
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === VÄG SPARAD POPUP === */}
      {showSavedPopup && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: '#000',
          zIndex: 510,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%',
            background: 'rgba(34, 197, 94, 0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: '16px',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
              <path d="M5 12l5 5L20 7"/>
            </svg>
          </div>
          
          <div style={{ fontSize: '18px', fontWeight: '500', marginBottom: '6px', opacity: 0.9, color: '#fff' }}>
            Väg sparad
          </div>
          <div style={{ fontSize: '12px', opacity: 0.5, marginBottom: '32px', color: '#fff' }}>
            {markers.filter(m => m.isLine && ['sideRoadRed', 'sideRoadYellow', 'sideRoadBlue'].includes(m.lineType || '')).length} vägar totalt
          </div>

          <div style={{
            background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '20px',
            width: '100%', maxWidth: '260px',
          }}>
            <div style={{ 
              fontSize: '10px', opacity: 0.4, marginBottom: '16px',
              textTransform: 'uppercase', letterSpacing: '1.5px', textAlign: 'center', color: '#fff',
            }}>
              Nästa väg
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginBottom: '20px' }}>
              {[
                { id: 'rod', color: '#ef4444' },
                { id: 'gul', color: '#fbbf24' },
                { id: 'bla', color: '#3b82f6' },
              ].map((f) => (
                <button key={f.id} onClick={() => continueWithColor(f.id)} style={{
                  width: '56px', height: '56px', borderRadius: '16px',
                  border: savedVagColor === f.color ? '2px solid rgba(255,255,255,0.4)' : '2px solid transparent',
                  background: f.color, cursor: 'pointer',
                }} />
              ))}
            </div>

            <button onClick={() => continueWithColor('rod')} style={{
              width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
              background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: '14px',
              fontWeight: '500', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}>
              Fortsätt
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </button>
          </div>

          <button onClick={() => {
            setShowSavedPopup(false);
            setStickvagMode(false);
            previousStickvagRef.current = null;
          }} style={{
            marginTop: '20px', padding: '12px 24px', borderRadius: '10px',
            border: 'none', background: 'transparent', color: '#fff',
            fontSize: '13px', opacity: 0.4, cursor: 'pointer',
          }}>
            Avsluta snitsling
          </button>
        </div>
      )}

      {/* === STICKVÄGSVY ÖVERSIKT (TESLA-STIL) === */}
      {stickvagOversikt && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: '#000',
          zIndex: 501,
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
            <svg viewBox="0 0 400 600" style={{ width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid meet">
              <defs>
                <filter id="terrain-oversikt">
                  <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="4" seed="42"/>
                  <feDiffuseLighting lightingColor="#444" surfaceScale="2">
                    <feDistantLight azimuth="315" elevation="40"/>
                  </feDiffuseLighting>
                </filter>
              </defs>
              <rect width="400" height="600" fill="#1a1a1a"/>
              <rect width="400" height="600" filter="url(#terrain-oversikt)" opacity="0.3"/>
              <ellipse cx="80" cy="450" rx="40" ry="60" fill="#1e40af" opacity="0.2"/>
              <ellipse cx="350" cy="200" rx="35" ry="50" fill="#1e40af" opacity="0.15"/>
              <rect x="60" y="80" width="280" height="440" fill="none" 
                stroke="#fff" strokeWidth="0.5" strokeDasharray="6,4" opacity="0.15" rx="4"/>

              {/* Alla vägar */}
              {markers.filter(m => m.isLine).map((line) => {
                const lineType = lineTypes.find(t => t.id === line.lineType);
                const color = lineType?.color || '#888';
                const isBoundary = line.lineType === 'boundary';
                if (!line.path || line.path.length < 2) return null;
                
                const allPaths = markers.filter(m => m.isLine && m.path);
                let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                allPaths.forEach(l => {
                  l.path?.forEach(p => {
                    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
                    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
                  });
                });
                const centerX = (minX + maxX) / 2;
                const centerY = (minY + maxY) / 2;
                const viewScale = Math.min(
                  (maxX - minX) > 0 ? 300 / (maxX - minX) : 1,
                  (maxY - minY) > 0 ? 450 / (maxY - minY) : 1, 1
                ) * 0.7;
                
                return (
                  <path key={line.id}
                    d={line.path.map((p, i) => {
                      const x = 200 + (p.x - centerX) * viewScale;
                      const y = 300 + (p.y - centerY) * viewScale;
                      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                    }).join(' ')}
                    fill="none" stroke={color} strokeWidth={isBoundary ? 2 : 3}
                    strokeLinecap="round" strokeDasharray={isBoundary ? '6,3' : 'none'} opacity={0.8}
                  />
                );
              })}
              
              {/* Pågående väg (streckad) */}
              {gpsPath.length > 0 && (() => {
                const allPaths = markers.filter(m => m.isLine && m.path);
                let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                allPaths.forEach(l => {
                  l.path?.forEach(p => {
                    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
                    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
                  });
                });
                gpsPath.forEach(p => {
                  minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
                  minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
                });
                
                const centerX = (minX + maxX) / 2;
                const centerY = (minY + maxY) / 2;
                const viewScale = Math.min(
                  (maxX - minX) > 0 ? 300 / (maxX - minX) : 1,
                  (maxY - minY) > 0 ? 450 / (maxY - minY) : 1, 1
                ) * 0.7;
                
                const currentColor = lineTypes.find(t => t.id === gpsLineType)?.color || '#fbbf24';
                
                return (
                  <path
                    d={gpsPath.map((p, i) => {
                      const x = 200 + (p.x - centerX) * viewScale;
                      const y = 300 + (p.y - centerY) * viewScale;
                      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                    }).join(' ')}
                    fill="none" stroke={currentColor} strokeWidth={3}
                    strokeDasharray="6, 4" strokeLinecap="round" opacity={0.6}
                  />
                );
              })()}
              
              {/* GPS-position */}
              {(() => {
                const allPaths = markers.filter(m => m.isLine && m.path);
                if (allPaths.length === 0) {
                  return <circle cx={200} cy={300} r={6} fill="#fff"/>;
                }
                let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                allPaths.forEach(l => {
                  l.path?.forEach(p => {
                    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
                    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
                  });
                });
                const centerX = (minX + maxX) / 2;
                const centerY = (minY + maxY) / 2;
                const viewScale = Math.min(
                  (maxX - minX) > 0 ? 300 / (maxX - minX) : 1,
                  (maxY - minY) > 0 ? 450 / (maxY - minY) : 1, 1
                ) * 0.7;
                const gpsX = 200 + (gpsMapPositionRef.current.x - centerX) * viewScale;
                const gpsY = 300 + (gpsMapPositionRef.current.y - centerY) * viewScale;
                return (
                  <>
                    <circle cx={gpsX} cy={gpsY} r={6} fill="#fff"/>
                    <circle cx={gpsX} cy={gpsY} r={12} fill="none" stroke="#fff" strokeWidth={1} opacity={0.4}>
                      <animate attributeName="r" from="6" to="16" dur="1.5s" repeatCount="indefinite"/>
                      <animate attributeName="opacity" from="0.5" to="0" dur="1.5s" repeatCount="indefinite"/>
                    </circle>
                  </>
                );
              })()}
            </svg>
          </div>

          {/* GPS vänster */}
          <div style={{ position: 'absolute', top: '50px', left: '14px', zIndex: 10 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 12px', borderRadius: '10px', background: 'rgba(0,0,0,0.5)',
            }}>
              <div style={{ width: '6px', height: '6px', background: gpsPaused ? '#666' : '#22c55e', borderRadius: '50%' }} />
              <span style={{ fontSize: '11px', color: '#fff', opacity: 0.6 }}>GPS</span>
            </div>
          </div>

          {/* Stäng */}
          <button onClick={() => setStickvagOversikt(false)} style={{
            position: 'absolute', top: '50px', right: '14px',
            width: '40px', height: '40px', borderRadius: '10px',
            border: 'none', background: 'rgba(0,0,0,0.5)',
            color: '#fff', fontSize: '16px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: 0.8, zIndex: 10,
          }}>
            ✕
          </button>

          {/* Zoom */}
          <div style={{
            position: 'absolute', bottom: '30px', right: '14px',
            display: 'flex', flexDirection: 'column', gap: '4px', zIndex: 10,
          }}>
            <button
              onClick={() => setZoom(z => Math.min(2.5, z + 0.25))}
              style={{
                width: '40px', height: '40px', borderRadius: '10px',
                border: 'none', background: 'rgba(0,0,0,0.4)',
                color: '#fff', fontSize: '18px', fontWeight: '300',
                cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                opacity: 0.3,
              }}
            >
              +
            </button>
            <button
              onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
              style={{
                width: '40px', height: '40px', borderRadius: '10px',
                border: 'none', background: 'rgba(0,0,0,0.4)',
                color: '#fff', fontSize: '18px', fontWeight: '300',
                cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                opacity: 0.3,
              }}
            >
              −
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
