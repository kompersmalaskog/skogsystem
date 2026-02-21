'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@supabase/supabase-js'
import ObjektValjare from './ObjektValjare'
import BrandriskPanel from './brandrisk-panel'
import VolymPanel from './volym-panel'
import { beraknaVolym, type VolymResultat } from '../../lib/skoglig-berakning'
import { beraknaKorbarhet, type KorbarhetsResultat } from '../../lib/korbarhet'

const DynamicMapLibre = dynamic(() => import('@/components/MapLibreMap'), { ssr: false })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// === TYPES ===
interface Point {
  x: number;
  y: number;
}

interface RoadCheckResult {
  status: 'loading' | 'ok' | 'warning' | 'error';
  nearestRoad?: {
    name: string;
    type: string;
    maxspeed?: number;
    ref?: string;
  };
  roadCategory?: 'allman' | 'kan_vara_allman' | 'enskild';
  requiresSpecialPermit?: boolean;
  generelltTillstandApplied?: boolean;
  tillstand: 'ej_sokt' | 'sokt' | 'beviljat';
  checklist?: boolean[];
  nearbyIntersection?: { distance: number };
  message?: string;
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
  roadCheck?: RoadCheckResult;
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

interface TmaRoadHit {
  name: string;
  type: string;       // OSM highway tag
  maxspeed?: number;
  ref?: string;        // Vägnummer (E22, Rv 25, etc.)
  distance: number;    // Meter från traktgräns till väg
  category: 'allman' | 'kan_vara_allman' | 'enskild';
  skyddsklassad: boolean; // Kräver TMA klass 2+ (hög ÅDT-proxy)
  nearbyGeom?: { lat: number; lon: number }[]; // Vägsegment inom 50m
  closestPoint?: { lat: number; lon: number };  // Närmaste punkt på vägen
}

interface TmaCheckResult {
  status: 'loading' | 'done' | 'error';
  roads: TmaRoadHit[];
  message?: string;
}

interface SmhiWeather {
  status: 'loading' | 'done' | 'error';
  temp?: number;        // °C
  windSpeed?: number;   // m/s
  windDir?: number;     // grader (0=N, 90=E, 180=S, 270=W)
  windDirLabel?: string; // "N", "NE", "SV" etc.
  windArrow?: string;   // Unicode-pil
  precip?: number;      // nederbördskategori (0=ingen, 1=snö, 2=snö+regn, 3=regn, 4=duggregn, 5=hagel, 6=regn+åska)
  precipLabel?: string;
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

// Linjetyper som ritas som stängda polygoner (gränslinjer)
const POLYGON_LINE_TYPES = new Set(['boundary', 'nature']);

export default function PlannerPage() {
  // === OBJEKTVAL ===
  const [valtObjekt, setValtObjekt] = useState<any>(null);

  // === STATE ===
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [markersLoaded, setMarkersLoaded] = useState(false);
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [markerMenuOpen, setMarkerMenuOpen] = useState<string | null>(null);

  // === SUPABASE SYNC ===
  const getMarkerTyp = (m: Marker): string => {
    if (m.isLine) return 'linje';
    if (m.isZone) return 'zon';
    if (m.isArrow) return 'pil';
    return 'symbol';
  };

  // Ladda markeringar från Supabase när objekt väljs
  useEffect(() => {
    if (!valtObjekt?.id) {
      setMarkersLoaded(false);
      return;
    }
    const loadMarkers = async () => {
      const { data, error } = await supabase
        .from('planering_markeringar')
        .select('marker_id, data')
        .eq('objekt_id', valtObjekt.id);
      if (error) {
        console.error('Kunde inte ladda markeringar:', error);
      } else if (data && data.length > 0) {
        setMarkers(data.map(row => row.data as Marker));
      }
      setMarkersLoaded(true);
    };
    loadMarkers();
  }, [valtObjekt?.id]);

  // Spara en markering till Supabase
  const saveMarkerToDb = useCallback(async (marker: Marker) => {
    if (!valtObjekt?.id) return;
    const { error } = await supabase
      .from('planering_markeringar')
      .upsert({
        objekt_id: valtObjekt.id,
        marker_id: String(marker.id),
        typ: getMarkerTyp(marker),
        data: marker,
      }, { onConflict: 'objekt_id,marker_id' });
    if (error) console.error('Spara markering fel:', error);
  }, [valtObjekt?.id]);

  // Ta bort en markering från Supabase
  const deleteMarkerFromDb = useCallback(async (markerId: string | number) => {
    if (!valtObjekt?.id) return;
    const { error } = await supabase
      .from('planering_markeringar')
      .delete()
      .eq('objekt_id', valtObjekt.id)
      .eq('marker_id', String(markerId));
    if (error) console.error('Ta bort markering fel:', error);
  }, [valtObjekt?.id]);

  // Synka markers till Supabase vid ändringar (debounced)
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!valtObjekt?.id || !markersLoaded) return;
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(async () => {
      // Upsert alla nuvarande markers
      const rows = markers.map(m => ({
        objekt_id: valtObjekt.id,
        marker_id: String(m.id),
        typ: getMarkerTyp(m),
        data: m,
      }));
      if (rows.length > 0) {
        const { error } = await supabase
          .from('planering_markeringar')
          .upsert(rows, { onConflict: 'objekt_id,marker_id' });
        if (error) console.error('Sync markers fel:', error);
      }
    }, 1000);
    return () => { if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current); };
  }, [markers, valtObjekt?.id, markersLoaded]);

  // === AVLÄGG: Ladda sparad data från Supabase ===
  const avlaggLoadedRef = useRef(false);
  useEffect(() => {
    avlaggLoadedRef.current = false;
    if (!valtObjekt?.id || !markersLoaded) return;
    const landingMarkers = markers.filter(m => m.isMarker && m.type === 'landing');
    if (landingMarkers.length === 0) { avlaggLoadedRef.current = true; return; }
    const loadAvlagg = async () => {
      const { data, error } = await supabase
        .from('avlagg_assessments')
        .select('*')
        .eq('objekt_id', valtObjekt.id);
      if (error) {
        console.error('[Avlägg] Kunde inte ladda från Supabase:', error);
        avlaggLoadedRef.current = true;
        return;
      }
      if (data && data.length > 0) {
        const byMarkerId: Record<string, any> = {};
        for (const row of data) byMarkerId[row.marker_id] = row;
        setMarkers(prev => prev.map(m => {
          if (m.type !== 'landing') return m;
          const saved = byMarkerId[String(m.id)];
          if (!saved) return m;
          // Merga sparad data in i roadCheck (om den finns)
          const rc = m.roadCheck || { status: 'ok' as const, tillstand: 'ej_sokt' as const };
          return {
            ...m,
            comment: saved.comment ?? m.comment,
            photoData: saved.photo_data ?? m.photoData,
            roadCheck: {
              ...rc,
              tillstand: saved.tillstand || rc.tillstand,
              checklist: saved.checklist || rc.checklist,
            },
          };
        }));
        console.log('[Avlägg] Laddade', data.length, 'avlägg från Supabase');
      }
      avlaggLoadedRef.current = true;
    };
    loadAvlagg();
  }, [valtObjekt?.id, markersLoaded]);

  // === AVLÄGG: Spara till Supabase (debounced) ===
  const avlaggSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!valtObjekt?.id || !markersLoaded || !avlaggLoadedRef.current) return;
    const landingMarkers = markers.filter(m => m.isMarker && m.type === 'landing');
    if (landingMarkers.length === 0) return;
    if (avlaggSaveTimeoutRef.current) clearTimeout(avlaggSaveTimeoutRef.current);
    avlaggSaveTimeoutRef.current = setTimeout(async () => {
      const mPerDegLat = 111320;
      const mPerDegLon = 111320 * Math.cos(mapCenter.lat * Math.PI / 180);
      const curScale = 156543.03392 * Math.cos(mapCenter.lat * Math.PI / 180) / Math.pow(2, mapZoom);

      const rows = landingMarkers.map(m => {
        const dxMeters = m.x * curScale;
        const dyMeters = -m.y * curScale;
        const lon = mapCenter.lng + dxMeters / mPerDegLon;
        const lat = mapCenter.lat + dyMeters / mPerDegLat;
        const rc = m.roadCheck;
        const nr = rc?.nearestRoad;
        return {
          objekt_id: valtObjekt.id,
          marker_id: String(m.id),
          lat,
          lon,
          comment: m.comment || null,
          photo_data: m.photoData || null,
          road_name: nr ? (nr.ref ? `${nr.ref} — ${nr.name}` : nr.name) : null,
          road_ref: nr?.ref || null,
          road_type: nr?.type || null,
          road_speed: nr?.maxspeed || null,
          road_category: rc?.roadCategory || null,
          distance_to_road: null, // Inte tillgängligt i RoadCheckResult
          nearby_intersection_distance: rc?.nearbyIntersection?.distance || null,
          tillstand: rc?.tillstand || 'ej_sokt',
          requires_special_permit: rc?.requiresSpecialPermit || false,
          generellt_tillstand_applied: rc?.generelltTillstandApplied || false,
          checklist: rc?.checklist || [false, false, false, false, false, false, false, false, false, false, false],
          updated_at: new Date().toISOString(),
        };
      });

      const { error } = await supabase
        .from('avlagg_assessments')
        .upsert(rows, { onConflict: 'objekt_id,marker_id' });
      if (error) {
        console.error('[Avlägg] Spara till Supabase fel:', error);
      } else {
        console.log('[Avlägg] Sparade', rows.length, 'avlägg till Supabase');
      }
    }, 1500);
    return () => { if (avlaggSaveTimeoutRef.current) clearTimeout(avlaggSaveTimeoutRef.current); };
  }, [markers, valtObjekt?.id, markersLoaded]);

  // === KARTA ===
  const [screenSize, setScreenSize] = useState({ width: 800, height: 600 });
  const [mapCenter, setMapCenter] = useState({ lat: 57.1052, lng: 14.8261 }); // Stenshult ungefär
  const [mapZoom, setMapZoom] = useState(16);
  const [showMap, setShowMap] = useState(true);
  const [mapType, setMapType] = useState<'osm' | 'satellite' | 'terrain'>('satellite');
  
  // Overlay-lager
  const [overlays, setOverlays] = useState({
    vidaKartbild: true,    // VIDA traktdirektiv-kartbild
    propertyLines: false,  // Fastighetsgränser
    moisture: false,       // Markfuktighet (kräver konto)
    contours: false,       // Höjdkurvor
    wetlands: false,       // Sumpskog (öppet)
    // Skogsstyrelsen
    nyckelbiotoper: false,
    naturvarde: false,
    sumpskog: false,
    skoghistoria: false,
    biotopskydd: false,
    naturvardsavtal: false,
    avverkningsanmalan: false,
    utfordavverkning: false,
    // Riksantikvarieämbetet
    fornlamningar: false,
    // Naturvårdsverket
    naturreservat: false,
    natura2000: false,
    vattenskydd: false,
    // MSB
    brandrisk: false,
    oversvamning: false,
    // SGU
    jordarter: false,
    // Trafikverket
    barighet: false,
    // Svenska Kraftnät
    kraftledningar: false,
    // Körbarhet (kombinerat lager)
    korbarhet: false,
    // Skogsstyrelsen Raster (via proxy)
    sks_markfuktighet: false,
    sks_virkesvolym: false,
    sks_tradhojd: false,
    sks_lutning: false,
    sks_gallringsindex: false,
  });

  const wmsLayerGroups = [
    {
      group: 'Skogsstyrelsen',
      layers: [
        { id: 'nyckelbiotoper', url: 'https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaNyckelbiotop/MapServer/WmsServer', layers: 'Nyckelbiotop_Skogsstyrelsen', name: 'Nyckelbiotoper', color: '#a855f7' },
        { id: 'naturvarde', url: 'https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaObjektnaturvarde/MapServer/WmsServer', layers: 'Objektnaturvarde_Skogsstyrelsen', name: 'Naturvärde', color: '#22c55e' },
        { id: 'sumpskog', url: 'https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaSumpskog/MapServer/WmsServer', layers: 'Sumpskog_Skogsstyrelsen', name: 'Sumpskogar', color: '#3b82f6' },
        { id: 'biotopskydd', url: 'https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaBiotopskydd/MapServer/WmsServer', layers: 'Biotopskydd_Skogsstyrelsen', name: 'Biotopskydd', color: '#166534' },
        { id: 'naturvardsavtal', url: 'https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaNaturvardsavtal/MapServer/WmsServer', layers: 'Naturvardsavtal_Skogsstyrelsen', name: 'Naturvårdsavtal', color: '#14b8a6' },
        { id: 'skoghistoria', url: 'https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaSkoghistoria/MapServer/WmsServer', layers: 'SkoghistoriaYta_Skogsstyrelsen,SkoghistoriaLinje_Skogsstyrelsen,SkoghistoriaPunkt_Skogsstyrelsen', name: 'Skog & historia', color: '#f59e0b' },
        { id: 'avverkningsanmalan', url: 'https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaAvverkningsanmalan/MapServer/WmsServer', layers: 'Avverkningsanmalan_Skogsstyrelsen', name: 'Avverkningsanmälningar', color: '#eab308' },
        { id: 'utfordavverkning', url: 'https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaUtfordavverkning/MapServer/WmsServer', layers: 'UtfordAvverkning_Skogsstyrelsen', name: 'Utförda avverkningar', color: '#92400e' },
      ],
    },
    {
      group: 'Riksantikvarieämbetet',
      layers: [
        { id: 'fornlamningar', url: 'https://pub.raa.se/visning/lamningar/wms', layers: 'fornlamningar', name: 'Fornlämningar', color: '#ef4444', srs: 'EPSG:3857' },
      ],
    },
    {
      group: 'Naturvårdsverket',
      layers: [
        { id: 'naturreservat', url: 'https://geodata.naturvardsverket.se/naturvardsregistret/wms', layers: 'Naturreservat', name: 'Naturreservat', color: '#15803d' },
        { id: 'natura2000', url: 'https://geodata.naturvardsverket.se/n2000/wms', layers: 'Habitatdirektivet,Fageldirektivet', name: 'Natura 2000', color: '#4ade80' },
        { id: 'vattenskydd', url: 'https://geodata.naturvardsverket.se/naturvardsregistret/wms', layers: 'Vattenskyddsomrade', name: 'Vattenskyddsområden', color: '#7dd3fc' },
      ],
    },
    {
      group: 'MSB',
      layers: [
        { id: 'oversvamning', url: 'https://inspire.msb.se/oversvamning/wms', layers: 'NZ_Oversvamning_100,NZ_Oversvamning_200,NZ_Oversvamning_BHF', name: 'Översvämningskarteringar', color: '#1e3a8a' },
      ],
    },
    {
      group: 'SGU',
      layers: [
        { id: 'jordarter', url: 'https://maps3.sgu.se/geoserver/jord/ows', layers: 'jord:SE.GOV.SGU.JORD.GRUNDLAGER.25K', name: 'Jordarter', color: '#92400e' },
      ],
    },
    {
      group: 'Trafikverket',
      layers: [
        { id: 'barighet', url: 'https://geo-netinfo.trafikverket.se/mapservice/wms.axd/NetInfo_1_8', layers: 'Barighet', name: 'Bärighet (BK-klass)', color: '#f97316' },
      ],
    },
    {
      group: 'Svenska Kraftnät',
      layers: [
        { id: 'kraftledningar', url: 'https://inspire-skn.metria.se/geoserver/skn/ows', layers: 'US.ElectricityNetwork.Lines', name: 'Kraftledningar (stamnätet)', color: '#ef4444' },
      ],
    },
    {
      group: 'Analys',
      layers: [
        { id: 'korbarhet', url: '/api/korbarhet-tiles', layers: '', name: 'Körbarhet', color: '#22c55e', customApi: true, desc: 'Baserat på markfuktighet och lutning. Rita trakt för full analys inkl jordart.' },
      ],
    },
    {
      group: 'Skogsstyrelsen Raster',
      layers: [
        { id: 'sks_markfuktighet', url: '/api/wms-proxy', layers: 'Markfuktighet_SLU_2_0', name: 'Markfuktighet (SLU)', color: '#4FC3F7', proxyTarget: 'https://geodata.skogsstyrelsen.se/arcgis/services/Publikt/Markfuktighet_SLU_2_0/ImageServer/WMSServer' },
        { id: 'sks_virkesvolym', url: '/api/wms-proxy', layers: 'SkogligaGrunddata_3_1', name: 'Virkesvolym', color: '#66BB6A', proxyTarget: 'https://geodata.skogsstyrelsen.se/arcgis/services/Publikt/SkogligaGrunddata_3_1/ImageServer/WMSServer' },
        { id: 'sks_tradhojd', url: '/api/wms-proxy', layers: 'Tradhojd_3_1', name: 'Trädhöjd', color: '#AED581', proxyTarget: 'https://geodata.skogsstyrelsen.se/arcgis/services/Publikt/Tradhojd_3_1/ImageServer/WMSServer' },
        { id: 'sks_lutning', url: '/api/wms-proxy', layers: 'Lutning_1_0', name: 'Lutning', color: '#FF8A65', proxyTarget: 'https://geodata.skogsstyrelsen.se/arcgis/services/Publikt/Lutning_1_0/ImageServer/WMSServer' },
        { id: 'sks_gallringsindex', url: '/api/wms-proxy', layers: '', name: 'Gallringsindex', color: '#E91E63', exportImage: 'https://geodata.skogsstyrelsen.se/arcgis/rest/services/Publikt/SkogligaGrunddata_3_1/ImageServer', renderingRule: '{"rasterFunction":"Gallringsindex","rasterFunctionArguments":{"sis":"g16-g22"}}' },
      ],
    },
  ];
  const wmsLayers = wmsLayerGroups.flatMap(g => g.layers);

  // SMHI Brandrisk (API-baserad, inte WMS)
  const [brandriskData, setBrandriskData] = useState<{fwiindex: number, grassfire: number, fwi: number, date: string} | null>(null);
  useEffect(() => {
    if (!overlays.brandrisk) { setBrandriskData(null); return; }
    const lng = mapCenter.lng.toFixed(1);
    const lat = mapCenter.lat.toFixed(1);
    fetch(`https://opendata-download-metfcst.smhi.se/api/category/fwif1g/version/1/daily/geotype/point/lon/${lng}/lat/${lat}/data.json`)
      .then(r => r.json())
      .then(data => {
        const today = data.timeSeries?.[0];
        if (today) {
          const fwiindex = today.parameters.find((p: any) => p.name === 'fwiindex')?.values[0] ?? -1;
          const grassfire = today.parameters.find((p: any) => p.name === 'grassfire')?.values[0] ?? -1;
          const fwi = today.parameters.find((p: any) => p.name === 'fwi')?.values[0] ?? 0;
          setBrandriskData({ fwiindex, grassfire, fwi, date: today.validTime });
        }
      })
      .catch(() => setBrandriskData(null));
  }, [overlays.brandrisk, mapCenter.lat, mapCenter.lng]);

  // Hämta skärmstorlek på klienten
  useEffect(() => {
    setScreenSize({ width: window.innerWidth, height: window.innerHeight });
    const handleResize = () => setScreenSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // === MapLibre state ===
  const [mapLibreReady, setMapLibreReady] = useState(false);

  // MapLibre map style config (stable constant)
  const mapStyleConfig = useRef({
    version: 8 as const,
    sources: {
      satellite: {
        type: 'raster' as const,
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        maxzoom: 18,
        attribution: '&copy; Esri',
      },
      osm: {
        type: 'raster' as const,
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 19,
        attribution: '&copy; OpenStreetMap',
      },
      topographic: {
        type: 'raster' as const,
        tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 17,
        attribution: '&copy; OpenTopoMap',
      },
      contours: {
        type: 'raster' as const,
        tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 17,
      },
    },
    layers: [
      { id: 'bg', type: 'background' as const, paint: { 'background-color': '#0a0a0a' } },
      { id: 'osm-layer', type: 'raster' as const, source: 'osm', layout: { visibility: 'none' as const } },
      { id: 'satellite-layer', type: 'raster' as const, source: 'satellite', paint: { 'raster-brightness-max': 0.7, 'raster-contrast': 0.15, 'raster-saturation': -0.2 }, layout: { visibility: 'visible' as const } },
      { id: 'terrain-layer', type: 'raster' as const, source: 'topographic', layout: { visibility: 'none' as const } },
      { id: 'contours-layer', type: 'raster' as const, source: 'contours', paint: { 'raster-opacity': 0.4 }, layout: { visibility: 'none' as const } },
    ],
    sky: { 'sky-color': '#000000', 'horizon-color': '#111111', 'sky-horizon-blend': 0.5 },
  });

  // Callback när MapLibre-kartan är laddad och redo
  const handleMapReady = useCallback((map: any) => {
    mapInstanceRef.current = map;
    console.log('[MapLibre] handleMapReady — adding sources and layers');

    // === GeoJSON Sources för linjer, zoner och ritning ===
    map.addSource('lines-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addSource('zones-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addSource('drawing-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addSource('drawing-points-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addSource('tma-roads-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

    // === Zone layers ===
    map.addLayer({ id: 'zone-fill', type: 'fill', source: 'zones-source', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.2 } });
    map.addLayer({ id: 'zone-outline', type: 'line', source: 'zones-source', paint: { 'line-color': ['get', 'color'], 'line-width': 4 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    map.addLayer({ id: 'zone-outline-dash', type: 'line', source: 'zones-source', paint: { 'line-color': '#ffffff', 'line-width': 4, 'line-dasharray': [2, 2] }, layout: { 'line-cap': 'round', 'line-join': 'round' } });

    // === Line layers per type ===
    const lineTypeDefs = [
      { id: 'boundary', color: '#ef4444', color2: '#fbbf24', striped: true },
      { id: 'mainRoad', color: '#3b82f6', color2: '#fbbf24', striped: true },
      { id: 'backRoadRed', color: '#ef4444' },
      { id: 'backRoadYellow', color: '#fbbf24' },
      { id: 'backRoadBlue', color: '#3b82f6' },
      { id: 'sideRoadRed', color: '#ef4444' },
      { id: 'sideRoadYellow', color: '#fbbf24' },
      { id: 'sideRoadBlue', color: '#3b82f6' },
      { id: 'stickvag', color: '#ff00ff' },
      { id: 'nature', color: '#22c55e', color2: '#ef4444', striped: true },
      { id: 'ditch', color: '#06b6d4', color2: '#0e7490', striped: true },
      { id: 'trail', color: '#ffffff', dashed: true },
    ];
    lineTypeDefs.forEach((lt: any) => {
      map.addLayer({
        id: `line-${lt.id}-base`, type: 'line', source: 'lines-source',
        filter: ['==', ['get', 'lineType'], lt.id],
        paint: { 'line-color': lt.color, 'line-width': 5, ...(lt.dashed ? { 'line-dasharray': [3, 2] } : {}), ...(!lt.striped && !lt.dashed ? { 'line-dasharray': [2.5, 1.5] } : {}) },
        layout: { 'line-cap': 'round', 'line-join': 'round' }
      });
      if (lt.striped && lt.color2) {
        map.addLayer({
          id: `line-${lt.id}-stripe`, type: 'line', source: 'lines-source',
          filter: ['==', ['get', 'lineType'], lt.id],
          paint: { 'line-color': lt.color2, 'line-width': 5, 'line-dasharray': [2, 2] },
          layout: { 'line-cap': 'round', 'line-join': 'round' }
        });
      }
    });

    // === Line hitbox layer ===
    map.addLayer({ id: 'line-hitbox', type: 'line', source: 'lines-source', paint: { 'line-color': 'rgba(0,0,0,0)', 'line-width': 20 } });

    // === TMA road layers ===
    map.addLayer({ id: 'tma-roads-glow', type: 'line', source: 'tma-roads-source', paint: { 'line-color': 'rgba(239,68,68,0.3)', 'line-width': 20, 'line-blur': 4 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    map.addLayer({ id: 'tma-roads-line', type: 'line', source: 'tma-roads-source', paint: { 'line-color': '#ef4444', 'line-width': 8 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });

    // === TMA varningslinje (traktgräns nära väg – pulserande röd linje) ===
    map.addSource('tma-warning-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'tma-warning-glow', type: 'line', source: 'tma-warning-source', paint: { 'line-color': '#ef4444', 'line-width': 18, 'line-opacity': 0.4, 'line-blur': 6 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    map.addLayer({ id: 'tma-warning-line', type: 'line', source: 'tma-warning-source', paint: { 'line-color': '#ef4444', 'line-width': 5 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    map.addLayer({ id: 'tma-warning-dash', type: 'line', source: 'tma-warning-source', paint: { 'line-color': '#ffffff', 'line-width': 5, 'line-dasharray': [2, 4], 'line-opacity': 0.7 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    map.addLayer({ id: 'tma-warning-hitbox', type: 'line', source: 'tma-warning-source', paint: { 'line-color': 'rgba(0,0,0,0)', 'line-width': 30 } });

    // === Drawing preview layers ===
    map.addLayer({ id: 'drawing-fill', type: 'fill', source: 'drawing-source', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#7cba3f', 'fill-opacity': 0.15 } });
    map.addLayer({ id: 'drawing-glow', type: 'line', source: 'drawing-source', paint: { 'line-color': '#7cba3f', 'line-width': 12, 'line-opacity': 0.3, 'line-blur': 4 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    map.addLayer({ id: 'drawing-line', type: 'line', source: 'drawing-source', paint: { 'line-color': '#7cba3f', 'line-width': 4 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    map.addLayer({ id: 'drawing-points-layer', type: 'circle', source: 'drawing-points-source', paint: { 'circle-radius': 6, 'circle-color': '#ffffff', 'circle-stroke-color': '#7cba3f', 'circle-stroke-width': 2 } });
    // Streckad stängningslinje (sista→första punkt)
    map.addSource('drawing-close-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'drawing-close-line', type: 'line', source: 'drawing-close-source', paint: { 'line-color': '#7cba3f', 'line-width': 3, 'line-dasharray': [4, 4], 'line-opacity': 0.6 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });

    // === WMS overlay sources + layers ===
    const wmsLayerDefs = [
      { id: 'nyckelbiotoper', tiles: ['https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaNyckelbiotop/MapServer/WmsServer?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=Nyckelbiotop_Skogsstyrelsen&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256'] },
      { id: 'naturvarde', tiles: ['https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaObjektnaturvarde/MapServer/WmsServer?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=Objektnaturvarde_Skogsstyrelsen&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256'] },
      { id: 'sumpskog', tiles: ['https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaSumpskog/MapServer/WmsServer?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=Sumpskog_Skogsstyrelsen&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256'] },
      { id: 'wetlands', tiles: ['https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaSumpskog/MapServer/WmsServer?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=Sumpskog_Skogsstyrelsen&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256'] },
      { id: 'biotopskydd', tiles: ['https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaBiotopskydd/MapServer/WmsServer?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=Biotopskydd_Skogsstyrelsen&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256'] },
      { id: 'naturvardsavtal', tiles: ['https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaNaturvardsavtal/MapServer/WmsServer?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=Naturvardsavtal_Skogsstyrelsen&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256'] },
      { id: 'skoghistoria', tiles: ['https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaSkoghistoria/MapServer/WmsServer?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=SkoghistoriaYta_Skogsstyrelsen,SkoghistoriaLinje_Skogsstyrelsen,SkoghistoriaPunkt_Skogsstyrelsen&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256'] },
      { id: 'avverkningsanmalan', tiles: ['https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaAvverkningsanmalan/MapServer/WmsServer?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=Avverkningsanmalan_Skogsstyrelsen&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256'] },
      { id: 'utfordavverkning', tiles: ['https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaUtfordavverkning/MapServer/WmsServer?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=UtfordAvverkning_Skogsstyrelsen&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256'] },
      { id: 'fornlamningar', tiles: ['/api/wms-proxy?layer=raa_lamningar&bbox={bbox-epsg-3857}&width=256&height=256'], maxzoom: 14 },
      { id: 'naturreservat', tiles: ['https://geodata.naturvardsverket.se/naturvardsregistret/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=Naturreservat&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256'] },
      { id: 'natura2000', tiles: ['https://geodata.naturvardsverket.se/n2000/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=Habitatdirektivet,Fageldirektivet&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256'] },
      { id: 'vattenskydd', tiles: ['https://geodata.naturvardsverket.se/naturvardsregistret/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=Vattenskyddsomrade&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256'] },
      { id: 'oversvamning', tiles: ['https://inspire.msb.se/oversvamning/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=NZ_Oversvamning_100,NZ_Oversvamning_200,NZ_Oversvamning_BHF&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256'] },
      { id: 'jordarter', tiles: ['https://maps3.sgu.se/geoserver/jord/ows?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=jord:SE.GOV.SGU.JORD.GRUNDLAGER.25K&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256'] },
      { id: 'barighet', tiles: ['https://geo-netinfo.trafikverket.se/mapservice/wms.axd/NetInfo_1_8?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=Barighet&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256'] },
      { id: 'kraftledningar', tiles: ['https://inspire-skn.metria.se/geoserver/skn/ows?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=US.ElectricityNetwork.Lines&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256'] },
      { id: 'sks_markfuktighet', tiles: ['/api/wms-proxy?layer=sks_markfuktighet&bbox={bbox-epsg-3857}&width=256&height=256'] },
      { id: 'sks_virkesvolym', tiles: ['/api/wms-proxy?layer=sks_virkesvolym&bbox={bbox-epsg-3857}&width=256&height=256'] },
      { id: 'sks_tradhojd', tiles: ['/api/wms-proxy?layer=sks_tradhojd&bbox={bbox-epsg-3857}&width=256&height=256'] },
      { id: 'sks_lutning', tiles: ['/api/wms-proxy?layer=sks_lutning&bbox={bbox-epsg-3857}&width=256&height=256'] },
      { id: 'sks_gallringsindex', tiles: ['/api/wms-proxy?layer=sks_gallringsindex&bbox={bbox-epsg-3857}&width=256&height=256'] },
    ];
    wmsLayerDefs.forEach((def: { id: string; tiles: string[]; maxzoom?: number }) => {
      try {
        const sourceOpts: any = { type: 'raster', tiles: def.tiles, tileSize: 256 };
        if (def.maxzoom) sourceOpts.maxzoom = def.maxzoom;
        map.addSource(`wms-${def.id}`, sourceOpts);
        map.addLayer({ id: `wms-layer-${def.id}`, type: 'raster', source: `wms-${def.id}`, paint: { 'raster-opacity': 0.7 }, layout: { visibility: 'none' } }, 'zone-fill');
        console.log(`[MapLibre] WMS layer created: wms-layer-${def.id}`);
      } catch (e) { console.error(`[MapLibre] WMS ${def.id} error:`, e); }
    });

    // Körbarhetstiles
    try {
      map.addSource('wms-korbarhet', { type: 'raster', tiles: ['/api/korbarhet-tiles?bbox={bbox-epsg-3857}&width=256&height=256'], tileSize: 256 });
      map.addLayer({ id: 'wms-layer-korbarhet', type: 'raster', source: 'wms-korbarhet', paint: { 'raster-opacity': 0.7 }, layout: { visibility: 'none' } }, 'zone-fill');
    } catch (e) { console.error('[MapLibre] korbarhet error:', e); }

    setMapLibreReady(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMapRemoved = useCallback(() => {
    mapInstanceRef.current = null;
    setMapLibreReady(false);
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
  const [lastUsedColorId, setLastUsedColorId] = useState<string>('rod'); // Senast använda färgen
  const [showAvslutaBekraftelse, setShowAvslutaBekraftelse] = useState(false); // Bekräftelse vid avsluta
  const [showSnitslaMeny, setShowSnitslaMeny] = useState(false); // Långtryck-meny under snitsling
  const [selectedOversiktVag, setSelectedOversiktVag] = useState<Marker | null>(null); // Vald väg i översikt
  const [selectedOversiktItem, setSelectedOversiktItem] = useState<Marker | null>(null); // Vald symbol/zon i översikt
  const longPressTimerRef = useRef<any>(null); // Timer för långtryck
  
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

  // Info-fliken
  const maskinLista = ['PONSSE Scorpion Giant 8W', 'Wisent 2015', 'Elephant King AF', 'Rottne'];
  const [infoBarighet, setInfoBarighet] = useState<string | null>(null);
  const [infoTerrang, setInfoTerrang] = useState<string | null>(null);
  const [infoSkordareMaskin, setInfoSkordareMaskin] = useState('');
  const [infoSkordareBand, setInfoSkordareBand] = useState(false);
  const [infoSkordareBandPar, setInfoSkordareBandPar] = useState('1');
  const [infoSkordareManFall, setInfoSkordareManFall] = useState(false);
  const [infoSkordareManFallText, setInfoSkordareManFallText] = useState('');
  const [infoSkotareMaskin, setInfoSkotareMaskin] = useState('');
  const [infoSkotareBand, setInfoSkotareBand] = useState(false);
  const [infoSkotareBandPar, setInfoSkotareBandPar] = useState('1');
  const [infoSkotareLastreder, setInfoSkotareLastreder] = useState(false);
  const [infoSkotareRisDirekt, setInfoSkotareRisDirekt] = useState(false);
  const [infoTrailerIn, setInfoTrailerIn] = useState(true);
  const [infoTransportKommentar, setInfoTransportKommentar] = useState('');
  const [infoMarkagareVed, setInfoMarkagareVed] = useState(false);
  const [infoMarkagareVedText, setInfoMarkagareVedText] = useState('');
  const [infoAnteckningar, setInfoAnteckningar] = useState('');
  const [infoLoaded, setInfoLoaded] = useState(false);
  const infoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Ladda info-data från Supabase när objekt väljs
  useEffect(() => {
    if (!valtObjekt?.id) { setInfoLoaded(false); return; }
    const loadInfo = async () => {
      const { data, error } = await supabase
        .from('objekt')
        .select('barighet, terrang, skordare_maskin, skordare_band, skordare_band_par, skordare_manuell_fallning, skordare_manuell_fallning_text, skotare_maskin, skotare_band, skotare_band_par, skotare_lastreder_breddat, skotare_ris_direkt, transport_trailer_in, transport_kommentar, markagare_ska_ha_ved, markagare_ved_text, info_anteckningar')
        .eq('id', valtObjekt.id)
        .single();
      if (!error && data) {
        setInfoBarighet(data.barighet || null);
        setInfoTerrang(data.terrang || null);
        setInfoSkordareMaskin(data.skordare_maskin || '');
        setInfoSkordareBand(data.skordare_band || false);
        setInfoSkordareBandPar(data.skordare_band_par || '1');
        setInfoSkordareManFall(data.skordare_manuell_fallning || false);
        setInfoSkordareManFallText(data.skordare_manuell_fallning_text || '');
        setInfoSkotareMaskin(data.skotare_maskin || '');
        setInfoSkotareBand(data.skotare_band || false);
        setInfoSkotareBandPar(data.skotare_band_par || '1');
        setInfoSkotareLastreder(data.skotare_lastreder_breddat || false);
        setInfoSkotareRisDirekt(data.skotare_ris_direkt || false);
        setInfoTrailerIn(data.transport_trailer_in !== false);
        setInfoTransportKommentar(data.transport_kommentar || '');
        setInfoMarkagareVed(data.markagare_ska_ha_ved || false);
        setInfoMarkagareVedText(data.markagare_ved_text || '');
        setInfoAnteckningar(data.info_anteckningar || '');
      }
      setInfoLoaded(true);
    };
    loadInfo();
  }, [valtObjekt?.id]);

  // Spara info till Supabase (debounced)
  const saveInfoToDb = useCallback(async () => {
    if (!valtObjekt?.id || !infoLoaded) return;
    const { error } = await supabase
      .from('objekt')
      .update({
        barighet: infoBarighet,
        terrang: infoTerrang,
        skordare_maskin: infoSkordareMaskin || null,
        skordare_band: infoSkordareBand,
        skordare_band_par: infoSkordareBandPar,
        skordare_manuell_fallning: infoSkordareManFall,
        skordare_manuell_fallning_text: infoSkordareManFallText || null,
        skotare_maskin: infoSkotareMaskin || null,
        skotare_band: infoSkotareBand,
        skotare_band_par: infoSkotareBandPar,
        skotare_lastreder_breddat: infoSkotareLastreder,
        skotare_ris_direkt: infoSkotareRisDirekt,
        transport_trailer_in: infoTrailerIn,
        transport_kommentar: infoTransportKommentar || null,
        markagare_ska_ha_ved: infoMarkagareVed,
        markagare_ved_text: infoMarkagareVedText || null,
        info_anteckningar: infoAnteckningar || null,
      })
      .eq('id', valtObjekt.id);
    if (error) console.error('Spara info fel:', error);
  }, [valtObjekt?.id, infoLoaded, infoBarighet, infoTerrang, infoSkordareMaskin, infoSkordareBand, infoSkordareBandPar, infoSkordareManFall, infoSkordareManFallText, infoSkotareMaskin, infoSkotareBand, infoSkotareBandPar, infoSkotareLastreder, infoSkotareRisDirekt, infoTrailerIn, infoTransportKommentar, infoMarkagareVed, infoMarkagareVedText, infoAnteckningar]);

  useEffect(() => {
    if (!infoLoaded) return;
    if (infoSaveTimeoutRef.current) clearTimeout(infoSaveTimeoutRef.current);
    infoSaveTimeoutRef.current = setTimeout(() => saveInfoToDb(), 800);
    return () => { if (infoSaveTimeoutRef.current) clearTimeout(infoSaveTimeoutRef.current); };
  }, [saveInfoToDb, infoLoaded]);

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
  // Refs for document-level event handlers (avoid stale closures)
  const draggingMarkerRef = useRef<string | null>(null);
  const hasMovedRef = useRef(false);
  const dragStartRef = useRef<Point>({ x: 0, y: 0 });

  // Rotera pilar
  const [rotatingArrow, setRotatingArrow] = useState<string | null>(null);
  const [rotationCenter, setRotationCenter] = useState<Point>({ x: 0, y: 0 });
  const rotatingArrowRef = useRef<string | null>(null);
  const rotationCenterRef = useRef<Point>({ x: 0, y: 0 });
  
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
  const [emergencyHealthcare, setEmergencyHealthcare] = useState<{ name: string; type: string; lat: number; lon: number; dist: number }[] | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [detectedColor, setDetectedColor] = useState<any>(null);
  const [selectedVagType, setSelectedVagType] = useState('stickvag');
  const [selectedVagColor, setSelectedVagColor] = useState<any>(null);
  
  // Rita
  const [isDrawMode, setIsDrawMode] = useState(false);
  const [drawType, setDrawType] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<Point[]>([]); // SVG coords (behålls för kompatibilitet)
  const [currentDrawCoords, setCurrentDrawCoords] = useState<[number, number][]>([]); // [lng, lat] coords för MapLibre-ritning
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawPaused, setDrawPaused] = useState(false); // Pausad mellan drag
  // Freehand drawing refs (avoid stale closures in document-level listeners)
  const freehandCoordsRef = useRef<[number, number][]>([]);
  const freehandActiveRef = useRef(false);
  const freehandStartScreenRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  
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
  
  // Synka gpsPausedRef med gpsPaused state
  useEffect(() => {
    gpsPausedRef.current = gpsPaused;
  }, [gpsPaused]);
  
  const [currentPosition, setCurrentPosition] = useState<GeolocationPosition | null>(null);
  const [gpsMapPosition, setGpsMapPosition] = useState<Point>({ x: 200, y: 300 }); // Var på kartan GPS-punkten är
  const [gpsPosition, setGpsPosition] = useState<{lat: number, lng: number} | null>(null); // GPS lat/lng
  const [trackingPath, setTrackingPath] = useState<Point[]>([]);
  const [gpsLineType, setGpsLineType] = useState<string | null>(null); // Vilken linjetyp som spåras
  const gpsLineTypeRef = useRef<string | null>(null); // Ref för callback
  const [gpsPath, setGpsPath] = useState<Point[]>([]); // Spårad linje i kartkoordinater
  const [gpsStartPos, setGpsStartPos] = useState<{lat: number, lon: number, x: number, y: number} | null>(null); // Startposition för konvertering
  const watchIdRef = useRef<number | null>(null);
  const gpsMapPositionRef = useRef<Point>({ x: 200, y: 300 });
  const gpsPathRef = useRef<Point[]>([]);
  const gpsHistoryRef = useRef<Point[]>([]); // Senaste 20 positioner för medelvärde
  const lastConfirmedPosRef = useRef<Point>({ x: 200, y: 300 }); // Sista bekräftade position (efter minDistance-filter)
  
  // Karta
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });

  // MapLibre
  const mapInstanceRef = useRef<any>(null);
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
  
  // Zoom funktioner - delegerar till MapLibre
  const zoomIn = () => {
    const map = mapInstanceRef.current;
    if (map) map.zoomIn();
  };

  const zoomOut = () => {
    const map = mapInstanceRef.current;
    if (map) map.zoomOut();
  };
  
  // Beräkna dynamisk storlek för symboler baserat på zoom
  // Symboler ska vara mindre vid utzoom och större vid inzoom,
  // men inte växa linjärt med zoom (då blir de enorma)
  const getConstrainedSize = (baseSize: number) => {
    // Symboler positioneras nu via map.project() utan grupp-transform.
    // Returnera fast pixelstorlek (ca halva basvärdet).
    return baseSize * 0.5;
  };

  // === MapLibre: Synkronisera React-state från MapLibre-kamera ===
  // MapLibre är nu master för kameran. Vi lyssnar på 'move' och beräknar
  // pan/zoom-ekvivalenter så SVG-overlayen kan positionera symboler.
  const mapMoveCounterRef = useRef(0);
  const [mapMoveCounter, setMapMoveCounter] = useState(0);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const onMove = () => {
      // mapCenter och mapZoom uppdateras INTE här — de är stabila referenspunkter
      // för SVG-koordinatsystemet (sätts bara vid objektval).
      // Istället triggar vi re-render så SVG-element kan positioneras via map.project().
      mapMoveCounterRef.current++;
      setMapMoveCounter(mapMoveCounterRef.current);
    };

    map.on('move', onMove);
    return () => { map.off('move', onMove); };
  }, [mapLibreReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // === MapLibre: Byt bakgrundskarta ===
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const setVis = (id: string, vis: boolean) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis ? 'visible' : 'none');
    };
    setVis('osm-layer', mapType === 'osm');
    setVis('satellite-layer', mapType === 'satellite');
    setVis('terrain-layer', mapType === 'terrain');
  }, [mapType, mapLibreReady]);

  // === MapLibre: Höjdkurvor overlay ===
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !map.getLayer('contours-layer')) return;
    map.setLayoutProperty('contours-layer', 'visibility', overlays.contours && mapType !== 'terrain' ? 'visible' : 'none');
    map.setPaintProperty('contours-layer', 'raster-opacity', mapType === 'satellite' ? 0.5 : 0.3);
  }, [overlays.contours, mapType, mapLibreReady]);



  // === MapLibre: GeoJSON sync useEffects placerade efter alla state-deklarationer (undvik TDZ) ===
  // Se längre ner i filen för: lines sync, zones sync, TMA sync, layer visibility

  // === MapLibre: VIDA kartbild som image source ===
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapLibreReady) return;

    const hasVida = valtObjekt?.kartbild_url && valtObjekt?.kartbild_bounds && overlays.vidaKartbild;

    if (hasVida) {
      const b = valtObjekt.kartbild_bounds; // [[south, west], [north, east]]
      const coordinates: any = [
        [b[0][1], b[1][0]], // top-left: [west_lng, north_lat]
        [b[1][1], b[1][0]], // top-right: [east_lng, north_lat]
        [b[1][1], b[0][0]], // bottom-right: [east_lng, south_lat]
        [b[0][1], b[0][0]], // bottom-left: [west_lng, south_lat]
      ];

      if (map.getSource('vida-overlay')) {
        try {
          (map.getSource('vida-overlay') as any).updateImage({
            url: valtObjekt.kartbild_url,
            coordinates
          });
        } catch {}
      } else {
        try {
          map.addSource('vida-overlay', {
            type: 'image',
            url: valtObjekt.kartbild_url,
            coordinates
          });
          // Lägg vida-lagret ovanpå bakgrundskartan men under ritade features
          const firstLineLayer = map.getStyle().layers?.find((l: any) => l.id.startsWith('zone-') || l.id.startsWith('line-'));
          map.addLayer({
            id: 'vida-layer',
            type: 'raster',
            source: 'vida-overlay',
            paint: { 'raster-opacity': 0.8 }
          }, firstLineLayer?.id);
        } catch (e) { console.error('[MapLibre] VIDA layer error:', e); }
      }

      if (map.getLayer('vida-layer')) map.setLayoutProperty('vida-layer', 'visibility', 'visible');
    } else {
      if (map.getLayer('vida-layer')) map.setLayoutProperty('vida-layer', 'visibility', 'none');
    }
  }, [valtObjekt?.kartbild_url, valtObjekt?.kartbild_bounds, overlays.vidaKartbild, mapLibreReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // === MapLibre: Toggle WMS overlay visibility ===
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapLibreReady) return;

    const allWmsIds = ['nyckelbiotoper', 'naturvarde', 'sumpskog', 'wetlands', 'biotopskydd', 'naturvardsavtal', 'skoghistoria', 'avverkningsanmalan', 'utfordavverkning', 'fornlamningar', 'naturreservat', 'natura2000', 'vattenskydd', 'oversvamning', 'jordarter', 'barighet', 'kraftledningar', 'sks_markfuktighet', 'sks_virkesvolym', 'sks_tradhojd', 'sks_lutning', 'sks_gallringsindex', 'korbarhet'];

    allWmsIds.forEach(id => {
      const layerId = `wms-layer-${id}`;
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', overlays[id] ? 'visible' : 'none');
      } else {
        console.warn(`[MapLibre] WMS toggle: layer ${layerId} does not exist`);
      }
    });
  }, [overlays, mapLibreReady]);

  // === MapLibre: Ritverktyg (freehand + klick) + symbolplacering ===
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapLibreReady) return;

    const isDrawingMode = isDrawMode || isZoneMode;
    const canvas = map.getCanvas();
    const canvasContainer = map.getCanvasContainer();

    // Override MapLibre's CSS cursor
    if (isDrawingMode || selectedSymbol || isArrowMode) {
      canvasContainer.style.setProperty('cursor', 'crosshair', 'important');
    } else {
      canvasContainer.style.removeProperty('cursor');
    }

    // --- Symbol/pil-placering via MapLibre click ---
    const onClick = (e: any) => {
      if (!isDrawingMode && (selectedSymbol || (isArrowMode && arrowType))) {
        const lngLat = e.lngLat;
        const svgPos = latLonToSvg(lngLat.lat, lngLat.lng);

        if (selectedSymbol) {
          saveToHistory([...markers]);
          const newMarker: any = {
            id: Date.now(),
            type: selectedSymbol,
            x: svgPos.x,
            y: svgPos.y,
            isMarker: true,
            comment: '',
          };

          if (selectedSymbol === 'landing') {
            newMarker.roadCheck = { status: 'loading', tillstand: 'ej_sokt' };
            checkRoadSafety(lngLat.lat, lngLat.lng).then((result: any) => {
              const gt = generelltTillstand;
              const maxspeed = result.nearestRoad?.maxspeed;
              const isAllman = result.roadCategory === 'allman' || result.roadCategory === 'kan_vara_allman';
              if (isAllman && maxspeed && maxspeed > 80) {
                result.requiresSpecialPermit = true;
              } else if (isAllman && gt && (gt as any).lan && (gt as any).giltigtTom && new Date((gt as any).giltigtTom) >= new Date()) {
                result.tillstand = 'beviljat';
                result.generelltTillstandApplied = true;
              }
              setMarkers((prev: any[]) => prev.map(m =>
                m.id === newMarker.id ? { ...m, roadCheck: result } : m
              ));
            });
          }

          setMarkers((prev: any[]) => [...prev, newMarker]);
          if (navigator.vibrate) navigator.vibrate(30);
          setRecentSymbols((prev: string[]) => {
            const filtered = prev.filter(s => s !== selectedSymbol);
            return [selectedSymbol!, ...filtered].slice(0, 4);
          });
          setSelectedSymbol(null);
          return;
        }

        if (isArrowMode && arrowType) {
          saveToHistory([...markers]);
          const newArrow = {
            id: Date.now(),
            arrowType,
            x: svgPos.x,
            y: svgPos.y,
            rotation: 0,
            isArrow: true,
          };
          setMarkers((prev: any[]) => [...prev, newArrow]);
          setIsArrowMode(false);
          setArrowType(null);
          return;
        }
      }

      if (!isDrawingMode) {
        if (!justEndedDrag.current && markerMenuOpen) {
          setMarkerMenuOpen(null);
        }
        return;
      }
      // Klick-till-punkt hanteras inte här längre — hanteras i onPointerUp som fallback
    };

    // --- Freehand drawing via DOM events ---
    let lastScreenX = 0;
    let lastScreenY = 0;

    const screenToLngLat = (clientX: number, clientY: number): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      const pt = map.unproject([clientX - rect.left, clientY - rect.top]);
      return [pt.lng, pt.lat];
    };

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!isDrawingMode) return;
      // Bara vänsterklick (touch räknas alltid)
      if ('button' in e && e.button !== 0) return;

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      freehandStartScreenRef.current = { x: clientX, y: clientY };
      freehandActiveRef.current = false; // Blir true om man drar > 5px
      lastScreenX = clientX;
      lastScreenY = clientY;

      // Starta freehand-koordinater med nuvarande + ny punkt
      const coord = screenToLngLat(clientX, clientY);
      freehandCoordsRef.current = [...currentDrawCoords, coord];

      // Disable map drag under ritning
      map.dragPan.disable();
      setIsDrawing(true);
    };

    const onPointerMove = (e: MouseEvent | TouchEvent) => {
      if (!freehandCoordsRef.current.length || !isDrawingMode) return;
      // Kolla att vi fortfarande håller ner (kan missa mouseup om man lämnar fönstret)
      if ('buttons' in e && e.buttons === 0) return;

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      // Kolla om vi har rört oss tillräckligt för att aktivera freehand
      const startDx = Math.abs(clientX - freehandStartScreenRef.current.x);
      const startDy = Math.abs(clientY - freehandStartScreenRef.current.y);
      if (!freehandActiveRef.current && startDx < 5 && startDy < 5) return;
      freehandActiveRef.current = true;

      // Sampla var ~3px skärmavstånd (tätare = mjukare kurvor)
      const dx = clientX - lastScreenX;
      const dy = clientY - lastScreenY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 3) return;

      lastScreenX = clientX;
      lastScreenY = clientY;
      const coord = screenToLngLat(clientX, clientY);
      freehandCoordsRef.current.push(coord);

      // Uppdatera GeoJSON preview direkt via source (snabbare än setState varje punkt)
      try {
        const drawSrc = map.getSource('drawing-source') as any;
        if (drawSrc && freehandCoordsRef.current.length >= 2) {
          const coords = freehandCoordsRef.current;
          // Visa som polygon BARA för polygon-typer (boundary, nature, zoner)
          const isPolygonType = isZoneMode || (isDrawMode && POLYGON_LINE_TYPES.has(drawType || ''));
          const showAsPolygon = isPolygonType && coords.length >= 3;
          drawSrc.setData({
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              properties: {},
              geometry: showAsPolygon
                ? { type: 'Polygon', coordinates: [[...coords, coords[0]]] }
                : { type: 'LineString', coordinates: coords },
            }],
          });
        }
      } catch { /* source not ready */ }
    };

    const onPointerUp = (e: MouseEvent | TouchEvent) => {
      if (!isDrawingMode) return;
      const wasFreehand = freehandActiveRef.current;
      const coords = freehandCoordsRef.current;
      freehandActiveRef.current = false;
      freehandCoordsRef.current = [];

      // Återaktivera map drag
      map.dragPan.enable();
      setIsDrawing(false);

      if (wasFreehand && coords.length >= 3) {
        const shouldClose = isZoneMode || (isDrawMode && POLYGON_LINE_TYPES.has(drawType || ''));
        if (shouldClose) {
          coords.push(coords[0]); // Stäng polygon
        }
        const simplified = simplifyCoords(coords, 0.00002);
        const smoothed = smoothCoords(simplified, 2, shouldClose);
        console.log('Freehand klar, shouldClose:', shouldClose, 'punkter:', coords.length, 'efter smooth:', smoothed.length);
        if (shouldClose) {
          console.log('Polygon stängd, första:', smoothed[0], 'sista:', smoothed[smoothed.length-1]);
        }
        if (isDrawMode) {
          finishLineFromCoords(smoothed);
        } else if (isZoneMode) {
          finishZoneFromCoords(smoothed);
        }
      } else if (!wasFreehand && coords.length > 0) {
        // Kort klick (ingen drag) → lägg till punkt (punkt-för-punkt-läge)
        const lastCoord = coords[coords.length - 1];
        const shouldClose = isZoneMode || (isDrawMode && POLYGON_LINE_TYPES.has(drawType || ''));

        // Klick nära första punkten → stäng polygon (bara för polygon-typer)
        if (shouldClose && currentDrawCoords.length >= 3) {
          const first = currentDrawCoords[0];
          const firstScreen = map.project(first as any);
          const clickScreen = map.project(lastCoord as any);
          const ddx = firstScreen.x - clickScreen.x;
          const ddy = firstScreen.y - clickScreen.y;
          const closeDist = Math.sqrt(ddx * ddx + ddy * ddy);
          if (closeDist < 20) {
            const closed = [...currentDrawCoords, currentDrawCoords[0]];
            const smoothed = smoothCoords(closed, 2, true);
            console.log('Polygon stängd (nära start), antal punkter:', closed.length, 'första:', closed[0], 'sista:', closed[closed.length-1], 'efter smooth:', smoothed.length);
            if (isDrawMode) finishLineFromCoords(smoothed);
            if (isZoneMode) finishZoneFromCoords(smoothed);
            return;
          }
        }
        setCurrentDrawCoords(prev => [...prev, lastCoord]);
      }
    };

    // Dubbelklick → avsluta ritning (stäng polygon-typer, smootha alla)
    const onDblClick = (e: any) => {
      if (!isDrawingMode) return;
      e.preventDefault();
      if (currentDrawCoords.length >= 2) {
        const shouldClose = isZoneMode || (isDrawMode && POLYGON_LINE_TYPES.has(drawType || ''));
        let finalCoords: [number, number][];
        if (shouldClose) {
          const closed = [...currentDrawCoords, currentDrawCoords[0]];
          finalCoords = smoothCoords(closed, 2, true);
          console.log('Polygon stängd (dblclick), punkter:', closed.length, 'första:', closed[0], 'sista:', closed[closed.length-1], 'efter smooth:', finalCoords.length);
        } else {
          finalCoords = currentDrawCoords.length >= 3 ? smoothCoords([...currentDrawCoords], 2, false) : [...currentDrawCoords];
          console.log('Linje avslutad (dblclick), punkter:', currentDrawCoords.length, 'efter smooth:', finalCoords.length);
        }
        if (isDrawMode) finishLineFromCoords(finalCoords);
        if (isZoneMode) finishZoneFromCoords(finalCoords);
      }
    };

    // Under ritning: disable double-click zoom
    if (isDrawingMode) {
      map.doubleClickZoom.disable();
    } else {
      map.doubleClickZoom.enable();
    }

    // Registrera MapLibre click för symbol/pil och menystängning
    map.on('click', onClick);
    map.on('dblclick', onDblClick);

    // Registrera DOM events för freehand drawing
    if (isDrawingMode) {
      canvas.addEventListener('mousedown', onPointerDown);
      canvas.addEventListener('touchstart', onPointerDown, { passive: true });
      document.addEventListener('mousemove', onPointerMove);
      document.addEventListener('touchmove', onPointerMove, { passive: true });
      document.addEventListener('mouseup', onPointerUp);
      document.addEventListener('touchend', onPointerUp);
    }

    return () => {
      map.off('click', onClick);
      map.off('dblclick', onDblClick);
      canvas.removeEventListener('mousedown', onPointerDown);
      canvas.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('mousemove', onPointerMove);
      document.removeEventListener('touchmove', onPointerMove);
      document.removeEventListener('mouseup', onPointerUp);
      document.removeEventListener('touchend', onPointerUp);
      canvasContainer.style.removeProperty('cursor');
      // Säkerställ att dragPan är aktiverad vid cleanup
      if (map.dragPan) map.dragPan.enable();
    };
  }, [isDrawMode, isZoneMode, selectedSymbol, isArrowMode, arrowType, mapLibreReady, markerMenuOpen, currentDrawCoords]); // eslint-disable-line react-hooks/exhaustive-deps

  // Douglas-Peucker linjeförenkling (tar [lng,lat][] och returnerar förenklad version)
  const simplifyCoords = (coords: [number, number][], tolerance: number): [number, number][] => {
    if (coords.length <= 2) return coords;
    // Hitta punkten längst bort från linjen start→slut
    const [sx, sy] = coords[0];
    const [ex, ey] = coords[coords.length - 1];
    let maxDist = 0;
    let maxIdx = 0;
    const lineLenSq = (ex - sx) ** 2 + (ey - sy) ** 2;
    for (let i = 1; i < coords.length - 1; i++) {
      const [px, py] = coords[i];
      let dist: number;
      if (lineLenSq === 0) {
        dist = Math.sqrt((px - sx) ** 2 + (py - sy) ** 2);
      } else {
        const t = Math.max(0, Math.min(1, ((px - sx) * (ex - sx) + (py - sy) * (ey - sy)) / lineLenSq));
        const projX = sx + t * (ex - sx);
        const projY = sy + t * (ey - sy);
        dist = Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
      }
      if (dist > maxDist) { maxDist = dist; maxIdx = i; }
    }
    if (maxDist > tolerance) {
      const left = simplifyCoords(coords.slice(0, maxIdx + 1), tolerance);
      const right = simplifyCoords(coords.slice(maxIdx), tolerance);
      return [...left.slice(0, -1), ...right];
    }
    return [coords[0], coords[coords.length - 1]];
  };

  // Chaikin's corner-cutting algorithm för mjuka kurvor
  // closed=true → stäng polygonen efter varje iteration, closed=false → öppen linje
  const smoothCoords = (coords: [number, number][], iterations: number = 2, closed: boolean = true): [number, number][] => {
    if (coords.length < 3) return coords;
    const beforeLen = coords.length;
    let pts = coords;
    for (let iter = 0; iter < iterations; iter++) {
      const smoothed: [number, number][] = [];
      for (let j = 0; j < pts.length - 1; j++) {
        const p0 = pts[j];
        const p1 = pts[j + 1];
        smoothed.push([p0[0] * 0.75 + p1[0] * 0.25, p0[1] * 0.75 + p1[1] * 0.25]);
        smoothed.push([p0[0] * 0.25 + p1[0] * 0.75, p0[1] * 0.25 + p1[1] * 0.75]);
      }
      if (closed && smoothed.length > 0) smoothed.push(smoothed[0]);
      pts = smoothed;
    }
    console.log('Smoothing applied, before:', beforeLen, 'after:', pts.length, 'closed:', closed);
    return pts;
  };

  // Hjälpfunktioner för att avsluta ritning med [lng,lat]-coords
  // Rensa ritnings-preview layers
  const clearDrawingPreview = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    try {
      const s1 = map.getSource('drawing-source') as any;
      const s2 = map.getSource('drawing-points-source') as any;
      const s3 = map.getSource('drawing-close-source') as any;
      if (s1) s1.setData({ type: 'FeatureCollection', features: [] });
      if (s2) s2.setData({ type: 'FeatureCollection', features: [] });
      if (s3) s3.setData({ type: 'FeatureCollection', features: [] });
    } catch { /* ok */ }
  };

  const finishLineFromCoords = (coords: [number, number][]) => {
    if (coords.length > 1 && drawType) {
      saveToHistory([...markers]);
      const svgPath = coords.map(([lng, lat]) => latLonToSvg(lat, lng));
      const newLine = {
        id: Date.now(),
        lineType: drawType,
        path: svgPath,
        isLine: true,
      };
      setMarkers((prev: any[]) => [...prev, newLine]);
    }
    clearDrawingPreview();
    setCurrentDrawCoords([]);
    setCurrentPath([]);
    setIsDrawMode(false);
    setDrawType(null);
    setIsDrawing(false);
    setDrawPaused(false);
  };

  const finishZoneFromCoords = (coords: [number, number][]) => {
    if (coords.length > 2 && zoneType) {
      saveToHistory([...markers]);
      const svgPath = coords.map(([lng, lat]) => latLonToSvg(lat, lng));
      const newZone = {
        id: Date.now(),
        zoneType,
        path: svgPath,
        isZone: true,
      };
      setMarkers((prev: any[]) => [...prev, newZone]);
    }
    clearDrawingPreview();
    setCurrentDrawCoords([]);
    setCurrentPath([]);
    setIsZoneMode(false);
    setZoneType(null);
    setIsDrawing(false);
    setDrawPaused(false);
  };

  // === MapLibre: Uppdatera ritnings-preview layers ===
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapLibreReady) return;
    try {
      const drawSrc = map.getSource('drawing-source') as any;
      const ptsSrc = map.getSource('drawing-points-source') as any;
      const closeSrc = map.getSource('drawing-close-source') as any;
      if (!drawSrc || !ptsSrc) return;

      if (currentDrawCoords.length < 2) {
        drawSrc.setData({ type: 'FeatureCollection', features: [] });
        if (closeSrc) closeSrc.setData({ type: 'FeatureCollection', features: [] });
        // Visa enskilda punkter
        if (currentDrawCoords.length === 1) {
          ptsSrc.setData({
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              properties: {},
              geometry: { type: 'Point', coordinates: currentDrawCoords[0] }
            }]
          });
        } else {
          ptsSrc.setData({ type: 'FeatureCollection', features: [] });
        }
        return;
      }

      // Visa som polygon BARA för polygon-typer (boundary, nature, zoner)
      const isPolygonType = isZoneMode || (isDrawMode && POLYGON_LINE_TYPES.has(drawType || ''));
      const showAsPolygon = isPolygonType && currentDrawCoords.length >= 3;
      const feature = {
        type: 'Feature' as const,
        properties: {},
        geometry: showAsPolygon ? {
          type: 'Polygon' as const,
          coordinates: [[...currentDrawCoords, currentDrawCoords[0]]]
        } : {
          type: 'LineString' as const,
          coordinates: currentDrawCoords
        }
      };
      drawSrc.setData({ type: 'FeatureCollection', features: [feature] });

      // Streckad stängningslinje (sista → första punkt) — bara för polygon-typer
      if (closeSrc && isPolygonType && currentDrawCoords.length >= 2) {
        closeSrc.setData({
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [currentDrawCoords[currentDrawCoords.length - 1], currentDrawCoords[0]]
            }
          }]
        });
      } else if (closeSrc) {
        closeSrc.setData({ type: 'FeatureCollection', features: [] });
      }

      // Ritpunkter (vertices)
      const pointFeatures = currentDrawCoords.map((coord, i) => ({
        type: 'Feature' as const,
        properties: { index: i },
        geometry: { type: 'Point' as const, coordinates: coord }
      }));
      ptsSrc.setData({ type: 'FeatureCollection', features: pointFeatures });
    } catch (e) { console.error('[MapLibre] drawing preview error:', e); }
  }, [currentDrawCoords, isDrawMode, isZoneMode, drawType, mapLibreReady]);

  // === MapLibre: Click-handlers för linjer/zoner ===
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapLibreReady) return;

    const onLineClick = (e: any) => {
      if (isDrawMode || isZoneMode) return;
      if (e.features && e.features.length > 0) {
        const featureId = e.features[0].properties.id;
        const marker = markers.find(m => String(m.id) === String(featureId));
        if (marker) {
          setMarkerMenuOpen(marker.id === markerMenuOpen ? null : marker.id);
        }
      }
    };

    const onZoneClick = (e: any) => {
      if (isDrawMode || isZoneMode) return;
      if (e.features && e.features.length > 0) {
        const featureId = e.features[0].properties.id;
        const marker = markers.find(m => String(m.id) === String(featureId));
        if (marker) {
          setMarkerMenuOpen(marker.id === markerMenuOpen ? null : marker.id);
        }
      }
    };

    map.on('click', 'line-hitbox', onLineClick);
    map.on('click', 'zone-fill', onZoneClick);

    // Cursor change on hover (use container with !important to override MapLibre CSS)
    const container = map.getCanvasContainer();
    const onEnter = () => { if (!isDrawMode && !isZoneMode) container.style.setProperty('cursor', 'pointer', 'important'); };
    const onLeave = () => { if (!isDrawMode && !isZoneMode) container.style.removeProperty('cursor'); };
    map.on('mouseenter', 'line-hitbox', onEnter);
    map.on('mouseleave', 'line-hitbox', onLeave);
    map.on('mouseenter', 'zone-fill', onEnter);
    map.on('mouseleave', 'zone-fill', onLeave);

    return () => {
      map.off('click', 'line-hitbox', onLineClick);
      map.off('click', 'zone-fill', onZoneClick);
      map.off('mouseenter', 'line-hitbox', onEnter);
      map.off('mouseleave', 'line-hitbox', onLeave);
      map.off('mouseenter', 'zone-fill', onEnter);
      map.off('mouseleave', 'zone-fill', onLeave);
    };
  }, [mapLibreReady, isDrawMode, isZoneMode, markers, markerMenuOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Centrera på GPS-position
  const centerOnMe = () => {
    const map = mapInstanceRef.current;
    if (map && gpsPosition) {
      map.flyTo({
        center: [gpsPosition.lng, gpsPosition.lat],
        zoom: 16.5,
        duration: 500,
      });
    }
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

  // Volymberäkning
  const [volymResultat, setVolymResultat] = useState<VolymResultat | null>(null);
  const [volymLoading, setVolymLoading] = useState(false);
  // Körbarhetsanalys
  const [korbarhetsResultat, setKorbarhetsResultat] = useState<KorbarhetsResultat | null>(null);
  const [korbarhetsLoading, setKorbarhetsLoading] = useState(false);

  // Generellt tillstånd för avlägg
  const [generelltTillstand, setGenerelltTillstand] = useState<{ lan: string; giltigtTom: string } | null>(null);

  // TMA-varning (traktgräns nära väg) – per boundary
  const [tmaResults, setTmaResults] = useState<Record<string, TmaCheckResult>>({});
  const tmaCheckedRef = useRef<Record<string, string>>({}); // markerId → hash, undviker dubbelkoll
  const [tmaOpen, setTmaOpen] = useState<string | null>(null); // boundary-id för öppen panel
  const [tmaRisk, setTmaRisk] = useState<Record<string, (boolean | null)[]>>({}); // per boundary: 7 riskfrågor
  const [tmaWeather, setTmaWeather] = useState<SmhiWeather | null>(null);
  const [tmaSamrad, setTmaSamrad] = useState<Record<string, {
    fallare: string;
    tmaBil: boolean | null;
    checkboxes: boolean[];
    datum: string;
    kvitterad: boolean;
    kvitteradDatum: string;
  }>>({});

  // === BRANDRISK ===
  const [brandRisk, setBrandRisk] = useState<{
    status: 'idle' | 'loading' | 'done' | 'error';
    currentFwi: number;
    currentIdx: number;
  } | null>(null);
  const [brandOpen, setBrandOpen] = useState(false);
  const [brandEldningsforbud, setBrandEldningsforbud] = useState(false);
  const [brandSamrad, setBrandSamrad] = useState({
    beredskapsniva: 'normal' as 'normal' | 'hojd',
    atgarder: [] as string[],
    blotMarkUndantag: false,
    uppdragsgivareNamn: '',
    uppdragsgivareTel: '',
    kortider: '',
    datum: new Date().toISOString().slice(0, 16),
    kvitterad: false,
  });
  const [brandKontakter, setBrandKontakter] = useState({
    uppdragsgivareNamn: '', uppdragsgivareTel: '',
    forsakringsbolag: '', forsakringsnummer: '',
    raddningstjanstNamn: '', raddningstjanstTel: '',
  });
  const [brandTillbud, setBrandTillbud] = useState<{
    datum: string; beskrivning: string; atgard: string;
    lat: number; lon: number; photoData: string; rapporteradTill: string;
  }[]>([]);
  const [brandNewTillbud, setBrandNewTillbud] = useState({
    datum: new Date().toISOString().slice(0, 16),
    beskrivning: '', atgard: '', rapporteradTill: '', photoData: '',
  });
  const [brandEfterkontroll, setBrandEfterkontroll] = useState({
    datum: new Date().toISOString().slice(0, 16),
    noteringar: '', kvitterad: false,
  });
  const [brandBrandvakt, setBrandBrandvakt] = useState({
    namn: '', starttid: '', sluttid: '', noteringar: '',
  });
  const [brandUtrustning, setBrandUtrustning] = useState([false, false, false, false]);
  const [brandNearbyWater, setBrandNearbyWater] = useState<{ name: string; dist: number; lat: number; lon: number }[]>([]);
  const [brandNearbyFireStation, setBrandNearbyFireStation] = useState<{ name: string; dist: number; lat: number; lon: number }[]>([]);
  const [brandLarmTillfart, setBrandLarmTillfart] = useState('');
  const [brandLarmChecklista, setBrandLarmChecklista] = useState([false, false, false, false, false]);
  const brandLoadedRef = useRef(false);
  const [brandTestMode, setBrandTestMode] = useState<number | null>(null);

  // Hjälpare: alla TMA-resultat som har vägar (för rendering)
  const tmaWithRoads = Object.entries(tmaResults).filter(([, r]) => r.status === 'done' && r.roads.length > 0);

  // Trigga TMA-kontroll per boundary individuellt
  useEffect(() => {
    const boundaryMarkers = markers.filter(m => m.isLine && m.lineType === 'boundary' && m.path && m.path.length > 1);
    const currentIds = new Set(boundaryMarkers.map(m => String(m.id)));

    // Ta bort resultat för raderade boundaries
    setTmaResults(prev => {
      const next = { ...prev };
      let changed = false;
      for (const id of Object.keys(next)) {
        if (!currentIds.has(id)) {
          delete next[id];
          delete tmaCheckedRef.current[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    // Kolla varje boundary individuellt
    for (const bm of boundaryMarkers) {
      const bmId = String(bm.id);
      const hash = bmId + ':' + (bm.path?.length || 0);
      if (tmaCheckedRef.current[bmId] === hash) continue; // Redan kontrollerad
      tmaCheckedRef.current[bmId] = hash;

      console.log('[TMA] Kontrollerar boundary', bmId, 'pathLength:', bm.path?.length);

      // Sätt loading för denna boundary
      setTmaResults(prev => ({ ...prev, [bmId]: { status: 'loading', roads: [] } }));

      const path = bm.path!;
      checkBoundaryTma([path]).then(result => {
        console.log('[TMA] Resultat för', bmId, ':', result.roads.length, 'vägar');
        setTmaResults(prev => ({ ...prev, [bmId]: result }));
      });

      // Hämta väder från första boundaryn som kollas (om inte redan hämtat)
      if (!tmaWeather) {
        const midPt = path[Math.floor(path.length / 2)];
        const { lat: wLat, lon: wLon } = svgToLatLon(midPt.x, midPt.y);
        fetchSmhiWeather(wLat, wLon);
      }
    }
  }, [markers]);

  // === BRANDRISK: Hämta nearby vatten/brandstation när panelen öppnas ===
  useEffect(() => {
    if (activeCategory !== 'brandrisk') return;
    if (brandTestMode !== null) return;
    if (brandNearbyWater.length > 0 || brandNearbyFireStation.length > 0) return;
    fetchBrandNearby(mapCenter.lat, mapCenter.lng);
  }, [activeCategory, brandTestMode]);

  // === BRAND: Ladda sparad data från Supabase ===
  useEffect(() => {
    brandLoadedRef.current = false;
    if (!valtObjekt?.id) return;
    const loadBrand = async () => {
      const { data: samData } = await supabase.from('brand_samrad').select('*').eq('objekt_id', valtObjekt.id).maybeSingle();
      if (samData) {
        setBrandSamrad({
          beredskapsniva: samData.beredskapsniva || 'normal',
          atgarder: (samData.atgarder as string[]) || [],
          blotMarkUndantag: samData.blot_mark_undantag || false,
          uppdragsgivareNamn: samData.uppdragsgivare_namn || '',
          uppdragsgivareTel: samData.uppdragsgivare_tel || '',
          kortider: samData.kortider || '',
          datum: samData.datum ? new Date(samData.datum).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
          kvitterad: samData.kvitterad || false,
        });
      }
      const { data: kontData } = await supabase.from('brand_kontakter').select('*').eq('objekt_id', valtObjekt.id).maybeSingle();
      if (kontData) {
        setBrandKontakter({
          uppdragsgivareNamn: kontData.uppdragsgivare_namn || '',
          uppdragsgivareTel: kontData.uppdragsgivare_tel || '',
          forsakringsbolag: kontData.forsakringsbolag || '',
          forsakringsnummer: kontData.forsakringsnummer || '',
          raddningstjanstNamn: kontData.raddningstjanst_namn || '',
          raddningstjanstTel: kontData.raddningstjanst_tel || '',
        });
      }
      const { data: tillData } = await supabase.from('brand_tillbud').select('*').eq('objekt_id', valtObjekt.id).order('datum', { ascending: false });
      if (tillData) {
        setBrandTillbud(tillData.map(t => ({
          datum: t.datum || '', beskrivning: t.beskrivning || '', atgard: t.atgard || '',
          lat: t.lat || 0, lon: t.lon || 0, photoData: t.photo_data || '', rapporteradTill: t.rapporterad_till || '',
        })));
      }
      const { data: ekData } = await supabase.from('brand_efterkontroll').select('*').eq('objekt_id', valtObjekt.id).maybeSingle();
      if (ekData) {
        setBrandEfterkontroll({
          datum: ekData.datum ? new Date(ekData.datum).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
          noteringar: ekData.noteringar || '', kvitterad: ekData.kvitterad || false,
        });
      }
      const { data: bvData } = await supabase.from('brand_brandvakt').select('*').eq('objekt_id', valtObjekt.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (bvData) {
        setBrandBrandvakt({
          namn: bvData.namn || '', starttid: bvData.starttid || '', sluttid: bvData.sluttid || '', noteringar: bvData.noteringar || '',
        });
      }
      brandLoadedRef.current = true;
      console.log('[Brand] Laddade data från Supabase');
    };
    loadBrand();
  }, [valtObjekt?.id]);

  // === BRAND: Spara samråd + kontakter (debounced) ===
  const brandSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!valtObjekt?.id || !brandLoadedRef.current || brandTestMode !== null) return;
    if (brandSaveTimeoutRef.current) clearTimeout(brandSaveTimeoutRef.current);
    brandSaveTimeoutRef.current = setTimeout(async () => {
      await supabase.from('brand_samrad').upsert({
        objekt_id: valtObjekt.id,
        fwi_value: brandRisk?.currentFwi || null,
        beredskapsniva: brandSamrad.beredskapsniva,
        atgarder: brandSamrad.atgarder,
        blot_mark_undantag: brandSamrad.blotMarkUndantag,
        uppdragsgivare_namn: brandSamrad.uppdragsgivareNamn || null,
        uppdragsgivare_tel: brandSamrad.uppdragsgivareTel || null,
        kortider: brandSamrad.kortider || null,
        datum: brandSamrad.datum,
        kvitterad: brandSamrad.kvitterad,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'objekt_id' });
      await supabase.from('brand_kontakter').upsert({
        objekt_id: valtObjekt.id,
        uppdragsgivare_namn: brandKontakter.uppdragsgivareNamn || null,
        uppdragsgivare_tel: brandKontakter.uppdragsgivareTel || null,
        forsakringsbolag: brandKontakter.forsakringsbolag || null,
        forsakringsnummer: brandKontakter.forsakringsnummer || null,
        raddningstjanst_namn: brandKontakter.raddningstjanstNamn || null,
        raddningstjanst_tel: brandKontakter.raddningstjanstTel || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'objekt_id' });
      await supabase.from('brand_efterkontroll').upsert({
        objekt_id: valtObjekt.id,
        datum: brandEfterkontroll.datum,
        noteringar: brandEfterkontroll.noteringar || null,
        kvitterad: brandEfterkontroll.kvitterad,
      }, { onConflict: 'objekt_id' });
      console.log('[Brand] Sparade till Supabase');
    }, 2000);
    return () => { if (brandSaveTimeoutRef.current) clearTimeout(brandSaveTimeoutRef.current); };
  }, [brandSamrad, brandKontakter, brandEfterkontroll, valtObjekt?.id, brandTestMode]);

  // === TMA: Ladda sparad data från Supabase ===
  const tmaLoadedRef = useRef(false);
  useEffect(() => {
    tmaLoadedRef.current = false;
    if (!valtObjekt?.id) return;
    const loadTma = async () => {
      const { data, error } = await supabase
        .from('tma_assessments')
        .select('boundary_id, risk_answers, risk_level, samrad_data')
        .eq('objekt_id', valtObjekt.id);
      if (error) {
        console.error('[TMA] Kunde inte ladda från Supabase:', error);
        tmaLoadedRef.current = true;
        return;
      }
      if (data && data.length > 0) {
        const loadedRisk: Record<string, (boolean | null)[]> = {};
        const loadedSamrad: Record<string, { fallare: string; tmaBil: boolean | null; checkboxes: boolean[]; datum: string; kvitterad: boolean; kvitteradDatum: string }> = {};
        for (const row of data) {
          if (row.risk_answers) {
            loadedRisk[row.boundary_id] = row.risk_answers as (boolean | null)[];
          }
          if (row.samrad_data && typeof row.samrad_data === 'object') {
            const sd = row.samrad_data as any;
            loadedSamrad[row.boundary_id] = {
              fallare: sd.fallare || '',
              tmaBil: sd.tmaBil ?? null,
              checkboxes: sd.checkboxes || [false, false, false, false, false, false],
              datum: sd.datum || new Date().toISOString().split('T')[0],
              kvitterad: sd.kvitterad || false,
              kvitteradDatum: sd.kvitteradDatum || '',
            };
          }
        }
        if (Object.keys(loadedRisk).length > 0) setTmaRisk(loadedRisk);
        if (Object.keys(loadedSamrad).length > 0) setTmaSamrad(loadedSamrad);
        console.log('[TMA] Laddade', data.length, 'bedömningar från Supabase');
      }
      tmaLoadedRef.current = true;
    };
    loadTma();
  }, [valtObjekt?.id]);

  // === TMA: Spara till Supabase (debounced) ===
  const tmaSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!valtObjekt?.id || !tmaLoadedRef.current) return;
    if (tmaSaveTimeoutRef.current) clearTimeout(tmaSaveTimeoutRef.current);
    tmaSaveTimeoutRef.current = setTimeout(async () => {
      // Samla alla boundary-IDs som har risk eller samråd-data
      const allBoundaryIds = new Set([...Object.keys(tmaRisk), ...Object.keys(tmaSamrad)]);
      if (allBoundaryIds.size === 0) return;

      const rows = Array.from(allBoundaryIds).map(bmId => {
        const risk = tmaRisk[bmId] || [null, null, null, null, null, null, null];
        const samrad = tmaSamrad[bmId];
        const tmaResult = tmaResults[bmId];
        const mainRoad = tmaResult?.status === 'done' && tmaResult.roads.length > 0 ? tmaResult.roads[0] : null;

        // Beräkna risknivå
        const answeredCount = risk.filter(v => v !== null).length;
        const jaCount = risk.filter(v => v === true).length;
        const windBoost = risk[4] === true ? 1 : 0;
        const baseLevel = answeredCount < 7 ? null : (jaCount >= 3 || risk[1] === true) ? 'high' : jaCount >= 1 ? 'medium' : 'low';
        const riskLevel = baseLevel === null ? null : windBoost > 0 ? (baseLevel === 'low' ? 'medium' : baseLevel === 'medium' ? 'high' : 'high') : baseLevel;

        return {
          objekt_id: valtObjekt.id,
          boundary_id: bmId,
          road_name: mainRoad ? (mainRoad.ref ? `${mainRoad.ref} · ${mainRoad.name}` : mainRoad.name) : null,
          road_speed: mainRoad?.maxspeed || null,
          road_type: mainRoad?.type || null,
          distance_to_road: mainRoad?.distance || null,
          risk_answers: risk,
          risk_level: riskLevel,
          samrad_data: samrad || {},
          updated_at: new Date().toISOString(),
        };
      });

      const { error } = await supabase
        .from('tma_assessments')
        .upsert(rows, { onConflict: 'objekt_id,boundary_id' });
      if (error) {
        console.error('[TMA] Spara till Supabase fel:', error);
      } else {
        console.log('[TMA] Sparade', rows.length, 'bedömningar till Supabase');
      }
    }, 1500);
    return () => { if (tmaSaveTimeoutRef.current) clearTimeout(tmaSaveTimeoutRef.current); };
  }, [tmaRisk, tmaSamrad, tmaResults, valtObjekt?.id]);

  // Drag för meny
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  // Hämta sjukvård när nödläge-panelen öppnas
  useEffect(() => {
    if (activeCategory !== 'emergency') return;
    if (emergencyHealthcare !== null) return; // Redan hämtat/hämtar

    console.log('[Emergency] Panelen öppnad, hämtar sjukvård. mapCenter:', mapCenter);
    setEmergencyHealthcare([]); // [] = loading

    const lat = mapCenter.lat;
    const lon = mapCenter.lng;

    (async () => {
      try {
        // Sök node + way + relation, 80km för sjukhus, 30km för vårdcentraler
        const query = `[out:json][timeout:20];(
          nwr(around:80000,${lat},${lon})["amenity"="hospital"];
          nwr(around:80000,${lat},${lon})["healthcare"="hospital"];
          nwr(around:30000,${lat},${lon})["amenity"="clinic"];
          nwr(around:30000,${lat},${lon})["amenity"="doctors"];
          nwr(around:30000,${lat},${lon})["healthcare"="clinic"];
        );out center;`;
        const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
        console.log('[Emergency] Overpass URL:', url);
        const resp = await fetch(url);
        console.log('[Emergency] Overpass status:', resp.status);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        const elements = data.elements || [];
        console.log('[Emergency] Overpass returnerade', elements.length, 'element (rå)');
        elements.forEach((e: any) => {
          console.log('[Emergency]  -', e.type, e.tags?.name || '(inget namn)', 'amenity=' + (e.tags?.amenity || '–'), 'healthcare=' + (e.tags?.healthcare || '–'));
        });

        const toRad = (d: number) => d * Math.PI / 180;
        const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
          const dLat = toRad(lat2 - lat1);
          const dLon = toRad(lon2 - lon1);
          const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
          return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        };

        // Deduplicera på namn
        const seen = new Set<string>();
        const items = elements
          .filter((e: any) => e.tags?.name)
          .map((e: any) => {
            // way/relation har center-koordinater via "out center"
            const eLat = e.lat ?? e.center?.lat;
            const eLon = e.lon ?? e.center?.lon;
            const isHospital = e.tags.amenity === 'hospital' || e.tags.healthcare === 'hospital';
            return {
              name: e.tags.name as string,
              type: isHospital ? 'hospital' : 'clinic',
              lat: eLat as number,
              lon: eLon as number,
              dist: (eLat && eLon) ? Math.round(haversine(lat, lon, eLat, eLon)) : 9999,
            };
          })
          .filter((item: any) => {
            if (!item.lat || !item.lon) return false;
            if (seen.has(item.name)) return false;
            seen.add(item.name);
            return true;
          })
          .sort((a: any, b: any) => a.dist - b.dist);

        const hospitals = items.filter((i: any) => i.type === 'hospital').slice(0, 2);
        const clinics = items.filter((i: any) => i.type === 'clinic').slice(0, 2);
        console.log('[Emergency] Sjukhus:', hospitals);
        console.log('[Emergency] Vårdcentraler:', clinics);

        const result = [...hospitals, ...clinics];
        if (hospitals.length === 0) {
          console.warn('[Emergency] Inga sjukhus hittades! Lägger till fallback.');
          result.push({ name: 'Växjö centralsjukhus', type: 'hospital', lat: 56.8790, lon: 14.8059, dist: Math.round(haversine(lat, lon, 56.8790, 14.8059)) });
        }
        setEmergencyHealthcare(result);
      } catch (err) {
        console.error('[Emergency] Overpass fel:', err);
        setEmergencyHealthcare([
          { name: 'Ljungby lasarett', type: 'hospital', lat: 56.8333, lon: 13.9333, dist: 34 },
          { name: 'Växjö centralsjukhus', type: 'hospital', lat: 56.8790, lon: 14.8059, dist: 45 },
          { name: 'Alvesta vårdcentral', type: 'clinic', lat: 56.8990, lon: 14.5560, dist: 12 },
        ]);
      }
    })();
  }, [activeCategory]);

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
      'menu-info': (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
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
      'menu-emergency': (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" stroke="#ef4444" />
          <line x1="12" y1="7" x2="12" y2="17" stroke="#ef4444" strokeWidth="2.5" />
          <line x1="7" y1="12" x2="17" y2="12" stroke="#ef4444" strokeWidth="2.5" />
        </svg>
      ),
      'menu-brandrisk': (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <path d="M12 2C12 2 4 12 4 16C4 20 8 22 12 22C16 22 20 20 20 16C20 12 12 2 12 2Z" stroke="#ef4444" strokeWidth="1.5" fill="rgba(239,68,68,0.15)" />
          <path d="M12 22C12 22 9 19 9 16C9 13 12 10 12 10C12 10 15 13 15 16C15 19 12 22 12 22Z" fill="#ef4444" opacity="0.6" />
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
    { id: 'info', name: 'Info', desc: 'Objektinformation', icon: 'menu-info' },
    { id: 'settings', name: 'Inställningar', desc: 'Anpassa appen', icon: 'menu-settings' },
    { id: 'brandrisk', name: 'Brandrisk', desc: 'FWI, samråd, utrustning', icon: 'menu-brandrisk' },
    { id: 'emergency', name: 'Nödläge', desc: 'SOS, position, sjukvård', icon: 'menu-emergency' },
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

  // Inverskonvertering: SVG-koordinater till lat/lon
  const svgToLatLon = (x: number, y: number) => {
    const mPerDegLat = 111320;
    const mPerDegLon = 111320 * Math.cos(mapCenter.lat * Math.PI / 180);
    const dxMeters = x * scale;
    const dyMeters = -y * scale;
    const lon = mapCenter.lng + dxMeters / mPerDegLon;
    const lat = mapCenter.lat + dyMeters / mPerDegLat;
    return { lat, lon };
  };

  // Konvertera SVG-koordinater till skärmkoordinater via MapLibre-projektion
  const svgToScreen = (x: number, y: number): { x: number, y: number } | null => {
    const map = mapInstanceRef.current;
    if (!map) return null;
    try {
      const { lat, lon } = svgToLatLon(x, y);
      const pt = map.project([lon, lat]);
      return { x: pt.x, y: pt.y };
    } catch {
      return null;
    }
  };

  // Hämta aktuell MapLibre-zoom (för UI-beslut som storlek/synlighet)
  const getMapLibreZoom = (): number => {
    return mapInstanceRef.current?.getZoom() ?? mapZoom;
  };

  // === MapLibre: GeoJSON sync useEffects (placerade här, EFTER alla state-deklarationer, för att undvika TDZ) ===

  // 1) Synka linjer → MapLibre lines-source
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapLibreReady) return;
    try {
      const src = map.getSource('lines-source') as any;
      if (!src) return;
      const features: any[] = [];
      markers.filter(m => m.isLine && m.path && m.path.length > 1).forEach(m => {
        const coords = m.path.map((p: any) => {
          const ll = svgToLatLon(p.x, p.y);
          return [ll.lon, ll.lat];
        });
        features.push({
          type: 'Feature',
          properties: { lineType: m.lineType, id: m.id },
          geometry: { type: 'LineString', coordinates: coords },
        });
      });
      src.setData({ type: 'FeatureCollection', features });
    } catch (e) { /* source not ready */ }
  }, [markers, mapLibreReady, mapCenter, visibleLines]);

  // 2) Synka zoner → MapLibre zones-source
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapLibreReady) return;
    try {
      const src = map.getSource('zones-source') as any;
      if (!src) return;
      const features: any[] = [];
      markers.filter(m => m.isZone && m.path && m.path.length > 2).forEach(m => {
        const coords = m.path.map((p: any) => {
          const ll = svgToLatLon(p.x, p.y);
          return [ll.lon, ll.lat];
        });
        // Stäng polygon (om inte redan stängd)
        if (coords.length > 0) {
          const f = coords[0]; const l = coords[coords.length - 1];
          if (f[0] !== l[0] || f[1] !== l[1]) coords.push(coords[0]);
        }
        const zt = zoneTypes.find(z => z.id === m.zoneType);
        features.push({
          type: 'Feature',
          properties: { zoneType: m.zoneType, id: m.id, color: zt?.color || '#3b82f6' },
          geometry: { type: 'Polygon', coordinates: [coords] },
        });
      });
      src.setData({ type: 'FeatureCollection', features });
    } catch (e) { /* source not ready */ }
  }, [markers, mapLibreReady, mapCenter, visibleZones]);

  // 3) Synka TMA-vägar → MapLibre tma-roads-source + tma-warning-source
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapLibreReady) return;
    try {
      // === TMA vägar (röda linjer för närliggande vägar) ===
      const roadSrc = map.getSource('tma-roads-source') as any;
      if (roadSrc) {
        const roadFeatures: any[] = [];
        tmaWithRoads.forEach(([markerId, result]) => {
          result.roads.forEach((road: any, idx: number) => {
            // Använd nearbyGeom (vägsegment inom 50m av boundary)
            if (road.nearbyGeom && road.nearbyGeom.length >= 2) {
              roadFeatures.push({
                type: 'Feature',
                properties: { markerId, roadIndex: idx, category: road.category || 'enskild' },
                geometry: { type: 'LineString', coordinates: road.nearbyGeom.map((p: any) => [p.lon, p.lat]) },
              });
            }
          });
        });
        roadSrc.setData({ type: 'FeatureCollection', features: roadFeatures });
      }

      // === TMA varningslinjer (traktgränssegment nära vägar – pulserande rött) ===
      const warnSrc = map.getSource('tma-warning-source') as any;
      if (warnSrc) {
        const warnFeatures: any[] = [];
        tmaWithRoads.forEach(([markerId, result]) => {
          // Hitta boundary-markern
          const bm = markers.find(m => String(m.id) === markerId);
          if (!bm || !bm.path || bm.path.length < 2) return;

          // Konvertera boundary-path till lnglat
          const bCoords: [number, number][] = bm.path.map((p: any) => {
            const ll = svgToLatLon(p.x, p.y);
            return [ll.lon, ll.lat] as [number, number];
          });

          // Samla alla road nearbyGeom-punkter för denna boundary
          const roadPoints: { lat: number; lon: number }[] = [];
          result.roads.forEach((road: any) => {
            if (road.nearbyGeom) roadPoints.push(...road.nearbyGeom);
          });
          if (roadPoints.length === 0) return;

          // Markera boundary-punkter nära vägen (< 80m)
          const nearMask = bCoords.map(([lon, lat]) => {
            return roadPoints.some(rp => {
              const dlat = (lat - rp.lat) * 111000;
              const dlon = (lon - rp.lon) * 111000 * Math.cos(lat * Math.PI / 180);
              return Math.sqrt(dlat * dlat + dlon * dlon) < 80;
            });
          });

          // Extrahera sammanhängande nära-väg-segment av boundary
          let segment: [number, number][] = [];
          for (let i = 0; i < bCoords.length; i++) {
            if (nearMask[i]) {
              segment.push(bCoords[i]);
            } else {
              if (segment.length >= 2) {
                warnFeatures.push({
                  type: 'Feature',
                  properties: { markerId },
                  geometry: { type: 'LineString', coordinates: segment },
                });
              }
              segment = [];
            }
          }
          if (segment.length >= 2) {
            warnFeatures.push({
              type: 'Feature',
              properties: { markerId },
              geometry: { type: 'LineString', coordinates: segment },
            });
          }
        });
        warnSrc.setData({ type: 'FeatureCollection', features: warnFeatures });
      }
    } catch (e) { /* source not ready */ }
  }, [tmaWithRoads, markers, mapLibreReady]);

  // 3b) TMA varningslinje – pulserande animation (glow oscillation)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapLibreReady || tmaWithRoads.length === 0) return;
    let frame: number;
    let t = 0;
    const animate = () => {
      t += 0.04;
      const opacity = 0.25 + 0.35 * Math.sin(t); // oscillerar 0.25–0.60
      try {
        if (map.getLayer('tma-warning-glow')) {
          map.setPaintProperty('tma-warning-glow', 'line-opacity', Math.max(0, opacity));
        }
      } catch { /* layer not ready */ }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [tmaWithRoads.length, mapLibreReady]);

  // 3c) TMA varningslinje – klickbar → öppna TMA-panel
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapLibreReady) return;
    const onClick = (e: any) => {
      if (e.features && e.features.length > 0) {
        const bmId = e.features[0].properties.markerId;
        if (bmId) setTmaOpen(bmId);
      }
    };
    map.on('click', 'tma-warning-hitbox', onClick);
    // Cursor pointer på hover
    const onEnter = () => { map.getCanvas().style.cursor = 'pointer'; };
    const onLeave = () => { map.getCanvas().style.cursor = ''; };
    map.on('mouseenter', 'tma-warning-hitbox', onEnter);
    map.on('mouseleave', 'tma-warning-hitbox', onLeave);
    return () => {
      map.off('click', 'tma-warning-hitbox', onClick);
      map.off('mouseenter', 'tma-warning-hitbox', onEnter);
      map.off('mouseleave', 'tma-warning-hitbox', onLeave);
    };
  }, [mapLibreReady]);

  // 4) Synka layer-visibility → MapLibre
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapLibreReady) return;
    const safeSetVisibility = (layerId: string, vis: string) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', vis);
      }
    };
    try {
      // Line layers per type
      const lineTypeIds = ['boundary', 'mainRoad', 'backRoadRed', 'backRoadYellow', 'backRoadBlue', 'sideRoadRed', 'sideRoadYellow', 'sideRoadBlue', 'stickvag', 'nature', 'ditch', 'trail'];
      const stripedTypeIds = ['boundary', 'mainRoad', 'nature', 'ditch'];
      lineTypeIds.forEach(id => {
        const vis = visibleLayers.lines && visibleLines[id] ? 'visible' : 'none';
        safeSetVisibility(`line-${id}-base`, vis);
        if (stripedTypeIds.includes(id)) {
          safeSetVisibility(`line-${id}-stripe`, vis);
        }
      });
      // Line hitbox
      safeSetVisibility('line-hitbox', visibleLayers.lines ? 'visible' : 'none');
      // Zone layers
      const zoneVis = visibleLayers.zones ? 'visible' : 'none';
      safeSetVisibility('zone-fill', zoneVis);
      safeSetVisibility('zone-outline', zoneVis);
      safeSetVisibility('zone-outline-dash', zoneVis);
      // TMA roads (actual layer names: tma-roads-glow, tma-roads-line)
      const tmaVis = visibleLayers.lines ? 'visible' : 'none';
      safeSetVisibility('tma-roads-glow', tmaVis);
      safeSetVisibility('tma-roads-line', tmaVis);
    } catch (e) { /* map not ready */ }
  }, [visibleLayers, visibleLines, visibleZones, mapLibreReady]);

  // Klassificera vägtyp: allmän, kan vara allmän, eller enskild
  const getRoadCategory = (highway: string): 'allman' | 'kan_vara_allman' | 'enskild' => {
    switch (highway) {
      case 'motorway': case 'motorway_link':
      case 'trunk': case 'trunk_link':
      case 'primary': case 'primary_link':
      case 'secondary': case 'secondary_link':
      case 'tertiary': case 'tertiary_link':
        return 'allman';
      case 'residential':
      case 'unclassified':
        return 'kan_vara_allman';
      case 'track': case 'service': case 'path':
      default:
        return 'enskild';
    }
  };

  // Avstånd vägkant → välta (meter), baserat på hastighetsgräns
  const getEdgeDistance = (speed: number): number => {
    if (speed <= 50) return 2;
    if (speed <= 80) return 3;
    if (speed === 90) return 7;
    if (speed === 100) return 8;
    return 9; // 110+
  };

  // Avstånd till korsning/krön/kurva (meter), baserat på hastighetsgräns
  const getIntersectionDistance = (speed: number): number => {
    const table: Record<number, number> = { 30: 35, 40: 60, 50: 80, 60: 100, 70: 130, 80: 160, 90: 190, 100: 220, 110: 250 };
    // Hitta närmaste uppåt
    const speeds = [30, 40, 50, 60, 70, 80, 90, 100, 110];
    for (const s of speeds) { if (speed <= s) return table[s]; }
    return 250;
  };

  // Haversine-avstånd mellan två punkter (meter)
  const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // Asynkron vägkontroll via Overpass API
  const checkRoadSafety = async (lat: number, lon: number): Promise<RoadCheckResult> => {
    try {
      // Hämta vägar + korsningsnoder inom 250m (max siktavstånd)
      const query = `[out:json][timeout:10];(way(around:50,${lat},${lon})["highway"];node(around:250,${lat},${lon})["highway"="crossing"];node(around:250,${lat},${lon})["railway"="level_crossing"];);out body geom;`;
      const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      const ways = (data.elements || []).filter((e: any) => e.type === 'way');
      const nodes = (data.elements || []).filter((e: any) => e.type === 'node');

      if (ways.length === 0) {
        return { status: 'ok', tillstand: 'ej_sokt', message: 'Ingen väg hittad inom 50m' };
      }

      // Hitta närmaste väg (baserat på taggarna, inte avstånd)
      // Prioritera allmän > kan vara allmän > enskild
      let bestWay: any = null;
      let bestCategory: 'allman' | 'kan_vara_allman' | 'enskild' = 'enskild';
      const categoryPriority = { allman: 0, kan_vara_allman: 1, enskild: 2 };

      for (const way of ways) {
        const tags = way.tags || {};
        const cat = getRoadCategory(tags.highway || '');
        if (!bestWay || categoryPriority[cat] < categoryPriority[bestCategory]) {
          bestWay = way;
          bestCategory = cat;
        }
      }

      if (!bestWay) {
        return { status: 'ok', tillstand: 'ej_sokt', message: 'Ingen väg hittad inom 50m' };
      }

      const tags = bestWay.tags || {};
      const nearestRoad: RoadCheckResult['nearestRoad'] = {
        name: tags.name || tags.ref || 'Namnlös väg',
        type: tags.highway || 'unknown',
        maxspeed: tags.maxspeed ? parseInt(tags.maxspeed) : undefined,
        ref: tags.ref,
      };
      const category = bestCategory;

      // Kolla korsningar i närheten
      let nearbyIntersection: RoadCheckResult['nearbyIntersection'] | undefined;
      if (category !== 'enskild') {
        // Kolla crossing/level_crossing-noder
        for (const node of nodes) {
          if (node.lat && node.lon) {
            const dist = Math.round(haversineDistance(lat, lon, node.lat, node.lon));
            const requiredDist = getIntersectionDistance(nearestRoad.maxspeed || 70);
            if (dist < requiredDist && (!nearbyIntersection || dist < nearbyIntersection.distance)) {
              nearbyIntersection = { distance: dist };
            }
          }
        }

        // Kolla om flera vägar korsar varandra (förenklad: >1 unika vägtyper/namn)
        if (!nearbyIntersection && ways.length > 1) {
          const uniqueNames = new Set(ways.map((w: any) => (w.tags?.name || w.tags?.ref || w.id)));
          if (uniqueNames.size > 1) {
            nearbyIntersection = { distance: 0 }; // Korsning vid avlägget
          }
        }
      }

      let status: RoadCheckResult['status'] = 'ok';
      let message: string;

      if (category === 'enskild') {
        message = 'Enskild väg';
      } else if (category === 'kan_vara_allman') {
        status = 'warning';
        message = 'Kontrollera om vägen är allmän';
      } else {
        status = 'warning';
        message = 'Allmän väg – tillstånd krävs';
      }

      return {
        status,
        nearestRoad,
        roadCategory: category,
        tillstand: 'ej_sokt',
        checklist: new Array(11).fill(false),
        nearbyIntersection,
        message,
      };
    } catch (err) {
      return { status: 'error', tillstand: 'ej_sokt', message: 'Kunde inte hämta vägdata' };
    }
  };

  // Klassificera om väg kräver TMA skyddsklassad (proxy för ÅDT > 2000)
  const isTmaSkyddsklassad = (highway: string, maxspeed?: number): boolean => {
    // Riksvägar och europavägar alltid skyddsklassade
    if (['motorway', 'motorway_link', 'trunk', 'trunk_link'].includes(highway)) return true;
    // Primary (riksväg/länsväg) med hög hastighet
    if (['primary', 'primary_link'].includes(highway)) return true;
    // Secondary med ≥70 km/h som proxy för ÅDT > 2000
    if (['secondary', 'secondary_link'].includes(highway) && (maxspeed || 70) >= 70) return true;
    return false;
  };

  // Hämta väder från SMHI öppna API
  const fetchSmhiWeather = async (lat: number, lon: number) => {
    setTmaWeather({ status: 'loading' });
    try {
      const roundedLon = Math.round(lon * 1000000) / 1000000;
      const roundedLat = Math.round(lat * 1000000) / 1000000;
      const url = `https://opendata-download-metfcst.smhi.se/api/category/pmp3g/version/2/geotype/point/lon/${roundedLon}/lat/${roundedLat}/data.json`;
      console.log('[SMHI] Fetching:', url);
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      // Hitta närmaste tidsserie (första är den mest aktuella prognosen)
      const ts = data.timeSeries?.[0];
      if (!ts) throw new Error('Ingen tidsserie');

      const getParam = (name: string) => {
        const p = ts.parameters?.find((p: any) => p.name === name);
        return p?.values?.[0];
      };

      const temp = getParam('t');        // °C
      const ws = getParam('ws');          // m/s
      const wd = getParam('wd');          // grader
      const pcat = getParam('pcat');      // nederbördskategori

      // Vindriktning till text och pil
      const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      const arrows = ['↓', '↙', '←', '↖', '↑', '↗', '→', '↘'];
      const dirIdx = wd != null ? Math.round(wd / 45) % 8 : 0;
      const dirLabel = wd != null ? dirs[dirIdx] : '';
      const arrow = wd != null ? arrows[dirIdx] : '';

      // Nederbördstext
      const precipLabels: Record<number, string> = { 0: '', 1: 'Snö', 2: 'Snöblandat regn', 3: 'Regn', 4: 'Duggregn', 5: 'Hagel', 6: 'Regn & åska' };
      const precipLabel = pcat != null ? (precipLabels[pcat] || '') : '';

      console.log('[SMHI] Resultat:', { temp, ws, wd, pcat, dirLabel, arrow, precipLabel });

      setTmaWeather({
        status: 'done',
        temp, windSpeed: ws, windDir: wd,
        windDirLabel: dirLabel, windArrow: arrow,
        precip: pcat, precipLabel,
      });
    } catch (err) {
      console.error('[SMHI] Fel:', err);
      setTmaWeather({ status: 'error' });
    }
  };

  // Beräkna förenklat FWI från SMHI-parametrar
  // Hämta närmaste vatten och brandstationer
  const fetchBrandNearby = async (lat: number, lon: number) => {
    // Vatten
    try {
      const wQuery = `[out:json][timeout:10];(nwr(around:5000,${lat},${lon})["natural"="water"];nwr(around:5000,${lat},${lon})["waterway"~"stream|river"];);out center 10;`;
      const wResp = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(wQuery) });
      const wData = await wResp.json();
      const waters = (wData.elements || [])
        .map((e: any) => {
          const eLat = e.lat ?? e.center?.lat;
          const eLon = e.lon ?? e.center?.lon;
          if (!eLat || !eLon) return null;
          const name = e.tags?.name || (e.tags?.waterway === 'river' ? 'Å/älv' : e.tags?.waterway === 'stream' ? 'Bäck' : 'Vatten');
          const R = 6371000;
          const dLat = (eLat - lat) * Math.PI / 180;
          const dLon = (eLon - lon) * Math.PI / 180;
          const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(eLat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
          const dist = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
          return { name, dist, lat: eLat, lon: eLon };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.dist - b.dist)
        .slice(0, 3);
      setBrandNearbyWater(waters);
    } catch (e) { console.error('[Brand] Vatten-fel:', e); }

    // Brandstationer
    try {
      const fQuery = `[out:json][timeout:10];nwr(around:30000,${lat},${lon})["amenity"="fire_station"];out center 10;`;
      const fResp = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(fQuery) });
      const fData = await fResp.json();
      const stations = (fData.elements || [])
        .map((e: any) => {
          const eLat = e.lat ?? e.center?.lat;
          const eLon = e.lon ?? e.center?.lon;
          if (!eLat || !eLon) return null;
          const name = e.tags?.name || 'Brandstation';
          const R = 6371000;
          const dLat = (eLat - lat) * Math.PI / 180;
          const dLon = (eLon - lon) * Math.PI / 180;
          const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(eLat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
          const dist = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
          return { name, dist, lat: eLat, lon: eLon };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.dist - b.dist)
        .slice(0, 3);
      setBrandNearbyFireStation(stations);
    } catch (e) { console.error('[Brand] Brandstation-fel:', e); }
  };

  // Kontrollera traktgränsens närhet till vägar (TMA-analys)
  const checkBoundaryTma = async (boundaryPaths: Point[][]): Promise<TmaCheckResult> => {
    try {
      console.log('[TMA] checkBoundaryTma anropad med', boundaryPaths.length, 'linjer, totalt', boundaryPaths.reduce((s, p) => s + p.length, 0), 'punkter');
      // Sampla punkter längs traktgränserna (var 10:e punkt, max 20 per linje)
      const samplePoints: { lat: number; lon: number }[] = [];
      for (const path of boundaryPaths) {
        const step = Math.max(1, Math.floor(path.length / 20));
        for (let i = 0; i < path.length; i += step) {
          const { lat, lon } = svgToLatLon(path[i].x, path[i].y);
          samplePoints.push({ lat, lon });
        }
      }

      console.log('[TMA] Samplade', samplePoints.length, 'punkter. Första:', samplePoints[0], 'mapCenter:', mapCenter);

      if (samplePoints.length === 0) {
        return { status: 'done', roads: [], message: 'Inga traktgränser att kontrollera' };
      }

      // Beräkna bounding box med 100m marginal
      let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
      for (const p of samplePoints) {
        minLat = Math.min(minLat, p.lat);
        maxLat = Math.max(maxLat, p.lat);
        minLon = Math.min(minLon, p.lon);
        maxLon = Math.max(maxLon, p.lon);
      }
      // 100m marginal ≈ 0.001° lat, 0.002° lon vid ~57°N
      minLat -= 0.001; maxLat += 0.001;
      minLon -= 0.002; maxLon += 0.002;

      console.log('[TMA] Bounding box:', { minLat, maxLat, minLon, maxLon });

      // Hämta ALLA vägar inom bounding box (ofiltrerat för debug)
      const query = `[out:json][timeout:15];way(${minLat},${minLon},${maxLat},${maxLon})["highway"];out body geom;`;
      const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
      console.log('[TMA] Overpass URL:', url);
      const response = await fetch(url);
      console.log('[TMA] Overpass response status:', response.status);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      const allWays = (data.elements || []).filter((e: any) => e.type === 'way');
      console.log('[TMA] === ALLA VÄGAR FRÅN OVERPASS (' + allWays.length + ' st) ===');
      allWays.forEach((w: any, i: number) => {
        const t = w.tags || {};
        console.log(`[TMA]  ${i + 1}. highway=${t.highway} | name=${t.name || '–'} | ref=${t.ref || '–'} | maxspeed=${t.maxspeed || '–'} | surface=${t.surface || '–'} | id=${w.id}`);
      });

      // Filtrera: behåll bara trunk, primary, secondary, tertiary (+ _link)
      const relevantTypes = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link']);
      const ways = allWays.filter((w: any) => relevantTypes.has(w.tags?.highway || ''));
      console.log('[TMA] Efter filter:', ways.length, 'relevanta vägar av', allWays.length);

      if (ways.length === 0) {
        return { status: 'done', roads: [], message: 'Inga relevanta vägar i närheten' };
      }

      // Beräkna avstånd från varje boundary-punkt till varje väg
      const roadHits: Map<number, TmaRoadHit> = new Map();

      for (const way of ways) {
        const tags = way.tags || {};
        const highway = tags.highway || '';
        const category = getRoadCategory(highway);

        const geom: { lat: number; lon: number }[] = way.geometry || [];
        if (geom.length < 2) continue;

        // Per-segment: beräkna min avstånd till traktgräns
        let minDist = Infinity;
        let closestPt: { lat: number; lon: number } = geom[0];
        const nearbyPts: { lat: number; lon: number }[] = [];
        const nearbySet = new Set<number>(); // index av noder nära

        for (let i = 0; i < geom.length - 1; i++) {
          const a = geom[i];
          const b = geom[i + 1];
          let segMin = Infinity;
          for (const sp of samplePoints) {
            const dist = pointToSegmentDistance(sp.lat, sp.lon, a.lat, a.lon, b.lat, b.lon);
            if (dist < segMin) segMin = dist;
            if (dist < minDist) {
              minDist = dist;
              // Beräkna närmaste punkt på segmentet
              const t = Math.max(0, Math.min(1, ((sp.lat - a.lat) * (b.lat - a.lat) + (sp.lon - a.lon) * (b.lon - a.lon)) / ((b.lat - a.lat) ** 2 + (b.lon - a.lon) ** 2 || 1)));
              closestPt = { lat: a.lat + t * (b.lat - a.lat), lon: a.lon + t * (b.lon - a.lon) };
            }
          }
          if (segMin < 50) {
            nearbySet.add(i);
            nearbySet.add(i + 1);
          }
        }

        // Bygg sammanhängande segment av noder inom 50m
        const nearbyGeom: { lat: number; lon: number }[] = [];
        for (let i = 0; i < geom.length; i++) {
          if (nearbySet.has(i)) nearbyGeom.push(geom[i]);
        }

        if (minDist < 200) {
          const maxspeed = tags.maxspeed ? parseInt(tags.maxspeed) : undefined;
          const existing = roadHits.get(way.id);
          if (!existing || minDist < existing.distance) {
            roadHits.set(way.id, {
              name: tags.name || tags.ref || 'Namnlös väg',
              type: highway,
              maxspeed,
              ref: tags.ref,
              distance: Math.round(minDist),
              category,
              skyddsklassad: isTmaSkyddsklassad(highway, maxspeed),
              nearbyGeom: nearbyGeom.length >= 2 ? nearbyGeom : undefined,
              closestPoint: closestPt,
            });
          }
        }
      }

      const roads = Array.from(roadHits.values()).sort((a, b) => a.distance - b.distance);
      console.log('[TMA] === VÄGDETALJER ===');
      roads.forEach((r, i) => {
        console.log(`[TMA] Väg ${i + 1}: ${r.ref || ''} ${r.name} | typ: ${r.type} | hastighet: ${r.maxspeed || 'okänd'} km/h | avstånd: ${r.distance}m | kategori: ${r.category} | skyddsklassad: ${r.skyddsklassad}`);
      });
      return { status: 'done', roads };
    } catch (err) {
      console.error('[TMA] FEL:', err);
      return { status: 'error', roads: [], message: 'Kunde inte hämta vägdata för TMA-kontroll' };
    }
  };

  // Punkt-till-segment avstånd (haversine-baserat, i meter)
  const pointToSegmentDistance = (pLat: number, pLon: number, aLat: number, aLon: number, bLat: number, bLon: number): number => {
    // Projicera punkt P på linje AB
    const dAB = haversineDistance(aLat, aLon, bLat, bLon);
    if (dAB < 0.1) return haversineDistance(pLat, pLon, aLat, aLon); // Punkter sammanfaller

    const dAP = haversineDistance(aLat, aLon, pLat, pLon);
    const dBP = haversineDistance(bLat, bLon, pLat, pLon);

    // Enkel projicering: kolla om punkten projicerar innanför segmentet
    const t = Math.max(0, Math.min(1, ((pLat - aLat) * (bLat - aLat) + (pLon - aLon) * (bLon - aLon)) / ((bLat - aLat) ** 2 + (bLon - aLon) ** 2 || 1)));
    const projLat = aLat + t * (bLat - aLat);
    const projLon = aLon + t * (bLon - aLon);
    const dProj = haversineDistance(pLat, pLon, projLat, projLon);

    return Math.min(dAP, dBP, dProj);
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
    if (!point || !path || path.length === 0) {
      return { distance: Infinity, closestPoint: { x: 0, y: 0 } };
    }
    
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
    if (!pos || pos.x === undefined || pos.y === undefined) return null;
    
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
    gpsLineTypeRef.current = lineType;
    setGpsPath([]);
    gpsPathRef.current = [];
    // Behåll gpsStartPos om vi redan har en (från continueWithColor)
    if (!gpsStartPos) {
      setGpsStartPos(null);
    }
    setGpsPaused(false);
    gpsPausedRef.current = false; // Viktigt! Nollställ paus
    setMenuOpen(false);
    setMenuHeight(0);
    
    // Kolla om det är en stickväg och om det finns tidigare stickvägar
    const isStickväg = ['sideRoadRed', 'sideRoadYellow', 'sideRoadBlue'].includes(lineType);
    if (isStickväg) {
      // Hitta alla stickvägar (inte backvägar)
      const previousStickvägar = markers.filter(m => 
        m.isLine && ['sideRoadRed', 'sideRoadYellow', 'sideRoadBlue'].includes(m.lineType)
      );
      
      // Aktivera ALLTID stickvagMode för stickvägar
      setStickvagMode(true);
      setStickvagOversikt(false);
      setStickvagWarningShown(false);
      
      // Sätt referens till föregående väg om det finns
      if (!previousStickvagRef.current && previousStickvägar.length > 0) {
        previousStickvagRef.current = previousStickvägar[previousStickvägar.length - 1];
      }
    }
    
    // Om GPS redan är igång, använd den
    if (isTracking && watchIdRef.current) {
      if (currentPosition) {
        // Vi har en position - sätt startposition till nuvarande
        const startX = gpsMapPositionRef.current.x;
        const startY = gpsMapPositionRef.current.y;
        setGpsStartPos({ 
          lat: currentPosition.lat, 
          lon: currentPosition.lon, 
          x: startX, 
          y: startY 
        });
        const firstPoint = { x: startX, y: startY };
        gpsPathRef.current = [firstPoint];
        setGpsPath([firstPoint]);
        lastConfirmedPosRef.current = firstPoint;
        gpsHistoryRef.current = [firstPoint];
      }
      // GPS körs redan, vänta på första positionen i befintlig callback
      return;
    }
    
    // Annars starta GPS
    setIsTracking(true);
    
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const newPos = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        const accuracy = pos.coords.accuracy; // meter
        
        // Ignorera osäkra positioner (över 10 meter för bättre kvalitet)
        if (accuracy > 10) return;
        
        setCurrentPosition(newPos);
        setGpsPosition({ lat: newPos.lat, lng: newPos.lon });
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
          
          // Lägg till i historik för medelvärde (max 20 punkter för jämnare resultat)
          gpsHistoryRef.current = [...gpsHistoryRef.current.slice(-19), rawMapPos];
          
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
                const minLinePixels = 2 / scale; // 2 meter i pixlar
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
      { enableHighAccuracy: true, maximumAge: 500, timeout: 10000 }
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
    gpsLineTypeRef.current = null;
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
    const currentLineType = gpsLineType || gpsLineTypeRef.current;
    
    if (gpsPathRef.current.length > 1 && currentLineType) {
      saveToHistory([...markers]);
      const newLine = {
        id: Date.now(),
        lineType: currentLineType,
        path: [...gpsPathRef.current],
        isLine: true,
        gpsRecorded: true,
      };
      setMarkers(prev => [...prev, newLine]);
      const lineType = lineTypes.find(t => t.id === currentLineType);
      setSavedVagColor(lineType?.color || '#fff');
      
      // Sätt den sparade linjen som referens för nästa spårning
      previousStickvagRef.current = newLine;
    }
    
    // Nollställ spårning MEN BEHÅLL GPS-position
    setGpsLineType(null);
    gpsLineTypeRef.current = null;
    setGpsPath([]);
    gpsPathRef.current = [];
    // VIKTIGT: Behåll gpsStartPos och gpsMapPosition så positionen inte hoppar
    setGpsPaused(false);
    gpsPausedRef.current = false;
    
    // Visa popup - håll stickvagMode aktiv
    setStickvagMode(true);
    setShowSavedPopup(true);
  };

  // Fortsätt snitslande med vald färg
  const continueWithColor = (colorId: string) => {
    const colorMap: Record<string, string> = {
      'rod': 'sideRoadRed',
      'gul': 'sideRoadYellow',
      'bla': 'sideRoadBlue',
    };
    setLastUsedColorId(colorId); // Spara senast använda färgen
    setShowSavedPopup(false);
    startGpsTracking(colorMap[colorId] || 'sideRoadRed');
    setStickvagMode(true);
    // previousStickvagRef är redan satt från saveAndShowPopup
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
      gpsLineTypeRef.current = null;
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
            
            // Ignorera osäkra positioner (över 10 meter för bättre kvalitet)
            if (accuracy > 10) return;
            
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
                
                // Lägg till punkt i linjespårning om aktiv
                if (gpsLineTypeRef.current && !gpsPausedRef.current) {
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
                    const minLinePixels = 2 / scale; // 2 meter
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
          { enableHighAccuracy: true, maximumAge: 500, timeout: 10000 }
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
    deleteMarkerFromDb(id);
  };

  // Drag & drop för symboler
  const handleMarkerDragStart = (e, marker) => {
    // I översiktsläge: visa info istället för drag
    if (stickvagOversikt) {
      e.stopPropagation();
      if (marker.isMarker || marker.isZone) {
        setSelectedOversiktItem(marker);
        setSelectedOversiktVag(null);
      } else if (marker.isLine && ['sideRoadRed', 'sideRoadYellow', 'sideRoadBlue'].includes(marker.lineType || '')) {
        setSelectedOversiktVag(marker);
        setSelectedOversiktItem(null);
      }
      return;
    }
    
    // Vibrera kort för feedback
    if (navigator.vibrate) {
      navigator.vibrate(20);
    }
    
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
    draggingMarkerRef.current = marker.id;
    setDragStart({ x: clientX, y: clientY });
    dragStartRef.current = { x: clientX, y: clientY };
    setHasMoved(false);
    hasMovedRef.current = false;
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
        saveToHistory([...markers]);
        setHasMoved(true);
      }

      // Konvertera skärmposition → lat/lng → SVG-koordinater via MapLibre
      const map = mapInstanceRef.current;
      if (map) {
        const mapRect = map.getCanvas().getBoundingClientRect();
        const lngLat = map.unproject([clientX - mapRect.left, clientY - mapRect.top]);
        const svgPos = latLonToSvg(lngLat.lat, lngLat.lng);
        setMarkers(prev => prev.map(m =>
          m.id === draggingMarker ? { ...m, x: svgPos.x, y: svgPos.y } : m
        ));
      }
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
    } else {
      // Symbolen flyttades - bekräfta med vibration
      if (navigator.vibrate) {
        navigator.vibrate([20, 50, 20]); // Dubbel-vibration
      }
    }
  };
  
  // Rotera pil genom att dra
  const startRotatingArrow = (arrowId, centerX, centerY) => {
    saveToHistory([...markers]);
    setRotatingArrow(arrowId);
    rotatingArrowRef.current = arrowId;
    setRotationCenter({ x: centerX, y: centerY });
    rotationCenterRef.current = { x: centerX, y: centerY };
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
    rotatingArrowRef.current = null;
  };

  // === Document-level event listeners for marker drag and arrow rotation ===
  useEffect(() => {
    if (!draggingMarker && !rotatingArrow) return;

    const onMove = (e: MouseEvent | TouchEvent) => {
      const map = mapInstanceRef.current;
      if (!map) return;
      const clientX = 'touches' in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;

      if (draggingMarkerRef.current) {
        const dx = Math.abs(clientX - dragStartRef.current.x);
        const dy = Math.abs(clientY - dragStartRef.current.y);
        if (dx > 5 || dy > 5) {
          if (!hasMovedRef.current) {
            saveToHistory([...markers]);
            hasMovedRef.current = true;
            setHasMoved(true);
          }
          const mapRect = map.getCanvas().getBoundingClientRect();
          const lngLat = map.unproject([clientX - mapRect.left, clientY - mapRect.top]);
          const svgPos = latLonToSvg(lngLat.lat, lngLat.lng);
          setMarkers((prev: any[]) => prev.map(m =>
            m.id === draggingMarkerRef.current ? { ...m, x: svgPos.x, y: svgPos.y } : m
          ));
        }
      }

      if (rotatingArrowRef.current) {
        const rc = rotationCenterRef.current;
        const screenPos = svgToScreen(rc.x, rc.y);
        if (screenPos) {
          const dxr = clientX - screenPos.x;
          const dyr = clientY - screenPos.y;
          let angle = Math.atan2(dxr, -dyr) * (180 / Math.PI);
          if (angle < 0) angle += 360;
          angle = Math.round(angle / 15) * 15;
          setMarkers((prev: any[]) => prev.map(m =>
            m.id === rotatingArrowRef.current ? { ...m, rotation: angle } : m
          ));
        }
      }
    };

    const onUp = () => {
      if (draggingMarkerRef.current) {
        const markerId = draggingMarkerRef.current;
        const moved = hasMovedRef.current;
        setDraggingMarker(null);
        draggingMarkerRef.current = null;
        setHasMoved(false);
        hasMovedRef.current = false;
        if (!moved) {
          justEndedDrag.current = true;
          setMarkerMenuOpen(markerId);
          setTimeout(() => { justEndedDrag.current = false; }, 100);
        } else if (navigator.vibrate) {
          navigator.vibrate([20, 50, 20]);
        }
      }
      if (rotatingArrowRef.current) {
        setRotatingArrow(null);
        rotatingArrowRef.current = null;
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);

    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    };
  }, [draggingMarker, rotatingArrow]); // eslint-disable-line react-hooks/exhaustive-deps

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
    
    // I översiktsläge: visa info istället för meny
    if (stickvagOversikt) {
      if (marker.isMarker || marker.isZone) {
        setSelectedOversiktItem(marker);
        setSelectedOversiktVag(null);
      } else if (marker.isLine && ['sideRoadRed', 'sideRoadYellow', 'sideRoadBlue'].includes(marker.lineType || '')) {
        setSelectedOversiktVag(marker);
        setSelectedOversiktItem(null);
      }
      return;
    }
    
    if (markerMenuOpen === marker.id) {
      setMarkerMenuOpen(null);
    } else {
      setMarkerMenuOpen(marker.id);
    }
  };

  // === KARTA INTERAKTION ===
  const handleMapClick = (e) => {
    // I översiktsläge: stäng paneler vid klick på tom yta
    if (stickvagOversikt) {
      setSelectedOversiktVag(null);
      setSelectedOversiktItem(null);
      return;
    }
    
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

      // Automatisk vägkontroll för avlägg
      if (selectedSymbol === 'landing') {
        const { lat, lon } = svgToLatLon(x, y);
        newMarker.roadCheck = { status: 'loading', tillstand: 'ej_sokt' };
        checkRoadSafety(lat, lon).then(result => {
          const gt = generelltTillstand;
          const maxspeed = result.nearestRoad?.maxspeed;
          const isAllman = result.roadCategory === 'allman' || result.roadCategory === 'kan_vara_allman';

          if (isAllman && maxspeed && maxspeed > 80) {
            result.requiresSpecialPermit = true;
          } else if (isAllman && gt && gt.lan && gt.giltigtTom && new Date(gt.giltigtTom) >= new Date()) {
            result.tillstand = 'beviljat';
            result.generelltTillstandApplied = true;
          }

          setMarkers(prev => prev.map(m =>
            m.id === newMarker.id ? { ...m, roadCheck: result } : m
          ));
        });
      }

      setMarkers(prev => [...prev, newMarker]);

      // Vibrera för bekräftelse
      if (navigator.vibrate) {
        navigator.vibrate(30);
      }

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
    // Använd MapLibre-coords om de finns, annars SVG-coords
    if (currentDrawCoords.length > 1 && drawType) {
      const shouldClose = POLYGON_LINE_TYPES.has(drawType);
      let finalCoords = [...currentDrawCoords];
      if (shouldClose && finalCoords.length >= 3) {
        finalCoords.push(finalCoords[0]);
        finalCoords = smoothCoords(finalCoords, 2, true);
        console.log('Polygon stängd (knapp), antal punkter:', currentDrawCoords.length, 'första:', finalCoords[0], 'sista:', finalCoords[finalCoords.length-1], 'efter smooth:', finalCoords.length);
      } else if (finalCoords.length >= 3) {
        finalCoords = smoothCoords(finalCoords, 2, false);
        console.log('Linje avslutad (knapp), punkter:', currentDrawCoords.length, 'efter smooth:', finalCoords.length);
      }
      finishLineFromCoords(finalCoords);
      return;
    }
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
    setCurrentDrawCoords([]);
    setIsDrawMode(false);
    setDrawType(null);
    setIsDrawing(false);
    setDrawPaused(false);
  };

  const finishZone = () => {
    // Använd MapLibre-coords om de finns, annars SVG-coords
    if (currentDrawCoords.length > 2 && zoneType) {
      let finalCoords = [...currentDrawCoords, currentDrawCoords[0]];
      finalCoords = smoothCoords(finalCoords, 2, true);
      console.log('Zon stängd (knapp), antal punkter:', currentDrawCoords.length, 'första:', finalCoords[0], 'sista:', finalCoords[finalCoords.length-1], 'efter smooth:', finalCoords.length);
      finishZoneFromCoords(finalCoords);
      return;
    }
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
    setCurrentDrawCoords([]);
    setIsZoneMode(false);
    setZoneType(null);
    setIsDrawing(false);
    setDrawPaused(false);
  };

  // Dra-för-att-rita med offset
  const drawOffset = 0; // Ritas direkt där fingret är
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
  
  // Ångra senaste punkten medan man ritar
  const undoLastSegment = () => {
    if (currentDrawCoords.length <= 1) {
      cancelDrawing();
      return;
    }
    setCurrentDrawCoords(prev => prev.slice(0, -1));
  };

  const cancelDrawing = () => {
    setCurrentPath([]);
    setCurrentDrawCoords([]);
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
    // Ignorera i översiktsläge
    if (stickvagOversikt) return;
    
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
  
  const renderLine = (path, typeId) => {
    if (!path || path.length < 2) return null;
    const type = lineTypes.find(t => t.id === typeId);
    if (!type) return null;

    // Linje som matchar VIDA-kartans stil (~5px visuellt)
    // Kompensera för zoom-transform så visuell tjocklek förblir konstant
    const w = 5 / zoom;
    const dashScale = 1 / zoom;

    // Använd smooth path
    const d = createSmoothPath(path);

    if (type.striped) {
      return (
        <g key={`line-${path[0]?.x}-${path[0]?.y}-${typeId}`}>
          <path d={d} fill="none" stroke={type.color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
          <path d={d} fill="none" stroke={type.color2} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${20 * dashScale},${20 * dashScale}`} />
        </g>
      );
    } else if (type.dashed) {
      return (
        <g key={`line-${path[0]?.x}-${path[0]?.y}-${typeId}`}>
          <path d={d} fill="none" stroke={type.color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${15 * dashScale},${10 * dashScale}`} />
        </g>
      );
    } else {
      return (
        <g key={`line-${path[0]?.x}-${path[0]?.y}-${typeId}`}>
          <path d={d} fill="none" stroke={type.color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${12 * dashScale},${8 * dashScale}`} />
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

  // Är ritläge aktivt? Blockerar klick på befintliga element
  const isInDrawingMode = isDrawMode || isZoneMode || isArrowMode || !!selectedSymbol || measureMode || measureAreaMode;

  // Visa objektväljaren om inget objekt är valt
  if (!valtObjekt) {
    return (
      <ObjektValjare
        onSelectObjekt={(obj) => {
          console.log('=== VALT OBJEKT ===');
          console.log('namn:', obj.namn);
          console.log('kartbild_url:', obj.kartbild_url);
          console.log('kartbild_bounds:', obj.kartbild_bounds);
          console.log('kartbild_bounds type:', typeof obj.kartbild_bounds);
          console.log('lat:', obj.lat, 'lng:', obj.lng);
          setValtObjekt(obj);
          // Centrera kartan på objektets koordinater eller kartbild
          if (obj.kartbild_bounds) {
            const bounds = obj.kartbild_bounds;
            const centerLat = (bounds[0][0] + bounds[1][0]) / 2;
            const centerLng = (bounds[0][1] + bounds[1][1]) / 2;
            setMapCenter({ lat: centerLat, lng: centerLng });
            setMapZoom(15);
            // Flytta MapLibre-kartan om den finns
            if (mapInstanceRef.current) {
              mapInstanceRef.current.jumpTo({ center: [centerLng, centerLat], zoom: 15, pitch: 50, bearing: 20 });
              setTimeout(() => mapInstanceRef.current?.resize(), 50);
            }
          } else if (obj.lat && obj.lng) {
            setMapCenter({ lat: obj.lat, lng: obj.lng });
            setMapZoom(16);
            if (mapInstanceRef.current) {
              mapInstanceRef.current.jumpTo({ center: [obj.lng, obj.lat], zoom: 16, pitch: 50, bearing: 20 });
              setTimeout(() => mapInstanceRef.current?.resize(), 50);
            }
          }
          setPan({ x: screenSize.width / 2, y: screenSize.height / 2 });
          setZoom(1);
        }}
        onNavigera={(lat, lng) => {
          window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
        }}
      />
    );
  }

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
            {valtObjekt?.namn || 'Inget objekt'}
          </span>
          <span style={{ fontSize: '14px', color: colors.textMuted }}>
            {valtObjekt?.areal ? `${valtObjekt.areal} ha` : ''}
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

      {/* === MAPLIBRE BAKGRUNDSKARTA === */}
      {showMap && (
        <DynamicMapLibre
          onMapReady={handleMapReady}
          onMapRemoved={handleMapRemoved}
          initialCenter={[mapCenter.lng, mapCenter.lat] as [number, number]}
          initialZoom={mapZoom}
          initialPitch={50}
          initialBearing={20}
          mapStyle={mapStyleConfig.current as any}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: 0,
          }}
        />
      )}

      {/* === WMS OVERLAY-LAGER renderas nu som MapLibre raster sources === */}
      {false && showMap && screenSize.width > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            overflow: 'hidden',
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
            const basePosX = -offsetX;
            const basePosY = -offsetY;
            
            // WMS Overlay: Sumpskog (gammal toggle) - nu tile-baserad
            if (overlays.wetlands) {
              for (let dx = -tilesAround; dx <= tilesAround; dx++) {
                for (let dy = -tilesAround; dy <= tilesAround; dy++) {
                  const tileX = centerTileX + dx;
                  const tileY = centerTileY + dy;
                  const svgX = basePosX + dx * tileSize;
                  const svgY = basePosY + dy * tileSize;
                  const screenX = pan.x + svgX * zoom;
                  const screenY = pan.y + svgY * zoom;
                  const scaledSize = tileSize * zoom;
                  if (screenX < -scaledSize * 2 || screenX > screenSize.width + scaledSize) continue;
                  if (screenY < -scaledSize * 2 || screenY > screenSize.height + scaledSize) continue;
                  // Beräkna tile-bbox i EPSG:4326 (WMS 1.1.1: minx=lng_min, miny=lat_min)
                  const tLngMin = tileX / n * 360 - 180;
                  const tLngMax = (tileX + 1) / n * 360 - 180;
                  const tLatMax = Math.atan(Math.sinh(Math.PI * (1 - 2 * tileY / n))) * 180 / Math.PI;
                  const tLatMin = Math.atan(Math.sinh(Math.PI * (1 - 2 * (tileY + 1) / n))) * 180 / Math.PI;
                  const bbox = `${tLngMin},${tLatMin},${tLngMax},${tLatMax}`;
                  tiles.push(
                    <img
                      key={`wms-wetlands-${tileX}-${tileY}-${z}`}
                      src={`https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaSumpskog/MapServer/WmsServer?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=Sumpskog_Skogsstyrelsen&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:4326&BBOX=${bbox}&WIDTH=256&HEIGHT=256`}
                      alt=""
                      style={{ position: 'absolute', left: screenX, top: screenY, width: scaledSize, height: scaledSize, opacity: 0.7, pointerEvents: 'none' }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  );
                }
              }
            }

            // WMS Overlays: tile-baserade - följer pan/zoom exakt som baskartan
            // Hjälpfunktion: tile -> bbox i EPSG:4326
            const tileBbox4326 = (tx: number, ty: number) => {
              const lngMin = tx / n * 360 - 180;
              const lngMax = (tx + 1) / n * 360 - 180;
              const latMax = Math.atan(Math.sinh(Math.PI * (1 - 2 * ty / n))) * 180 / Math.PI;
              const latMin = Math.atan(Math.sinh(Math.PI * (1 - 2 * (ty + 1) / n))) * 180 / Math.PI;
              return `${lngMin},${latMin},${lngMax},${latMax}`;
            };
            // Hjälpfunktion: tile -> bbox i EPSG:3857
            const tileBbox3857 = (tx: number, ty: number) => {
              const lngMin = tx / n * 360 - 180;
              const lngMax = (tx + 1) / n * 360 - 180;
              const latMax = Math.atan(Math.sinh(Math.PI * (1 - 2 * ty / n))) * 180 / Math.PI;
              const latMin = Math.atan(Math.sinh(Math.PI * (1 - 2 * (ty + 1) / n))) * 180 / Math.PI;
              const toMerc = (la: number, lo: number) => {
                const mx = lo * 20037508.34 / 180;
                const my = Math.log(Math.tan((90 + la) * Math.PI / 360)) / (Math.PI / 180) * 20037508.34 / 180;
                return { mx, my };
              };
              const swM = toMerc(latMin, lngMin);
              const neM = toMerc(latMax, lngMax);
              return `${swM.mx},${swM.my},${neM.mx},${neM.my}`;
            };

            wmsLayers.forEach(layer => {
              if (!overlays[layer.id]) return;
              const srs = layer.srs || 'EPSG:4326';
              // maxNativeZoom: hämta tiles vid lägre zoom och skala upp
              const wmsZ = (layer.maxNativeZoom != null && z > layer.maxNativeZoom) ? layer.maxNativeZoom : z;
              const wmsN = Math.pow(2, wmsZ);
              const scaleMult = Math.pow(2, z - wmsZ); // 1 om samma zoom, >1 om lägre
              const wmsTileXFloat = (lng + 180) / 360 * wmsN;
              const wmsLatRad = lat * Math.PI / 180;
              const wmsTileYFloat = (1 - Math.log(Math.tan(wmsLatRad) + 1 / Math.cos(wmsLatRad)) / Math.PI) / 2 * wmsN;
              const wmsCenterTileX = Math.floor(wmsTileXFloat);
              const wmsCenterTileY = Math.floor(wmsTileYFloat);
              const wmsTA = Math.ceil(tilesAround / scaleMult) + 2;
              for (let dx = -wmsTA; dx <= wmsTA; dx++) {
                for (let dy = -wmsTA; dy <= wmsTA; dy++) {
                  const tileX = wmsCenterTileX + dx;
                  const tileY = wmsCenterTileY + dy;
                  // Positionera WMS-tile i basmap-tile-gridet
                  const svgX = basePosX + (tileX * scaleMult - centerTileX) * tileSize;
                  const svgY = basePosY + (tileY * scaleMult - centerTileY) * tileSize;
                  const screenX = pan.x + svgX * zoom;
                  const screenY = pan.y + svgY * zoom;
                  const wmsTileScreenSize = tileSize * scaleMult * zoom;
                  if (screenX < -wmsTileScreenSize * 2 || screenX > screenSize.width + wmsTileScreenSize) continue;
                  if (screenY < -wmsTileScreenSize * 2 || screenY > screenSize.height + wmsTileScreenSize) continue;
                  // BBOX vid WMS-zoom
                  const lngMin = tileX / wmsN * 360 - 180;
                  const lngMax = (tileX + 1) / wmsN * 360 - 180;
                  const latMax = Math.atan(Math.sinh(Math.PI * (1 - 2 * tileY / wmsN))) * 180 / Math.PI;
                  const latMin = Math.atan(Math.sinh(Math.PI * (1 - 2 * (tileY + 1) / wmsN))) * 180 / Math.PI;
                  let bbox: string;
                  if (srs === 'EPSG:3857') {
                    const toMerc = (la: number, lo: number) => ({ mx: lo * 20037508.34 / 180, my: Math.log(Math.tan((90 + la) * Math.PI / 360)) / (Math.PI / 180) * 20037508.34 / 180 });
                    const sw = toMerc(latMin, lngMin);
                    const ne = toMerc(latMax, lngMax);
                    bbox = `${sw.mx},${sw.my},${ne.mx},${ne.my}`;
                  } else {
                    bbox = `${lngMin},${latMin},${lngMax},${latMax}`;
                  }
                  let wmsUrl: string;
                  if (layer.customApi) {
                    // Egen API-route (t.ex. körbarhetstiles) — bbox i EPSG:4326
                    wmsUrl = `${layer.url}?bbox=${lngMin},${latMin},${lngMax},${latMax}&width=256&height=256`;
                  } else if (layer.exportImage) {
                    // ArcGIS ImageServer exportImage (t.ex. Gallringsindex)
                    const mercBbox = (() => {
                      const toM = (la: number, lo: number) => ({ mx: lo * 20037508.34 / 180, my: Math.log(Math.tan((90 + la) * Math.PI / 360)) / (Math.PI / 180) * 20037508.34 / 180 });
                      const s = toM(latMin, lngMin), n = toM(latMax, lngMax);
                      return `${s.mx},${s.my},${n.mx},${n.my}`;
                    })();
                    const target = `${layer.exportImage}/exportImage?bbox=${mercBbox}&bboxSR=3857&imageSR=3857&size=256,256&format=png&transparent=true&renderingRule=${encodeURIComponent(layer.renderingRule || '')}&f=image`;
                    wmsUrl = `${layer.url}?url=${encodeURIComponent(target)}`;
                  } else if (layer.proxyTarget) {
                    const target = `${layer.proxyTarget}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=${encodeURIComponent(layer.layers)}&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=${srs}&BBOX=${bbox}&WIDTH=256&HEIGHT=256`;
                    wmsUrl = `${layer.url}?url=${encodeURIComponent(target)}`;
                  } else {
                    wmsUrl = `${layer.url}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=${encodeURIComponent(layer.layers)}&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=${srs}&BBOX=${bbox}&WIDTH=256&HEIGHT=256`;
                  }
                  tiles.push(
                    <img
                      key={`wms-${layer.id}-${tileX}-${tileY}-${wmsZ}`}
                      src={wmsUrl}
                      alt=""
                      style={{ position: 'absolute', left: screenX, top: screenY, width: wmsTileScreenSize, height: wmsTileScreenSize, opacity: 0.75, pointerEvents: 'none' }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  );
                }
              }
            });
            
            return tiles;
          })()}
        </div>
      )}

      {/* === VIDA KARTBILD renderas nu som MapLibre image source === */}

      {/* === SVG OVERLAY (symboler, GPS, mätverktyg) === */}
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          touchAction: 'none',
          zIndex: 50,
          pointerEvents: 'none',
          ...(showMap ? {} : {
            background: `
              radial-gradient(ellipse at 30% 40%, rgba(52, 199, 89, 0.15) 0%, transparent 50%),
              radial-gradient(ellipse at 70% 60%, rgba(10, 132, 255, 0.2) 0%, transparent 45%),
              radial-gradient(ellipse at 50% 80%, rgba(10, 132, 255, 0.25) 0%, transparent 40%),
              linear-gradient(180deg, #1c1c1e 0%, #000000 100%)
            `,
          }),
        }}
      >
        {/* Defs */}
        <defs>
          <radialGradient id="viewConeGradient" cx="0%" cy="0%" r="100%">
            <stop offset="0%" stopColor="#0a84ff" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#0a84ff" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* SVG-innehåll positioneras via map.project() (ingen grupp-transform) */}
        <g style={{
          pointerEvents: isInDrawingMode ? 'none' : 'auto',
        }}>

          {/* Zoner, linjer, TMA och ritning renderas nu i MapLibre native layers */}
          
          {/* Mätlinje - ritas nu utanför transform så den alltid syns där man drar */}
          
          {/* Markeringar (inte foton) */}
          {visibleLayers.symbols && markers.filter(m => m.isMarker).map(m => {
            const type = markerTypes.find(t => t.id === m.type);
            const isMenuOpen = markerMenuOpen === m.id;
            const isDragging = draggingMarker === m.id;
            const opacity = getMarkerOpacity({ x: m.x, y: m.y, id: m.id });
            const isAcknowledged = acknowledgedWarnings.includes(m.id);

            // Projicera SVG-position till skärmkoordinater
            const screenPos = svgToScreen(m.x, m.y);
            if (!screenPos) return null;
            const offsetX = screenPos.x - m.x;
            const offsetY = screenPos.y - m.y;

            // === ZOOM-BASERAD SYNLIGHET ===
            const importantTypes = ['eternitytree', 'naturecorner', 'culturemonument', 'culturestump'];
            const isImportant = importantTypes.includes(m.type || '');
            const isZoomedOut = getMapLibreZoom() < 15;
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
                transform={`translate(${offsetX}, ${offsetY})`}
                onMouseDown={(e) => handleMarkerDragStart(e, m)}
                onTouchStart={(e) => handleMarkerDragStart(e, m)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (stickvagOversikt) {
                    setSelectedOversiktItem(m);
                    setSelectedOversiktVag(null);
                  }
                }}
                style={{
                  cursor: isDragging ? 'grabbing' : 'pointer',
                  opacity: opacity,
                  transition: 'opacity 0.3s ease',
                  pointerEvents: isInDrawingMode ? 'none' : 'auto',
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
                {/* Vägkontroll-ring för avlägg — ej enskild väg */}
                {m.type === 'landing' && m.roadCheck && m.roadCheck.status !== 'loading' && m.roadCheck.roadCategory !== 'enskild' && (
                  <circle
                    cx={m.x} cy={m.y}
                    r={ringRadius}
                    fill="none"
                    stroke={m.roadCheck.tillstand === 'beviljat' ? '#22c55e' : m.roadCheck.tillstand === 'sokt' ? '#eab308' : '#ef4444'}
                    strokeWidth={strokeW}
                    strokeDasharray={m.roadCheck.tillstand === 'ej_sokt' ? '6 4' : 'none'}
                    opacity={0.7}
                  />
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
            const arrowScale = getConstrainedSize(1);
            const ringRadius = getConstrainedSize(30);
            const photoRadius = getConstrainedSize(10);
            const photoOffset = getConstrainedSize(18);
            const photoFontSize = getConstrainedSize(10);
            // Projicera position
            const screenPos = svgToScreen(m.x, m.y);
            if (!screenPos) return null;
            const offsetX = screenPos.x - m.x;
            const offsetY = screenPos.y - m.y;
            return (
              <g key={m.id} transform={`translate(${offsetX}, ${offsetY})`} style={{ opacity: opacity, transition: 'opacity 0.3s ease' }}>
                {/* Grön ring om kvitterad */}
                {isAcknowledged && drivingMode && (
                  <circle cx={m.x} cy={m.y} r={ringRadius} fill="none" stroke="#22c55e" strokeWidth={getConstrainedSize(3)} />
                )}
                <g 
                  transform={`translate(${m.x}, ${m.y}) rotate(${m.rotation || 0}) scale(${arrowScale})`}
                  onMouseDown={(e) => handleMarkerDragStart(e, m)}
                  onTouchStart={(e) => handleMarkerDragStart(e, m)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (stickvagOversikt) {
                      setSelectedOversiktItem(m);
                      setSelectedOversiktVag(null);
                    }
                  }}
                  style={{ cursor: isDragging ? 'grabbing' : 'pointer', pointerEvents: isInDrawingMode ? 'none' : 'auto' }}
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
          
          {/* Linjer/zoner klickas nu via MapLibre layers (line-hitbox, zone-fill) */}

          {/* Förra stickvägen (visas under snitslande) */}
          {stickvagMode && previousStickvagRef.current?.path && (
            <path
              d={previousStickvagRef.current.path.map((p, i) => {
                const s = svgToScreen(p.x, p.y);
                return s ? `${i === 0 ? 'M' : 'L'} ${s.x} ${s.y}` : '';
              }).join(' ')}
              fill="none"
              stroke={lineTypes.find(t => t.id === previousStickvagRef.current.lineType)?.color || '#ef4444'}
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.7}
            />
          )}

          {/* GPS-spårad linje (live) */}
          {gpsLineType && gpsPath.length > 1 && (
            <path
              d={gpsPath.map((p, i) => {
                const s = svgToScreen(p.x, p.y);
                return s ? `${i === 0 ? 'M' : 'L'} ${s.x} ${s.y}` : '';
              }).join(' ')}
              fill="none"
              stroke={lineTypes.find(t => t.id === gpsLineType)?.color || '#fff'}
              strokeWidth={4}
              strokeDasharray="8,8"
              style={{ animation: 'pulse 1s infinite' }}
            />
          )}

          {/* GPS position med ljuskägla */}
          {isTracking && (() => {
            // Projicera GPS-position till skärm
            const gpsScreen = gpsPosition
              ? (() => { const map = mapInstanceRef.current; return map ? map.project([gpsPosition.lng, gpsPosition.lat]) : null; })()
              : svgToScreen(gpsMapPosition.x, gpsMapPosition.y);
            if (!gpsScreen) return null;
            const gpx = gpsScreen.x;
            const gpy = gpsScreen.y;
            return (
            <g>
              {/* Ljuskägla - visar riktning när kompass är på */}
              {compassMode && isTracking && (() => {
                const coneRadius = getConstrainedSize(80);
                return (
                  <path
                    d={`M ${gpx} ${gpy}
                        L ${gpx + Math.sin((deviceHeading - 30) * Math.PI / 180) * coneRadius} ${gpy - Math.cos((deviceHeading - 30) * Math.PI / 180) * coneRadius}
                        A ${coneRadius} ${coneRadius} 0 0 1 ${gpx + Math.sin((deviceHeading + 30) * Math.PI / 180) * coneRadius} ${gpy - Math.cos((deviceHeading + 30) * Math.PI / 180) * coneRadius}
                        Z`}
                    fill="url(#viewConeGradient)"
                    opacity={0.6}
                  />
                );
              })()}
              {/* GPS-prick */}
              <circle
                cx={gpx} cy={gpy} r={getConstrainedSize(12)}
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
                    d={`M ${gpx} ${gpy - 18 * arrowScale}
                        L ${gpx - 6 * arrowScale} ${gpy - 8 * arrowScale}
                        L ${gpx + 6 * arrowScale} ${gpy - 8 * arrowScale} Z`}
                    fill="#fff"
                    transform={`rotate(${deviceHeading}, ${gpx}, ${gpy})`}
                  />
                );
              })()}
            </g>
            );
          })()}
          
          {/* Rotationsindikator */}
          {rotatingArrow && (() => {
            const arrow = markers.find(m => m.id === rotatingArrow);
            if (!arrow) return null;
            const sp = svgToScreen(arrow.x, arrow.y);
            if (!sp) return null;
            return (
              <g>
                <circle cx={sp.x} cy={sp.y} r={60} fill="none" stroke={colors.blue} strokeWidth={2} strokeDasharray="8,4" opacity={0.5} />
                <line
                  x1={sp.x} y1={sp.y}
                  x2={sp.x + Math.sin((arrow.rotation || 0) * Math.PI / 180) * 55}
                  y2={sp.y - Math.cos((arrow.rotation || 0) * Math.PI / 180) * 55}
                  stroke={colors.blue} strokeWidth={3} strokeLinecap="round"
                />
                <circle cx={sp.x} cy={sp.y} r={6} fill={colors.blue} />
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

      {/* === GPS-CENTRERING-KNAPP (höger nere) === */}
      <button
        onClick={() => {
          // Vibrera för feedback
          if (navigator.vibrate) {
            navigator.vibrate(25);
          }
          
          if (isTracking && currentPosition) {
            // Flytta kartcentrum till din GPS-position
            setMapCenter({ lat: currentPosition.lat, lng: currentPosition.lon });
            // Återställ GPS-position till centrum (0,0) och pan
            gpsMapPositionRef.current = { x: 0, y: 0 };
            setGpsMapPosition({ x: 0, y: 0 });
            setGpsStartPos({ lat: currentPosition.lat, lon: currentPosition.lon, x: 0, y: 0 });
            setPan({ x: screenSize.width / 2, y: screenSize.height / 2 });
          }
          // Om GPS är av, gör ingenting - GPS startas via objekt-menyn
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
          cursor: isTracking ? 'pointer' : 'default',
          opacity: isTracking ? 1 : 0.4,
        }}
      >
        {/* Centrerings-ikon */}
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={isTracking ? '#22c55e' : 'rgba(255,255,255,0.5)'} strokeWidth="2">
          <circle cx="12" cy="12" r="3" fill={isTracking ? '#22c55e' : 'none'}/>
          <line x1="12" y1="2" x2="12" y2="6"/>
          <line x1="12" y1="18" x2="12" y2="22"/>
          <line x1="2" y1="12" x2="6" y2="12"/>
          <line x1="18" y1="12" x2="22" y2="12"/>
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
                maxWidth: '500px',
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

            {/* Vägkontroll för avlägg */}
            {marker.type === 'landing' && marker.roadCheck && (() => {
              const rc = marker.roadCheck;
              const cat = rc.roadCategory;
              const isAllmanOrOklar = cat === 'allman' || cat === 'kan_vara_allman';
              const speed = rc.nearestRoad?.maxspeed;
              const edgeDist = speed ? getEdgeDistance(speed) : undefined;
              const intDist = speed ? getIntersectionDistance(speed) : undefined;
              const checklistLabels = [
                'Inte i kurva med skymd sikt',
                'Inte vid backkrön',
                'Inte vid heldragen mittlinje',
                'Inte vid busshållplats',
                'Inte vid plankorsning med järnväg',
                'Lossning kan ske från skogssidan',
                'Skotare kan lossa utan att köra upp på vägen',
                'Lastbil kan stå plant',
                'Utryckningsfordon kan passera',
                'Ingen kraftledning ovanför',
                'Vattenavrinning och diken inte blockerade',
              ];
              const checkedCount = rc.checklist ? rc.checklist.filter(Boolean).length : 0;

              // Style-helpers
              const sectionStyle = { marginTop: '24px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '20px' };
              const sectionHeadingStyle = { fontSize: '11px', fontWeight: '600' as const, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' as const, letterSpacing: '1.5px', marginBottom: '12px' };
              const ruleStyle = { fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: '1.7', margin: 0 as const };
              const bulletStyle = { fontSize: '12px', color: 'rgba(255,255,255,0.5)', lineHeight: '1.8', margin: 0 as const, paddingLeft: '4px' };

              return (
              <div style={{
                marginTop: '16px',
                maxHeight: '55vh',
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                paddingTop: '4px',
              }}>
                {/* Loading */}
                {rc.status === 'loading' && (
                  <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontSize: '14px', padding: '14px' }}>
                    <div style={{
                      display: 'inline-block', width: '16px', height: '16px',
                      border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#fff',
                      borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                      marginRight: '8px', verticalAlign: 'middle',
                    }} />
                    Kontrollerar vägdata...
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  </div>
                )}

                {/* Error */}
                {rc.status === 'error' && (
                  <div style={{ textAlign: 'center', padding: '14px' }}>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', marginBottom: '8px' }}>{rc.message}</div>
                    <button
                      onClick={() => {
                        const { lat, lon } = svgToLatLon(marker.x, marker.y);
                        setMarkers(prev => prev.map(m => m.id === marker.id ? { ...m, roadCheck: { ...m.roadCheck!, status: 'loading' as const } } : m));
                        checkRoadSafety(lat, lon).then(result => {
                          setMarkers(prev => prev.map(m => m.id === marker.id ? { ...m, roadCheck: result } : m));
                        });
                      }}
                      style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px', cursor: 'pointer' }}
                    >Försök igen</button>
                  </div>
                )}

                {/* Resultat */}
                {(rc.status === 'ok' || rc.status === 'warning') && (
                  <div style={{ padding: '16px', background: cat === 'enskild' ? 'rgba(255,255,255,0.05)' : 'transparent', borderRadius: '16px', border: cat === 'enskild' ? '1px solid rgba(34,197,94,0.3)' : 'none' }}>

                    {/* ===== RUBRIK ===== */}
                    <div style={{ fontSize: '15px', fontWeight: '700', textAlign: 'center', marginBottom: '4px', color: cat === 'enskild' ? '#22c55e' : cat === 'allman' ? '#ef4444' : '#eab308' }}>
                      {cat === 'enskild' ? 'Enskild väg' : cat === 'kan_vara_allman' ? 'Kontrollera om vägen är allmän' : 'Allmän väg – tillstånd krävs'}
                    </div>

                    {/* Vägnamn */}
                    {rc.nearestRoad && (
                      <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginBottom: '16px' }}>
                        {rc.nearestRoad.ref ? `${rc.nearestRoad.ref} — ` : ''}{rc.nearestRoad.name}
                        {speed ? ` · ${speed} km/h` : ''}
                      </div>
                    )}

                    {/* ===== ENSKILD VÄG ===== */}
                    {cat === 'enskild' && (
                      <div style={ruleStyle}>Kontakta väghållaren</div>
                    )}

                    {/* ===== OKLAR VÄG ===== */}
                    {cat === 'kan_vara_allman' && (
                      <div style={{ ...ruleStyle, marginBottom: '6px' }}>Kontrollera vägtyp med kommunen</div>
                    )}

                    {/* ===== TILLSTÅND (allmän + oklar) ===== */}
                    {isAllmanOrOklar && (
                      <div style={sectionStyle}>
                        <div style={sectionHeadingStyle}>Tillstånd</div>

                        {rc.generelltTillstandApplied && (
                          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>Generellt tillstånd gäller</div>
                        )}

                        {rc.requiresSpecialPermit && (
                          <div style={{ fontSize: '13px', color: '#ef4444', marginBottom: '4px' }}>Särskilt tillstånd krävs</div>
                        )}

                        {!rc.generelltTillstandApplied && (
                          <>
                            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', marginBottom: '12px' }}>Väglagen 43§</div>

                            {/* Tillstånd-toggle */}
                            <div style={{ display: 'flex', gap: '6px', padding: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                              {(['ej_sokt', 'sokt', 'beviljat'] as const).map(t => {
                                const isActive = rc.tillstand === t;
                                const label = t === 'ej_sokt' ? 'Ej sökt' : t === 'sokt' ? 'Sökt' : 'Beviljat';
                                const activeColor = t === 'ej_sokt' ? '#ef4444' : t === 'sokt' ? '#eab308' : '#22c55e';
                                return (
                                  <button key={t} onClick={() => { setMarkers(prev => prev.map(m => m.id === marker.id && m.roadCheck ? { ...m, roadCheck: { ...m.roadCheck, tillstand: t } } : m)); }}
                                    style={{ flex: 1, padding: '10px 0', borderRadius: '8px', border: 'none', background: isActive ? activeColor : 'transparent', color: isActive ? '#000' : 'rgba(255,255,255,0.5)', fontSize: '12px', fontWeight: isActive ? '700' : '500', cursor: 'pointer', transition: 'all 0.2s' }}>
                                    {label}
                                  </button>
                                );
                              })}
                            </div>

                            <a href="https://www.trafikverket.se/e-tjanster/upplag-av-virke-eller-skogsbransle-vid-vag/" target="_blank" rel="noopener noreferrer"
                              style={{ display: 'block', textAlign: 'center', marginTop: '16px', fontSize: '12px', color: '#60a5fa', textDecoration: 'none' }}>
                              Sök tillstånd hos Trafikverket →
                            </a>
                          </>
                        )}

                        {speed && speed <= 80 && !rc.generelltTillstandApplied && (
                          <div style={{ marginTop: '14px', fontSize: '12px', color: 'rgba(255,255,255,0.35)', lineHeight: '1.5' }}>
                            Generellt tillstånd kan sökas per län – gäller 2 år
                          </div>
                        )}
                      </div>
                    )}

                    {/* ===== PLACERING (allmän + oklar) ===== */}
                    {isAllmanOrOklar && speed && (
                      <div style={sectionStyle}>
                        <div style={sectionHeadingStyle}>Placering</div>
                        <div style={{ display: 'flex', gap: '24px' }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                            <div style={{ fontSize: '28px', fontWeight: '700', color: '#fff', lineHeight: '1' }}>{edgeDist}m</div>
                            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>vägkant → välta</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                            <div style={{ fontSize: '28px', fontWeight: '700', color: '#fff', lineHeight: '1' }}>{intDist}m</div>
                            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>till korsning/krön/kurva</div>
                          </div>
                        </div>

                        {/* Korsningsvarning borttagen – avstånd visas redan i placerings-siffran */}
                      </div>
                    )}

                    {/* ===== CHECKLISTA (allmän + oklar) ===== */}
                    {isAllmanOrOklar && rc.checklist && (
                      <details style={sectionStyle}>
                        <summary style={{ ...sectionHeadingStyle, cursor: 'pointer', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0' }}>
                          <span>Checklista</span>
                          <span style={{ fontSize: '11px', fontWeight: '500', color: checkedCount === 11 ? '#22c55e' : 'rgba(255,255,255,0.3)', letterSpacing: '0', textTransform: 'none' as const }}>{checkedCount}/11</span>
                        </summary>
                        <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
                          {checklistLabels.map((label, i) => (
                            <div key={i}
                              onClick={() => {
                                setMarkers(prev => prev.map(m => {
                                  if (m.id !== marker.id || !m.roadCheck?.checklist) return m;
                                  const newCl = [...m.roadCheck.checklist!];
                                  newCl[i] = !newCl[i];
                                  return { ...m, roadCheck: { ...m.roadCheck, checklist: newCl } };
                                }));
                              }}
                              style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '7px 0', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                              <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: `1.5px solid ${rc.checklist![i] ? '#22c55e' : 'rgba(255,255,255,0.15)'}`, background: rc.checklist![i] ? 'rgba(34,197,94,0.12)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                                {rc.checklist![i] && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3"><path d="M5 13l4 4L19 7" /></svg>}
                              </div>
                              <span style={{ fontSize: '11px', color: rc.checklist![i] ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.6)', textDecoration: rc.checklist![i] ? 'line-through' : 'none', lineHeight: '1.4' }}>{label}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}

                    {/* ===== VÄLTAN (alla vägar) ===== */}
                    <details style={sectionStyle}>
                      <summary style={{ ...sectionHeadingStyle, cursor: 'pointer', listStyle: 'none', marginBottom: '0' }}>Regler för vältan</summary>
                      <div style={{ marginTop: '10px' }}>
                        {[
                          'Max höjd: 4,5m',
                          'Jämndragen mot vägen upp till 1,5m höjd',
                          'Första vältan mot trafiken ska vara sluttande',
                          'Stockändarna ska peka mot vägen',
                          'Alla vältor ska märkas med ägarens namn',
                          'Inga utstickande stamdelar under 1,5m höjd',
                          'Virke får inte riskera att rasa in på vägbanan',
                        ].map((t, i) => <div key={i} style={bulletStyle}>• {t}</div>)}
                      </div>
                    </details>

                    {/* ===== LASTNING & SÄKERHET (alla vägar) ===== */}
                    <details style={sectionStyle}>
                      <summary style={{ ...sectionHeadingStyle, cursor: 'pointer', listStyle: 'none', marginBottom: '0' }}>Lastning & säkerhet</summary>
                      <div style={{ marginTop: '10px' }}>
                        {[
                          'Lastbil/maskin får inte blockera vägen – utryckningsfordon måste kunna passera',
                          'Använd varningstriangel och varningslykta vid lastning',
                          'Skylt X6 "Lastning" ska användas',
                          'Ta bort skyltning när lastning är klar',
                          'Min 2–6m från kraftledningar',
                        ].map((t, i) => <div key={i} style={bulletStyle}>• {t}</div>)}
                      </div>
                    </details>

                    {/* ===== LIGGTIDER (alla vägar) ===== */}
                    <div style={sectionStyle}>
                      <div style={sectionHeadingStyle}>Liggtider</div>
                      <div style={bulletStyle}>• Rundvirke: max 60 dagar</div>
                      <div style={bulletStyle}>• Skogsbränsle: max 18 månader</div>
                    </div>

                    {/* ===== EFTER AVHÄMTNING (alla vägar) ===== */}
                    <details style={{ ...sectionStyle, borderBottom: 'none' }}>
                      <summary style={{ ...sectionHeadingStyle, cursor: 'pointer', listStyle: 'none', marginBottom: '0' }}>Efter avhämtning</summary>
                      <div style={{ marginTop: '10px' }}>
                        {[
                          'Städa vägen, slänter och diken',
                          'Anmäl vägskador till väghållaren',
                          'Den som skadat vägen har betalningsansvar',
                          'Får EJ blockera vattenavrinning, diken eller vägtrummor',
                          'Får EJ hindra snöplogning',
                        ].map((t, i) => <div key={i} style={bulletStyle}>• {t}</div>)}
                      </div>
                    </details>

                    {/* ===== LÄNK TILL DOKUMENT (alla vägar) ===== */}
                    <div style={{ marginTop: '20px', textAlign: 'center' as const }}>
                      <a href="https://www.skogforsk.se/cd_20200406123332/contentassets/8431ded2d08246c69be60fa9eb35b7fb/100401_upplag_av_virke_och_skogsbransle_vid_allman_och_enskild_vag_utg_6.pdf"
                        target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: '11px', color: '#60a5fa', textDecoration: 'none' }}>
                        Trafikverket & Skogforsk instruktion (PDF) →
                      </a>
                    </div>
                  </div>
                )}
              </div>
              );
            })()}

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
                    // Convert SVG path to [lng, lat] for MapLibre drawing
                    const lngLatCoords: [number, number][] = marker.path.map((p: any) => {
                      const { lat, lon } = svgToLatLon(p.x, p.y);
                      return [lon, lat] as [number, number];
                    });
                    setCurrentDrawCoords(lngLatCoords);
                    setDrawType(marker.lineType);
                    setIsDrawMode(true);
                    setDrawPaused(true);
                    saveToHistory([...markers]);
                    deleteMarkerFromDb(marker.id);
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
              
              {/* Beräkna volym (bara för traktgränser) */}
              {marker.isLine && marker.lineType === 'boundary' && marker.path && marker.path.length >= 3 && (
                <button
                  onClick={() => {
                    const path = marker.path!;
                    const latLonPath = path.map(p => svgToLatLon(p.x, p.y));
                    setVolymLoading(true);
                    setVolymResultat(null);
                    setKorbarhetsLoading(true);
                    setKorbarhetsResultat(null);
                    setMarkerMenuOpen(null);
                    beraknaVolym(latLonPath, '/api/wms-proxy').then(res => {
                      setVolymResultat(res);
                      setVolymLoading(false);
                    }).catch(() => {
                      setVolymResultat({ status: 'error', areal: 0, totalVolymHa: 0, totalVolym: 0, medeldiameter: 0, tradslag: [], felmeddelande: 'Beräkning misslyckades' });
                      setVolymLoading(false);
                    });
                    beraknaKorbarhet(latLonPath, '/api/wms-proxy', '/api/sgu-proxy').then(res => {
                      setKorbarhetsResultat(res);
                      setKorbarhetsLoading(false);
                    }).catch(() => {
                      setKorbarhetsResultat({ status: 'error', fordelning: { gron: 0, gul: 0, rod: 0 }, dominantJordart: 'Okänd', jordartFordelning: [], medelLutning: 0, felmeddelande: 'Körbarhetsanalys misslyckades' });
                      setKorbarhetsLoading(false);
                    });
                  }}
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '24px',
                    border: 'none',
                    background: 'rgba(34,197,94,0.15)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(34,197,94,0.8)" strokeWidth="2">
                    <path d="M3 3v18h18" /><path d="M7 16l4-8 4 4 6-10" />
                  </svg>
                </button>
              )}

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

      {/* === VOLYMBERÄKNING + KÖRBARHET === */}
      {(volymLoading || volymResultat) && (
        <VolymPanel
          resultat={volymResultat}
          loading={volymLoading}
          onClose={() => { setVolymResultat(null); setVolymLoading(false); setKorbarhetsResultat(null); setKorbarhetsLoading(false); }}
          korbarhetsResultat={korbarhetsResultat}
          korbarhetsLoading={korbarhetsLoading}
        />
      )}

      {/* === SMHI BRANDRISK-BADGE === */}
      {overlays.brandrisk && brandriskData && (
        <div style={{
          position: 'absolute',
          top: 60,
          right: 12,
          background: '#0a0a0a',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '14px',
          padding: '10px 14px',
          zIndex: 200,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          <div style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: brandriskData.fwiindex <= 0 ? '#22c55e'
              : brandriskData.fwiindex <= 2 ? '#eab308'
              : brandriskData.fwiindex <= 3 ? '#f97316'
              : '#ef4444',
            flexShrink: 0,
          }} />
          <div>
            <div style={{ fontSize: '13px', color: '#fff', fontWeight: 500 }}>
              {brandriskData.fwiindex <= 0 ? 'Ingen brandrisk'
                : brandriskData.fwiindex <= 1 ? 'Liten brandrisk'
                : brandriskData.fwiindex <= 2 ? 'Normal brandrisk'
                : brandriskData.fwiindex <= 3 ? 'Stor brandrisk'
                : brandriskData.fwiindex <= 4 ? 'Mycket stor brandrisk'
                : 'Extrem brandrisk'}
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
              SMHI FWI: {brandriskData.fwi.toFixed(1)} {brandriskData.grassfire > 0 ? '| Gräsbrandsrisk' : ''}
            </div>
          </div>
        </div>
      )}

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
      {gpsLineType && isTracking && !stickvagMode && (
        <div style={{
          position: 'fixed',
          bottom: '40px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          zIndex: 500,
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
              {gpsPath.length} pkt
            </span>
            {gpsPaused && <span style={{ fontSize: '11px', color: '#f59e0b' }}>PAUS</span>}
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
            onClick={() => {
              // Om det är en stickväg, visa popup för nästa färg
              const currentLineType = gpsLineType || gpsLineTypeRef.current;
              const isStickväg = ['sideRoadRed', 'sideRoadYellow', 'sideRoadBlue'].includes(currentLineType || '');
              if (isStickväg) {
                saveAndShowPopup();
              } else {
                stopGpsTracking(true);
              }
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
      {(isDrawMode || isZoneMode) && currentDrawCoords.length > 1 && (
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
          zIndex: 700,
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
      {(isDrawMode || isZoneMode) && currentDrawCoords.length === 0 && (
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
          zIndex: 700,
        }}>
          <span style={{ fontSize: '14px', opacity: 0.6, padding: '0 12px' }}>Dra för att rita fritt</span>
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
                { id: 'vidaKartbild', name: 'VIDA-kartbild', desc: 'Traktdirektivets kartbild', enabled: true },
                { id: 'wetlands', name: 'Sumpskog', desc: 'Blöta skogsområden', enabled: true },
                { id: 'contours', name: 'Höjdkurvor', desc: 'Terräng ovanpå karta/satellit', enabled: true },
                { id: 'sks_markfuktighet', name: 'Markfuktighet', desc: 'SLU via Skogsstyrelsen', enabled: true },
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

            {/* WMS-lager grupperade */}
            {wmsLayerGroups.map(group => (
              <div key={group.group} style={{
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
                  {group.group}
                </div>
                {group.layers.map(layer => (
                  <div
                    key={layer.id}
                    onClick={() => setOverlays(prev => ({ ...prev, [layer.id]: !prev[layer.id] }))}
                    style={{
                      padding: '14px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: layer.color,
                      flexShrink: 0,
                      opacity: overlays[layer.id] ? 1 : 0.3,
                      transition: 'opacity 0.2s ease',
                    }} />
                    <span style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', color: '#fff' }}>{layer.name}</div>
                      {layer.desc && <div style={{ fontSize: '11px', opacity: 0.4, marginTop: '2px' }}>{layer.desc}</div>}
                    </span>
                    <div style={{
                      width: '44px',
                      height: '26px',
                      borderRadius: '13px',
                      background: overlays[layer.id] ? '#22c55e' : 'rgba(255,255,255,0.1)',
                      padding: '2px',
                      transition: 'background 0.2s ease',
                    }}>
                      <div style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        background: '#fff',
                        transform: overlays[layer.id] ? 'translateX(18px)' : 'translateX(0)',
                        transition: 'transform 0.2s ease',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {/* SMHI Brandrisk (API-baserad) */}
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
                SMHI
              </div>
              <div
                onClick={() => setOverlays(prev => ({ ...prev, brandrisk: !prev.brandrisk }))}
                style={{
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                }}
              >
                <div style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: '#f97316',
                  flexShrink: 0,
                  opacity: overlays.brandrisk ? 1 : 0.3,
                  transition: 'opacity 0.2s ease',
                }} />
                <span style={{ flex: 1 }}>
                  <span style={{ fontSize: '15px', color: '#fff' }}>Brandrisk</span>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>SMHI prognos, uppdateras dagligen</div>
                </span>
                <div style={{
                  width: '44px',
                  height: '26px',
                  borderRadius: '13px',
                  background: overlays.brandrisk ? '#22c55e' : 'rgba(255,255,255,0.1)',
                  padding: '2px',
                  transition: 'background 0.2s ease',
                }}>
                  <div style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    background: '#fff',
                    transform: overlays.brandrisk ? 'translateX(18px)' : 'translateX(0)',
                    transition: 'transform 0.2s ease',
                  }} />
                </div>
              </div>
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

                {/* Spara */}
                <div
                  onClick={async () => {
                    if (!valtObjekt?.id || markers.length === 0) return;
                    const rows = markers.map(m => ({
                      objekt_id: valtObjekt.id,
                      marker_id: String(m.id),
                      typ: getMarkerTyp(m),
                      data: m,
                    }));
                    const { error } = await supabase
                      .from('planering_markeringar')
                      .upsert(rows, { onConflict: 'objekt_id,marker_id' });
                    if (error) {
                      console.error('Manuell sparning fel:', error);
                    } else {
                      setShowSaveToast(true);
                      setTimeout(() => setShowSaveToast(false), 2000);
                    }
                    setMenuOpen(false);
                    setMenuHeight(0);
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
                    border: '1px solid rgba(34,197,94,0.3)',
                  }}
                >
                  <div style={{ opacity: 0.7 }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                      <polyline points="17 21 17 13 7 13 7 21" />
                      <polyline points="7 3 7 8 15 8" />
                    </svg>
                  </div>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: '500',
                    color: '#22c55e',
                    textAlign: 'center',
                  }}>
                    Spara
                  </span>
                </div>

                {/* Byt objekt */}
                <div
                  onClick={() => {
                    setMenuOpen(false);
                    setMenuHeight(0);
                    setMarkers([]);
                    setMarkersLoaded(false);
                    setValtObjekt(null);
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
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  <div style={{ opacity: 0.7 }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 14L4 9l5-5" />
                      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
                    </svg>
                  </div>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: '500',
                    color: '#fff',
                    textAlign: 'center',
                  }}>
                    Byt objekt
                  </span>
                </div>
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
                            if (stickvagMode && gpsMapPosition) {
                              // I stickvagMode: placera direkt på GPS-position
                              const newMarker: Marker = {
                                id: Date.now().toString(),
                                x: gpsMapPosition.x,
                                y: gpsMapPosition.y,
                                type: type.id,
                                isMarker: true,
                              };
                              setMarkers(prev => [...prev, newMarker]);
                              // Stäng menyn
                              setMenuOpen(false);
                              setMenuHeight(0);
                              setSubMenu(null);
                              setActiveCategory(null);
                            } else {
                              // Normalt läge: välj symbol och stäng meny
                              setSelectedSymbol(type.id);
                              setMenuOpen(false);
                              setMenuHeight(0);
                              setSubMenu(null);
                              setActiveCategory(null);
                            }
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
                        console.log('[Rita] Aktiverar ritläge:', type.id, type.name);
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
                            const accuracy = pos.coords.accuracy;
                            
                            // Ignorera osäkra positioner (över 10 meter)
                            if (accuracy > 10) return;
                            
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
                          { enableHighAccuracy: true, maximumAge: 500, timeout: 10000 }
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
                      // Mappa svenska färgnamn till engelska för lineType
                      const colorMap: Record<string, string> = {
                        'rod': 'Red',
                        'gul': 'Yellow',
                        'bla': 'Blue',
                        'gron': 'Green',
                        'orange': 'Orange',
                        'vit': 'White',
                        'svart': 'Black',
                        'rosa': 'Pink',
                      };
                      const englishColor = colorMap[selectedVagColor.id] || 'Red';
                      const lineId = selectedVagType === 'backvag' 
                        ? `backRoad${englishColor}` 
                        : `sideRoad${englishColor}`;
                      // Spara senast använda färgen för översikt
                      if (['rod', 'gul', 'bla'].includes(selectedVagColor.id)) {
                        setLastUsedColorId(selectedVagColor.id);
                      }
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

            {/* === INFO === */}
            {activeCategory === 'info' && (
              <div style={{ padding: '12px' }}>

                {/* MARKFÖRHÅLLANDEN */}
                <div style={{
                  background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '20px', padding: '16px', marginBottom: '16px',
                }}>
                  <div style={{ fontSize: '11px', opacity: 0.4, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Markförhållanden</div>

                  {/* Bärighet */}
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '14px', color: '#fff', marginBottom: '8px' }}>Bärighet</div>
                    <div style={{ display: 'flex', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                      {[{ id: 'bra', label: 'Bra' }, { id: 'medel', label: 'Medel' }, { id: 'dalig', label: 'Dålig' }].map(opt => (
                        <div key={opt.id} onClick={() => setInfoBarighet(opt.id)}
                          style={{
                            flex: 1, padding: '10px 0', textAlign: 'center', fontSize: '14px', cursor: 'pointer',
                            background: infoBarighet === opt.id ? 'rgba(255,255,255,0.15)' : 'transparent',
                            color: infoBarighet === opt.id ? '#fff' : 'rgba(255,255,255,0.4)',
                            fontWeight: infoBarighet === opt.id ? '600' : '400',
                            transition: 'all 0.2s ease',
                          }}>{opt.label}</div>
                      ))}
                    </div>
                  </div>

                  {/* Terräng */}
                  <div>
                    <div style={{ fontSize: '14px', color: '#fff', marginBottom: '8px' }}>Terräng</div>
                    <div style={{ display: 'flex', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                      {[{ id: 'flackt', label: 'Flackt' }, { id: 'kuperat', label: 'Kuperat' }, { id: 'brant', label: 'Brant' }].map(opt => (
                        <div key={opt.id} onClick={() => setInfoTerrang(opt.id)}
                          style={{
                            flex: 1, padding: '10px 0', textAlign: 'center', fontSize: '14px', cursor: 'pointer',
                            background: infoTerrang === opt.id ? 'rgba(255,255,255,0.15)' : 'transparent',
                            color: infoTerrang === opt.id ? '#fff' : 'rgba(255,255,255,0.4)',
                            fontWeight: infoTerrang === opt.id ? '600' : '400',
                            transition: 'all 0.2s ease',
                          }}>{opt.label}</div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* HINDER & HÄNSYN */}
                <div style={{
                  background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '20px', padding: '16px', marginBottom: '16px',
                }}>
                  <div style={{ fontSize: '11px', opacity: 0.4, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Hinder & hänsyn</div>
                  {(() => {
                    const hinderSymboler = markers.filter(m => m.isMarker !== false && !m.isZone && !m.isLine && !m.isArrow && ['powerline', 'ditch', 'bridge', 'corduroy', 'wet', 'steep', 'warning', 'culturemonument', 'culturestump', 'eternitytree', 'naturecorner', 'trail'].includes(m.type || ''));
                    const hinderZoner = markers.filter(m => m.isZone);
                    const alla = [...hinderSymboler, ...hinderZoner];
                    if (alla.length === 0) {
                      return <div style={{ fontSize: '14px', opacity: 0.3, padding: '8px 0' }}>Inga hinder ritade på kartan</div>;
                    }
                    return alla.map(m => {
                      const namn = m.isZone
                        ? (zoneTypes.find(z => z.id === m.zoneType)?.name || m.zoneType || 'Zon')
                        : (markerTypes.find(t => t.id === m.type)?.name || m.type || 'Markering');
                      const farg = m.isZone
                        ? (zoneTypes.find(z => z.id === m.zoneType)?.color || '#666')
                        : '#888';
                      return (
                        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: farg, flexShrink: 0 }} />
                          <span style={{ fontSize: '14px', color: '#fff' }}>{namn}</span>
                          {m.comment && <span style={{ fontSize: '12px', opacity: 0.4, marginLeft: 'auto' }}>{m.comment}</span>}
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* SKÖRDARE */}
                <div style={{
                  background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '20px', padding: '16px', marginBottom: '16px',
                }}>
                  <div style={{ fontSize: '11px', opacity: 0.4, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Skördare</div>

                  {/* Maskin dropdown */}
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '14px', color: '#fff', marginBottom: '8px' }}>Maskin</div>
                    <select
                      value={infoSkordareMaskin}
                      onChange={e => setInfoSkordareMaskin(e.target.value)}
                      style={{
                        width: '100%', padding: '12px 16px', borderRadius: '10px',
                        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                        color: '#fff', fontSize: '14px', outline: 'none',
                        appearance: 'none', WebkitAppearance: 'none',
                      }}
                    >
                      <option value="" style={{ background: '#111' }}>Välj maskin...</option>
                      {maskinLista.map(m => <option key={m} value={m} style={{ background: '#111' }}>{m}</option>)}
                    </select>
                  </div>

                  {/* Band toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: infoSkordareBand ? '12px' : '16px' }}>
                    <span style={{ fontSize: '14px', color: '#fff' }}>Band</span>
                    <div onClick={() => setInfoSkordareBand(!infoSkordareBand)} style={{
                      width: '44px', height: '26px', borderRadius: '13px', padding: '2px', cursor: 'pointer',
                      background: infoSkordareBand ? '#22c55e' : 'rgba(255,255,255,0.1)', transition: 'background 0.2s ease',
                    }}>
                      <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#fff', transform: infoSkordareBand ? 'translateX(18px)' : 'translateX(0)', transition: 'transform 0.2s ease' }} />
                    </div>
                  </div>
                  {infoSkordareBand && (
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ display: 'flex', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                        {[{ id: '1', label: '1 par' }, { id: '2', label: '2 par' }].map(opt => (
                          <div key={opt.id} onClick={() => setInfoSkordareBandPar(opt.id)}
                            style={{
                              flex: 1, padding: '10px 0', textAlign: 'center', fontSize: '14px', cursor: 'pointer',
                              background: infoSkordareBandPar === opt.id ? 'rgba(255,255,255,0.15)' : 'transparent',
                              color: infoSkordareBandPar === opt.id ? '#fff' : 'rgba(255,255,255,0.4)',
                              fontWeight: infoSkordareBandPar === opt.id ? '600' : '400',
                              transition: 'all 0.2s ease',
                            }}>{opt.label}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Manuell fällning toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: infoSkordareManFall ? '12px' : '0' }}>
                    <span style={{ fontSize: '14px', color: '#fff' }}>Manuell fällning</span>
                    <div onClick={() => setInfoSkordareManFall(!infoSkordareManFall)} style={{
                      width: '44px', height: '26px', borderRadius: '13px', padding: '2px', cursor: 'pointer',
                      background: infoSkordareManFall ? '#22c55e' : 'rgba(255,255,255,0.1)', transition: 'background 0.2s ease',
                    }}>
                      <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#fff', transform: infoSkordareManFall ? 'translateX(18px)' : 'translateX(0)', transition: 'transform 0.2s ease' }} />
                    </div>
                  </div>
                  {infoSkordareManFall && (
                    <textarea
                      value={infoSkordareManFallText}
                      onChange={e => setInfoSkordareManFallText(e.target.value)}
                      placeholder="Beskriv..."
                      style={{
                        width: '100%', minHeight: '70px', padding: '12px', borderRadius: '10px', marginTop: '4px',
                        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                        color: '#fff', fontSize: '14px', outline: 'none', resize: 'vertical',
                        fontFamily: 'inherit',
                      }}
                    />
                  )}
                </div>

                {/* SKOTARE */}
                <div style={{
                  background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '20px', padding: '16px', marginBottom: '16px',
                }}>
                  <div style={{ fontSize: '11px', opacity: 0.4, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Skotare</div>

                  {/* Maskin dropdown */}
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '14px', color: '#fff', marginBottom: '8px' }}>Maskin</div>
                    <select
                      value={infoSkotareMaskin}
                      onChange={e => setInfoSkotareMaskin(e.target.value)}
                      style={{
                        width: '100%', padding: '12px 16px', borderRadius: '10px',
                        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                        color: '#fff', fontSize: '14px', outline: 'none',
                        appearance: 'none', WebkitAppearance: 'none',
                      }}
                    >
                      <option value="" style={{ background: '#111' }}>Välj maskin...</option>
                      {maskinLista.map(m => <option key={m} value={m} style={{ background: '#111' }}>{m}</option>)}
                    </select>
                  </div>

                  {/* Band toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: infoSkotareBand ? '12px' : '16px' }}>
                    <span style={{ fontSize: '14px', color: '#fff' }}>Band</span>
                    <div onClick={() => setInfoSkotareBand(!infoSkotareBand)} style={{
                      width: '44px', height: '26px', borderRadius: '13px', padding: '2px', cursor: 'pointer',
                      background: infoSkotareBand ? '#22c55e' : 'rgba(255,255,255,0.1)', transition: 'background 0.2s ease',
                    }}>
                      <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#fff', transform: infoSkotareBand ? 'translateX(18px)' : 'translateX(0)', transition: 'transform 0.2s ease' }} />
                    </div>
                  </div>
                  {infoSkotareBand && (
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ display: 'flex', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                        {[{ id: '1', label: '1 par' }, { id: '2', label: '2 par' }].map(opt => (
                          <div key={opt.id} onClick={() => setInfoSkotareBandPar(opt.id)}
                            style={{
                              flex: 1, padding: '10px 0', textAlign: 'center', fontSize: '14px', cursor: 'pointer',
                              background: infoSkotareBandPar === opt.id ? 'rgba(255,255,255,0.15)' : 'transparent',
                              color: infoSkotareBandPar === opt.id ? '#fff' : 'rgba(255,255,255,0.4)',
                              fontWeight: infoSkotareBandPar === opt.id ? '600' : '400',
                              transition: 'all 0.2s ease',
                            }}>{opt.label}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Lastreder breddat */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <span style={{ fontSize: '14px', color: '#fff' }}>Lastreder breddat</span>
                    <div onClick={() => setInfoSkotareLastreder(!infoSkotareLastreder)} style={{
                      width: '44px', height: '26px', borderRadius: '13px', padding: '2px', cursor: 'pointer',
                      background: infoSkotareLastreder ? '#22c55e' : 'rgba(255,255,255,0.1)', transition: 'background 0.2s ease',
                    }}>
                      <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#fff', transform: infoSkotareLastreder ? 'translateX(18px)' : 'translateX(0)', transition: 'transform 0.2s ease' }} />
                    </div>
                  </div>

                  {/* Ris skotas direkt */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '14px', color: '#fff' }}>Ris skotas direkt</span>
                    <div onClick={() => setInfoSkotareRisDirekt(!infoSkotareRisDirekt)} style={{
                      width: '44px', height: '26px', borderRadius: '13px', padding: '2px', cursor: 'pointer',
                      background: infoSkotareRisDirekt ? '#22c55e' : 'rgba(255,255,255,0.1)', transition: 'background 0.2s ease',
                    }}>
                      <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#fff', transform: infoSkotareRisDirekt ? 'translateX(18px)' : 'translateX(0)', transition: 'transform 0.2s ease' }} />
                    </div>
                  </div>
                </div>

                {/* TRANSPORT */}
                <div style={{
                  background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '20px', padding: '16px', marginBottom: '16px',
                }}>
                  <div style={{ fontSize: '11px', opacity: 0.4, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Transport</div>

                  {/* Trailer kan köra in */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: !infoTrailerIn ? '12px' : '16px' }}>
                    <span style={{ fontSize: '14px', color: '#fff' }}>Trailer kan köra in</span>
                    <div onClick={() => setInfoTrailerIn(!infoTrailerIn)} style={{
                      width: '44px', height: '26px', borderRadius: '13px', padding: '2px', cursor: 'pointer',
                      background: infoTrailerIn ? '#22c55e' : 'rgba(255,255,255,0.1)', transition: 'background 0.2s ease',
                    }}>
                      <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#fff', transform: infoTrailerIn ? 'translateX(18px)' : 'translateX(0)', transition: 'transform 0.2s ease' }} />
                    </div>
                  </div>
                  {!infoTrailerIn && (
                    <div style={{
                      padding: '10px 14px', borderRadius: '10px', marginBottom: '16px',
                      background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)',
                      color: '#eab308', fontSize: '13px', fontWeight: '500',
                    }}>
                      Lassa av vid väg
                    </div>
                  )}

                  {/* Kommentar */}
                  <div>
                    <div style={{ fontSize: '14px', color: '#fff', marginBottom: '8px' }}>Kommentar</div>
                    <textarea
                      value={infoTransportKommentar}
                      onChange={e => setInfoTransportKommentar(e.target.value)}
                      placeholder="Kommentar om transport..."
                      style={{
                        width: '100%', minHeight: '70px', padding: '12px', borderRadius: '10px',
                        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                        color: '#fff', fontSize: '14px', outline: 'none', resize: 'vertical',
                        fontFamily: 'inherit',
                      }}
                    />
                  </div>
                </div>

                {/* MARKÄGARE */}
                <div style={{
                  background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '20px', padding: '16px', marginBottom: '16px',
                }}>
                  <div style={{ fontSize: '11px', opacity: 0.4, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Markägare</div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: infoMarkagareVed ? '12px' : '0' }}>
                    <span style={{ fontSize: '14px', color: '#fff' }}>Ska ha ved</span>
                    <div onClick={() => setInfoMarkagareVed(!infoMarkagareVed)} style={{
                      width: '44px', height: '26px', borderRadius: '13px', padding: '2px', cursor: 'pointer',
                      background: infoMarkagareVed ? '#22c55e' : 'rgba(255,255,255,0.1)', transition: 'background 0.2s ease',
                    }}>
                      <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#fff', transform: infoMarkagareVed ? 'translateX(18px)' : 'translateX(0)', transition: 'transform 0.2s ease' }} />
                    </div>
                  </div>
                  {infoMarkagareVed && (
                    <textarea
                      value={infoMarkagareVedText}
                      onChange={e => setInfoMarkagareVedText(e.target.value)}
                      placeholder="Detaljer om ved..."
                      style={{
                        width: '100%', minHeight: '70px', padding: '12px', borderRadius: '10px',
                        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                        color: '#fff', fontSize: '14px', outline: 'none', resize: 'vertical',
                        fontFamily: 'inherit',
                      }}
                    />
                  )}
                </div>

                {/* ANTECKNINGAR */}
                <div style={{
                  background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '20px', padding: '16px', marginBottom: '16px',
                }}>
                  <div style={{ fontSize: '11px', opacity: 0.4, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Anteckningar</div>
                  <textarea
                    value={infoAnteckningar}
                    onChange={e => setInfoAnteckningar(e.target.value)}
                    placeholder="Fritext..."
                    style={{
                      width: '100%', minHeight: '100px', padding: '12px', borderRadius: '10px',
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                      color: '#fff', fontSize: '14px', outline: 'none', resize: 'vertical',
                      fontFamily: 'inherit',
                    }}
                  />
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

                {/* Generellt tillstånd */}
                <div style={{
                  background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '20px',
                  padding: '16px 20px',
                  marginBottom: '16px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                    <div style={{ opacity: 0.6 }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <path d="M14 2v6h6" />
                        <path d="M9 15l2 2 4-4" />
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: '15px', color: '#fff', fontWeight: '600' }}>Generellt tillstånd</div>
                      <div style={{ fontSize: '12px', opacity: 0.5, marginTop: '2px' }}>Avlägg vid allmän väg ≤80 km/h</div>
                    </div>
                  </div>

                  {/* Län */}
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>Län</div>
                    <select
                      value={generelltTillstand?.lan || ''}
                      onChange={(e) => {
                        const lan = e.target.value;
                        if (!lan) {
                          setGenerelltTillstand(null);
                        } else {
                          setGenerelltTillstand(prev => ({ lan, giltigtTom: prev?.giltigtTom || '' }));
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid rgba(255,255,255,0.15)',
                        background: 'rgba(255,255,255,0.05)',
                        color: '#fff',
                        fontSize: '14px',
                        appearance: 'none',
                        WebkitAppearance: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="" style={{ background: '#111' }}>Välj län...</option>
                      {[
                        'Blekinge', 'Dalarna', 'Gotland', 'Gävleborg', 'Halland',
                        'Jämtland', 'Jönköping', 'Kalmar', 'Kronoberg', 'Norrbotten',
                        'Skåne', 'Stockholm', 'Södermanland', 'Uppsala', 'Värmland',
                        'Västerbotten', 'Västernorrland', 'Västmanland',
                        'Västra Götaland', 'Örebro', 'Östergötland',
                      ].map(l => (
                        <option key={l} value={l} style={{ background: '#111' }}>{l}</option>
                      ))}
                    </select>
                  </div>

                  {/* Giltig t.o.m. */}
                  <div style={{ marginBottom: '6px' }}>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>Giltig t.o.m.</div>
                    <input
                      type="date"
                      value={generelltTillstand?.giltigtTom || ''}
                      onChange={(e) => {
                        const giltigtTom = e.target.value;
                        setGenerelltTillstand(prev => prev ? { ...prev, giltigtTom } : { lan: '', giltigtTom });
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid rgba(255,255,255,0.15)',
                        background: 'rgba(255,255,255,0.05)',
                        color: '#fff',
                        fontSize: '14px',
                        colorScheme: 'dark',
                      }}
                    />
                  </div>

                  {/* Status */}
                  {generelltTillstand?.lan && generelltTillstand?.giltigtTom && (
                    <div style={{
                      marginTop: '10px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: '600',
                      textAlign: 'center',
                      background: new Date(generelltTillstand.giltigtTom) >= new Date()
                        ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                      color: new Date(generelltTillstand.giltigtTom) >= new Date()
                        ? '#22c55e' : '#ef4444',
                    }}>
                      {new Date(generelltTillstand.giltigtTom) >= new Date()
                        ? `Giltigt — ${generelltTillstand.lan} län`
                        : `Utgånget ${generelltTillstand.giltigtTom}`}
                    </div>
                  )}
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

                  {/* Brandrisk testläge */}
                  <div style={{ marginTop: '24px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '20px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' as const, letterSpacing: '1.5px', marginBottom: '12px' }}>Testläge</div>
                    {brandTestMode === null ? (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => {
                            setBrandTestMode(5);
                            setBrandNearbyWater([
                              { name: 'Testsjön', dist: 800, lat: mapCenter.lat + 0.005, lon: mapCenter.lng + 0.003 },
                              { name: 'Testbäcken', dist: 1200, lat: mapCenter.lat - 0.003, lon: mapCenter.lng + 0.008 },
                            ]);
                            setBrandNearbyFireStation([
                              { name: 'Teststation Räddningstjänst', dist: 4500, lat: mapCenter.lat + 0.02, lon: mapCenter.lng - 0.01 },
                            ]);
                            console.log('[BrandTest] Aktiverat FWI 5 testläge');
                            setTimeout(() => setActiveCategory('brandrisk'), 50);
                          }}
                          style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: 'rgba(239,68,68,0.2)', color: '#ef4444', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                        >
                          Testa FWI 5
                        </button>
                        <button
                          onClick={() => {
                            setBrandTestMode(3);
                            setBrandNearbyWater([
                              { name: 'Testsjön', dist: 800, lat: mapCenter.lat + 0.005, lon: mapCenter.lng + 0.003 },
                            ]);
                            setBrandNearbyFireStation([
                              { name: 'Teststation Räddningstjänst', dist: 4500, lat: mapCenter.lat + 0.02, lon: mapCenter.lng - 0.01 },
                            ]);
                            console.log('[BrandTest] Aktiverat FWI 3 testläge');
                            setTimeout(() => setActiveCategory('brandrisk'), 50);
                          }}
                          style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: 'rgba(234,179,8,0.2)', color: '#eab308', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                        >
                          Testa FWI 3
                        </button>
                      </div>
                    ) : (
                      <div>
                        <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.3)', marginBottom: '10px' }}>
                          <span style={{ fontSize: '13px', color: '#eab308', fontWeight: '600' }}>TESTLÄGE AKTIVT – FWI {brandTestMode}</span>
                        </div>
                        <button
                          onClick={() => {
                            setBrandTestMode(null);
                            setBrandRisk(null);
                            setBrandNearbyWater([]);
                            setBrandNearbyFireStation([]);
                          }}
                          style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.7)', fontSize: '13px', cursor: 'pointer' }}
                        >
                          Avsluta testläge
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* === NÖDLÄGE === */}
            {activeCategory === 'emergency' && (
              <div style={{ padding: '12px' }}>
                <div style={{
                  background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '20px',
                  padding: '24px',
                }}>
                  {/* === SOS === */}
                  <div style={{ marginBottom: '24px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '20px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#fff', textTransform: 'uppercase' as const, letterSpacing: '1.5px', marginBottom: '16px' }}>SOS</div>
                    <a href="tel:112" style={{ textDecoration: 'none', display: 'block', marginBottom: '12px' }}>
                      <div style={{ fontSize: '48px', fontWeight: '700', color: '#fff', lineHeight: '1' }}>112</div>
                      <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginTop: '4px' }}>SOS Alarm – Nödsamtal</div>
                    </a>
                    <a href="tel:1177" style={{ textDecoration: 'none', display: 'block' }}>
                      <div style={{ fontSize: '32px', fontWeight: '700', color: '#fff', lineHeight: '1' }}>1177</div>
                      <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginTop: '4px' }}>Sjukvårdsrådgivningen</div>
                    </a>
                  </div>

                  {/* === DIN POSITION === */}
                  <div style={{ marginBottom: '24px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '20px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#fff', textTransform: 'uppercase' as const, letterSpacing: '1.5px', marginBottom: '12px' }}>Din position</div>
                    {(() => {
                      const centerLat = mapCenter.lat.toFixed(4);
                      const centerLon = mapCenter.lng.toFixed(4);
                      const posText = `${centerLat}°N, ${centerLon}°E`;
                      return (
                        <>
                          <div style={{ fontSize: '18px', fontWeight: '600', color: '#fff', marginBottom: '8px', fontFamily: 'monospace' }}>
                            {posText}
                          </div>
                          <button
                            onClick={() => { navigator.clipboard.writeText(posText); }}
                            style={{
                              padding: '8px 16px', borderRadius: '8px',
                              border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)',
                              color: '#fff', fontSize: '12px', cursor: 'pointer', marginBottom: '8px',
                            }}
                          >
                            Kopiera koordinater
                          </button>
                          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                            Ge denna position till larmoperatören
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* === NÄRMASTE SJUKVÅRD === */}
                  {emergencyHealthcare !== null && emergencyHealthcare.length === 0 && (
                    <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '16px' }}>Söker sjukvård i närheten...</div>
                  )}

                  {/* Sjukhus */}
                  {emergencyHealthcare && emergencyHealthcare.filter(h => h.type === 'hospital').length > 0 && (
                    <div style={{ marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '16px' }}>
                      <div style={{ fontSize: '11px', fontWeight: '600', color: '#fff', textTransform: 'uppercase' as const, letterSpacing: '1.5px', marginBottom: '12px' }}>Närmaste sjukhus</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {emergencyHealthcare.filter(h => h.type === 'hospital').map((h, i) => (
                          <a
                            key={i}
                            href={`https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lon}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)' }}
                          >
                            <span style={{ fontSize: '20px' }}>🏥</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '14px', color: '#fff' }}>{h.name}</div>
                              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                                {h.dist} km · ~{Math.max(5, Math.round(h.dist * 0.9))} min
                              </div>
                            </div>
                            <span style={{ fontSize: '13px', color: '#60a5fa' }}>Navigera →</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Vårdcentraler */}
                  {emergencyHealthcare && emergencyHealthcare.filter(h => h.type === 'clinic').length > 0 && (
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: '600', color: '#fff', textTransform: 'uppercase' as const, letterSpacing: '1.5px', marginBottom: '12px' }}>Närmaste vårdcentral</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {emergencyHealthcare.filter(h => h.type === 'clinic').map((h, i) => (
                          <a
                            key={i}
                            href={`https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lon}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)' }}
                          >
                            <span style={{ fontSize: '20px' }}>🏥</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '14px', color: '#fff' }}>{h.name}</div>
                              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                                {h.dist} km · ~{Math.max(5, Math.round(h.dist * 0.9))} min
                              </div>
                            </div>
                            <span style={{ fontSize: '13px', color: '#60a5fa' }}>Navigera →</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* === BRANDRISK === */}
            {activeCategory === 'brandrisk' && (
              <BrandriskPanel
                lat={mapCenter.lat}
                lon={mapCenter.lng}
                eldningsforbud={brandEldningsforbud}
                onEldningsforbudChange={setBrandEldningsforbud}
                testMode={brandTestMode}
                brandSamrad={brandSamrad}
                onSamradChange={setBrandSamrad}
                brandKontakter={brandKontakter}
                onKontakterChange={setBrandKontakter}
                brandTillbud={brandTillbud}
                brandNewTillbud={brandNewTillbud}
                onNewTillbudChange={setBrandNewTillbud}
                onSaveTillbud={async () => {
                  if (!valtObjekt?.id || !brandNewTillbud.beskrivning) return;
                  const row = {
                    objekt_id: valtObjekt.id,
                    datum: brandNewTillbud.datum,
                    beskrivning: brandNewTillbud.beskrivning,
                    atgard: brandNewTillbud.atgard,
                    lat: mapCenter.lat, lon: mapCenter.lng,
                    photo_data: brandNewTillbud.photoData || null,
                    rapporterad_till: brandNewTillbud.rapporteradTill || null,
                  };
                  const { error } = await supabase.from('brand_tillbud').insert(row);
                  if (!error) {
                    setBrandTillbud(p => [{ datum: row.datum, beskrivning: row.beskrivning, atgard: row.atgard, lat: row.lat, lon: row.lon, photoData: '', rapporteradTill: row.rapporterad_till || '' }, ...p]);
                    setBrandNewTillbud({ datum: new Date().toISOString().slice(0, 16), beskrivning: '', atgard: '', rapporteradTill: '', photoData: '' });
                  }
                }}
                brandEfterkontroll={brandEfterkontroll}
                onEfterkontrollChange={setBrandEfterkontroll}
                brandBrandvakt={brandBrandvakt}
                onBrandvaktChange={setBrandBrandvakt}
                onSaveBrandvakt={async () => {
                  if (!valtObjekt?.id || !brandBrandvakt.namn) return;
                  await supabase.from('brand_brandvakt').insert({
                    objekt_id: valtObjekt.id,
                    namn: brandBrandvakt.namn, starttid: brandBrandvakt.starttid || null,
                    sluttid: brandBrandvakt.sluttid || null, noteringar: brandBrandvakt.noteringar || null,
                  });
                }}
                brandUtrustning={brandUtrustning}
                onUtrustningChange={setBrandUtrustning}
                brandNearbyWater={brandNearbyWater}
                brandNearbyFireStation={brandNearbyFireStation}
                brandLarmTillfart={brandLarmTillfart}
                onLarmTillfartChange={setBrandLarmTillfart}
                brandLarmChecklista={brandLarmChecklista}
                onLarmChecklistaChange={setBrandLarmChecklista}
                mapCenter={mapCenter}
                onStatusChange={(s) => setBrandRisk({ status: s.status, currentFwi: s.currentFwi, currentIdx: s.currentIdx })}
              />
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


      {/* === GALLRING OVERLAY === */}
      {stickvagMode && !stickvagOversikt && !showSavedPopup && !menuOpen && !isZoneMode && !isDrawMode && (
        <>
          {/* Stor avståndssiffra */}
          <div style={{
            position: 'fixed',
            top: '30%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 600,
            pointerEvents: 'none',
            textAlign: 'center',
          }}>
            {(() => {
              const dist = getStickvagDistance();
              const target = stickvagSettings?.targetDistance || 20;
              const tolerance = stickvagSettings?.tolerance || 5;
              const isInRange = dist !== null && Math.abs(dist - target) <= tolerance;
              
              return (
                <div style={{
                  fontSize: '120px',
                  fontWeight: '200',
                  color: isInRange ? '#22c55e' : '#fff',
                  lineHeight: 0.9,
                  textShadow: '0 4px 30px rgba(0,0,0,0.9)',
                }}>
                  {dist !== null ? dist : '—'}
                </div>
              );
            })()}
          </div>

          {/* Pausad-indikator */}
          {gpsPaused && (
            <div style={{
              position: 'fixed',
              top: '60px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 600,
              background: 'rgba(245,158,11,0.2)',
              color: '#f59e0b',
              padding: '8px 20px',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: '500',
            }}>
              PAUSAD
            </div>
          )}

          {/* Tre knappar i botten */}
          <div style={{
            position: 'fixed',
            bottom: '50px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: '20px',
            zIndex: 600,
          }}>
            {/* Paus/Play */}
            <button
              onClick={() => {
                const newPaused = !gpsPaused;
                setGpsPaused(newPaused);
                gpsPausedRef.current = newPaused;
              }}
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                border: 'none',
                background: gpsPaused ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.15)',
                color: gpsPaused ? '#f59e0b' : '#fff',
                fontSize: '18px',
                cursor: 'pointer',
              }}
            >
              {gpsPaused ? '▶' : '❚❚'}
            </button>

            {/* + Meny */}
            <button
              onClick={() => {
                setMenuOpen(true);
                setActiveCategory('symbols');
              }}
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                border: 'none',
                background: 'rgba(255,255,255,0.15)',
                color: '#fff',
                fontSize: '28px',
                fontWeight: '300',
                cursor: 'pointer',
              }}
            >
              +
            </button>

            {/* Spara */}
            <button
              onClick={() => saveAndShowPopup()}
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                border: 'none',
                background: '#22c55e',
                color: '#fff',
                fontSize: '24px',
                cursor: 'pointer',
              }}
            >
              ✓
            </button>
          </div>
        </>
      )}

      {/* === VÄG SPARAD POPUP === */}
      {showSavedPopup && !showAvslutaBekraftelse && (
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

            <button onClick={() => {
              setShowSavedPopup(false);
              setStickvagOversikt(true);
            }} style={{
              width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
              background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: '14px',
              fontWeight: '500', cursor: 'pointer',
            }}>
              Översikt
            </button>
          </div>

          <button onClick={() => setShowAvslutaBekraftelse(true)} style={{
            marginTop: '24px', padding: '12px 24px',
            border: 'none', background: 'transparent', color: '#fff',
            fontSize: '14px', opacity: 0.4, cursor: 'pointer',
          }}>
            Avsluta snitsling
          </button>
        </div>
      )}

      {/* === BEKRÄFTA AVSLUTA SNITSLING === */}
      {showAvslutaBekraftelse && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: '#000',
          zIndex: 520,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: '20px',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
          </div>
          
          <div style={{ fontSize: '18px', fontWeight: '500', marginBottom: '8px', color: '#fff' }}>
            Avsluta snitsling?
          </div>
          <div style={{ fontSize: '14px', opacity: 0.5, textAlign: 'center', marginBottom: '32px', lineHeight: 1.5, color: '#fff' }}>
            Allt ditt arbete sparas automatiskt.<br/>
            Du kan fortsätta när som helst.
          </div>

          <div style={{
            background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px', padding: '16px', width: '100%', maxWidth: '260px',
            marginBottom: '12px', color: '#fff',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ opacity: 0.5, fontSize: '14px' }}>Sparade vägar</span>
              <span style={{ fontSize: '14px' }}>{markers.filter(m => m.isLine && ['sideRoadRed', 'sideRoadYellow', 'sideRoadBlue'].includes(m.lineType || '')).length} st</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ opacity: 0.5, fontSize: '14px' }}>Symboler</span>
              <span style={{ fontSize: '14px' }}>{markers.filter(m => m.isMarker).length} st</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ opacity: 0.5, fontSize: '14px' }}>Zoner</span>
              <span style={{ fontSize: '14px' }}>{markers.filter(m => m.isZone).length} st</span>
            </div>
          </div>

          <button
            onClick={() => {
              setShowAvslutaBekraftelse(false);
              setShowSavedPopup(false);
              setStickvagMode(false);
              setStickvagOversikt(false);
              previousStickvagRef.current = null;
              setMenuOpen(true);
              setMenuHeight(window.innerHeight * 0.7);
            }}
            style={{
              width: '100%',
              maxWidth: '260px',
              padding: '16px',
              borderRadius: '14px',
              border: 'none',
              background: '#22c55e',
              color: '#fff',
              fontSize: '15px',
              fontWeight: '500',
              cursor: 'pointer',
              marginBottom: '12px',
            }}
          >
            Spara och avsluta
          </button>

          <button
            onClick={() => setShowAvslutaBekraftelse(false)}
            style={{
              padding: '12px 24px',
              background: 'none',
              border: 'none',
              color: '#fff',
              fontSize: '14px',
              opacity: 0.5,
              cursor: 'pointer',
            }}
          >
            Fortsätt snitsla
          </button>
        </div>
      )}

      {/* === STICKVÄGSVY ÖVERSIKT (TESLA-STIL) === */}
      {stickvagOversikt && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'transparent',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          pointerEvents: 'none',
        }}>

          {/* GPS vänster */}
          <div style={{ position: 'absolute', top: '50px', left: '14px', zIndex: 110, pointerEvents: 'auto' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 12px', borderRadius: '10px', background: 'rgba(0,0,0,0.5)',
            }}>
              <div style={{ width: '6px', height: '6px', background: gpsPaused ? '#666' : '#22c55e', borderRadius: '50%' }} />
              <span style={{ fontSize: '11px', color: '#fff', opacity: 0.6 }}>GPS</span>
            </div>
          </div>

          {/* Zoom */}
          <div style={{
            position: 'absolute', bottom: '100px', right: '14px',
            display: 'flex', flexDirection: 'column', gap: '4px', zIndex: 110,
            pointerEvents: 'auto',
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

          {/* Stats + Stäng länk längst ner (när inget är valt) */}
          {!selectedOversiktVag && !selectedOversiktItem && (
            <div style={{
              position: 'absolute',
              bottom: '100px',
              left: 0,
              right: 0,
              textAlign: 'center',
              zIndex: 110,
              pointerEvents: 'auto',
            }}>
              <div style={{ fontSize: '13px', color: '#fff', opacity: 0.4, marginBottom: '16px' }}>
                {markers.filter(m => m.isLine && ['sideRoadRed', 'sideRoadYellow', 'sideRoadBlue'].includes(m.lineType || '')).length} vägar • {markers.filter(m => m.isMarker).length} symboler
              </div>
              <button
                onClick={() => {
                  setStickvagOversikt(false);
                  setStickvagMode(true);
                  setShowSavedPopup(true);
                }}
                style={{
                  background: 'rgba(255,255,255,0.15)',
                  border: 'none',
                  color: '#fff',
                  fontSize: '15px',
                  padding: '12px 24px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                }}
              >
                ← Tillbaka till gallring
              </button>
            </div>
          )}

          {/* Info-panel för vald väg */}
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            background: '#0a0a0a',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '24px 24px 0 0',
            padding: '20px',
            paddingBottom: '60px',
            transform: selectedOversiktVag ? 'translateY(0)' : 'translateY(100%)',
            transition: 'transform 0.3s ease-out',
            zIndex: 520,
            pointerEvents: 'auto',
          }}>
            {selectedOversiktVag && (() => {
              const lineType = lineTypes.find(t => t.id === selectedOversiktVag.lineType);
              const color = lineType?.color || '#888';
              const colorName = selectedOversiktVag.lineType === 'sideRoadRed' ? 'Röd' : 
                              selectedOversiktVag.lineType === 'sideRoadYellow' ? 'Gul' : 
                              selectedOversiktVag.lineType === 'sideRoadBlue' ? 'Blå' : 'Stickväg';
              const stickvägar = markers.filter(m => m.isLine && ['sideRoadRed', 'sideRoadYellow', 'sideRoadBlue'].includes(m.lineType || ''));
              const vägNummer = stickvägar.findIndex(v => v.id === selectedOversiktVag.id) + 1;
              
              // Beräkna längd
              let längd = 0;
              if (selectedOversiktVag.path && selectedOversiktVag.path.length > 1) {
                for (let i = 1; i < selectedOversiktVag.path.length; i++) {
                  const dx = selectedOversiktVag.path[i].x - selectedOversiktVag.path[i-1].x;
                  const dy = selectedOversiktVag.path[i].y - selectedOversiktVag.path[i-1].y;
                  längd += Math.sqrt(dx*dx + dy*dy);
                }
              }
              
              return (
                <>
                  {/* Drag-indikator */}
                  <div style={{
                    width: '40px', height: '4px',
                    background: 'rgba(255,255,255,0.2)',
                    borderRadius: '2px',
                    margin: '0 auto 16px',
                  }}/>
                  
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px',
                  }}>
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '12px',
                      background: color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
                        <line x1="4" y1="22" x2="4" y2="15"/>
                      </svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '17px', fontWeight: '500', color: '#fff' }}>
                        Väg {vägNummer}
                      </div>
                      <div style={{ fontSize: '13px', opacity: 0.5, color: '#fff' }}>
                        {colorName} stickväg
                      </div>
                    </div>
                  </div>

                  <div style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '16px',
                    padding: '16px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <span style={{ opacity: 0.5, fontSize: '14px', color: '#fff' }}>Längd</span>
                      <span style={{ fontSize: '14px', color: '#fff' }}>{Math.round(längd)} m</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ opacity: 0.5, fontSize: '14px', color: '#fff' }}>Kommentar</span>
                      <span style={{ fontSize: '14px', opacity: 0.5, color: '#fff' }}>
                        {selectedOversiktVag.comment || 'Ingen'}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedOversiktVag(null)}
                    style={{
                      marginTop: '16px',
                      width: '100%',
                      padding: '14px',
                      borderRadius: '12px',
                      border: 'none',
                      background: 'rgba(255,255,255,0.08)',
                      color: '#fff',
                      fontSize: '14px',
                      cursor: 'pointer',
                    }}
                  >
                    Stäng
                  </button>

                  <button
                    onClick={() => {
                      deleteMarkerFromDb(selectedOversiktVag.id);
                      setMarkers(prev => prev.filter(m => m.id !== selectedOversiktVag.id));
                      setSelectedOversiktVag(null);
                    }}
                    style={{
                      marginTop: '8px',
                      width: '100%',
                      padding: '14px',
                      borderRadius: '12px',
                      border: 'none',
                      background: 'rgba(239,68,68,0.2)',
                      color: '#ef4444',
                      fontSize: '14px',
                      cursor: 'pointer',
                      pointerEvents: 'auto',
                    }}
                  >
                    Ta bort väg
                  </button>
                </>
              );
            })()}
          </div>

          {/* Info-panel för vald symbol/zon */}
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            background: '#0a0a0a',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '24px 24px 0 0',
            padding: '20px',
            paddingBottom: '60px',
            transform: selectedOversiktItem ? 'translateY(0)' : 'translateY(100%)',
            transition: 'transform 0.3s ease-out',
            zIndex: 521,
            pointerEvents: 'auto',
          }}>
            {selectedOversiktItem && (() => {
              const isSymbol = selectedOversiktItem.isMarker;
              const isZone = selectedOversiktItem.isZone;
              const symbolType = isSymbol ? markerTypes.find(t => t.id === selectedOversiktItem.type) : null;
              const zoneTypeDef = isZone ? zoneTypes.find(t => t.id === selectedOversiktItem.zoneType) : null;
              const name = symbolType?.name || zoneTypeDef?.name || 'Okänd';
              const color = zoneTypeDef?.color || getIconBackground(selectedOversiktItem.type || '');
              
              return (
                <>
                  {/* Drag-indikator */}
                  <div style={{
                    width: '40px', height: '4px',
                    background: 'rgba(255,255,255,0.2)',
                    borderRadius: '2px',
                    margin: '0 auto 16px',
                  }}/>
                  
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px',
                  }}>
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '12px',
                      background: color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isZone ? (
                        <span style={{ fontSize: '18px', color: '#fff' }}>▢</span>
                      ) : (
                        <span style={{ fontSize: '18px', color: '#fff' }}>◉</span>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '17px', fontWeight: '500', color: '#fff' }}>
                        {name}
                      </div>
                      <div style={{ fontSize: '13px', opacity: 0.5, color: '#fff' }}>
                        {isZone ? 'Zon' : 'Symbol'}
                      </div>
                    </div>
                  </div>

                  {selectedOversiktItem.comment && (
                    <div style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '16px',
                      padding: '16px',
                      marginBottom: '16px',
                    }}>
                      <div style={{ opacity: 0.5, fontSize: '12px', color: '#fff', marginBottom: '8px' }}>Kommentar</div>
                      <div style={{ fontSize: '14px', color: '#fff' }}>{selectedOversiktItem.comment}</div>
                    </div>
                  )}

                  <button
                    onClick={() => setSelectedOversiktItem(null)}
                    style={{
                      width: '100%',
                      padding: '14px',
                      borderRadius: '12px',
                      border: 'none',
                      background: 'rgba(255,255,255,0.08)',
                      color: '#fff',
                      fontSize: '14px',
                      cursor: 'pointer',
                    }}
                  >
                    Stäng
                  </button>

                  <button
                    onClick={() => {
                      deleteMarkerFromDb(selectedOversiktItem.id);
                      setMarkers(prev => prev.filter(m => m.id !== selectedOversiktItem.id));
                      setSelectedOversiktItem(null);
                    }}
                    style={{
                      marginTop: '8px',
                      width: '100%',
                      padding: '14px',
                      borderRadius: '12px',
                      border: 'none',
                      background: 'rgba(239,68,68,0.2)',
                      color: '#ef4444',
                      fontSize: '14px',
                      cursor: 'pointer',
                      pointerEvents: 'auto',
                    }}
                  >
                    Ta bort {isZone ? 'zon' : 'symbol'}
                  </button>
                </>
              );
            })()}
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

      {/* Brandrisk: eld-ikon som HTML-overlay (alltid synlig vid FWI >= 3) */}
      {((brandRisk?.status === 'done' && ((brandRisk.currentIdx ?? 0) >= 3 || brandEldningsforbud)) || brandTestMode !== null) && activeCategory !== 'brandrisk' && (
        <div
          onClick={() => { setActiveCategory('brandrisk'); setMenuOpen(true); }}
          style={{
            position: 'absolute',
            right: 16,
            top: 80,
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: (brandRisk?.currentIdx ?? 0) >= 5 ? 'rgba(239,68,68,0.9)' : 'rgba(234,179,8,0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 100,
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            pointerEvents: 'auto',
          }}
        >
          <span style={{ fontSize: '20px' }}>{'\u{1F525}'}</span>
          {brandTestMode !== null && (
            <div style={{ position: 'absolute', top: -6, right: -6, background: '#eab308', color: '#000', fontSize: '7px', fontWeight: '800', padding: '2px 4px', borderRadius: '4px', lineHeight: '1' }}>TEST</div>
          )}
        </div>
      )}

      {/* TMA: Varning visas som pulserande röd linje på kartan (MapLibre layer, klickbar) */}

      {/* === TMA / VÄG-PANEL === */}
      {tmaOpen && tmaResults[tmaOpen] && tmaResults[tmaOpen].status === 'done' && tmaResults[tmaOpen].roads.length > 0 && (() => {
        const boundaryId = tmaOpen;
        const mainRoad = tmaResults[boundaryId].roads[0];
        const isRed = ['trunk', 'trunk_link', 'primary', 'primary_link'].includes(mainRoad.type) || (mainRoad.maxspeed || 0) >= 80;
        const roadLabel = mainRoad.ref ? `${mainRoad.ref} · ${mainRoad.name}` : mainRoad.name;
        const speedLabel = mainRoad.maxspeed ? `${mainRoad.maxspeed} km/h` : '';

        // Traktnummer baserat på ordning bland boundaries med vägvarning
        const boundaryIds = markers.filter(m => m.isLine && m.lineType === 'boundary' && m.path && m.path.length > 1).map(m => String(m.id));
        const traktIndex = boundaryIds.indexOf(boundaryId) + 1;
        const traktLabel = traktIndex > 0 ? `Trakt ${traktIndex}` : 'Trakt';

        // Per-boundary risk och samråd
        const bRisk = tmaRisk[boundaryId] || [null, null, null, null, null, null, null];
        const bSamrad = tmaSamrad[boundaryId] || { fallare: '', tmaBil: null, checkboxes: [false, false, false, false, false, false], datum: new Date().toISOString().split('T')[0], kvitterad: false, kvitteradDatum: '' };

        // Styles – identiska med avläggspanelen
        const secStyle = { marginTop: '24px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '20px' };
        const headStyle: React.CSSProperties = { fontSize: '11px', fontWeight: '600', color: '#fff', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '12px' };
        const summaryStyle: React.CSSProperties = { ...headStyle, cursor: 'pointer', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0' };
        const textStyle = { fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: '1.7' as const };
        const linkStyle = { fontSize: '13px', color: '#60a5fa', textDecoration: 'none' as const };

        // Riskbedömning (7 frågor: 0-3 original, 4-6 väder)
        const riskLabels = [
          'Kan träd falla mot vägen?',
          'Behöver maskiner korsa eller stå på vägen?',
          'Kommer personal att arbeta inom 20m från vägkant?',
          'Behövs manuell fällning nära vägen?',
          'Blåser det mot vägen?',
          'Är träden snötyngda eller istyngda?',
          'Finns det synligt rötskadade träd nära vägen?',
        ];
        const answeredCount = bRisk.filter(v => v !== null).length;
        const jaCount = bRisk.filter(v => v === true).length;
        // "Blåser mot vägen" (index 4) = Ja höjer risken ett steg
        const windBoost = bRisk[4] === true ? 1 : 0;
        const baseLevel = answeredCount < 7 ? null : (jaCount >= 3 || bRisk[1] === true) ? 'high' : jaCount >= 1 ? 'medium' : 'low';
        const riskLevel = baseLevel === null ? null : windBoost > 0 ? (baseLevel === 'low' ? 'medium' : baseLevel === 'medium' ? 'high' : 'high') : baseLevel;

        // Vädervarningar
        const wWind = tmaWeather?.windSpeed;
        const wTemp = tmaWeather?.temp;
        const wPrecip = tmaWeather?.precip;
        const windWarningRed = wWind != null && wWind > 15;
        const windWarningYellow = wWind != null && wWind > 10 && !windWarningRed;
        const snowWarning = (wPrecip === 1 || wPrecip === 2) && wTemp != null && wTemp >= -2 && wTemp <= 2;

        // Samråd checkboxar
        const samradLabels = [
          'Vilka träd ska fällas och var',
          'Fallriktning bestämd (bort från väg)',
          'TMA-bilens placering',
          'Kommunikation (radio/telefon)',
          'Vem avbryter vid fara',
          'Säkerhetsavstånd mellan maskin och fällare',
        ];

        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 600,
            }}
            onClick={() => setTmaOpen(null)}
          >
            <div
              style={{
                background: '#000',
                borderRadius: '24px',
                padding: '28px',
                width: '90%',
                maxWidth: '500px',
                maxHeight: '85vh',
                overflowY: 'auto',
                boxShadow: '0 12px 60px rgba(0,0,0,0.9)',
                border: '1px solid rgba(255,255,255,0.15)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header med ikon och titel */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '14px',
                marginBottom: '8px',
              }}>
                <div style={{
                  width: '52px',
                  height: '52px',
                  background: isRed ? 'rgba(239,68,68,0.15)' : 'rgba(234,179,8,0.15)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: `2px solid ${isRed ? 'rgba(239,68,68,0.3)' : 'rgba(234,179,8,0.3)'}`,
                  fontSize: '24px',
                }}>
                  ⚠
                </div>
                <span style={{ fontSize: '20px', fontWeight: '600', color: '#fff' }}>Avverkning nära väg – {traktLabel}</span>
              </div>

              {/* Samråd-status (diskret vit text, centrerad) */}
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginBottom: '20px', textAlign: 'center' }}>
                {bSamrad.kvitterad
                  ? `Samråd genomfört ${bSamrad.kvitteradDatum}`
                  : 'Samråd ej genomfört'
                }
              </div>

              {/* Rubrik + Väg + Avstånd – allt på en rad */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                paddingBottom: '20px',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
              }}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: '700', color: isRed ? '#ef4444' : '#eab308', marginBottom: '4px' }}>
                    {isRed ? 'Avverkning nära skyddsklassad väg' : 'Allmän väg nära avverkning'}
                  </div>
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>
                    {roadLabel}{speedLabel ? ` · ${speedLabel}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '20px' }}>
                  <div style={{ fontSize: '28px', fontWeight: '700', color: '#fff', lineHeight: '1' }}>
                    {mainRoad.distance}m
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '4px' }}>
                    till väg
                  </div>
                </div>
              </div>

              {/* ===== VÄDER (SMHI) ===== */}
              {tmaWeather && tmaWeather.status === 'done' && (
                <div style={secStyle}>
                  <div style={headStyle}>Väder just nu</div>
                  <div style={{ display: 'flex', gap: '20px', alignItems: 'baseline' }}>
                    {tmaWeather.windSpeed != null && (
                      <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>
                        {tmaWeather.windArrow} {tmaWeather.windSpeed} m/s {tmaWeather.windDirLabel}
                      </div>
                    )}
                    {tmaWeather.temp != null && (
                      <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>
                        {tmaWeather.temp}°C
                      </div>
                    )}
                    {tmaWeather.precipLabel ? (
                      <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>
                        {tmaWeather.precipLabel}
                      </div>
                    ) : null}
                  </div>

                  {/* Vädervarningar */}
                  {windWarningRed && (
                    <div style={{ marginTop: '10px', fontSize: '13px', fontWeight: '500', color: '#ef4444' }}>
                      Mycket stark vind – avbryt fällning nära väg
                    </div>
                  )}
                  {windWarningYellow && (
                    <div style={{ marginTop: '10px', fontSize: '13px', fontWeight: '500', color: '#eab308' }}>
                      Stark vind – kontrollera fallriktning mot väg
                    </div>
                  )}
                  {snowWarning && (
                    <div style={{ marginTop: '10px', fontSize: '13px', fontWeight: '500', color: '#eab308' }}>
                      Snötyngda träd – ökad risk för oväntad fallriktning
                    </div>
                  )}
                </div>
              )}
              {tmaWeather && tmaWeather.status === 'loading' && (
                <div style={secStyle}>
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>Hämtar väder...</div>
                </div>
              )}

              {/* ===== SEKTION 1: Riskbedömning ===== */}
              <details open style={secStyle}>
                <summary style={summaryStyle}>
                  <span>Riskbedömning – arbete nära väg</span>
                  {answeredCount === 7 && (
                    <span style={{ fontSize: '11px', fontWeight: '500', letterSpacing: '0', textTransform: 'none' as const, color: riskLevel === 'low' ? '#22c55e' : riskLevel === 'medium' ? '#eab308' : '#ef4444' }}>
                      {riskLevel === 'low' ? 'Låg risk' : riskLevel === 'medium' ? 'Förhöjd' : 'Hög risk'}
                    </span>
                  )}
                </summary>
                <div style={{ marginTop: '12px' }}>
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: '1.7', marginBottom: '16px' }}>
                    Enligt AML 3 kap 2§ ska arbetsgivaren bedöma risker innan arbete påbörjas.
                  </div>

                  {/* Frågor – label och Ja/Nej bredvid varandra */}
                  {riskLabels.map((label, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '14px' }}>
                      <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', flex: 1, lineHeight: '1.4' }}>{label}</div>
                      <div style={{ display: 'flex', gap: '6px', padding: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', flexShrink: 0 }}>
                        {([true, false] as const).map(val => {
                          const isActive = bRisk[i] === val;
                          const activeColor = val ? '#eab308' : '#22c55e';
                          return (
                            <button key={String(val)} onClick={() => setTmaRisk(prev => { const old = prev[boundaryId] || [null, null, null, null, null, null, null]; const n = [...old]; n[i] = val; return { ...prev, [boundaryId]: n }; })}
                              style={{ flex: 1, minWidth: '50px', padding: '10px 0', borderRadius: '8px', border: 'none', background: isActive ? activeColor : 'transparent', color: isActive ? '#000' : 'rgba(255,255,255,0.5)', fontSize: '12px', fontWeight: isActive ? '700' : '500', cursor: 'pointer', transition: 'all 0.2s' }}>
                              {val ? 'Ja' : 'Nej'}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {/* Resultat */}
                  {riskLevel && (
                    <div style={{ marginTop: '8px', fontSize: '13px', fontWeight: '500', lineHeight: '1.5', color: riskLevel === 'low' ? '#22c55e' : riskLevel === 'medium' ? '#eab308' : '#ef4444' }}>
                      {riskLevel === 'low' && 'Låg risk – tänk på skyltning vid fällning nära väg'}
                      {riskLevel === 'medium' && 'Förhöjd risk – varningsskyltar och farthinder rekommenderas'}
                      {riskLevel === 'high' && 'Hög risk – TMA-bil eller avstängd vägbana rekommenderas'}
                    </div>
                  )}
                </div>
              </details>

              {/* ===== SEKTION 2: Att tänka på ===== */}
              <details style={secStyle}>
                <summary style={summaryStyle}>
                  <span>Att tänka på</span>
                  <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.2)' }}>›</span>
                </summary>
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[
                    'Fäll alltid bort från vägen.',
                    'Säkerhetsavstånd minst 1,5 × trädlängd från vägkant.',
                    'Varningsskyltar vid fällning nära väg.',
                    'Maskiner ska inte stå på allmän väg utan tillstånd.',
                    'Kontakta Trafikverket om arbete måste ske på vägbanan.',
                  ].map((t, i) => <div key={i} style={textStyle}>{t}</div>)}
                </div>
              </details>

              {/* ===== SEKTION 3: Samråd ===== */}
              <details open={bRisk[3] === true} style={secStyle}>
                <summary style={summaryStyle}>
                  <span>Samråd – gemensamt arbetsställe</span>
                  {bSamrad.kvitterad ? (
                    <span style={{ fontSize: '11px', fontWeight: '500', letterSpacing: '0', textTransform: 'none' as const, color: '#22c55e' }}>Genomfört</span>
                  ) : (
                    <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.2)' }}>›</span>
                  )}
                </summary>
                <div style={{ marginTop: '12px' }}>
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: '1.7', marginBottom: '16px' }}>
                    Enligt AML 3 kap 7g§ ska alla som arbetar på samma ställe samråda om skyddsåtgärder. Det finns ingen branschstandard för skogsbruk – denna mall är baserad på lagen.
                  </div>

                  {bSamrad.kvitterad ? (
                    <div style={{ fontSize: '13px', color: '#22c55e', fontWeight: '500' }}>
                      Samråd genomfört {bSamrad.kvitteradDatum}
                      <button onClick={() => setTmaSamrad(prev => ({ ...prev, [boundaryId]: { ...bSamrad, kvitterad: false, kvitteradDatum: '' } }))} style={{ marginLeft: '12px', fontSize: '12px', color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Ändra</button>
                    </div>
                  ) : (
                    <>
                      {/* Fällare + TMA-bil på en rad */}
                      <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '6px' }}>Manuell fällare (namn/företag)</div>
                          <input
                            type="text"
                            value={bSamrad.fallare}
                            onChange={e => { const v = e.target.value; setTmaSamrad(prev => ({ ...prev, [boundaryId]: { ...bSamrad, fallare: v } })); }}
                            placeholder="Ange namn eller företag"
                            style={{
                              width: '100%', padding: '10px 12px', borderRadius: '8px',
                              border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)',
                              color: '#fff', fontSize: '13px', outline: 'none', boxSizing: 'border-box',
                            }}
                          />
                        </div>
                        <div style={{ width: '140px', flexShrink: 0 }}>
                          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '6px' }}>TMA-bil beställd?</div>
                          <div style={{ display: 'flex', gap: '6px', padding: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                            {([true, false] as const).map(val => {
                              const isActive = bSamrad.tmaBil === val;
                              const activeColor = val ? '#22c55e' : 'rgba(255,255,255,0.3)';
                              return (
                                <button key={String(val)} onClick={() => setTmaSamrad(prev => ({ ...prev, [boundaryId]: { ...bSamrad, tmaBil: val } }))}
                                  style={{ flex: 1, padding: '10px 0', borderRadius: '8px', border: 'none', background: isActive ? activeColor : 'transparent', color: isActive ? '#000' : 'rgba(255,255,255,0.5)', fontSize: '12px', fontWeight: isActive ? '700' : '500', cursor: 'pointer', transition: 'all 0.2s' }}>
                                  {val ? 'Ja' : 'Nej'}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Checkboxar */}
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>Genomgånget tillsammans</div>
                      <div style={{ marginBottom: '20px' }}>
                        {samradLabels.map((label, i) => (
                          <div key={i}
                            onClick={() => setTmaSamrad(prev => { const old = prev[boundaryId] || bSamrad; const cb = [...old.checkboxes]; cb[i] = !cb[i]; return { ...prev, [boundaryId]: { ...old, checkboxes: cb } }; })}
                            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <div style={{
                              width: '18px', height: '18px', borderRadius: '4px',
                              border: `1.5px solid ${bSamrad.checkboxes[i] ? '#22c55e' : 'rgba(255,255,255,0.15)'}`,
                              background: bSamrad.checkboxes[i] ? 'rgba(34,197,94,0.12)' : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }}>
                              {bSamrad.checkboxes[i] && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3"><path d="M5 13l4 4L19 7" /></svg>}
                            </div>
                            <span style={{ fontSize: '13px', color: bSamrad.checkboxes[i] ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.6)', textDecoration: bSamrad.checkboxes[i] ? 'line-through' : 'none', lineHeight: '1.4' }}>
                              {label}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Datum + Kvittera på en rad */}
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                        <div style={{ width: '160px', flexShrink: 0 }}>
                          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '6px' }}>Datum</div>
                          <input
                            type="date"
                            value={bSamrad.datum}
                            onChange={e => { const v = e.target.value; setTmaSamrad(prev => ({ ...prev, [boundaryId]: { ...bSamrad, datum: v } })); }}
                            style={{
                              width: '100%', padding: '10px 12px', borderRadius: '8px',
                              border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)',
                              color: '#fff', fontSize: '13px', outline: 'none', boxSizing: 'border-box',
                              colorScheme: 'dark',
                            }}
                          />
                        </div>
                        <button
                          onClick={() => setTmaSamrad(prev => ({ ...prev, [boundaryId]: { ...bSamrad, kvitterad: true, kvitteradDatum: bSamrad.datum } }))}
                          style={{
                            flex: 1, padding: '14px', borderRadius: '12px', border: 'none',
                            background: '#22c55e', color: '#000', fontSize: '14px', fontWeight: '600',
                            cursor: 'pointer',
                          }}
                        >
                          Samråd genomfört
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </details>

              {/* ===== SEKTION 4: TMA-leverantörer ===== */}
              <details style={secStyle}>
                <summary style={summaryStyle}>
                  <span>TMA-leverantörer</span>
                  <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.2)' }}>›</span>
                </summary>
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginBottom: '2px' }}>Ramudden: 010-303 50 00</div>
                    <a href="https://www.ramudden.se/tjanster/trafiktjanster/tma" target="_blank" rel="noopener noreferrer" style={linkStyle}>ramudden.se →</a>
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginBottom: '2px' }}>Assistancekåren</div>
                    <a href="https://assistancekaren.se" target="_blank" rel="noopener noreferrer" style={linkStyle}>assistancekaren.se →</a>
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>Trafikverket (frågor om krav): 0771-921 921</div>
                  </div>
                </div>
              </details>

              {/* ===== LÄNKAR ===== */}
              <div style={{ ...secStyle, borderBottom: 'none' }}>
                <div style={headStyle}>Mer information</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <a href="https://www.skogforsk.se/rad--stod/filmer--publikationer/avverkning-av-trad-nara-trafikerade-vagar/" target="_blank" rel="noopener noreferrer" style={linkStyle}>
                    Skogforsk – Avverkning nära vägar →
                  </a>
                  <a href="https://bransch.trafikverket.se/for-dig-i-branschen/Arbetsmiljo-och-sakerhet/Arbete-pa-vag/" target="_blank" rel="noopener noreferrer" style={linkStyle}>
                    Trafikverket – Arbete på väg →
                  </a>
                  <a href="https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/arbetsmiljolag-19771160_sfs-1977-1160/" target="_blank" rel="noopener noreferrer" style={linkStyle}>
                    Arbetsmiljölagen 3 kap →
                  </a>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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

            {/* Vägsäkerhet – TMA-varning per boundary */}
            {tmaWithRoads.map(([bmId, result]) => {
              const mainRoad = result.roads[0];
              const isRed = mainRoad.skyddsklassad && ((mainRoad.maxspeed || 0) >= 80 || ['trunk', 'trunk_link', 'primary', 'primary_link'].includes(mainRoad.type));
              const roadLabel = mainRoad.ref ? `${mainRoad.ref} · ${mainRoad.name}` : mainRoad.name;
              const speedLabel = mainRoad.maxspeed ? `${mainRoad.maxspeed} km/h` : '';
              return (
                <div
                  key={`prognos-tma-${bmId}`}
                  onClick={() => setTmaOpen(bmId)}
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    borderRadius: '16px',
                    padding: '20px',
                    marginBottom: '16px',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: isRed ? '#ef4444' : '#eab308', flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: '500', color: '#fff' }}>Avverkning nära väg</div>
                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
                          {roadLabel}{speedLabel ? ` · ${speedLabel}` : ''} · {mainRoad.distance}m
                        </div>
                      </div>
                    </div>
                    <span style={{ fontSize: '16px', color: 'rgba(255,255,255,0.2)' }}>›</span>
                  </div>
                </div>
              );
            })}

            {/* TMA loading */}
            {Object.values(tmaResults).some(r => r.status === 'loading') && (
              <div style={{
                background: 'rgba(255,255,255,0.04)',
                borderRadius: '16px',
                padding: '20px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}>
                <div style={{
                  width: '16px', height: '16px', borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.2)',
                  borderTopColor: '#60a5fa',
                  animation: 'spin 1s linear infinite',
                }} />
                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>Kontrollerar vägar nära traktgränsen...</span>
              </div>
            )}

            {/* TMA error */}
            {Object.entries(tmaResults).filter(([, r]) => r.status === 'error').map(([bmId, result]) => (
              <div key={`prognos-tma-err-${bmId}`} style={{
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
                  marginBottom: '12px',
                }}>
                  Vägsäkerhet
                </div>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>
                  {result.message || 'Kunde inte hämta vägdata'}
                </div>
                <button
                  onClick={() => {
                    delete tmaCheckedRef.current[bmId];
                    setTmaResults(prev => { const next = { ...prev }; delete next[bmId]; return next; });
                    setMarkers(prev => [...prev]);
                  }}
                  style={{
                    marginTop: '10px',
                    fontSize: '12px',
                    color: '#60a5fa',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Försök igen
                </button>
              </div>
            ))}

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

      {/* Sparat-toast */}
      {showSaveToast && (
        <div style={{
          position: 'fixed',
          top: '80px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10000,
          background: 'rgba(34,197,94,0.95)',
          color: '#fff',
          padding: '12px 28px',
          borderRadius: '12px',
          fontSize: '16px',
          fontWeight: '600',
          pointerEvents: 'none',
        }}>
          Sparat!
        </div>
      )}
    </div>
  );
}
