"use client";

import React, { useState, useEffect, useRef } from 'react';

export default function PlannerPage() {
  const [markers, setMarkers] = useState<any[]>([]);
  
  const [showInfo, setShowInfo] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [showGpsMenu, setShowGpsMenu] = useState(false);
  const [showDrawMenu, setShowDrawMenu] = useState(false);
  const [showZoneMenu, setShowZoneMenu] = useState(false);
  const [activeLayer, setActiveLayer] = useState('moisture');
  
  const [pendingMarker, setPendingMarker] = useState(null);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [showSymbolMenu, setShowSymbolMenu] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  
  // Nya v10 states
  const [showTaskList, setShowTaskList] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [taskFilter, setTaskFilter] = useState('all');
  const [activeView, setActiveView] = useState('all');
  const [measureMode, setMeasureMode] = useState(null);
  const [measurePoints, setMeasurePoints] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [currentUser, setCurrentUser] = useState('');
  
  // Load user from localStorage on client side
  useEffect(() => {
    const savedUser = localStorage.getItem('forestPlannerUser');
    if (savedUser) setCurrentUser(savedUser);
  }, []);
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [editingMarker, setEditingMarker] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [touchStart, setTouchStart] = useState(null);
  const [touchStartAngle, setTouchStartAngle] = useState(0);
  const [touchStartRotation, setTouchStartRotation] = useState(0);
  const [singleTouchStart, setSingleTouchStart] = useState(null);
  const audioContextRef = useRef(null);
  
  const [isDrawMode, setIsDrawMode] = useState(false);
  const [drawType, setDrawType] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState([]);
  const [pendingLine, setPendingLine] = useState(null);
  const [drawnPath, setDrawnPath] = useState([]);
  
  const [isZoneMode, setIsZoneMode] = useState(false);
  const [zoneType, setZoneType] = useState(null);
  const [pendingZone, setPendingZone] = useState(null);
  const [drawnZonePath, setDrawnZonePath] = useState([]);
  
  // Pilar
  const [isArrowMode, setIsArrowMode] = useState(false);
  const [arrowType, setArrowType] = useState(null);
  const [pendingArrow, setPendingArrow] = useState(null);
  const [showArrowMenu, setShowArrowMenu] = useState(false);
  
  // Drag/flytta markeringar
  const [draggingMarker, setDraggingMarker] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  // Rotera pilar med finger
  const [rotatingArrow, setRotatingArrow] = useState(null);
  
  // Redigera linjepunkter
  const [editingLine, setEditingLine] = useState(null);
  const [draggingPointIndex, setDraggingPointIndex] = useState(null);
  
  // Gallring/stickvägsguide
  const [stripRoadGuide, setStripRoadGuide] = useState(false);
  const [guideDistance, setGuideDistance] = useState({ min: 25, max: 30 });
  const [guideSource, setGuideSource] = useState({ stripRoads: true, boundary: false }); // Vad ska vi mäta mot?
  const [boundaryDistance, setBoundaryDistance] = useState(15); // Avstånd från gräns
  const [nearestStripRoad, setNearestStripRoad] = useState(null);
  const [nearestBoundary, setNearestBoundary] = useState(null);
  const wasInStripRoadZone = useRef(false);
  const wasInBoundaryZone = useRef(false);
  
  const [isTracking, setIsTracking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [trackingType, setTrackingType] = useState(null);
  const [trackingPath, setTrackingPath] = useState([]);
  const [gpsStatus, setGpsStatus] = useState(null);
  const [currentPosition, setCurrentPosition] = useState(null);
  const watchIdRef = useRef(null);
  const wakeLockRef = useRef(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  
  const mapRef = useRef(null);
  
  const [saveStatus, setSaveStatus] = useState(null);
  const [lastSaved, setLastSaved] = useState(null);
  
  const [visibleCategories, setVisibleCategories] = useState({
    harvester: true,
    forwarder: true,
    manual: true
  });
  
  const [visibleLines, setVisibleLines] = useState({
    boundary: true,
    mainRoad: true,
    sideRoadRed: true,
    sideRoadYellow: true,
    sideRoadBlue: true,
    nature: true,
    ditch: true,
  });
  
  const [visibleZones, setVisibleZones] = useState({
    wet: true,
    steep: true,
    protected: true,
  });

  const categories = [
    { id: 'harvester', name: 'Skördare', color: '#f59e0b', icon: '🌲' },
    { id: 'forwarder', name: 'Skotare', color: '#3b82f6', icon: '🚜' },
    { id: 'manual', name: 'Manuellt', color: '#ef4444', icon: '🪓' },
  ];

  const lineTypes = [
    { id: 'boundary', name: 'Traktgräns', color: '#ef4444', color2: '#fbbf24', striped: true },
    { id: 'mainRoad', name: 'Basväg', color: '#3b82f6', color2: '#fbbf24', striped: true },
    { id: 'sideRoadRed', name: 'Stickväg Röd', color: '#ef4444', striped: false },
    { id: 'sideRoadYellow', name: 'Stickväg Gul', color: '#fbbf24', striped: false },
    { id: 'sideRoadBlue', name: 'Stickväg Blå', color: '#3b82f6', striped: false },
    { id: 'nature', name: 'Naturvård', color: '#22c55e', color2: '#ef4444', striped: true },
    { id: 'ditch', name: 'Dike', color: '#06b6d4', color2: '#0e7490', striped: true },
  ];

  const zoneTypes = [
    { id: 'wet', name: 'Blött', color: '#3b82f6', icon: '💧', description: 'Blött/sumpigt område' },
    { id: 'steep', name: 'Brant', color: '#f59e0b', icon: '⛰️', description: 'Brant lutning' },
    { id: 'protected', name: 'Skyddat', color: '#22c55e', icon: '🌳', description: 'Skyddsvärd natur' },
  ];

  // Piltyper
  const arrowTypes = [
    { id: 'felling', name: 'Fällriktning', color: '#22c55e', icon: '🌲', description: 'Fäll träd åt detta håll' },
    { id: 'drive', name: 'Körriktning', color: '#3b82f6', icon: '🚜', description: 'Kör denna riktning' },
  ];

  const markerTypes = [
    { id: 'general', name: 'Allmän', icon: '📍', requireComment: false },
    { id: 'warning', name: 'Varning', icon: '⚠️', requireComment: true },
    { id: 'windfall', name: 'Vindfälle', icon: '🌪️', requireComment: false },
    { id: 'powerline', name: 'Ledning', icon: '⚡', requireComment: true },
    { id: 'ditchPoint', name: 'Dike', icon: '〰️', requireComment: false },
    { id: 'corduroy', name: 'Kavling', icon: '🪵', requireComment: false },
    { id: 'hillroad', name: 'Backväg', icon: '⛰️', requireComment: false },
    { id: 'nature', name: 'Naturvård', icon: '🌳', requireComment: true },
    { id: 'eternityTree', name: 'Evighetsträd', icon: '🌲', requireComment: true },
    { id: 'water', name: 'Vatten/Källa', icon: '💧', requireComment: false },
    { id: 'fellingHeavy', name: 'Grovt träd - fäll', icon: '🪓', requireComment: false },
    { id: 'fellingForward', name: 'Framfällning', icon: '➡️', requireComment: false },
    { id: 'leaveTree', name: 'Lämna träd', icon: '🛑', requireComment: true },
    { id: 'brushing', name: 'Risa här', icon: '🌿', requireComment: false },
    { id: 'twoWay', name: 'Kör från två håll', icon: '↔️', requireComment: false },
    { id: 'landing', name: 'Avlägg', icon: '📦', requireComment: false },
    { id: 'loadPoint', name: 'Lastpunkt', icon: '🎯', requireComment: false },
    { id: 'start', name: 'Startpunkt', icon: '▶️', requireComment: false },
  ];

  // Varningsradier (meter)
  const warningRadii = [
    { value: 0, label: 'Ingen' },
    { value: 10, label: '10m' },
    { value: 20, label: '20m' },
    { value: 30, label: '30m' },
    { value: 50, label: '50m' },
  ];

  const tractInfo = {
    id: '880178',
    name: 'Stenshult 1:4',
    area: '12.4 ha',
    volume: '2,840 m³fub',
    dominant: 'Gran 78%',
    avgHeight: '24 m',
    terrain: 'Kuperad',
    soilType: 'Morän/Torv',
  };

  const mapCoords = {
    minLat: 56.438,
    maxLat: 56.447,
    minLon: 14.658,
    maxLon: 14.672,
  };

  // === NYA V10 FUNKTIONER ===
  
  // Hämta kategorier för en markering
  const getCategories = (marker) => {
    if (marker.categories) return marker.categories;
    if (marker.category) return [marker.category];
    return ['harvester'];
  };

  // Ljud
  const getAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    // iOS kräver att AudioContext "resumed" efter användarinteraktion
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  };
  
  // Unlock audio på iOS vid första interaktion
  const unlockAudio = () => {
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    // Ta bort listeners efter första unlock
    document.removeEventListener('touchstart', unlockAudio);
    document.removeEventListener('click', unlockAudio);
  };
  
  useEffect(() => {
    // Lägg till listeners för att unlocka audio på iOS
    document.addEventListener('touchstart', unlockAudio, { once: true });
    document.addEventListener('click', unlockAudio, { once: true });
    return () => {
      document.removeEventListener('touchstart', unlockAudio);
      document.removeEventListener('click', unlockAudio);
    };
  }, []);
  
  // Wake Lock - håll skärmen vaken
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        setWakeLockActive(true);
        console.log('Wake Lock aktiverat - skärmen hålls vaken');
        
        // Lyssna på om wake lock släpps (t.ex. vid tab-byte)
        wakeLockRef.current.addEventListener('release', () => {
          setWakeLockActive(false);
          console.log('Wake Lock släppt');
        });
      }
    } catch (e) {
      console.log('Wake Lock kunde inte aktiveras:', e);
      setWakeLockActive(false);
    }
  };
  
  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
      setWakeLockActive(false);
    }
  };
  
  // Återaktivera wake lock när sidan blir synlig igen
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && (isTracking || stripRoadGuide)) {
        await requestWakeLock();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isTracking, stripRoadGuide]);
  
  const playWarningSound = (type = 'warning') => {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      
      // Extra check för iOS
      if (ctx.state === 'suspended') {
        ctx.resume().then(() => playWarningSound(type));
        return;
      }
      
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      if (type === 'critical') {
        // Skarpt pip-pip-pip för "för nära"
        oscillator.frequency.value = 880;
        oscillator.type = 'square';
        gainNode.gain.value = 0.4;
        const now = ctx.currentTime;
        for (let i = 0; i < 3; i++) {
          gainNode.gain.setValueAtTime(0.4, now + i * 0.2);
          gainNode.gain.setValueAtTime(0, now + i * 0.2 + 0.1);
        }
        oscillator.start(now);
        oscillator.stop(now + 0.6);
      } else if (type === 'warning') {
        // Fallande ton för "för långt"
        oscillator.frequency.value = 660;
        oscillator.type = 'sine';
        gainNode.gain.value = 0.3;
        const now = ctx.currentTime;
        oscillator.frequency.setValueAtTime(660, now);
        oscillator.frequency.setValueAtTime(440, now + 0.2);
        oscillator.start(now);
        oscillator.stop(now + 0.4);
      } else if (type === 'success') {
        // Stigande ton för "rätt avstånd"
        oscillator.frequency.value = 440;
        oscillator.type = 'sine';
        gainNode.gain.value = 0.2;
        const now = ctx.currentTime;
        oscillator.frequency.setValueAtTime(440, now);
        oscillator.frequency.setValueAtTime(880, now + 0.15);
        oscillator.start(now);
        oscillator.stop(now + 0.2);
      }
    } catch (e) {
      console.log('Ljud kunde inte spelas:', e);
    }
  };

  // Zoom
  const zoomIn = () => setZoom(z => Math.min(z + 0.25, 3));
  const zoomOut = () => setZoom(z => Math.max(z - 0.25, 0.5));
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); setRotation(0); };
  
  const handleWheel = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else zoomOut();
    }
  };

  // Pan
  const handlePanStart = (e) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handlePanMove = (e) => {
    // Linjeredigering - dra punkt (mus)
    if (editingLine && draggingPointIndex !== null) {
      const rect = e.currentTarget.getBoundingClientRect();
      handleLinePointDrag(e.clientX, e.clientY, rect);
      return;
    }
    
    // Rotations-läge (mus)
    if (rotatingArrow) {
      const rect = e.currentTarget.getBoundingClientRect();
      handleRotateMove(e.clientX, e.clientY, rect);
      return;
    }
    
    // Drag-läge (mus)
    if (draggingMarker) {
      const rect = e.currentTarget.getBoundingClientRect();
      handleDragMove(e.clientX, e.clientY, rect);
      return;
    }
    
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  };

  const handlePanEnd = () => {
    setIsPanning(false);
    if (draggingMarker) endDrag();
    if (rotatingArrow) endRotate();
    if (draggingPointIndex !== null) setDraggingPointIndex(null);
  };

  // Touch
  const getTouchAngle = (touches) => {
    const dx = touches[1].clientX - touches[0].clientX;
    const dy = touches[1].clientY - touches[0].clientY;
    return Math.atan2(dy, dx) * (180 / Math.PI);
  };
  
  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      setSingleTouchStart(null);
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      setTouchStart({ x: midX - pan.x, y: midY - pan.y });
      setTouchStartAngle(getTouchAngle(e.touches));
      setTouchStartRotation(rotation);
    } else if (e.touches.length === 1) {
      const noToolActive = !selectedSymbol && !isDrawMode && !isZoneMode && !measureMode && !isTracking;
      if (noToolActive) {
        setSingleTouchStart({ x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y });
      }
    }
  };

  const handleTouchMove = (e) => {
    // Linjeredigering - dra punkt (touch)
    if (editingLine && draggingPointIndex !== null && e.touches.length === 1) {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      handleLinePointDrag(e.touches[0].clientX, e.touches[0].clientY, rect);
      return;
    }
    
    // Rotations-läge
    if (rotatingArrow && e.touches.length === 1) {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      handleRotateMove(e.touches[0].clientX, e.touches[0].clientY, rect);
      return;
    }
    
    // Drag-läge
    if (draggingMarker && e.touches.length === 1) {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      handleDragMove(e.touches[0].clientX, e.touches[0].clientY, rect);
      return;
    }
    
    if (e.touches.length === 2 && touchStart) {
      e.preventDefault();
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      setPan({ x: midX - touchStart.x, y: midY - touchStart.y });
      const currentAngle = getTouchAngle(e.touches);
      setRotation(touchStartRotation + (currentAngle - touchStartAngle));
    } else if (e.touches.length === 1 && singleTouchStart) {
      setPan({ x: e.touches[0].clientX - singleTouchStart.x, y: e.touches[0].clientY - singleTouchStart.y });
    }
  };

  const handleTouchEnd = () => { 
    setTouchStart(null); 
    setSingleTouchStart(null);
    if (draggingMarker) endDrag();
    if (rotatingArrow) endRotate();
    if (draggingPointIndex !== null) setDraggingPointIndex(null);
  };

  // Koordinatkonvertering
  const screenToMap = (screenX, screenY, rect) => {
    const svgX = screenX - rect.left;
    const svgY = screenY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const afterPanX = svgX - pan.x;
    const afterPanY = svgY - pan.y;
    const dx = afterPanX - centerX;
    const dy = afterPanY - centerY;
    const rad = -rotation * (Math.PI / 180);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const rotatedX = dx * cos - dy * sin;
    const rotatedY = dx * sin + dy * cos;
    return { x: (rotatedX + centerX) / zoom, y: (rotatedY + centerY) / zoom };
  };

  // Mätning
  const calculateDistance = (points) => {
    if (points.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i-1].x;
      const dy = points[i].y - points[i-1].y;
      total += Math.sqrt(dx * dx + dy * dy);
    }
    return total * 2;
  };

  const formatDistance = (m) => m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`;

  // Beräkna avstånd från punkt till linjesegment
  const pointToSegmentDistance = (px, py, x1, y1, x2, y2) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;
    
    if (lengthSq === 0) {
      // Linjen är en punkt
      return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    }
    
    // Projicera punkten på linjen
    let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));
    
    const nearestX = x1 + t * dx;
    const nearestY = y1 + t * dy;
    
    return Math.sqrt((px - nearestX) ** 2 + (py - nearestY) ** 2);
  };

  // Beräkna avstånd från punkt till hel linje (path)
  const pointToPathDistance = (px, py, path) => {
    if (!path || path.length < 2) return Infinity;
    
    let minDist = Infinity;
    for (let i = 1; i < path.length; i++) {
      const dist = pointToSegmentDistance(px, py, path[i-1].x, path[i-1].y, path[i].x, path[i].y);
      if (dist < minDist) minDist = dist;
    }
    return minDist;
  };

  // Hitta avstånd till SENASTE stickvägen
  const findNearestStripRoad = (px, py) => {
    // Stickvägar har id som börjar med 'sideRoad'
    const stripRoads = markers.filter(m => m.isLine && m.lineType && m.lineType.startsWith('sideRoad'));
    
    if (stripRoads.length === 0) return null;
    
    // Hitta senaste (högst id)
    const latestRoad = stripRoads.reduce((latest, road) => road.id > latest.id ? road : latest, stripRoads[0]);
    
    const dist = pointToPathDistance(px, py, latestRoad.path);
    
    // Konvertera pixlar till meter (2m per pixel approximation)
    const distanceMeters = dist * 2;
    
    return {
      road: latestRoad,
      distance: distanceMeters,
      inZone: distanceMeters >= guideDistance.min && distanceMeters <= guideDistance.max,
      tooClose: distanceMeters < guideDistance.min,
      tooFar: distanceMeters > guideDistance.max
    };
  };

  // Hitta närmaste traktgräns och dess avstånd
  const findNearestBoundary = (px, py) => {
    const boundaries = markers.filter(m => m.isLine && m.lineType === 'boundary');
    
    if (boundaries.length === 0) return null;
    
    let nearest = null;
    let minDist = Infinity;
    
    for (const boundary of boundaries) {
      const dist = pointToPathDistance(px, py, boundary.path);
      if (dist < minDist) {
        minDist = dist;
        nearest = boundary;
      }
    }
    
    // Konvertera pixlar till meter (2m per pixel approximation)
    const distanceMeters = minDist * 2;
    
    // För gräns: rätt avstånd är exakt boundaryDistance (med lite tolerans ±2m)
    const tolerance = 2;
    return {
      boundary: nearest,
      distance: distanceMeters,
      inZone: Math.abs(distanceMeters - boundaryDistance) <= tolerance,
      tooClose: distanceMeters < boundaryDistance - tolerance,
      tooFar: distanceMeters > boundaryDistance + tolerance
    };
  };

  // Generera parallella guidlinjer för en path
  const generateParallelPath = (path, offsetMeters) => {
    if (!path || path.length < 2) return [];
    
    const offset = offsetMeters / 2; // Pixlar (2m per pixel)
    const result = [];
    
    for (let i = 0; i < path.length; i++) {
      let nx = 0, ny = 0;
      
      if (i === 0) {
        // Första punkten - använd riktning till nästa
        const dx = path[1].x - path[0].x;
        const dy = path[1].y - path[0].y;
        const len = Math.sqrt(dx * dx + dy * dy);
        nx = -dy / len;
        ny = dx / len;
      } else if (i === path.length - 1) {
        // Sista punkten - använd riktning från föregående
        const dx = path[i].x - path[i-1].x;
        const dy = path[i].y - path[i-1].y;
        const len = Math.sqrt(dx * dx + dy * dy);
        nx = -dy / len;
        ny = dx / len;
      } else {
        // Mittpunkter - genomsnitt av normaler
        const dx1 = path[i].x - path[i-1].x;
        const dy1 = path[i].y - path[i-1].y;
        const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
        
        const dx2 = path[i+1].x - path[i].x;
        const dy2 = path[i+1].y - path[i].y;
        const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
        
        const nx1 = -dy1 / len1;
        const ny1 = dx1 / len1;
        const nx2 = -dy2 / len2;
        const ny2 = dx2 / len2;
        
        nx = (nx1 + nx2) / 2;
        ny = (ny1 + ny2) / 2;
        const nlen = Math.sqrt(nx * nx + ny * ny);
        nx /= nlen;
        ny /= nlen;
      }
      
      result.push({ x: path[i].x + nx * offset, y: path[i].y + ny * offset });
    }
    
    return result;
  };

  // Kvittera varning
  const acknowledgeMarker = (id, machine) => {
    setMarkers(prev => prev.map(m => m.id === id ? { ...m, acknowledged: { ...m.acknowledged, [machine]: new Date().toISOString() } } : m));
    playWarningSound('success');
  };

  // Användarnamn
  const saveUserName = (name) => {
    if (name.trim()) {
      setCurrentUser(name.trim());
      localStorage.setItem('forestPlannerUser', name.trim());
      setShowUserDialog(false);
    }
  };

  // Redigering
  const startEdit = (marker) => {
    if (!currentUser) { setShowUserDialog(true); return; }
    setEditingMarker({ ...marker, _original: { ...marker } });
    setSelectedMarker(null);
  };

  const saveEdit = () => {
    if (!editingMarker || !currentUser) return;
    const changes = [];
    const orig = editingMarker._original;
    if (editingMarker.comment !== orig.comment) changes.push('kommentar');
    if (editingMarker.warningRadius !== orig.warningRadius) changes.push('varningsradie');
    
    setMarkers(prev => prev.map(m => {
      if (m.id === editingMarker.id) {
        const { _original, ...markerData } = editingMarker;
        return { ...markerData, editHistory: [...(m.editHistory || []), { editedBy: currentUser, editedAt: new Date().toISOString(), changes: changes.length > 0 ? changes : ['uppdaterad'] }] };
      }
      return m;
    }));
    setEditingMarker(null);
  };

  const cancelEdit = () => setEditingMarker(null);

  // Drag/flytta markeringar
  const startDrag = (marker) => {
    setDraggingMarker(marker);
    setSelectedMarker(null);
  };

  const handleDragMove = (clientX, clientY, rect) => {
    if (!draggingMarker) return;
    const { x, y } = screenToMap(clientX, clientY, rect);
    
    setMarkers(prev => prev.map(m => {
      if (m.id === draggingMarker.id) {
        if (m.isArrow) {
          return { ...m, x, y };
        } else if (m.isLine || m.isZone) {
          // Flytta hela linjen/zonen - beräkna offset
          const oldCenter = {
            x: m.path.reduce((s, p) => s + p.x, 0) / m.path.length,
            y: m.path.reduce((s, p) => s + p.y, 0) / m.path.length,
          };
          const dx = x - oldCenter.x;
          const dy = y - oldCenter.y;
          return { ...m, path: m.path.map(p => ({ x: p.x + dx, y: p.y + dy })) };
        } else {
          return { ...m, x, y };
        }
      }
      return m;
    }));
  };

  const endDrag = () => {
    if (draggingMarker && currentUser) {
      // Lägg till i historiken att den flyttades
      setMarkers(prev => prev.map(m => {
        if (m.id === draggingMarker.id) {
          return {
            ...m,
            editHistory: [...(m.editHistory || []), {
              editedBy: currentUser,
              editedAt: new Date().toISOString(),
              changes: ['flyttad']
            }]
          };
        }
        return m;
      }));
    }
    setDraggingMarker(null);
  };

  // Rotera pil med finger
  const startRotate = (marker) => {
    setRotatingArrow(marker);
    setSelectedMarker(null);
  };

  const handleRotateMove = (clientX, clientY, rect) => {
    if (!rotatingArrow) return;
    const { x, y } = screenToMap(clientX, clientY, rect);
    
    // Beräkna vinkel från pilens centrum till fingret
    const dx = x - rotatingArrow.x;
    const dy = y - rotatingArrow.y;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    
    setMarkers(prev => prev.map(m => {
      if (m.id === rotatingArrow.id) {
        return { ...m, angle: Math.round(angle) };
      }
      return m;
    }));
    
    // Uppdatera rotatingArrow state också så vi har rätt referens
    setRotatingArrow(prev => ({ ...prev, angle: Math.round(angle) }));
  };

  const endRotate = () => {
    if (rotatingArrow && currentUser) {
      setMarkers(prev => prev.map(m => {
        if (m.id === rotatingArrow.id) {
          return {
            ...m,
            editHistory: [...(m.editHistory || []), {
              editedBy: currentUser,
              editedAt: new Date().toISOString(),
              changes: ['roterad']
            }]
          };
        }
        return m;
      }));
    }
    setRotatingArrow(null);
    playWarningSound('success');
  };

  // Redigera linje - starta
  const startLineEdit = (marker) => {
    if (!currentUser) { setShowUserDialog(true); return; }
    setEditingLine({ ...marker, originalPath: [...marker.path] });
    setSelectedMarker(null);
  };

  // Redigera linje - dra punkt
  const handleLinePointDrag = (clientX, clientY, rect) => {
    if (!editingLine || draggingPointIndex === null) return;
    const { x, y } = screenToMap(clientX, clientY, rect);
    
    setEditingLine(prev => {
      const newPath = [...prev.path];
      newPath[draggingPointIndex] = { x, y };
      return { ...prev, path: newPath };
    });
  };

  // Redigera linje - spara
  const saveLineEdit = () => {
    if (!editingLine || !currentUser) return;
    
    setMarkers(prev => prev.map(m => {
      if (m.id === editingLine.id) {
        return {
          ...editingLine,
          editHistory: [...(m.editHistory || []), {
            editedBy: currentUser,
            editedAt: new Date().toISOString(),
            changes: ['punkter justerade']
          }]
        };
      }
      return m;
    }));
    
    setEditingLine(null);
    setDraggingPointIndex(null);
    playWarningSound('success');
  };

  // Redigera linje - avbryt
  const cancelLineEdit = () => {
    setEditingLine(null);
    setDraggingPointIndex(null);
  };

  // Redigera linje - ta bort punkt
  const removeLinePoint = (index) => {
    if (!editingLine || editingLine.path.length <= 2) return;
    setEditingLine(prev => ({
      ...prev,
      path: prev.path.filter((_, i) => i !== index)
    }));
  };

  // Redigera linje - lägg till punkt mellan två befintliga
  const addLinePoint = (afterIndex) => {
    if (!editingLine || afterIndex >= editingLine.path.length - 1) return;
    const p1 = editingLine.path[afterIndex];
    const p2 = editingLine.path[afterIndex + 1];
    const newPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    
    setEditingLine(prev => ({
      ...prev,
      path: [...prev.path.slice(0, afterIndex + 1), newPoint, ...prev.path.slice(afterIndex + 1)]
    }));
  };

  // === SLUT NYA V10 FUNKTIONER ===

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setPendingMarker(null);
        setSelectedMarker(null);
        setSelectedSymbol(null);
        setPendingLine(null);
        setPendingZone(null);
        setIsDrawing(false);
        setCurrentPath([]);
        setDrawnPath([]);
        setDrawnZonePath([]);
        setDrawType(null);
        setIsDrawMode(false);
        setIsZoneMode(false);
        setZoneType(null);
        setShowGpsMenu(false);
        setShowDrawMenu(false);
        setShowZoneMenu(false);
        setShowSymbolMenu(false);
        stopTracking();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    return () => {
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const saveData = async () => {
    try {
      setSaveStatus('saving');
      const data = {
        markers,
        tractId: tractInfo.id,
        savedAt: new Date().toISOString()
      };
      await window.storage.set(`forest-plan-${tractInfo.id}`, JSON.stringify(data));
      setLastSaved(new Date());
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (error) {
      console.error('Kunde inte spara:', error);
      setSaveStatus('error');
    }
  };

  const loadData = async () => {
    try {
      const result = await window.storage.get(`forest-plan-${tractInfo.id}`);
      if (result && result.value) {
        const data = JSON.parse(result.value);
        setMarkers(data.markers || []);
        setLastSaved(new Date(data.savedAt));
      }
    } catch (error) {
      console.log('Ingen sparad data');
    }
  };

  const gpsToPixel = (lat, lon) => {
    if (!mapRef.current) return null;
    const rect = mapRef.current.getBoundingClientRect();
    const x = ((lon - mapCoords.minLon) / (mapCoords.maxLon - mapCoords.minLon)) * rect.width;
    const y = ((mapCoords.maxLat - lat) / (mapCoords.maxLat - mapCoords.minLat)) * rect.height;
    return { x, y };
  };

  const startTracking = (type) => {
    if (!navigator.geolocation) {
      setGpsStatus('error');
      alert('GPS stöds inte i denna webbläsare');
      return;
    }

    setTrackingType(type);
    if (!isPaused) {
      setTrackingPath([]);
    }
    setGpsStatus('searching');
    setIsTracking(true);
    setIsPaused(false);
    setShowGpsMenu(false);
    
    // Håll skärmen vaken
    requestWakeLock();

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setCurrentPosition({ lat: latitude, lon: longitude, accuracy });
        setGpsStatus('active');
        
        const pixel = gpsToPixel(latitude, longitude);
        if (pixel) {
          setTrackingPath(prev => [...prev, pixel]);
          
          // Stickvägsguide - kolla avstånd
          if (stripRoadGuide) {
            // Kolla mot stickvägar
            if (guideSource.stripRoads) {
              const nearest = findNearestStripRoad(pixel.x, pixel.y);
              setNearestStripRoad(nearest);
              
              if (nearest) {
                if (!nearest.inZone && wasInStripRoadZone.current) {
                  // Gick UTANFÖR zonen - VARNA!
                  playWarningSound(nearest.tooClose ? 'critical' : 'warning');
                } else if (nearest.inZone && !wasInStripRoadZone.current) {
                  // Kom tillbaka IN i zonen - bra!
                  playWarningSound('success');
                }
                wasInStripRoadZone.current = nearest.inZone;
              }
            } else {
              setNearestStripRoad(null);
              wasInStripRoadZone.current = false;
            }
            
            // Kolla mot gräns
            if (guideSource.boundary) {
              const nearestB = findNearestBoundary(pixel.x, pixel.y);
              setNearestBoundary(nearestB);
              
              if (nearestB) {
                if (!nearestB.inZone && wasInBoundaryZone.current) {
                  // Gick UTANFÖR zonen - VARNA!
                  playWarningSound(nearestB.tooClose ? 'critical' : 'warning');
                } else if (nearestB.inZone && !wasInBoundaryZone.current) {
                  // Kom tillbaka IN i zonen - bra!
                  playWarningSound('success');
                }
                wasInBoundaryZone.current = nearestB.inZone;
              }
            } else {
              setNearestBoundary(null);
              wasInBoundaryZone.current = false;
            }
          }
        }
      },
      (error) => {
        console.error('GPS error:', error);
        setGpsStatus('error');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 1000,
      }
    );
  };

  // Pausa GPS men behåll spåret
  const pauseTracking = () => {
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
    setIsPaused(true);
    setGpsStatus('paused');
  };

  // Fortsätt spåra
  const resumeTracking = () => {
    if (trackingType) {
      startTracking(trackingType);
    }
  };

  // Avsluta och öppna dialog
  const finishTracking = () => {
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    
    if (trackingPath.length > 1) {
      setPendingLine({
        path: trackingPath,
        lineType: trackingType,
        comment: '',
        category: 'forwarder',
      });
    }
    
    setIsTracking(false);
    setIsPaused(false);
    setTrackingType(null);
    setTrackingPath([]);
    setGpsStatus(null);
    setCurrentPosition(null);
    
    // Släpp wake lock om guiden inte är aktiv
    if (!stripRoadGuide) {
      releaseWakeLock();
    }
  };

  // Avbryt och kasta spåret
  const cancelTracking = () => {
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    
    setIsTracking(false);
    setIsPaused(false);
    setTrackingType(null);
    setTrackingPath([]);
    setGpsStatus(null);
    setCurrentPosition(null);
    
    // Släpp wake lock om guiden inte är aktiv
    if (!stripRoadGuide) {
      releaseWakeLock();
    }
  };

  const stopTracking = () => {
    cancelTracking();
  };

  const handleMapClick = (e) => {
    if (isPanning) return;
    
    // Mätläge
    if (measureMode) {
      const rect = e.currentTarget.getBoundingClientRect();
      const { x, y } = screenToMap(e.clientX, e.clientY, rect);
      setMeasurePoints(prev => [...prev, { x, y }]);
      return;
    }
    
    // Pilläge - ett klick för placering
    if (isArrowMode && arrowType) {
      const rect = e.currentTarget.getBoundingClientRect();
      const { x, y } = screenToMap(e.clientX, e.clientY, rect);
      
      setPendingArrow({
        x,
        y,
        angle: 0, // Startar åt höger, användaren roterar i dialogen
        arrowType: arrowType,
        categories: ['harvester', 'forwarder'],
        comment: '',
      });
      return;
    }
    
    if (pendingMarker || selectedMarker || pendingLine || pendingZone || pendingArrow || isTracking) return;
    if ((isDrawMode && drawType) || (isZoneMode && zoneType)) return;
    
    // Om vi har valt en symbol, placera den
    if (selectedSymbol) {
      const rect = e.currentTarget.getBoundingClientRect();
      const { x, y } = screenToMap(e.clientX, e.clientY, rect);
      
      setPendingMarker({
        x,
        y,
        type: selectedSymbol,
        categories: ['harvester'],
        comment: '',
        warningRadius: 0,
        warningFor: 'both',
      });
      return;
    }
  };

  const handleMouseDown = (e) => {
    if (pendingMarker || selectedMarker || isTracking || pendingLine || pendingZone) return;
    if (isPanning) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const { x, y } = screenToMap(e.clientX, e.clientY, rect);
    
    if (isDrawMode && drawType) {
      setIsDrawing(true);
      if (drawnPath.length > 0) {
        setCurrentPath([drawnPath[drawnPath.length - 1], { x, y }]);
      } else {
        setCurrentPath([{ x, y }]);
      }
    } else if (isZoneMode && zoneType) {
      setIsDrawing(true);
      if (drawnZonePath.length > 0) {
        setCurrentPath([drawnZonePath[drawnZonePath.length - 1], { x, y }]);
      } else {
        setCurrentPath([{ x, y }]);
      }
    }
  };

  const handleMouseMove = (e) => {
    if (!isDrawing) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const { x, y } = screenToMap(e.clientX, e.clientY, rect);
    
    setCurrentPath(prev => [...prev, { x, y }]);
  };

  const handleMouseUp = () => {
    if (!isDrawing || currentPath.length < 2) {
      setIsDrawing(false);
      setCurrentPath([]);
      return;
    }
    
    if (isDrawMode && drawType) {
      // Lägg till i drawnPath istället för att öppna dialog
      setDrawnPath(prev => [...prev, ...currentPath.slice(prev.length > 0 ? 1 : 0)]);
    } else if (isZoneMode && zoneType) {
      // Lägg till i drawnZonePath
      setDrawnZonePath(prev => [...prev, ...currentPath.slice(prev.length > 0 ? 1 : 0)]);
    }
    
    setIsDrawing(false);
    setCurrentPath([]);
  };

  // Avsluta ritning och öppna dialog
  const finishDrawing = () => {
    if (isDrawMode && drawnPath.length >= 2) {
      setPendingLine({
        path: drawnPath,
        lineType: drawType,
        comment: '',
        category: 'forwarder',
      });
      setDrawnPath([]);
    } else if (isZoneMode && drawnZonePath.length >= 3) {
      setPendingZone({
        path: drawnZonePath,
        zoneType: zoneType,
        comment: '',
      });
      setDrawnZonePath([]);
    }
  };

  // Avbryt ritning
  const cancelDrawing = () => {
    setDrawnPath([]);
    setDrawnZonePath([]);
    setIsDrawMode(false);
    setIsZoneMode(false);
    setDrawType(null);
    setZoneType(null);
  };

  const saveMarker = () => {
    if (!pendingMarker) return;
    if (!currentUser) {
      setShowUserDialog(true);
      return;
    }
    const newMarker = {
      ...pendingMarker,
      id: Date.now(),
      createdAt: new Date().toISOString(),
      createdBy: currentUser,
      editHistory: [],
    };
    setMarkers(prev => [...prev, newMarker]);
    setPendingMarker(null);
    setSelectedSymbol(null);
    playWarningSound('success');
  };

  const saveLine = () => {
    if (!pendingLine || pendingLine.path.length < 2) return;
    if (!currentUser) {
      setShowUserDialog(true);
      return;
    }
    const newMarker = {
      ...pendingLine,
      id: Date.now(),
      createdAt: new Date().toISOString(),
      createdBy: currentUser,
      editHistory: [],
      isLine: true,
    };
    setMarkers(prev => [...prev, newMarker]);
    setPendingLine(null);
    playWarningSound('success');
  };

  const saveZone = () => {
    if (!pendingZone || pendingZone.path.length < 3) return;
    if (!currentUser) {
      setShowUserDialog(true);
      return;
    }
    const newMarker = {
      ...pendingZone,
      id: Date.now(),
      createdAt: new Date().toISOString(),
      createdBy: currentUser,
      editHistory: [],
      isZone: true,
    };
    setMarkers(prev => [...prev, newMarker]);
    setPendingZone(null);
    playWarningSound('success');
  };

  // Spara pil
  const saveArrow = () => {
    if (!pendingArrow) return;
    if (!currentUser) {
      setShowUserDialog(true);
      return;
    }
    const newMarker = {
      ...pendingArrow,
      id: Date.now(),
      createdAt: new Date().toISOString(),
      createdBy: currentUser,
      editHistory: [],
      isArrow: true,
    };
    setMarkers(prev => [...prev, newMarker]);
    setPendingArrow(null);
    setIsArrowMode(false);
    setArrowType(null);
    playWarningSound('success');
  };

  const deleteMarker = (id) => {
    setMarkers(prev => prev.filter(m => m.id !== id));
    setSelectedMarker(null);
  };

  const handleMarkerClick = (e, marker) => {
    e.stopPropagation();
    setSelectedMarker(marker);
  };

  const undo = () => {
    setMarkers(prev => prev.slice(0, -1));
  };

  const countByCategory = (catId) => markers.filter(m => (m.category || 'harvester') === catId && !m.isLine && !m.isZone).length;
  const countLines = (type) => markers.filter(m => m.isLine && m.lineType === type).length;
  const countZones = (type) => markers.filter(m => m.isZone && m.zoneType === type).length;

  const renderLine = (path, lineTypeId, width, key, onClick) => {
    if (!path || path.length < 2) return null;
    
    const type = lineTypes.find(t => t.id === lineTypeId);
    if (!type) return null;
    
    const pathD = path.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    
    if (type.striped) {
      return (
        <g key={key} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
          <path d={pathD} fill="none" stroke={type.color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }} />
          <path d={pathD} fill="none" stroke={type.color2} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="20,20" />
          <path d={pathD} fill="none" stroke="transparent" strokeWidth="24" strokeLinecap="round" />
        </g>
      );
    } else {
      return (
        <g key={key} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
          <path d={pathD} fill="none" stroke={type.color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="12,8" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }} />
          <path d={pathD} fill="none" stroke="transparent" strokeWidth="24" strokeLinecap="round" />
        </g>
      );
    }
  };

  const renderZone = (path, zoneTypeId, key, onClick) => {
    if (!path || path.length < 3) return null;
    
    const type = zoneTypes.find(t => t.id === zoneTypeId);
    if (!type) return null;
    
    const pathD = path.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
    
    const centerX = path.reduce((sum, p) => sum + p.x, 0) / path.length;
    const centerY = path.reduce((sum, p) => sum + p.y, 0) / path.length;
    
    return (
      <g key={key} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
        <path 
          d={pathD} 
          fill={type.color} 
          fillOpacity={0.25} 
          stroke={type.color} 
          strokeWidth={3}
          strokeDasharray="8,4"
          style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.3))' }}
        />
        <circle cx={centerX} cy={centerY} r={18} fill="rgba(0,0,0,0.7)" stroke={type.color} strokeWidth={2} />
        <text x={centerX} y={centerY} textAnchor="middle" dominantBaseline="central" fontSize="16" style={{ pointerEvents: 'none' }}>
          {type.icon}
        </text>
      </g>
    );
  };

  const renderColorPreview = (type, width = 30, height = 8) => {
    if (type.striped) {
      return (
        <div style={{
          width: `${width}px`,
          height: `${height}px`,
          borderRadius: '4px',
          background: `repeating-linear-gradient(90deg, ${type.color} 0px, ${type.color} 8px, ${type.color2} 8px, ${type.color2} 16px)`,
        }} />
      );
    }
    return (
      <div style={{
        width: `${width}px`,
        height: `${height}px`,
        borderRadius: '4px',
        background: type.color,
      }} />
    );
  };

  const renderZonePreview = (type, size = 24) => {
    return (
      <div style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '6px',
        background: `${type.color}40`,
        border: `2px solid ${type.color}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '14px',
      }}>
        {type.icon}
      </div>
    );
  };

  const buttonBase = {
    width: '50px',
    height: '50px',
    borderRadius: '16px',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '22px',
    transition: 'all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    WebkitTapHighlightColor: 'transparent',
  };

  // Apple färger
  const appleColors = {
    blue: '#0A84FF',
    green: '#34C759',
    red: '#FF453A',
    orange: '#FF9F0A',
    yellow: '#FFD60A',
    gray: '#8E8E93',
    darkGray: '#48484A',
    fill: 'rgba(255,255,255,0.08)',
    fillActive: 'rgba(255,255,255,0.12)',
  };

  const closeAllMenus = () => {
    setShowInfo(false);
    setShowFilter(false);
    setShowGpsMenu(false);
    setShowDrawMenu(false);
    setShowZoneMenu(false);
    setShowSymbolMenu(false);
    setShowArrowMenu(false);
  };

  return (
    <div style={{
      height: '100vh',
      width: '100vw',
      background: '#000000',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif',
      color: '#ffffff',
      overflow: 'hidden',
      position: 'relative',
      WebkitFontSmoothing: 'antialiased',
    }}>
      
      {/* Map Background */}
      <div 
        ref={mapRef}
        style={{
          position: 'absolute',
          inset: 0,
          background: activeLayer === 'moisture' 
            ? `
              radial-gradient(ellipse at 25% 35%, rgba(52, 199, 89, 0.25) 0%, transparent 45%),
              radial-gradient(ellipse at 65% 55%, rgba(10, 132, 255, 0.35) 0%, transparent 40%),
              radial-gradient(ellipse at 45% 75%, rgba(10, 132, 255, 0.4) 0%, transparent 35%),
              radial-gradient(ellipse at 15% 65%, rgba(255, 69, 58, 0.25) 0%, transparent 30%),
              radial-gradient(ellipse at 80% 25%, rgba(52, 199, 89, 0.2) 0%, transparent 35%),
              linear-gradient(180deg, #1c1c1e 0%, #000000 100%)
            `
            : activeLayer === 'terrain'
            ? `
              repeating-linear-gradient(45deg, rgba(142, 142, 147, 0.03) 0px, rgba(142, 142, 147, 0.03) 1px, transparent 1px, transparent 30px),
              linear-gradient(180deg, #1c1c1e 0%, #000000 100%)
            `
            : `linear-gradient(180deg, #1c1c1e 0%, #000000 100%)`,
          transition: 'all 0.4s ease-out',
        }}
      >
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(132, 204, 22, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(132, 204, 22, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
          pointerEvents: 'none',
        }} />
      </div>

      {/* SVG Canvas */}
      <svg 
        style={{ 
          position: 'absolute', 
          inset: 0, 
          width: '100%', 
          height: '100%',
          cursor: rotatingArrow ? 'crosshair' : draggingMarker ? 'grabbing' : isPanning ? 'grabbing' : (isDrawMode && drawType) || (isZoneMode && zoneType) ? 'crosshair' : selectedSymbol ? 'crosshair' : measureMode ? 'crosshair' : isArrowMode ? 'crosshair' : 'grab',
        }}
        onClick={handleMapClick}
        onMouseDown={(e) => { handleMouseDown(e); handlePanStart(e); }}
        onMouseMove={(e) => { handleMouseMove(e); handlePanMove(e); }}
        onMouseUp={(e) => { handleMouseUp(); handlePanEnd(); }}
        onMouseLeave={(e) => { handleMouseUp(); handlePanEnd(); }}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <g style={{ transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${zoom})`, transformOrigin: '50% 50%' }}>
        {/* Zoner först */}
        {markers.filter(m => {
          if (!m.isZone || !visibleZones[m.zoneType]) return false;
          const cats = getCategories(m);
          if (activeView !== 'all' && !cats.includes(activeView)) return false;
          return true;
        }).map(marker => (
          renderZone(marker.path, marker.zoneType, `zone-${marker.id}`, (e) => handleMarkerClick(e, marker))
        ))}
        
        {/* Pågående zon (sparat + nuvarande) */}
        {isZoneMode && (drawnZonePath.length > 0 || currentPath.length > 2) && zoneType && (
          <path
            d={[...drawnZonePath, ...currentPath.slice(drawnZonePath.length > 0 ? 1 : 0)].map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'}
            fill={zoneTypes.find(t => t.id === zoneType)?.color}
            fillOpacity={0.2}
            stroke={zoneTypes.find(t => t.id === zoneType)?.color}
            strokeWidth={2}
            strokeDasharray="6,6"
          />
        )}
        
        {/* Linjer */}
        {markers.filter(m => {
          if (!m.isLine || !visibleLines[m.lineType]) return false;
          const cats = getCategories(m);
          if (activeView !== 'all' && !cats.includes(activeView)) return false;
          return true;
        }).map(marker => (
          renderLine(marker.path, marker.lineType, marker.lineType === 'mainRoad' ? 10 : marker.lineType === 'boundary' ? 6 : 6, `line-${marker.id}`, (e) => handleMarkerClick(e, marker))
        ))}
        
        {/* Stickvägsguide - parallella linjer för SENASTE stickvägen */}
        {stripRoadGuide && guideSource.stripRoads && (() => {
          // Hitta senaste stickvägen (högst id = senast skapad)
          const stripRoads = markers.filter(m => m.isLine && m.lineType && m.lineType.startsWith('sideRoad'));
          if (stripRoads.length === 0) return null;
          
          const latestRoad = stripRoads.reduce((latest, road) => road.id > latest.id ? road : latest, stripRoads[0]);
          
          const path25Left = generateParallelPath(latestRoad.path, guideDistance.min);
          const path25Right = generateParallelPath(latestRoad.path, -guideDistance.min);
          const path30Left = generateParallelPath(latestRoad.path, guideDistance.max);
          const path30Right = generateParallelPath(latestRoad.path, -guideDistance.max);
          
          return (
            <g key={`guide-${latestRoad.id}`}>
              {/* Zon-fyllning mellan 25m och 30m (subtil grön) */}
              {path25Left.length > 1 && path30Left.length > 1 && (
                <path
                  d={`M ${path25Left.map(p => `${p.x},${p.y}`).join(' L ')} L ${[...path30Left].reverse().map(p => `${p.x},${p.y}`).join(' L ')} Z`}
                  fill="rgba(34, 197, 94, 0.1)"
                  stroke="none"
                />
              )}
              {path25Right.length > 1 && path30Right.length > 1 && (
                <path
                  d={`M ${path25Right.map(p => `${p.x},${p.y}`).join(' L ')} L ${[...path30Right].reverse().map(p => `${p.x},${p.y}`).join(' L ')} Z`}
                  fill="rgba(34, 197, 94, 0.1)"
                  stroke="none"
                />
              )}
              
              {/* 25m linjer (inre, grön) */}
              {path25Left.length > 1 && (
                <path
                  d={`M ${path25Left.map(p => `${p.x},${p.y}`).join(' L ')}`}
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth={2}
                  strokeDasharray="8,8"
                  opacity={0.8}
                />
              )}
              {path25Right.length > 1 && (
                <path
                  d={`M ${path25Right.map(p => `${p.x},${p.y}`).join(' L ')}`}
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth={2}
                  strokeDasharray="8,8"
                  opacity={0.8}
                />
              )}
              
              {/* 30m linjer (yttre, gul) */}
              {path30Left.length > 1 && (
                <path
                  d={`M ${path30Left.map(p => `${p.x},${p.y}`).join(' L ')}`}
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth={2}
                  strokeDasharray="4,8"
                  opacity={0.6}
                />
              )}
              {path30Right.length > 1 && (
                <path
                  d={`M ${path30Right.map(p => `${p.x},${p.y}`).join(' L ')}`}
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth={2}
                  strokeDasharray="4,8"
                  opacity={0.6}
                />
              )}
            </g>
          );
        })()}
        
        {/* Stickvägsguide - parallell linje för gräns */}
        {stripRoadGuide && guideSource.boundary && markers.filter(m => m.isLine && m.lineType === 'boundary').map(marker => {
          // Bara en linje inåt (inte utåt på grannens mark)
          const pathInner = generateParallelPath(marker.path, boundaryDistance);
          
          return (
            <g key={`guide-boundary-${marker.id}`}>
              {pathInner.length > 1 && (
                <path
                  d={`M ${pathInner.map(p => `${p.x},${p.y}`).join(' L ')}`}
                  fill="none"
                  stroke="#f97316"
                  strokeWidth={3}
                  strokeDasharray="12,6"
                  opacity={0.8}
                />
              )}
            </g>
          );
        })}
        
        {/* Pågående linje (sparat + nuvarande) */}
        {isDrawMode && (drawnPath.length > 0 || currentPath.length > 1) && drawType && (
          renderLine([...drawnPath, ...currentPath.slice(drawnPath.length > 0 ? 1 : 0)], drawType, 6, 'current-draw', null)
        )}
        
        {/* GPS-spårning (även när pausad) */}
        {(isTracking || isPaused) && trackingPath.length > 1 && trackingType && (
          renderLine(trackingPath, trackingType, 6, 'tracking-live', null)
        )}
        
        {isTracking && trackingPath.length > 0 && (
          <g>
            <circle cx={trackingPath[trackingPath.length - 1].x} cy={trackingPath[trackingPath.length - 1].y} r={20} fill="#3b82f6" fillOpacity={0.2} stroke="#3b82f6" strokeWidth={3}>
              <animate attributeName="r" values="15;25;15" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx={trackingPath[trackingPath.length - 1].x} cy={trackingPath[trackingPath.length - 1].y} r={8} fill="#3b82f6" />
          </g>
        )}
        
        {/* Pilar */}
        {markers.filter(m => {
          if (!m.isArrow) return false;
          const cats = getCategories(m);
          if (activeView !== 'all' && !cats.includes(activeView)) return false;
          return true;
        }).map(marker => {
          const type = arrowTypes.find(t => t.id === marker.arrowType);
          const angle = marker.angle || 0;
          const arrowLength = 50; // Fast längd på pil
          const endX = marker.x + Math.cos(angle * Math.PI / 180) * arrowLength;
          const endY = marker.y + Math.sin(angle * Math.PI / 180) * arrowLength;
          
          return (
            <g key={marker.id} onClick={(e) => handleMarkerClick(e, marker)} style={{ cursor: 'pointer' }}>
              {/* Linje */}
              <line
                x1={marker.x}
                y1={marker.y}
                x2={endX - Math.cos(angle * Math.PI / 180) * 10}
                y2={endY - Math.sin(angle * Math.PI / 180) * 10}
                stroke={type?.color || '#22c55e'}
                strokeWidth={5}
                strokeLinecap="round"
              />
              {/* Pilspets */}
              <polygon
                points={`0,-10 24,0 0,10`}
                fill={type?.color || '#22c55e'}
                transform={`translate(${endX}, ${endY}) rotate(${angle})`}
              />
              {/* Ikon vid start */}
              <circle cx={marker.x} cy={marker.y} r={14} fill="rgba(0,0,0,0.8)" stroke={type?.color || '#22c55e'} strokeWidth={2} />
              <text x={marker.x} y={marker.y} textAnchor="middle" dominantBaseline="central" fontSize="12" style={{ pointerEvents: 'none' }}>
                {type?.icon || '→'}
              </text>
            </g>
          );
        })}
        
        {/* Punktmarkeringar */}
        {markers.filter(m => !m.isLine && !m.isZone && visibleCategories[m.category || 'harvester']).map(marker => {
          const type = markerTypes.find(t => t.id === marker.type);
          const cat = categories.find(c => c.id === (marker.category || 'harvester'));
          const isSelected = selectedMarker?.id === marker.id;
          const hasWarning = marker.warningRadius > 0;
          
          // Färg baserat på kategori eller varning
          const markerColor = cat?.color || '#84cc16';
          
          // Beräkna pixelradie (approximativt - 1m ≈ 2px på denna zoomnivå)
          const warningPixels = (marker.warningRadius || 0) * 2;
          
          return (
            <g key={marker.id} onClick={(e) => handleMarkerClick(e, marker)} style={{ cursor: 'pointer' }}>
              {/* Varningsradie */}
              {hasWarning && (
                <>
                  <circle
                    cx={marker.x}
                    cy={marker.y}
                    r={warningPixels}
                    fill={marker.warningFor === 'harvester' ? '#f59e0b' : marker.warningFor === 'forwarder' ? '#3b82f6' : '#ef4444'}
                    fillOpacity={0.08}
                    stroke={marker.warningFor === 'harvester' ? '#f59e0b' : marker.warningFor === 'forwarder' ? '#3b82f6' : '#ef4444'}
                    strokeWidth={2}
                    strokeDasharray="8,4"
                    strokeOpacity={0.5}
                  />
                  <circle
                    cx={marker.x}
                    cy={marker.y}
                    r={warningPixels}
                    fill="none"
                    stroke={marker.warningFor === 'harvester' ? '#f59e0b' : marker.warningFor === 'forwarder' ? '#3b82f6' : '#ef4444'}
                    strokeWidth={1}
                    strokeOpacity={0.3}
                  >
                    <animate attributeName="r" values={`${warningPixels};${warningPixels + 10};${warningPixels}`} dur="2s" repeatCount="indefinite" />
                    <animate attributeName="stroke-opacity" values="0.3;0;0.3" dur="2s" repeatCount="indefinite" />
                  </circle>
                </>
              )}
              
              {/* Markör */}
              <circle cx={marker.x} cy={marker.y} r={isSelected ? 28 : 22} fill={markerColor} fillOpacity={0.2} stroke={markerColor} strokeWidth={isSelected ? 3 : 2} style={{ filter: `drop-shadow(0 0 ${isSelected ? '12px' : '8px'} ${markerColor}66)` }} />
              <circle cx={marker.x} cy={marker.y} r={16} fill="rgba(0,0,0,0.8)" stroke={markerColor} strokeWidth={2} />
              <text x={marker.x} y={marker.y} textAnchor="middle" dominantBaseline="central" fontSize="14" style={{ pointerEvents: 'none' }}>{type?.icon || '📍'}</text>
              
              {/* Kommentar-indikator */}
              {marker.comment && <circle cx={marker.x + 14} cy={marker.y - 14} r={6} fill="#a3e635" />}
              
              {/* Varningsindikator */}
              {hasWarning && (
                <g>
                  <circle cx={marker.x - 14} cy={marker.y - 14} r={8} fill={marker.warningFor === 'harvester' ? '#f59e0b' : marker.warningFor === 'forwarder' ? '#3b82f6' : '#ef4444'} />
                  <text x={marker.x - 14} y={marker.y - 14} textAnchor="middle" dominantBaseline="central" fontSize="8" fill="#fff" fontWeight="bold">{marker.warningRadius}</text>
                </g>
              )}
            </g>
          );
        })}
        
        {/* Pending marker */}
        {pendingMarker && (
          <g>
            <circle cx={pendingMarker.x} cy={pendingMarker.y} r={22} fill="#84cc16" fillOpacity={0.3} stroke="#84cc16" strokeWidth={2} strokeDasharray="6,4" />
            <circle cx={pendingMarker.x} cy={pendingMarker.y} r={8} fill="#84cc16" />
          </g>
        )}
        
        {/* Mätlinjer */}
        {measureMode && measurePoints.length > 0 && (
          <g>
            <path
              d={measurePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
              fill="none"
              stroke="#22c55e"
              strokeWidth={3}
              strokeDasharray="8,8"
            />
            {measurePoints.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={8} fill="#22c55e" stroke="#fff" strokeWidth={2} />
            ))}
          </g>
        )}
        </g>
      </svg>

      {/* Top bar - Apple style */}
      <div style={{ position: 'absolute', top: '0', left: '0', right: '0', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', pointerEvents: 'none', background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%)' }}>
        <div style={{ background: 'rgba(44,44,46,0.8)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', borderRadius: '14px', padding: '12px 16px', pointerEvents: 'auto' }}>
          <div style={{ fontSize: '10px', color: appleColors.gray, letterSpacing: '0.5px', marginBottom: '2px', textTransform: 'uppercase' }}>Trakt {tractInfo.id}</div>
          <div style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-0.3px' }}>{tractInfo.name}</div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', pointerEvents: 'auto' }}>
          {/* Användarknapp */}
          <button onClick={() => setShowUserDialog(true)} style={{ height: '44px', paddingLeft: '14px', paddingRight: '14px', background: 'rgba(44,44,46,0.8)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', borderRadius: '22px', border: 'none', color: currentUser ? '#ffffff' : appleColors.orange, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 500, cursor: 'pointer' }}>
            <span style={{ fontSize: '18px' }}>👤</span> {currentUser || 'Ange namn'}
          </button>
          
          {/* Ljudknapp */}
          <button onClick={() => setSoundEnabled(!soundEnabled)} style={{ width: '44px', height: '44px', background: soundEnabled ? 'rgba(52,199,89,0.2)' : 'rgba(255,69,58,0.2)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', borderRadius: '22px', border: 'none', color: soundEnabled ? appleColors.green : appleColors.red, fontSize: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {soundEnabled ? '🔊' : '🔇'}
          </button>
          
          {/* Spara */}
          <button onClick={saveData} style={{ width: '44px', height: '44px', background: saveStatus === 'saved' ? 'rgba(52,199,89,0.2)' : 'rgba(44,44,46,0.8)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', borderRadius: '22px', border: 'none', color: saveStatus === 'saved' ? appleColors.green : '#ffffff', fontSize: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {saveStatus === 'saving' ? '⏳' : saveStatus === 'saved' ? '✓' : '💾'}
          </button>
        </div>
      </div>

      {/* Left side buttons - Collapsible Apple style */}
      <div style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: '2px', background: 'rgba(44,44,46,0.8)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', borderRadius: '16px', padding: '4px', pointerEvents: 'auto' }}>
        
        {/* Menu toggle */}
        <button 
          onClick={() => setShowMenu(!showMenu)} 
          style={{ width: '50px', height: '50px', background: showMenu ? appleColors.fillActive : 'transparent', borderRadius: '12px', border: 'none', color: showMenu ? '#fff' : appleColors.gray, fontSize: '22px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {showMenu ? '✕' : '☰'}
        </button>

        {/* Expandable menu items */}
        {showMenu && (
          <>
            {/* Info */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => { closeAllMenus(); setShowInfo(!showInfo); }} style={{ width: '50px', height: '50px', background: showInfo ? appleColors.fillActive : 'transparent', borderRadius: '12px', border: 'none', color: showInfo ? '#fff' : appleColors.gray, fontSize: '22px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>i</button>
              
              {showInfo && (
                <div style={{ position: 'absolute', left: '60px', top: 0, background: 'rgba(44,44,46,0.95)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', borderRadius: '16px', padding: '20px', minWidth: '220px', zIndex: 100 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: appleColors.gray, letterSpacing: '0.5px', marginBottom: '16px', textTransform: 'uppercase' }}>Traktinfo</div>
                  {Object.entries(tractInfo).slice(2).map(([key, value]) => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: '13px' }}>
                      <span style={{ color: appleColors.gray }}>{key === 'area' ? 'Areal' : key === 'volume' ? 'Volym' : key === 'dominant' ? 'Trädslag' : key === 'avgHeight' ? 'Medelhöjd' : key === 'terrain' ? 'Terräng' : key === 'soilType' ? 'Marktyp' : key}</span>
                      <span style={{ color: '#fff', fontWeight: 500 }}>{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Symboler */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => { closeAllMenus(); setShowSymbolMenu(!showSymbolMenu); }} style={{ width: '50px', height: '50px', background: showSymbolMenu ? appleColors.fillActive : 'transparent', borderRadius: '12px', border: 'none', color: showSymbolMenu ? '#fff' : appleColors.gray, fontSize: '22px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📍</button>
              
              {showSymbolMenu && (
                <div style={{ position: 'absolute', left: '60px', top: 0, background: 'rgba(44,44,46,0.95)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', borderRadius: '16px', padding: '16px', minWidth: '280px', maxHeight: '70vh', overflowY: 'auto', zIndex: 100 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: appleColors.gray, letterSpacing: '0.5px', marginBottom: '12px', textTransform: 'uppercase' }}>Välj symbol</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                    {markerTypes.map(type => (
                      <button
                        key={type.id}
                        onClick={() => { setSelectedSymbol(type.id); setShowSymbolMenu(false); }}
                        style={{ padding: '12px', borderRadius: '12px', border: 'none', background: selectedSymbol === type.id ? appleColors.fillActive : 'rgba(255,255,255,0.05)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}
                      >
                        <span style={{ fontSize: '24px' }}>{type.icon}</span>
                        <span style={{ fontSize: '9px', color: appleColors.gray }}>{type.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Zoner */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => { closeAllMenus(); setShowZoneMenu(!showZoneMenu); }} style={{ width: '50px', height: '50px', background: showZoneMenu ? appleColors.fillActive : 'transparent', borderRadius: '12px', border: 'none', color: showZoneMenu ? '#fff' : appleColors.gray, fontSize: '22px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🎨</button>
              
              {showZoneMenu && (
                <div style={{ position: 'absolute', left: '60px', top: 0, background: 'rgba(44,44,46,0.95)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', borderRadius: '16px', padding: '16px', minWidth: '200px', zIndex: 100 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: appleColors.gray, letterSpacing: '0.5px', marginBottom: '12px', textTransform: 'uppercase' }}>Rita zon</div>
                  {zoneTypes.map(type => (
                    <button key={type.id} onClick={() => { setZoneType(type.id); setIsZoneMode(true); setShowZoneMenu(false); }} style={{ width: '100%', padding: '12px', marginBottom: '6px', borderRadius: '10px', border: 'none', background: 'rgba(255,255,255,0.05)', color: type.color, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                      <span style={{ fontSize: '20px' }}>{type.icon}</span>
                      {type.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Rita linjer */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => { closeAllMenus(); setShowDrawMenu(!showDrawMenu); }} style={{ width: '50px', height: '50px', background: showDrawMenu ? appleColors.fillActive : 'transparent', borderRadius: '12px', border: 'none', color: showDrawMenu ? '#fff' : appleColors.gray, fontSize: '22px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✏️</button>
              
              {showDrawMenu && (
                <div style={{ position: 'absolute', left: '60px', top: 0, background: 'rgba(44,44,46,0.95)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', borderRadius: '16px', padding: '16px', minWidth: '200px', zIndex: 100 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: appleColors.gray, letterSpacing: '0.5px', marginBottom: '12px', textTransform: 'uppercase' }}>Rita linje</div>
                  {lineTypes.map(type => (
                    <button key={type.id} onClick={() => { setDrawType(type.id); setIsDrawMode(true); setShowDrawMenu(false); }} style={{ width: '100%', padding: '12px', marginBottom: '6px', borderRadius: '10px', border: 'none', background: 'rgba(255,255,255,0.05)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                      {renderColorPreview(type, 24, 6)}
                      {type.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* GPS */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => { closeAllMenus(); setShowGpsMenu(!showGpsMenu); }} style={{ width: '50px', height: '50px', background: showGpsMenu ? appleColors.fillActive : 'transparent', borderRadius: '12px', border: 'none', color: showGpsMenu ? '#fff' : appleColors.gray, fontSize: '22px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🛰️</button>
              
              {showGpsMenu && (
                <div style={{ position: 'absolute', left: '60px', top: 0, background: 'rgba(44,44,46,0.95)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', borderRadius: '16px', padding: '16px', minWidth: '200px', zIndex: 100 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: appleColors.gray, letterSpacing: '0.5px', marginBottom: '12px', textTransform: 'uppercase' }}>GPS-spårning</div>
                  {lineTypes.map(type => (
                    <button key={type.id} onClick={() => { startTracking(type.id); setShowGpsMenu(false); }} style={{ width: '100%', padding: '12px', marginBottom: '6px', borderRadius: '10px', border: 'none', background: 'rgba(255,255,255,0.05)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                      {renderColorPreview(type, 24, 6)}
                      {type.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Pilar */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => { closeAllMenus(); setShowArrowMenu(!showArrowMenu); }} style={{ width: '50px', height: '50px', background: showArrowMenu ? appleColors.fillActive : 'transparent', borderRadius: '12px', border: 'none', color: showArrowMenu ? '#fff' : appleColors.gray, fontSize: '22px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>➡️</button>
              
              {showArrowMenu && (
                <div style={{ position: 'absolute', left: '60px', top: 0, background: 'rgba(44,44,46,0.95)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', borderRadius: '16px', padding: '16px', minWidth: '200px', zIndex: 100 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: appleColors.gray, letterSpacing: '0.5px', marginBottom: '12px', textTransform: 'uppercase' }}>Lägg till pil</div>
                  {arrowTypes.map(type => (
                    <button key={type.id} onClick={() => { setSelectedArrow(type.id); setShowArrowMenu(false); }} style={{ width: '100%', padding: '12px', marginBottom: '6px', borderRadius: '10px', border: 'none', background: 'rgba(255,255,255,0.05)', color: type.color, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                      <span style={{ fontSize: '20px' }}>{type.icon}</span>
                      {type.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Filter/Lager */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => { closeAllMenus(); setShowFilter(!showFilter); }} style={{ width: '50px', height: '50px', background: showFilter ? appleColors.fillActive : 'transparent', borderRadius: '12px', border: 'none', color: showFilter ? '#fff' : appleColors.gray, fontSize: '22px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>👁</button>
              
              {showFilter && (
                <div style={{ position: 'absolute', left: '60px', bottom: 0, background: 'rgba(44,44,46,0.95)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', borderRadius: '16px', padding: '16px', minWidth: '200px', zIndex: 100, maxHeight: '60vh', overflowY: 'auto' }}>
                  
                  <div style={{ fontSize: '13px', fontWeight: 600, color: appleColors.gray, letterSpacing: '0.5px', marginBottom: '12px', textTransform: 'uppercase' }}>Zoner</div>
                  {zoneTypes.map((type) => (
                    <label key={type.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', marginBottom: '2px', background: visibleZones[type.id] ? 'rgba(255,255,255,0.08)' : 'transparent', borderRadius: '10px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={visibleZones[type.id]} onChange={() => setVisibleZones(prev => ({ ...prev, [type.id]: !prev[type.id] }))} style={{ display: 'none' }} />
                      <div style={{ width: '22px', height: '22px', borderRadius: '6px', border: `2px solid ${type.color}`, background: visibleZones[type.id] ? type.color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {visibleZones[type.id] && <span style={{ color: '#000', fontSize: '13px', fontWeight: 'bold' }}>✓</span>}
                      </div>
                      <span style={{ fontSize: '15px' }}>{type.icon}</span>
                      <span style={{ fontSize: '13px', color: '#fff' }}>{type.name}</span>
                      <span style={{ marginLeft: 'auto', fontSize: '12px', color: appleColors.gray }}>{countZones(type.id)}</span>
                    </label>
                  ))}
                  
                  <div style={{ fontSize: '13px', fontWeight: 600, color: appleColors.gray, letterSpacing: '0.5px', margin: '16px 0 12px', textTransform: 'uppercase' }}>Linjer</div>
                  {lineTypes.map((type) => (
                    <label key={type.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', marginBottom: '2px', background: visibleLines[type.id] ? 'rgba(255,255,255,0.08)' : 'transparent', borderRadius: '10px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={visibleLines[type.id]} onChange={() => setVisibleLines(prev => ({ ...prev, [type.id]: !prev[type.id] }))} style={{ display: 'none' }} />
                      <div style={{ width: '22px', height: '22px', borderRadius: '6px', border: visibleLines[type.id] ? `2px solid ${appleColors.green}` : '2px solid #48484A', background: visibleLines[type.id] ? appleColors.green : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {visibleLines[type.id] && <span style={{ color: '#000', fontSize: '13px', fontWeight: 'bold' }}>✓</span>}
                      </div>
                      {renderColorPreview(type, 20, 5)}
                      <span style={{ fontSize: '13px', color: '#fff' }}>{type.name}</span>
                      <span style={{ marginLeft: 'auto', fontSize: '12px', color: appleColors.gray }}>{countLines(type.id)}</span>
                    </label>
                  ))}
                  
                  <div style={{ fontSize: '13px', fontWeight: 600, color: appleColors.gray, letterSpacing: '0.5px', margin: '16px 0 12px', textTransform: 'uppercase' }}>Symboler</div>
                  {categories.map((cat) => (
                    <label key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', marginBottom: '2px', background: visibleCategories[cat.id] ? 'rgba(255,255,255,0.08)' : 'transparent', borderRadius: '10px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={visibleCategories[cat.id]} onChange={() => setVisibleCategories(prev => ({ ...prev, [cat.id]: !prev[cat.id] }))} style={{ display: 'none' }} />
                      <div style={{ width: '22px', height: '22px', borderRadius: '6px', border: `2px solid ${cat.color}`, background: visibleCategories[cat.id] ? cat.color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {visibleCategories[cat.id] && <span style={{ color: '#000', fontSize: '13px', fontWeight: 'bold' }}>✓</span>}
                      </div>
                      <span style={{ fontSize: '15px' }}>{cat.icon}</span>
                      <span style={{ fontSize: '13px', color: '#fff' }}>{cat.name}</span>
                      <span style={{ marginLeft: 'auto', fontSize: '12px', color: appleColors.gray }}>{countByCategory(cat.id)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Mätverktyg */}
            <button 
              onClick={() => {
                if (measureMode) {
                  setMeasureMode(null);
                  setMeasurePoints([]);
                } else {
                  setMeasureMode('distance');
                }
              }} 
              style={{ width: '50px', height: '50px', background: measureMode ? appleColors.fillActive : 'transparent', borderRadius: '12px', border: 'none', color: measureMode ? '#fff' : appleColors.gray, fontSize: '22px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              📏
            </button>

            {/* Undo */}
            <button onClick={undo} style={{ width: '50px', height: '50px', background: 'transparent', borderRadius: '12px', border: 'none', color: appleColors.gray, fontSize: '22px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>↶</button>
          </>
        )}

        {/* Stickvägsguide - alltid synlig */}
        <button 
          onClick={() => {
            const newValue = !stripRoadGuide;
            setStripRoadGuide(newValue);
            if (newValue) {
              requestWakeLock();
            } else if (!isTracking) {
              releaseWakeLock();
            }
          }} 
          style={{ width: '50px', height: '50px', background: stripRoadGuide ? 'rgba(52,199,89,0.2)' : 'transparent', borderRadius: '12px', border: 'none', color: stripRoadGuide ? appleColors.green : appleColors.gray, fontSize: '22px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title="Gallringsguide"
        >
          🛤️
        </button>
      </div>

      {/* Right side - layers */}
      <div style={{ position: 'absolute', right: '20px', top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {[{ id: 'moisture', icon: '💧' }, { id: 'terrain', icon: '⛰️' }, { id: 'satellite', icon: '🛰️' }].map((layer) => (
          <button key={layer.id} onClick={() => setActiveLayer(layer.id)} style={{ ...buttonBase, width: '44px', height: '44px', background: activeLayer === layer.id ? 'rgba(132, 204, 22, 0.2)' : 'rgba(0,0,0,0.7)', backdropFilter: 'blur(20px)', border: activeLayer === layer.id ? '1px solid rgba(132, 204, 22, 0.5)' : '1px solid rgba(132, 204, 22, 0.15)', fontSize: '18px' }}>{layer.icon}</button>
        ))}
      </div>

      {/* GPS indicator - aktiv spårning */}
      {isTracking && (
        <div style={{ position: 'absolute', bottom: '24px', left: '50%', transform: 'translateX(-50%)', background: gpsStatus === 'active' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(251, 191, 36, 0.2)', backdropFilter: 'blur(20px)', borderRadius: '14px', padding: '14px 24px', border: `1px solid ${gpsStatus === 'active' ? '#22c55e' : '#fbbf24'}`, display: 'flex', alignItems: 'center', gap: '16px', color: gpsStatus === 'active' ? '#22c55e' : '#fbbf24' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {gpsStatus === 'searching' && <span>🔍</span>}
            {gpsStatus === 'active' && <span style={{ animation: 'pulse 1.5s infinite' }}>📍</span>}
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>{gpsStatus === 'searching' ? 'Söker GPS...' : 'Spårar'}</div>
              <div style={{ fontSize: '10px', color: '#7c8a70' }}>{trackingPath.length} punkter</div>
            </div>
          </div>
          
          {/* Stickvägsavstånd */}
          {stripRoadGuide && nearestStripRoad && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              padding: '8px 14px', 
              borderRadius: '8px', 
              background: nearestStripRoad.inZone ? 'rgba(34, 197, 94, 0.3)' : nearestStripRoad.tooClose ? 'rgba(239, 68, 68, 0.3)' : 'rgba(251, 191, 36, 0.3)',
              border: `1px solid ${nearestStripRoad.inZone ? '#22c55e' : nearestStripRoad.tooClose ? '#ef4444' : '#fbbf24'}`
            }}>
              <span style={{ fontSize: '16px' }}>🛤️</span>
              <div>
                <div style={{ 
                  fontSize: '18px', 
                  fontWeight: 700, 
                  color: nearestStripRoad.inZone ? '#22c55e' : nearestStripRoad.tooClose ? '#ef4444' : '#fbbf24' 
                }}>
                  {Math.round(nearestStripRoad.distance)}m
                </div>
                <div style={{ fontSize: '9px', color: '#7c8a70' }}>
                  {nearestStripRoad.inZone ? '✓ BRA! Fortsätt' : nearestStripRoad.tooClose ? '⚠️ FÖR NÄRA!' : '⚠️ FÖR LÅNGT!'}
                </div>
              </div>
            </div>
          )}
          
          {/* Gränsavstånd */}
          {stripRoadGuide && nearestBoundary && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              padding: '8px 14px', 
              borderRadius: '8px', 
              background: nearestBoundary.inZone ? 'rgba(249, 115, 22, 0.3)' : nearestBoundary.tooClose ? 'rgba(239, 68, 68, 0.3)' : 'rgba(251, 191, 36, 0.3)',
              border: `1px solid ${nearestBoundary.inZone ? '#f97316' : nearestBoundary.tooClose ? '#ef4444' : '#fbbf24'}`
            }}>
              <span style={{ fontSize: '16px' }}>🚧</span>
              <div>
                <div style={{ 
                  fontSize: '18px', 
                  fontWeight: 700, 
                  color: nearestBoundary.inZone ? '#f97316' : nearestBoundary.tooClose ? '#ef4444' : '#fbbf24' 
                }}>
                  {Math.round(nearestBoundary.distance)}m
                </div>
                <div style={{ fontSize: '9px', color: '#7c8a70' }}>
                  {nearestBoundary.inZone ? '✓ BRA! Fortsätt' : nearestBoundary.tooClose ? '⚠️ FÖR NÄRA GRÄNS!' : '⚠️ FÖR LÅNGT!'}
                </div>
              </div>
            </div>
          )}
          
          <button onClick={pauseTracking} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'rgba(251, 191, 36, 0.2)', color: '#fbbf24', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>Pausa ⏸</button>
          {trackingPath.length >= 2 && (
            <button onClick={finishTracking} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #365314, #1a2e05)', color: '#a3e635', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>Klar ✓</button>
          )}
          <button onClick={cancelTracking} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>Avbryt</button>
        </div>
      )}

      {/* GPS indicator - pausad */}
      {isPaused && !isTracking && trackingPath.length > 0 && (
        <div style={{ position: 'absolute', bottom: '24px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(251, 191, 36, 0.15)', backdropFilter: 'blur(20px)', borderRadius: '14px', padding: '14px 24px', border: '1px solid #fbbf24', display: 'flex', alignItems: 'center', gap: '16px', color: '#fbbf24' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>⏸</span>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>Pausad</div>
              <div style={{ fontSize: '10px', color: '#7c8a70' }}>{trackingPath.length} punkter – {lineTypes.find(t => t.id === trackingType)?.name}</div>
            </div>
          </div>
          <button onClick={resumeTracking} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'rgba(34, 197, 94, 0.2)', color: '#22c55e', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>Fortsätt ▶</button>
          {trackingPath.length >= 2 && (
            <button onClick={finishTracking} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #365314, #1a2e05)', color: '#a3e635', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>Klar ✓</button>
          )}
          <button onClick={cancelTracking} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>Avbryt</button>
        </div>
      )}

      {/* Draw/Zone mode indicator */}
      {((isDrawMode && drawType) || (isZoneMode && zoneType)) && !isDrawing && !pendingLine && !pendingZone && (
        <div style={{ position: 'absolute', bottom: '24px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(20px)', borderRadius: '12px', padding: '12px 20px', border: '1px solid rgba(132, 204, 22, 0.4)', color: '#a3e635', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isZoneMode && zoneType && renderZonePreview(zoneTypes.find(t => t.id === zoneType), 28)}
          {isDrawMode && drawType && renderColorPreview(lineTypes.find(t => t.id === drawType))}
          
          <div>
            {drawnPath.length > 0 || drawnZonePath.length > 0 ? (
              <span>{isZoneMode ? drawnZonePath.length : drawnPath.length} punkter – Fortsätt rita eller klicka Klar</span>
            ) : (
              <span>{isZoneMode ? `Rita ${zoneTypes.find(t => t.id === zoneType)?.name} zon` : `Ritar ${lineTypes.find(t => t.id === drawType)?.name}`} – Klicka och dra</span>
            )}
          </div>
          
          {(drawnPath.length >= 2 || drawnZonePath.length >= 3) && (
            <button onClick={finishDrawing} style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #365314, #1a2e05)', color: '#a3e635', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>Klar ✓</button>
          )}
          
          <button onClick={cancelDrawing} style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#7c8a70', cursor: 'pointer', fontSize: '11px' }}>Avbryt</button>
        </div>
      )}

      {/* Symbol placement mode indicator */}
      {selectedSymbol && !pendingMarker && (
        <div style={{ position: 'absolute', bottom: '24px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(20px)', borderRadius: '12px', padding: '12px 20px', border: '1px solid rgba(132, 204, 22, 0.4)', color: '#a3e635', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '24px' }}>{markerTypes.find(t => t.id === selectedSymbol)?.icon}</span>
          <span>Klicka på kartan för att placera {markerTypes.find(t => t.id === selectedSymbol)?.name}</span>
          <button onClick={() => setSelectedSymbol(null)} style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#7c8a70', cursor: 'pointer', fontSize: '11px' }}>Avbryt</button>
        </div>
      )}

      {/* Arrow mode indicator */}
      {isArrowMode && arrowType && !pendingArrow && (
        <div style={{ position: 'absolute', bottom: '24px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(20px)', borderRadius: '12px', padding: '12px 20px', border: `1px solid ${arrowTypes.find(t => t.id === arrowType)?.color}40`, color: arrowTypes.find(t => t.id === arrowType)?.color, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '20px' }}>{arrowTypes.find(t => t.id === arrowType)?.icon}</span>
          <span>Klicka för att placera {arrowTypes.find(t => t.id === arrowType)?.name.toLowerCase()}</span>
          <button onClick={() => { setIsArrowMode(false); setArrowType(null); }} style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#7c8a70', cursor: 'pointer', fontSize: '11px' }}>Avbryt</button>
        </div>
      )}

      {/* New marker dialog */}
      {pendingMarker && (() => {
        const markerType = markerTypes.find(t => t.id === pendingMarker.type);
        const requireComment = markerType?.requireComment || false;
        const canSave = !requireComment || (pendingMarker.comment && pendingMarker.comment.trim());
        
        return (
          <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(20px)', borderRadius: '20px', padding: '24px', border: '1px solid rgba(132, 204, 22, 0.3)', width: '320px', maxHeight: '85vh', overflowY: 'auto', zIndex: 1000, boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
            
            {/* Vald symbol */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid rgba(132, 204, 22, 0.2)' }}>
              <span style={{ fontSize: '36px' }}>{markerType?.icon}</span>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#a3e635' }}>{markerType?.name}</div>
                {requireComment && <div style={{ fontSize: '10px', color: '#fbbf24' }}>Kräver kommentar</div>}
              </div>
            </div>
            
            {/* Gäller för */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', color: '#7c8a70', marginBottom: '10px' }}>Visas för</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {categories.map(cat => (
                  <button key={cat.id} onClick={() => setPendingMarker(prev => ({ ...prev, category: cat.id }))} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: pendingMarker.category === cat.id ? `2px solid ${cat.color}` : '2px solid rgba(255,255,255,0.1)', background: pendingMarker.category === cat.id ? `${cat.color}22` : 'rgba(255,255,255,0.05)', cursor: 'pointer', color: pendingMarker.category === cat.id ? cat.color : '#7c8a70', fontSize: '11px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '16px' }}>{cat.icon}</span>
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Kommentar */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', color: '#7c8a70', marginBottom: '10px' }}>
                Kommentar {requireComment && <span style={{ color: '#ef4444' }}>*</span>}
              </div>
              <textarea value={pendingMarker.comment} onChange={(e) => setPendingMarker(prev => ({ ...prev, comment: e.target.value }))} placeholder={requireComment ? "Beskriv vad som ska skyddas/aktas..." : "Valfri kommentar..."} style={{ width: '100%', height: '80px', background: 'rgba(255,255,255,0.05)', border: requireComment && !pendingMarker.comment?.trim() ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px', color: '#e8ebe4', fontSize: '13px', resize: 'none', outline: 'none', fontFamily: 'inherit' }} autoFocus />
            </div>
            
            {/* Varningsradie */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', color: '#7c8a70', marginBottom: '10px' }}>Varningsradie (varna maskin inom)</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {warningRadii.map(r => (
                  <button key={r.value} onClick={() => setPendingMarker(prev => ({ ...prev, warningRadius: r.value }))} style={{ padding: '8px 12px', borderRadius: '8px', border: pendingMarker.warningRadius === r.value ? '2px solid #ef4444' : '2px solid rgba(255,255,255,0.1)', background: pendingMarker.warningRadius === r.value ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.05)', cursor: 'pointer', color: pendingMarker.warningRadius === r.value ? '#ef4444' : '#7c8a70', fontSize: '11px' }}>{r.label}</button>
                ))}
              </div>
            </div>
            
            {/* Varna vilken maskin */}
            {pendingMarker.warningRadius > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', color: '#7c8a70', marginBottom: '10px' }}>Varna vilken maskin?</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setPendingMarker(prev => ({ ...prev, warningFor: 'harvester' }))} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: pendingMarker.warningFor === 'harvester' ? '2px solid #f59e0b' : '2px solid rgba(255,255,255,0.1)', background: pendingMarker.warningFor === 'harvester' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.05)', cursor: 'pointer', color: pendingMarker.warningFor === 'harvester' ? '#f59e0b' : '#7c8a70', fontSize: '11px' }}>🌲 Skördare</button>
                  <button onClick={() => setPendingMarker(prev => ({ ...prev, warningFor: 'forwarder' }))} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: pendingMarker.warningFor === 'forwarder' ? '2px solid #3b82f6' : '2px solid rgba(255,255,255,0.1)', background: pendingMarker.warningFor === 'forwarder' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.05)', cursor: 'pointer', color: pendingMarker.warningFor === 'forwarder' ? '#3b82f6' : '#7c8a70', fontSize: '11px' }}>🚜 Skotare</button>
                  <button onClick={() => setPendingMarker(prev => ({ ...prev, warningFor: 'both' }))} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: pendingMarker.warningFor === 'both' ? '2px solid #ef4444' : '2px solid rgba(255,255,255,0.1)', background: pendingMarker.warningFor === 'both' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.05)', cursor: 'pointer', color: pendingMarker.warningFor === 'both' ? '#ef4444' : '#7c8a70', fontSize: '11px' }}>⚠️ Båda</button>
                </div>
              </div>
            )}
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => { setPendingMarker(null); setSelectedSymbol(null); }} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#7c8a70', cursor: 'pointer', fontSize: '13px' }}>Avbryt</button>
              <button onClick={saveMarker} disabled={!canSave} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: canSave ? 'linear-gradient(135deg, #365314, #1a2e05)' : 'rgba(255,255,255,0.1)', color: canSave ? '#a3e635' : '#7c8a70', cursor: canSave ? 'pointer' : 'not-allowed', fontSize: '13px', fontWeight: 600 }}>Spara</button>
            </div>
          </div>
        );
      })()}

      {/* Line dialog */}
      {pendingLine && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(20px)', borderRadius: '20px', padding: '24px', border: '1px solid rgba(132, 204, 22, 0.3)', width: '340px', maxHeight: '85vh', overflowY: 'auto', zIndex: 1000, boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
          <div style={{ fontSize: '11px', color: '#7c8a70', letterSpacing: '1.5px', marginBottom: '20px' }}>SPARA LINJE</div>
          
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '11px', color: '#7c8a70', marginBottom: '10px' }}>Linjetyp</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {lineTypes.map(type => (
                <button key={type.id} onClick={() => setPendingLine(prev => ({ ...prev, lineType: type.id }))} style={{ padding: '10px', borderRadius: '10px', border: pendingLine.lineType === type.id ? '2px solid #84cc16' : '2px solid rgba(255,255,255,0.1)', background: pendingLine.lineType === type.id ? 'rgba(132, 204, 22, 0.2)' : 'rgba(255,255,255,0.05)', cursor: 'pointer', color: pendingLine.lineType === type.id ? '#a3e635' : '#7c8a70', fontSize: '9px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  {renderColorPreview(type, 36, 5)}
                  {type.name}
                </button>
              ))}
            </div>
          </div>
          
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '11px', color: '#7c8a70', marginBottom: '10px' }}>Visas för</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {categories.map(cat => (
                <button key={cat.id} onClick={() => setPendingLine(prev => ({ ...prev, category: cat.id }))} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: pendingLine.category === cat.id ? `2px solid ${cat.color}` : '2px solid rgba(255,255,255,0.1)', background: pendingLine.category === cat.id ? `${cat.color}22` : 'rgba(255,255,255,0.05)', cursor: 'pointer', color: pendingLine.category === cat.id ? cat.color : '#7c8a70', fontSize: '11px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '16px' }}>{cat.icon}</span>
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
          
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '11px', color: '#7c8a70', marginBottom: '10px' }}>Kommentar</div>
            <textarea value={pendingLine.comment} onChange={(e) => setPendingLine(prev => ({ ...prev, comment: e.target.value }))} placeholder="Valfri kommentar..." style={{ width: '100%', height: '70px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px', color: '#e8ebe4', fontSize: '13px', resize: 'none', outline: 'none', fontFamily: 'inherit' }} />
          </div>
          
          {/* Varningsradie för linjer */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', color: '#7c8a70', marginBottom: '10px' }}>Varningsradie</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {warningRadii.map(r => (
                <button key={r.value} onClick={() => setPendingLine(prev => ({ ...prev, warningRadius: r.value }))} style={{ padding: '8px 12px', borderRadius: '8px', border: (pendingLine.warningRadius || 0) === r.value ? '2px solid #ef4444' : '2px solid rgba(255,255,255,0.1)', background: (pendingLine.warningRadius || 0) === r.value ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.05)', cursor: 'pointer', color: (pendingLine.warningRadius || 0) === r.value ? '#ef4444' : '#7c8a70', fontSize: '11px' }}>{r.label}</button>
              ))}
            </div>
          </div>
          
          {(pendingLine.warningRadius || 0) > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', color: '#7c8a70', marginBottom: '10px' }}>Varna vilken maskin?</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setPendingLine(prev => ({ ...prev, warningFor: 'harvester' }))} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: pendingLine.warningFor === 'harvester' ? '2px solid #f59e0b' : '2px solid rgba(255,255,255,0.1)', background: pendingLine.warningFor === 'harvester' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.05)', cursor: 'pointer', color: pendingLine.warningFor === 'harvester' ? '#f59e0b' : '#7c8a70', fontSize: '11px' }}>🌲 Skördare</button>
                <button onClick={() => setPendingLine(prev => ({ ...prev, warningFor: 'forwarder' }))} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: pendingLine.warningFor === 'forwarder' ? '2px solid #3b82f6' : '2px solid rgba(255,255,255,0.1)', background: pendingLine.warningFor === 'forwarder' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.05)', cursor: 'pointer', color: pendingLine.warningFor === 'forwarder' ? '#3b82f6' : '#7c8a70', fontSize: '11px' }}>🚜 Skotare</button>
                <button onClick={() => setPendingLine(prev => ({ ...prev, warningFor: 'both' }))} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: (pendingLine.warningFor || 'both') === 'both' ? '2px solid #ef4444' : '2px solid rgba(255,255,255,0.1)', background: (pendingLine.warningFor || 'both') === 'both' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.05)', cursor: 'pointer', color: (pendingLine.warningFor || 'both') === 'both' ? '#ef4444' : '#7c8a70', fontSize: '11px' }}>⚠️ Båda</button>
              </div>
            </div>
          )}
          
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setPendingLine(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#7c8a70', cursor: 'pointer', fontSize: '13px' }}>Avbryt</button>
            <button onClick={saveLine} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #365314, #1a2e05)', color: '#a3e635', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>Spara</button>
          </div>
        </div>
      )}

      {/* Zone dialog */}
      {pendingZone && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(20px)', borderRadius: '20px', padding: '24px', border: '1px solid rgba(132, 204, 22, 0.3)', width: '340px', maxHeight: '85vh', overflowY: 'auto', zIndex: 1000, boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
          <div style={{ fontSize: '11px', color: '#7c8a70', letterSpacing: '1.5px', marginBottom: '20px' }}>SPARA ZON</div>
          
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '11px', color: '#7c8a70', marginBottom: '10px' }}>Zontyp</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {zoneTypes.map(type => (
                <button key={type.id} onClick={() => setPendingZone(prev => ({ ...prev, zoneType: type.id }))} style={{ flex: 1, padding: '12px 8px', borderRadius: '10px', border: pendingZone.zoneType === type.id ? '2px solid #84cc16' : '2px solid rgba(255,255,255,0.1)', background: pendingZone.zoneType === type.id ? 'rgba(132, 204, 22, 0.2)' : 'rgba(255,255,255,0.05)', cursor: 'pointer', color: pendingZone.zoneType === type.id ? '#a3e635' : '#7c8a70', fontSize: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '24px' }}>{type.icon}</span>
                  {type.name}
                </button>
              ))}
            </div>
          </div>
          
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '11px', color: '#7c8a70', marginBottom: '10px' }}>Visas för</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {categories.map(cat => (
                <button key={cat.id} onClick={() => setPendingZone(prev => ({ ...prev, category: cat.id }))} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: (pendingZone.category || 'harvester') === cat.id ? `2px solid ${cat.color}` : '2px solid rgba(255,255,255,0.1)', background: (pendingZone.category || 'harvester') === cat.id ? `${cat.color}22` : 'rgba(255,255,255,0.05)', cursor: 'pointer', color: (pendingZone.category || 'harvester') === cat.id ? cat.color : '#7c8a70', fontSize: '11px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '16px' }}>{cat.icon}</span>
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
          
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '11px', color: '#7c8a70', marginBottom: '10px' }}>Kommentar <span style={{ color: '#ef4444' }}>*</span></div>
            <textarea value={pendingZone.comment} onChange={(e) => setPendingZone(prev => ({ ...prev, comment: e.target.value }))} placeholder="Beskriv problemet/området..." style={{ width: '100%', height: '80px', background: 'rgba(255,255,255,0.05)', border: !pendingZone.comment?.trim() ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px', color: '#e8ebe4', fontSize: '13px', resize: 'none', outline: 'none', fontFamily: 'inherit' }} autoFocus />
            <div style={{ fontSize: '10px', color: '#7c8a70', marginTop: '6px' }}>T.ex. "Blött 20m från bäcken"</div>
          </div>
          
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', color: '#7c8a70', marginBottom: '10px' }}>Varningsradie</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {warningRadii.map(r => (
                <button key={r.value} onClick={() => setPendingZone(prev => ({ ...prev, warningRadius: r.value }))} style={{ padding: '8px 12px', borderRadius: '8px', border: (pendingZone.warningRadius || 0) === r.value ? '2px solid #ef4444' : '2px solid rgba(255,255,255,0.1)', background: (pendingZone.warningRadius || 0) === r.value ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.05)', cursor: 'pointer', color: (pendingZone.warningRadius || 0) === r.value ? '#ef4444' : '#7c8a70', fontSize: '11px' }}>{r.label}</button>
              ))}
            </div>
          </div>
          
          {(pendingZone.warningRadius || 0) > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', color: '#7c8a70', marginBottom: '10px' }}>Varna vilken maskin?</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setPendingZone(prev => ({ ...prev, warningFor: 'harvester' }))} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: pendingZone.warningFor === 'harvester' ? '2px solid #f59e0b' : '2px solid rgba(255,255,255,0.1)', background: pendingZone.warningFor === 'harvester' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.05)', cursor: 'pointer', color: pendingZone.warningFor === 'harvester' ? '#f59e0b' : '#7c8a70', fontSize: '11px' }}>🌲 Skördare</button>
                <button onClick={() => setPendingZone(prev => ({ ...prev, warningFor: 'forwarder' }))} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: pendingZone.warningFor === 'forwarder' ? '2px solid #3b82f6' : '2px solid rgba(255,255,255,0.1)', background: pendingZone.warningFor === 'forwarder' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.05)', cursor: 'pointer', color: pendingZone.warningFor === 'forwarder' ? '#3b82f6' : '#7c8a70', fontSize: '11px' }}>🚜 Skotare</button>
                <button onClick={() => setPendingZone(prev => ({ ...prev, warningFor: 'both' }))} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: (pendingZone.warningFor || 'both') === 'both' ? '2px solid #ef4444' : '2px solid rgba(255,255,255,0.1)', background: (pendingZone.warningFor || 'both') === 'both' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.05)', cursor: 'pointer', color: (pendingZone.warningFor || 'both') === 'both' ? '#ef4444' : '#7c8a70', fontSize: '11px' }}>⚠️ Båda</button>
              </div>
            </div>
          )}
          
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setPendingZone(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#7c8a70', cursor: 'pointer', fontSize: '13px' }}>Avbryt</button>
            <button onClick={saveZone} disabled={!pendingZone.comment?.trim()} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: pendingZone.comment?.trim() ? 'linear-gradient(135deg, #365314, #1a2e05)' : 'rgba(255,255,255,0.1)', color: pendingZone.comment?.trim() ? '#a3e635' : '#7c8a70', cursor: pendingZone.comment?.trim() ? 'pointer' : 'not-allowed', fontSize: '13px', fontWeight: 600 }}>Spara</button>
          </div>
        </div>
      )}

      {/* Pending Arrow dialog */}
      {pendingArrow && (() => {
        const type = arrowTypes.find(t => t.id === pendingArrow.arrowType);
        const angle = pendingArrow.angle || 0;
        return (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(20px)', borderRadius: '20px', padding: '24px', border: `1px solid ${type?.color}50`, width: '340px', zIndex: 1000, boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{ fontSize: '28px' }}>{type?.icon}</div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: type?.color }}>{type?.name}</div>
              <div style={{ fontSize: '10px', color: '#7c8a70' }}>{type?.description}</div>
            </div>
          </div>
          
          {/* Rotation preview och kontroller */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '11px', color: '#7c8a70', marginBottom: '12px' }}>RIKTNING</div>
            
            {/* Visuell förhandsvisning */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
              <svg width="120" height="120" style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '60px', border: '1px solid rgba(255,255,255,0.1)' }}>
                {/* Kompasslinjer */}
                <line x1="60" y1="10" x2="60" y2="20" stroke="#444" strokeWidth="2" />
                <line x1="60" y1="100" x2="60" y2="110" stroke="#444" strokeWidth="2" />
                <line x1="10" y1="60" x2="20" y2="60" stroke="#444" strokeWidth="2" />
                <line x1="100" y1="60" x2="110" y2="60" stroke="#444" strokeWidth="2" />
                <text x="60" y="8" textAnchor="middle" fill="#666" fontSize="8">N</text>
                
                {/* Pil */}
                <line 
                  x1="60" 
                  y1="60" 
                  x2={60 + Math.cos(angle * Math.PI / 180) * 35} 
                  y2={60 + Math.sin(angle * Math.PI / 180) * 35} 
                  stroke={type?.color} 
                  strokeWidth="4" 
                  strokeLinecap="round"
                />
                <polygon
                  points="0,-6 14,0 0,6"
                  fill={type?.color}
                  transform={`translate(${60 + Math.cos(angle * Math.PI / 180) * 40}, ${60 + Math.sin(angle * Math.PI / 180) * 40}) rotate(${angle})`}
                />
                <circle cx="60" cy="60" r="8" fill="rgba(0,0,0,0.8)" stroke={type?.color} strokeWidth="2" />
                <text x="60" y="60" textAnchor="middle" dominantBaseline="central" fontSize="8">{type?.icon}</text>
              </svg>
            </div>
            
            {/* Snabbrotation knappar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '12px' }}>
              {[
                { deg: 0, label: '→', name: 'Höger' },
                { deg: 90, label: '↓', name: 'Ner' },
                { deg: 180, label: '←', name: 'Vänster' },
                { deg: 270, label: '↑', name: 'Upp' },
              ].map(dir => (
                <button
                  key={dir.deg}
                  onClick={() => setPendingArrow(prev => ({ ...prev, angle: dir.deg }))}
                  style={{ padding: '10px 6px', borderRadius: '8px', border: angle === dir.deg ? `2px solid ${type?.color}` : '1px solid rgba(255,255,255,0.1)', background: angle === dir.deg ? `${type?.color}22` : 'transparent', color: angle === dir.deg ? type?.color : '#7c8a70', cursor: 'pointer', fontSize: '16px' }}
                  title={dir.name}
                >
                  {dir.label}
                </button>
              ))}
            </div>
            
            {/* Finjustering */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button onClick={() => setPendingArrow(prev => ({ ...prev, angle: (prev.angle - 15 + 360) % 360 }))} style={{ width: '40px', height: '36px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#7c8a70', cursor: 'pointer', fontSize: '14px' }}>↺</button>
              <input 
                type="range" 
                min="0" 
                max="359" 
                value={angle} 
                onChange={(e) => setPendingArrow(prev => ({ ...prev, angle: parseInt(e.target.value) }))}
                style={{ flex: 1, accentColor: type?.color }}
              />
              <button onClick={() => setPendingArrow(prev => ({ ...prev, angle: (prev.angle + 15) % 360 }))} style={{ width: '40px', height: '36px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#7c8a70', cursor: 'pointer', fontSize: '14px' }}>↻</button>
              <div style={{ width: '45px', textAlign: 'center', fontSize: '12px', color: type?.color, fontWeight: 600 }}>{angle}°</div>
            </div>
          </div>
          
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', color: '#7c8a70', marginBottom: '8px' }}>VISAS FÖR</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              {categories.map(cat => {
                const isSelected = (pendingArrow.categories || []).includes(cat.id);
                return (
                  <button
                    key={cat.id}
                    onClick={() => {
                      const cats = pendingArrow.categories || ['harvester', 'forwarder'];
                      if (isSelected && cats.length > 1) {
                        setPendingArrow(prev => ({ ...prev, categories: cats.filter(c => c !== cat.id) }));
                      } else if (!isSelected) {
                        setPendingArrow(prev => ({ ...prev, categories: [...cats, cat.id] }));
                      }
                    }}
                    style={{ padding: '10px', borderRadius: '8px', border: isSelected ? `2px solid ${cat.color}` : '2px solid rgba(255,255,255,0.1)', background: isSelected ? `${cat.color}22` : 'transparent', color: isSelected ? cat.color : '#7c8a70', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}
                  >
                    <span style={{ fontSize: '16px' }}>{cat.icon}</span>
                    <span style={{ fontSize: '9px' }}>{cat.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
          
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', color: '#7c8a70', marginBottom: '8px' }}>KOMMENTAR (valfritt)</div>
            <textarea
              value={pendingArrow.comment || ''}
              onChange={(e) => setPendingArrow(prev => ({ ...prev, comment: e.target.value }))}
              placeholder="T.ex. 'Fäll mot vägen'..."
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#e8ebe4', fontSize: '13px', minHeight: '50px', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>
          
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => { setPendingArrow(null); setIsArrowMode(false); setArrowType(null); }} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#7c8a70', cursor: 'pointer', fontSize: '12px' }}>Avbryt</button>
            <button onClick={saveArrow} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: `linear-gradient(135deg, ${type?.color}44, ${type?.color}22)`, color: type?.color, cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>💾 Spara</button>
          </div>
        </div>
        );
      })()}

      {/* Selected marker/zone popup */}
      {selectedMarker && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(20px)', borderRadius: '16px', padding: '20px', border: `1px solid ${selectedMarker.isArrow ? arrowTypes.find(t => t.id === selectedMarker.arrowType)?.color : selectedMarker.isZone ? zoneTypes.find(t => t.id === selectedMarker.zoneType)?.color : selectedMarker.warningRadius > 0 ? '#ef4444' : categories.find(c => c.id === (selectedMarker.category || 'harvester'))?.color || '#84cc16'}`, minWidth: '280px', maxWidth: '340px', zIndex: 1000, boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            {selectedMarker.isArrow ? (
              <>
                <span style={{ fontSize: '32px' }}>{arrowTypes.find(t => t.id === selectedMarker.arrowType)?.icon}</span>
                <div>
                  <div style={{ fontSize: '14px', color: arrowTypes.find(t => t.id === selectedMarker.arrowType)?.color, fontWeight: 600 }}>{arrowTypes.find(t => t.id === selectedMarker.arrowType)?.name}</div>
                  <div style={{ fontSize: '10px', color: '#7c8a70' }}>{arrowTypes.find(t => t.id === selectedMarker.arrowType)?.description}</div>
                </div>
              </>
            ) : selectedMarker.isZone ? (
              <>
                <span style={{ fontSize: '32px' }}>{zoneTypes.find(t => t.id === selectedMarker.zoneType)?.icon}</span>
                <div>
                  <div style={{ fontSize: '14px', color: zoneTypes.find(t => t.id === selectedMarker.zoneType)?.color, fontWeight: 600 }}>{zoneTypes.find(t => t.id === selectedMarker.zoneType)?.name}</div>
                  <div style={{ fontSize: '10px', color: categories.find(c => c.id === (selectedMarker.category || 'harvester'))?.color }}>{categories.find(c => c.id === (selectedMarker.category || 'harvester'))?.name}</div>
                </div>
              </>
            ) : selectedMarker.isLine ? (
              <>
                {renderColorPreview(lineTypes.find(t => t.id === selectedMarker.lineType), 32, 8)}
                <div>
                  <div style={{ fontSize: '14px', color: '#a3e635', fontWeight: 600 }}>{lineTypes.find(t => t.id === selectedMarker.lineType)?.name}</div>
                  <div style={{ fontSize: '10px', color: categories.find(c => c.id === (selectedMarker.category || 'forwarder'))?.color }}>{categories.find(c => c.id === (selectedMarker.category || 'forwarder'))?.name}</div>
                </div>
              </>
            ) : (
              <>
                <span style={{ fontSize: '32px' }}>{markerTypes.find(t => t.id === selectedMarker.type)?.icon}</span>
                <div>
                  <div style={{ fontSize: '14px', color: categories.find(c => c.id === (selectedMarker.category || 'harvester'))?.color, fontWeight: 600 }}>{markerTypes.find(t => t.id === selectedMarker.type)?.name}</div>
                  <div style={{ fontSize: '10px', color: '#7c8a70' }}>Visas för {categories.find(c => c.id === (selectedMarker.category || 'harvester'))?.name}</div>
                </div>
              </>
            )}
            <button onClick={() => setSelectedMarker(null)} style={{ marginLeft: 'auto', width: '28px', height: '28px', borderRadius: '8px', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#7c8a70', cursor: 'pointer' }}>✕</button>
          </div>
          
          {/* Varningsinfo */}
          {selectedMarker.warningRadius > 0 && (
            <div style={{ background: 'rgba(239, 68, 68, 0.15)', borderRadius: '10px', padding: '12px', marginBottom: '16px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                <span>⚠️</span>
                <span>VARNING INOM {selectedMarker.warningRadius}m</span>
              </div>
              <div style={{ fontSize: '11px', color: '#fca5a5' }}>
                Varnar: {selectedMarker.warningFor === 'harvester' ? '🌲 Skördare' : selectedMarker.warningFor === 'forwarder' ? '🚜 Skotare' : '🌲 Skördare & 🚜 Skotare'}
              </div>
            </div>
          )}
          
          {selectedMarker.comment ? (
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '14px', fontSize: '14px', lineHeight: 1.6, marginBottom: '16px' }}>{selectedMarker.comment}</div>
          ) : (
            <div style={{ color: '#7c8a70', fontSize: '12px', fontStyle: 'italic', marginBottom: '16px' }}>Ingen kommentar</div>
          )}
          
          {/* Skapad av / senast redigerad */}
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px', marginBottom: '16px', fontSize: '10px', color: '#7c8a70' }}>
            <div style={{ marginBottom: '4px' }}>
              📝 Skapad: {selectedMarker.createdBy || 'Okänd'} • {selectedMarker.createdAt ? new Date(selectedMarker.createdAt).toLocaleString('sv-SE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
            </div>
            {selectedMarker.editHistory && selectedMarker.editHistory.length > 0 && (
              <div style={{ color: '#f59e0b' }}>
                ✏️ Senast: {selectedMarker.editHistory[selectedMarker.editHistory.length - 1].editedBy} • {new Date(selectedMarker.editHistory[selectedMarker.editHistory.length - 1].editedAt).toLocaleString('sv-SE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
          
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <button onClick={() => startDrag(selectedMarker)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid rgba(132, 204, 22, 0.3)', background: 'rgba(132, 204, 22, 0.1)', color: '#a3e635', cursor: 'pointer', fontSize: '12px' }}>👆 Flytta</button>
            {selectedMarker.isArrow ? (
              <button onClick={() => startRotate(selectedMarker)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid rgba(251, 191, 36, 0.3)', background: 'rgba(251, 191, 36, 0.1)', color: '#fbbf24', cursor: 'pointer', fontSize: '12px' }}>🔄 Rotera</button>
            ) : selectedMarker.isLine ? (
              <button onClick={() => startLineEdit(selectedMarker)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.3)', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', cursor: 'pointer', fontSize: '12px' }}>✏️ Redigera punkter</button>
            ) : (
              <button onClick={() => startEdit(selectedMarker)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.3)', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', cursor: 'pointer', fontSize: '12px' }}>✏️ Redigera</button>
            )}
          </div>
          <button onClick={() => deleteMarker(selectedMarker.id)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', cursor: 'pointer', fontSize: '12px' }}>🗑️ Ta bort</button>
        </div>
      )}

      {/* Redigerings-dialog */}
      {editingMarker && !editingMarker.isLine && !editingMarker.isZone && (() => {
        const type = markerTypes.find(t => t.id === editingMarker.type);
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
            <div style={{ background: 'rgba(0,0,0,0.95)', borderRadius: '16px', padding: '24px', border: '1px solid rgba(59, 130, 246, 0.3)', width: '340px', maxHeight: '80vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <span style={{ fontSize: '32px' }}>{type?.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600 }}>Redigera {type?.name}</div>
                  <div style={{ fontSize: '10px', color: '#7c8a70' }}>Ändras av: {currentUser}</div>
                </div>
                <button onClick={cancelEdit} style={{ width: '28px', height: '28px', borderRadius: '8px', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#7c8a70', cursor: 'pointer' }}>✕</button>
              </div>
              
              {/* Kategori */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '10px', color: '#7c8a70', marginBottom: '8px' }}>VISAS FÖR</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  {categories.map(cat => {
                    const isSelected = (editingMarker.categories || []).includes(cat.id);
                    return (
                      <button
                        key={cat.id}
                        onClick={() => {
                          const cats = editingMarker.categories || ['harvester'];
                          if (isSelected && cats.length > 1) {
                            setEditingMarker(prev => ({ ...prev, categories: cats.filter(c => c !== cat.id) }));
                          } else if (!isSelected) {
                            setEditingMarker(prev => ({ ...prev, categories: [...cats, cat.id] }));
                          }
                        }}
                        style={{ padding: '10px', borderRadius: '8px', border: isSelected ? `2px solid ${cat.color}` : '2px solid rgba(255,255,255,0.1)', background: isSelected ? `${cat.color}22` : 'transparent', color: isSelected ? cat.color : '#7c8a70', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}
                      >
                        <span style={{ fontSize: '18px' }}>{cat.icon}</span>
                        <span style={{ fontSize: '9px' }}>{cat.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              
              {/* Varning */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '10px', color: '#7c8a70', marginBottom: '8px' }}>VARNINGSRADIE</div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {[0, 10, 20, 30, 50].map(r => (
                    <button
                      key={r}
                      onClick={() => setEditingMarker(prev => ({ ...prev, warningRadius: r }))}
                      style={{ padding: '8px 12px', borderRadius: '6px', border: editingMarker.warningRadius === r ? '2px solid #ef4444' : '1px solid rgba(255,255,255,0.1)', background: editingMarker.warningRadius === r ? 'rgba(239, 68, 68, 0.2)' : 'transparent', color: editingMarker.warningRadius === r ? '#ef4444' : '#7c8a70', cursor: 'pointer', fontSize: '11px' }}
                    >
                      {r === 0 ? 'Ingen' : `${r}m`}
                    </button>
                  ))}
                </div>
              </div>
              
              {editingMarker.warningRadius > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '10px', color: '#7c8a70', marginBottom: '8px' }}>VARNAR</div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[{ id: 'harvester', label: '🌲 Skördare' }, { id: 'forwarder', label: '🚜 Skotare' }, { id: 'both', label: '⚠️ Båda' }].map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => setEditingMarker(prev => ({ ...prev, warningFor: opt.id }))}
                        style={{ flex: 1, padding: '8px', borderRadius: '6px', border: editingMarker.warningFor === opt.id ? '2px solid #ef4444' : '1px solid rgba(255,255,255,0.1)', background: editingMarker.warningFor === opt.id ? 'rgba(239, 68, 68, 0.2)' : 'transparent', color: editingMarker.warningFor === opt.id ? '#ef4444' : '#7c8a70', cursor: 'pointer', fontSize: '10px' }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Kommentar */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '10px', color: '#7c8a70', marginBottom: '8px' }}>KOMMENTAR</div>
                <textarea
                  value={editingMarker.comment || ''}
                  onChange={(e) => setEditingMarker(prev => ({ ...prev, comment: e.target.value }))}
                  placeholder="Lägg till anteckning..."
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#e8ebe4', fontSize: '13px', minHeight: '80px', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>
              
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={cancelEdit} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#7c8a70', cursor: 'pointer', fontSize: '12px' }}>Avbryt</button>
                <button onClick={saveEdit} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #1e40af, #1e3a8a)', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>💾 Spara ändringar</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Kompass */}
      <div style={{ position: 'absolute', top: '80px', right: '20px', zIndex: 100 }}>
        <div style={{ 
          width: '60px', 
          height: '60px', 
          background: 'rgba(0,0,0,0.85)', 
          backdropFilter: 'blur(20px)', 
          borderRadius: '50%', 
          border: '2px solid rgba(132, 204, 22, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)'
        }}>
          <svg width="50" height="50" style={{ transform: `rotate(${-rotation}deg)`, transition: 'transform 0.2s ease-out' }}>
            {/* Bakgrundscirkel */}
            <circle cx="25" cy="25" r="23" fill="none" stroke="rgba(132, 204, 22, 0.15)" strokeWidth="1" />
            
            {/* Gradmarkeringar */}
            {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => (
              <line 
                key={deg}
                x1={25 + Math.sin(deg * Math.PI / 180) * 18}
                y1={25 - Math.cos(deg * Math.PI / 180) * 18}
                x2={25 + Math.sin(deg * Math.PI / 180) * 21}
                y2={25 - Math.cos(deg * Math.PI / 180) * 21}
                stroke={deg === 0 ? '#ef4444' : 'rgba(132, 204, 22, 0.3)'}
                strokeWidth={deg === 0 ? 2 : 1}
              />
            ))}
            
            {/* Nordpil (röd) */}
            <polygon 
              points="25,6 21,25 25,20 29,25" 
              fill="#ef4444"
            />
            
            {/* Sydpil (vit/grå) */}
            <polygon 
              points="25,44 21,25 25,30 29,25" 
              fill="rgba(255,255,255,0.4)"
            />
            
            {/* N bokstav */}
            <text x="25" y="5" textAnchor="middle" fontSize="6" fill="#ef4444" fontWeight="bold">N</text>
            
            {/* Centerpunkt */}
            <circle cx="25" cy="25" r="3" fill="rgba(132, 204, 22, 0.8)" />
          </svg>
        </div>
        
        {/* Grader under kompassen */}
        <div style={{ 
          textAlign: 'center', 
          marginTop: '6px', 
          fontSize: '10px', 
          color: rotation !== 0 ? '#fbbf24' : '#7c8a70',
          fontWeight: rotation !== 0 ? 600 : 400
        }}>
          {rotation !== 0 ? `${Math.round(rotation)}°` : 'N'}
        </div>
      </div>

      {/* Zoom-knappar */}
      <div style={{ position: 'absolute', right: '20px', bottom: '100px', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center', zIndex: 100 }}>
        <button onClick={zoomIn} style={{ width: '44px', height: '44px', borderRadius: '10px', border: '1px solid rgba(132, 204, 22, 0.3)', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(20px)', color: '#a3e635', fontSize: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
        <div style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(20px)', borderRadius: '8px', padding: '6px 4px', textAlign: 'center', fontSize: '11px', color: '#a3e635', border: '1px solid rgba(132, 204, 22, 0.2)', fontWeight: 600, width: '44px' }}>
          {Math.round(zoom * 100)}%
        </div>
        <button onClick={zoomOut} style={{ width: '44px', height: '44px', borderRadius: '10px', border: '1px solid rgba(132, 204, 22, 0.3)', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(20px)', color: '#a3e635', fontSize: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
        <button onClick={resetView} style={{ width: '44px', height: '44px', borderRadius: '10px', border: '1px solid rgba(132, 204, 22, 0.15)', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(20px)', color: '#7c8a70', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '4px' }} title="Återställ vy">⟲</button>
      </div>

      {/* Mätningsresultat */}
      {measureMode && measurePoints.length > 0 && (
        <div style={{ position: 'absolute', bottom: '100px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(20px)', borderRadius: '12px', padding: '16px 24px', border: '1px solid rgba(34, 197, 94, 0.3)', zIndex: 1000 }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#22c55e', textAlign: 'center' }}>
            {formatDistance(calculateDistance(measurePoints))}
          </div>
          <div style={{ fontSize: '11px', color: '#7c8a70', textAlign: 'center', marginTop: '4px' }}>
            {measurePoints.length} punkter
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button onClick={() => setMeasurePoints(prev => prev.slice(0, -1))} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#7c8a70', cursor: 'pointer', fontSize: '11px' }}>↶ Ångra</button>
            <button onClick={() => setMeasurePoints([])} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#7c8a70', cursor: 'pointer', fontSize: '11px' }}>Rensa</button>
            <button onClick={() => { setMeasureMode(null); setMeasurePoints([]); }} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', cursor: 'pointer', fontSize: '11px' }}>Stäng</button>
          </div>
        </div>
      )}

      {/* Användarnamn-dialog */}
      {showUserDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ background: 'rgba(0,0,0,0.95)', borderRadius: '16px', padding: '24px', border: '1px solid rgba(59, 130, 246, 0.3)', width: '300px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: '#e8ebe4' }}>👤 Vem är du?</div>
            <div style={{ fontSize: '11px', color: '#7c8a70', marginBottom: '16px' }}>Ditt namn visas på markeringar du skapar</div>
            <input
              type="text"
              defaultValue={currentUser}
              placeholder="Ange ditt namn..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveUserName(e.target.value);
                if (e.key === 'Escape') setShowUserDialog(false);
              }}
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.3)', background: 'rgba(59, 130, 246, 0.1)', color: '#e8ebe4', fontSize: '14px', marginBottom: '16px', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowUserDialog(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#7c8a70', cursor: 'pointer', fontSize: '12px' }}>Avbryt</button>
              <button onClick={(e) => saveUserName(e.target.closest('div').parentElement.querySelector('input').value)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>Spara</button>
            </div>
          </div>
        </div>
      )}

      {/* Drag-indikator */}
      {draggingMarker && (
        <div style={{ position: 'absolute', bottom: '24px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(132, 204, 22, 0.2)', backdropFilter: 'blur(20px)', borderRadius: '12px', padding: '14px 24px', border: '1px solid rgba(132, 204, 22, 0.5)', color: '#a3e635', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '12px', zIndex: 1100 }}>
          <span style={{ fontSize: '20px' }}>👆</span>
          <span>Dra till ny position – släpp för att placera</span>
          <button onClick={() => setDraggingMarker(null)} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#7c8a70', cursor: 'pointer', fontSize: '11px' }}>Avbryt</button>
        </div>
      )}

      {/* Rotations-indikator */}
      {rotatingArrow && (() => {
        const type = arrowTypes.find(t => t.id === rotatingArrow.arrowType);
        const angle = rotatingArrow.angle || 0;
        const normalizedAngle = ((angle % 360) + 360) % 360;
        const direction = normalizedAngle >= 337.5 || normalizedAngle < 22.5 ? '→ Höger' :
                          normalizedAngle >= 22.5 && normalizedAngle < 67.5 ? '↘ Höger-ner' :
                          normalizedAngle >= 67.5 && normalizedAngle < 112.5 ? '↓ Ner' :
                          normalizedAngle >= 112.5 && normalizedAngle < 157.5 ? '↙ Vänster-ner' :
                          normalizedAngle >= 157.5 && normalizedAngle < 202.5 ? '← Vänster' :
                          normalizedAngle >= 202.5 && normalizedAngle < 247.5 ? '↖ Vänster-upp' :
                          normalizedAngle >= 247.5 && normalizedAngle < 292.5 ? '↑ Upp' : '↗ Höger-upp';
        return (
          <div style={{ position: 'absolute', bottom: '24px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(251, 191, 36, 0.2)', backdropFilter: 'blur(20px)', borderRadius: '12px', padding: '14px 24px', border: '1px solid rgba(251, 191, 36, 0.5)', color: '#fbbf24', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '16px', zIndex: 1100 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>{type?.icon}</span>
              <span style={{ fontWeight: 600 }}>{type?.name}</span>
            </div>
            <div style={{ width: '1px', height: '24px', background: 'rgba(251, 191, 36, 0.3)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '24px', fontWeight: 700 }}>{Math.round(normalizedAngle)}°</span>
              <span style={{ fontSize: '12px', color: '#fcd34d' }}>{direction}</span>
            </div>
            <div style={{ width: '1px', height: '24px', background: 'rgba(251, 191, 36, 0.3)' }} />
            <span style={{ fontSize: '12px', color: '#fcd34d' }}>Dra fingret runt pilen</span>
            <button onClick={() => { endRotate(); }} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fbbf24', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>✓ Klar</button>
          </div>
        );
      })()}

      {/* Linjeredigering - punkter overlay */}
      {editingLine && (
        <>
          {/* Punkter som cirklar */}
          <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1050 }}>
            <g style={{ transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${zoom})`, transformOrigin: 'center center' }}>
              {/* Linjen som redigeras */}
              <path
                d={`M ${editingLine.path.map(p => `${p.x},${p.y}`).join(' L ')}`}
                fill="none"
                stroke="#3b82f6"
                strokeWidth={4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              
              {/* Punkterna */}
              {editingLine.path.map((point, index) => (
                <g key={index}>
                  {/* Linje till nästa punkt (klickbar för att lägga till punkt) */}
                  {index < editingLine.path.length - 1 && (
                    <line
                      x1={point.x}
                      y1={point.y}
                      x2={editingLine.path[index + 1].x}
                      y2={editingLine.path[index + 1].y}
                      stroke="transparent"
                      strokeWidth={20}
                      style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                      onClick={() => addLinePoint(index)}
                    />
                  )}
                  
                  {/* Punkten */}
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={draggingPointIndex === index ? 14 : 10}
                    fill={draggingPointIndex === index ? '#3b82f6' : '#1e40af'}
                    stroke="#3b82f6"
                    strokeWidth={3}
                    style={{ pointerEvents: 'auto', cursor: 'grab' }}
                    onMouseDown={(e) => { e.stopPropagation(); setDraggingPointIndex(index); }}
                    onTouchStart={(e) => { e.stopPropagation(); setDraggingPointIndex(index); }}
                  />
                  
                  {/* Punkt-nummer */}
                  <text
                    x={point.x}
                    y={point.y + 4}
                    textAnchor="middle"
                    fontSize="10"
                    fill="white"
                    fontWeight="bold"
                    style={{ pointerEvents: 'none' }}
                  >
                    {index + 1}
                  </text>
                </g>
              ))}
            </g>
          </svg>
          
          {/* Kontrollpanel */}
          <div style={{ position: 'absolute', bottom: '24px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(59, 130, 246, 0.2)', backdropFilter: 'blur(20px)', borderRadius: '12px', padding: '14px 24px', border: '1px solid rgba(59, 130, 246, 0.5)', color: '#3b82f6', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '16px', zIndex: 1100 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {renderColorPreview(lineTypes.find(t => t.id === editingLine.lineType), 24, 6)}
              <span style={{ fontWeight: 600 }}>{lineTypes.find(t => t.id === editingLine.lineType)?.name}</span>
            </div>
            <div style={{ width: '1px', height: '24px', background: 'rgba(59, 130, 246, 0.3)' }} />
            <span style={{ fontSize: '12px', color: '#93c5fd' }}>{editingLine.path.length} punkter</span>
            <div style={{ width: '1px', height: '24px', background: 'rgba(59, 130, 246, 0.3)' }} />
            <span style={{ fontSize: '11px', color: '#93c5fd' }}>Dra punkter • Klicka på linje = ny punkt</span>
            <button onClick={saveLineEdit} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: 'linear-gradient(135deg, #1e40af, #1e3a8a)', color: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>✓ Spara</button>
            <button onClick={cancelLineEdit} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#93c5fd', cursor: 'pointer', fontSize: '11px' }}>Avbryt</button>
          </div>
        </>
      )}

      {/* Stickvägsguide-panel - Apple style */}
      {stripRoadGuide && !isTracking && (
        <div style={{ position: 'absolute', top: '90px', left: '80px', background: 'rgba(44,44,46,0.95)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', borderRadius: '20px', padding: '20px', width: '260px', zIndex: 100 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ fontSize: '17px', fontWeight: 600 }}>🛤️ Gallringsguide</div>
            <button onClick={() => { setStripRoadGuide(false); if (!isTracking) releaseWakeLock(); }} style={{ width: '30px', height: '30px', background: 'rgba(255,255,255,0.1)', borderRadius: '15px', border: 'none', color: appleColors.gray, cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          </div>
          
          {/* Status-indikatorer */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
            <div style={{ 
              flex: 1, 
              padding: '12px', 
              borderRadius: '12px', 
              background: wakeLockActive ? 'rgba(52,199,89,0.15)' : 'rgba(255,69,58,0.15)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '24px', marginBottom: '4px' }}>{wakeLockActive ? '☀️' : '💤'}</div>
              <div style={{ fontSize: '11px', fontWeight: 500, color: wakeLockActive ? appleColors.green : appleColors.red }}>
                {wakeLockActive ? 'Skärm vaken' : 'Ej stöd'}
              </div>
            </div>
            <div style={{ 
              flex: 1, 
              padding: '12px', 
              borderRadius: '12px', 
              background: soundEnabled ? 'rgba(52,199,89,0.15)' : 'rgba(255,69,58,0.15)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '24px', marginBottom: '4px' }}>{soundEnabled ? '🔊' : '🔇'}</div>
              <div style={{ fontSize: '11px', fontWeight: 500, color: soundEnabled ? appleColors.green : appleColors.red }}>
                {soundEnabled ? 'Ljud på' : 'Ljud av'}
              </div>
            </div>
          </div>
          
          <div style={{ fontSize: '13px', color: appleColors.gray, marginBottom: '16px', lineHeight: 1.4 }}>
            Varnar när du går för nära eller långt från stickväg.
          </div>
          
          {/* Vad ska vi mäta mot? */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: appleColors.gray, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Mät mot</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={() => setGuideSource(prev => ({ ...prev, stripRoads: !prev.stripRoads }))}
                style={{ 
                  flex: 1, 
                  padding: '12px', 
                  borderRadius: '12px', 
                  border: 'none',
                  background: guideSource.stripRoads ? 'rgba(52,199,89,0.2)' : 'rgba(255,255,255,0.08)', 
                  color: guideSource.stripRoads ? appleColors.green : appleColors.gray, 
                  cursor: 'pointer', 
                  fontSize: '13px',
                  fontWeight: 500 
                }}
              >
                🛤️ Stickvägar
              </button>
              <button 
                onClick={() => setGuideSource(prev => ({ ...prev, boundary: !prev.boundary }))}
                style={{ 
                  flex: 1, 
                  padding: '12px', 
                  borderRadius: '12px', 
                  border: 'none',
                  background: guideSource.boundary ? 'rgba(255,159,10,0.2)' : 'rgba(255,255,255,0.08)', 
                  color: guideSource.boundary ? appleColors.orange : appleColors.gray, 
                  cursor: 'pointer', 
                  fontSize: '13px',
                  fontWeight: 500
                }}
              >
                🚧 Gräns
              </button>
            </div>
          </div>
          
          {/* Stickvägsinställningar - Apple style */}
          {guideSource.stripRoads && (
            <div style={{ marginBottom: '16px', padding: '14px', background: 'rgba(52,199,89,0.1)', borderRadius: '14px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: appleColors.green, marginBottom: '12px' }}>🛤️ Avstånd till stickväg</div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '11px', color: appleColors.gray, marginBottom: '6px', fontWeight: 500 }}>Min (m)</div>
                  <input 
                    type="number" 
                    value={guideDistance.min} 
                    onChange={(e) => setGuideDistance(prev => ({ ...prev, min: parseInt(e.target.value) || 20 }))}
                    style={{ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', background: 'rgba(0,0,0,0.3)', color: appleColors.green, fontSize: '20px', fontWeight: 600, textAlign: 'center' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '11px', color: appleColors.gray, marginBottom: '6px', fontWeight: 500 }}>Max (m)</div>
                  <input 
                    type="number" 
                    value={guideDistance.max} 
                    onChange={(e) => setGuideDistance(prev => ({ ...prev, max: parseInt(e.target.value) || 35 }))}
                    style={{ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', background: 'rgba(0,0,0,0.3)', color: appleColors.orange, fontSize: '20px', fontWeight: 600, textAlign: 'center' }}
                  />
                </div>
              </div>
            </div>
          )}
          
          {/* Gränsinställningar - Apple style */}
          {guideSource.boundary && (
            <div style={{ marginBottom: '16px', padding: '14px', background: 'rgba(255,159,10,0.1)', borderRadius: '14px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: appleColors.orange, marginBottom: '12px' }}>🚧 Avstånd från gräns</div>
              <input 
                type="number" 
                value={boundaryDistance} 
                onChange={(e) => setBoundaryDistance(parseInt(e.target.value) || 15)}
                style={{ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', background: 'rgba(0,0,0,0.3)', color: appleColors.orange, fontSize: '24px', fontWeight: 600, textAlign: 'center' }}
              />
              <div style={{ fontSize: '12px', color: appleColors.gray, marginTop: '8px', textAlign: 'center' }}>meter</div>
            </div>
          )}
          
          {/* Legend - Apple style */}
          <div style={{ fontSize: '12px', color: appleColors.gray, paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            {guideSource.stripRoads && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <span style={{ width: '24px', height: '3px', background: appleColors.green, borderRadius: '2px' }} />
                  <span>{guideDistance.min}m — minsta avstånd</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: guideSource.boundary ? '8px' : 0 }}>
                  <span style={{ width: '24px', height: '3px', background: appleColors.orange, borderRadius: '2px' }} />
                  <span>{guideDistance.max}m — största avstånd</span>
                </div>
              </>
            )}
            {guideSource.boundary && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ width: '24px', height: '3px', background: appleColors.orange, borderRadius: '2px' }} />
                <span>{boundaryDistance}m från gräns</span>
              </div>
            )}
          </div>
          
          {/* Testa ljud - Apple style */}
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: appleColors.gray, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Testa ljud</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={() => playWarningSound('success')}
                style={{ flex: 1, padding: '14px 8px', borderRadius: '12px', border: 'none', background: 'rgba(52,199,89,0.15)', color: appleColors.green, cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
              >
                ✓ Rätt
              </button>
              <button 
                onClick={() => playWarningSound('warning')}
                style={{ flex: 1, padding: '14px 8px', borderRadius: '12px', border: 'none', background: 'rgba(255,159,10,0.15)', color: appleColors.orange, cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
              >
                ⚠️ Långt
              </button>
              <button 
                onClick={() => playWarningSound('critical')}
                style={{ flex: 1, padding: '14px 8px', borderRadius: '12px', border: 'none', background: 'rgba(255,69,58,0.15)', color: appleColors.red, cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
              >
                🚨 Nära
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.2); } }
        button { transition: all 0.15s ease; }
        button:active { transform: scale(0.96); opacity: 0.8; }
      `}</style>
    </div>
  );
}
