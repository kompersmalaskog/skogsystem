'use client';

// Kartan i rundvyn. 180 px, sticky overst - poangen ar att se var man ar medan
// man gar, och det ar vart en tredjedel av skarmen.
//
// TVA LAGER SOM ALDRIG FAR BLANDAS IHOP:
//
//   KONTROLLPUNKTERNA ritas ur punkternas geometri_snapshot. Snapshotten ar
//   dokumentets sanning - den overlever att markeringen raderas i planeringen.
//   De bar status som farg och gar att centrera pa.
//
//   KONTEXTLAGRET (grans, diken, pilar ...) lases ur planering_markeringar och
//   ar bara orientering. Nedtonat, underordnat, INTE tryckbart. Det ar inte
//   innehall i dokumentet och ska inte se ut som det.
//
// BOUNDS KRAVS FOR MARKERINGARNA, INTE FOR POSITIONEN. Markeringar ligger i en
// SVG-rymd vars origo harleds ur kartbild_bounds. Saknas bounds ritas INGA
// markeringar - lat/lng-fallbacken anvander ett annat origo an det planeraren
// ritade mot, och den familjen har gett flera mils fel (#278, #322). GPS-
// positionen ar daremot redan WGS84 och behover ingenting.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildForarkartaStyle, FORARKARTA_ATTRIBUTION } from '@/app/oversikt/forarkarta-stil';
import { signeraKartfil } from '@/lib/kartfiler';
import {
  kartOrigoFranBounds,
  pathTillGeoJson,
  svgTillGeoJson,
  type Origo,
} from '@/lib/kartkoordinater';
import { T } from '@/lib/utbildning';
import type { EgenkontrollPunkt, EgenkontrollProvyta } from '@/lib/egenkontroll';

declare global {
  interface Window { maplibregl: any }
}

const HOJD = 180;

/** Status som farg. Listan sager samma sak i text - fargen bar aldrig ensam. */
const STATUSFARG: Record<string, string> = {
  ok: '#30D158',
  avvikelse: '#FF453A',
  bra: '#30D158',
  godkant: '#0A84FF',
  battre: '#FFD60A',
};
const OBESVARAD = '#8E8E93';

function farg(status: string | null): string {
  return (status && STATUSFARG[status]) || OBESVARAD;
}

export type KartObjektData = {
  lat?: number | null;
  lng?: number | null;
  kartbild_url?: string | null;
  kartbild_bounds?: unknown;
};

type Geo = { type: 'FeatureCollection'; features: any[] };
const TOM: Geo = { type: 'FeatureCollection', features: [] };

/** Punktens snapshot -> GeoJSON. null nar punkten inte ar en plats. */
function punktTillFeature(p: EgenkontrollPunkt, origo: Origo): any | null {
  const g = p.geometri_snapshot as { x?: number; y?: number; path?: { x: number; y: number }[] } | null;
  if (!g) return null; // kalla='fast' - utforandepunkter ar inte platser
  const props = { id: p.id, farg: farg(p.status), status: p.status ?? 'obesvarad' };

  if (Array.isArray(g.path)) {
    const coords = pathTillGeoJson(g.path, origo);
    if (coords.length < 2) return null;
    return { type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: coords } };
  }
  if (typeof g.x === 'number' && typeof g.y === 'number') {
    return {
      type: 'Feature',
      properties: props,
      geometry: { type: 'Point', coordinates: svgTillGeoJson(g.x, g.y, origo) },
    };
  }
  return null;
}

export default function RundKarta({
  objekt,
  punkter,
  kontext,
  provytor,
  valdPunktId,
  onPosition,
}: {
  objekt: KartObjektData | null;
  punkter: EgenkontrollPunkt[];
  /** Ravt data ur planering_markeringar - bara orientering. */
  kontext: { data: any }[];
  provytor: EgenkontrollProvyta[];
  valdPunktId: string | null;
  /** Positionen delas uppat sa avstandslistan slipper en egen GPS-prenumeration. */
  onPosition?: (p: { lat: number; lng: number; noggrannhet: number | null } | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [laddad, setLaddad] = useState(false);
  const [minPosition, setMinPosition] = useState<[number, number] | null>(null);
  const [positionsFel, setPositionsFel] = useState(false);

  const origo = useMemo(() => (objekt ? kartOrigoFranBounds(objekt) : null), [objekt]);
  // Ref sa hamtaPosition inte behover onPosition i sitt beroende och far ny identitet.
  const onPositionRef = useRef(onPosition);
  onPositionRef.current = onPosition;

  // --- Geometrierna ---------------------------------------------------------
  const punktGeo = useMemo<Geo>(() => {
    if (!origo) return TOM;
    const features = punkter.map((p) => punktTillFeature(p, origo)).filter(Boolean);
    return { type: 'FeatureCollection', features };
  }, [punkter, origo]);

  const kontextGeo = useMemo<Geo>(() => {
    if (!origo) return TOM;
    const features: any[] = [];
    for (const m of kontext) {
      const d = m?.data;
      if (!d || typeof d !== 'object') continue;
      if (Array.isArray(d.path)) {
        const coords = pathTillGeoJson(d.path, origo);
        if (coords.length >= 2) {
          features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } });
        }
      } else if (typeof d.x === 'number' && typeof d.y === 'number') {
        features.push({
          type: 'Feature', properties: {},
          geometry: { type: 'Point', coordinates: svgTillGeoJson(d.x, d.y, origo) },
        });
      }
    }
    return { type: 'FeatureCollection', features };
  }, [kontext, origo]);

  /**
   * Provytorna. Egen farg (bla), skild fran planens markeringar och fran
   * statusfargerna. Matt = fylld, ej matt = ihalig ring.
   *
   * Ritas i FAST pixelstorlek, inte i sann skala: ytan ar 5,64 m i radie och
   * trakten ar over en kilometer bred, sa en sannskalig cirkel vore mindre an
   * en bildpunkt. Kartan ska hjalpa en att HITTA ytan - avstandslistan under
   * kartan ar det man faktiskt gar efter.
   */
  const provyteGeo = useMemo<Geo>(() => ({
    type: 'FeatureCollection',
    features: provytor
      .filter((y) => y.lat != null && y.lng != null)
      .map((y) => ({
        type: 'Feature',
        properties: { nummer: y.nummer, matt: y.matt != null || y.overhoppad ? 1 : 0 },
        geometry: { type: 'Point', coordinates: [y.lng as number, y.lat as number] },
      })),
  }), [provytor]);

  /** Avvikelsernas EGNA positioner - redan WGS84, ingen konvertering. */
  const avvikelseGeo = useMemo<Geo>(() => ({
    type: 'FeatureCollection',
    features: punkter
      .filter((p) => p.lat != null && p.lng != null)
      .map((p) => ({
        type: 'Feature', properties: { id: p.id },
        geometry: { type: 'Point', coordinates: [p.lng as number, p.lat as number] },
      })),
  }), [punkter]);

  // --- Egen position. WGS84, kraver ingen bounds. --------------------------
  const hamtaPosition = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setPositionsFel(true); return; }
    setPositionsFel(false);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setMinPosition([p.coords.longitude, p.coords.latitude]);
        onPositionRef.current?.({
          lat: p.coords.latitude, lng: p.coords.longitude,
          noggrannhet: Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : null,
        });
      },
      () => { setPositionsFel(true); onPositionRef.current?.(null); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 },
    );
  }, []);

  // Automatiskt forsok. I installerad PWA pa iOS ges ingen platsprompt utan en
  // riktig gest - da tystnar detta och raden nedanfor blir vagen in.
  useEffect(() => { hamtaPosition(); }, [hamtaPosition]);

  // --- MapLibre fran CDN (samma injektion som ovriga kartvyer) -------------
  useEffect(() => {
    if (!document.getElementById('maplibre-css-egenkontroll')) {
      const link = document.createElement('link');
      link.id = 'maplibre-css-egenkontroll';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
      document.head.appendChild(link);
    }
    if (window.maplibregl) { setMapReady(true); return; }
    let script = document.getElementById('maplibre-js-egenkontroll') as HTMLScriptElement | null;
    const onload = () => setMapReady(true);
    if (!script) {
      script = document.createElement('script');
      script.id = 'maplibre-js-egenkontroll';
      script.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
      document.head.appendChild(script);
    }
    script.addEventListener('load', onload);
    if (window.maplibregl) setMapReady(true);
    return () => { script?.removeEventListener('load', onload); };
  }, []);

  // --- Init kartan en gang -------------------------------------------------
  useEffect(() => {
    if (!mapReady || !containerRef.current || mapRef.current || !objekt) return;
    const center: [number, number] = origo
      ? [origo.lng, origo.lat]
      : objekt.lat != null && objekt.lng != null
        ? [objekt.lng, objekt.lat]
        : [14.7, 56.5];

    const map = new window.maplibregl.Map({
      container: containerRef.current,
      style: buildForarkartaStyle(),
      center, zoom: 14, maxPitch: 0, dragRotate: false, attributionControl: false,
    });
    mapRef.current = map;
    try { map.touchZoomRotate.disableRotation(); } catch { /* aldre maplibre */ }
    map.addControl(new window.maplibregl.AttributionControl({
      customAttribution: FORARKARTA_ATTRIBUTION, compact: true,
    }));

    map.on('load', async () => {
      map.resize();

      // VIDA:s kartbild som overlay, nar den finns.
      if (objekt.kartbild_url && objekt.kartbild_bounds) {
        const url = await signeraKartfil(objekt.kartbild_url);
        const b = objekt.kartbild_bounds as [[number, number], [number, number]];
        if (url) {
          map.addSource('ek-kartbild', {
            type: 'image', url,
            // [[south,west],[north,east]] -> hornen medurs fran nordvast
            coordinates: [[b[0][1], b[1][0]], [b[1][1], b[1][0]], [b[1][1], b[0][0]], [b[0][1], b[0][0]]],
          });
          map.addLayer({ id: 'ek-kartbild', type: 'raster', source: 'ek-kartbild', paint: { 'raster-opacity': 0.85 } });
        }
      }

      // KONTEXT underst: nedtonat, tunt, ej tryckbart.
      map.addSource('ek-kontext', { type: 'geojson', data: kontextGeo });
      map.addLayer({
        id: 'ek-kontext-linje', type: 'line', source: 'ek-kontext',
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-join': 'round' },
        paint: { 'line-color': 'rgba(255,255,255,0.45)', 'line-width': 1.2 },
      });
      map.addLayer({
        id: 'ek-kontext-punkt', type: 'circle', source: 'ek-kontext',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-color': 'rgba(255,255,255,0.35)', 'circle-radius': 2.5 },
      });

      // KONTROLLPUNKTERNA over: status som farg.
      map.addSource('ek-punkter', { type: 'geojson', data: punktGeo });
      map.addLayer({
        id: 'ek-punkt-linje', type: 'line', source: 'ek-punkter',
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': ['get', 'farg'], 'line-width': 3 },
      });
      map.addLayer({
        id: 'ek-punkt-symbol', type: 'circle', source: 'ek-punkter',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-color': ['get', 'farg'], 'circle-radius': 6,
          'circle-stroke-color': '#000', 'circle-stroke-width': 1.5,
        },
      });

      // VALD punkt: vit gloria runt den, sa den syns bland lika fargade syskon.
      map.addLayer({
        id: 'ek-vald-linje', type: 'line', source: 'ek-punkter',
        filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'id'], '']],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#fff', 'line-width': 7, 'line-opacity': 0.9 },
      }, 'ek-punkt-linje');
      map.addLayer({
        id: 'ek-vald-symbol', type: 'circle', source: 'ek-punkter',
        filter: ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'id'], '']],
        paint: { 'circle-color': '#fff', 'circle-radius': 11, 'circle-opacity': 0.9 },
      }, 'ek-punkt-symbol');

      // Avvikelsernas egna GPS-positioner - eget lager, egen rymd.
      map.addSource('ek-avvikelser', { type: 'geojson', data: avvikelseGeo });
      map.addLayer({
        id: 'ek-avvikelse', type: 'circle', source: 'ek-avvikelser',
        paint: {
          'circle-color': 'rgba(255,69,58,0.25)', 'circle-radius': 9,
          'circle-stroke-color': '#FF453A', 'circle-stroke-width': 2,
        },
      });

      map.addSource('ek-provytor', { type: 'geojson', data: provyteGeo });
      map.addLayer({
        id: 'ek-provyta-matt', type: 'circle', source: 'ek-provytor',
        filter: ['==', ['get', 'matt'], 1],
        paint: {
          'circle-color': '#0A84FF', 'circle-radius': 7,
          'circle-stroke-color': '#fff', 'circle-stroke-width': 2,
        },
      });
      map.addLayer({
        id: 'ek-provyta-omatt', type: 'circle', source: 'ek-provytor',
        filter: ['==', ['get', 'matt'], 0],
        paint: {
          'circle-color': 'rgba(10,132,255,0.15)', 'circle-radius': 7,
          'circle-stroke-color': '#0A84FF', 'circle-stroke-width': 2,
        },
      });

      map.addSource('ek-jag', { type: 'geojson', data: TOM });
      map.addLayer({
        id: 'ek-jag', type: 'circle', source: 'ek-jag',
        paint: {
          'circle-color': '#0A84FF', 'circle-radius': 6,
          'circle-stroke-color': '#fff', 'circle-stroke-width': 2,
        },
      });

      // STARTVYN PASSAS TILL TRAKTEN, INTE TILL MARKERINGARNA.
      //
      // En enda trasig markering skulle annars sanka hela kartan. Abogen har en
      // kulturlamning vars sparade x/y ar (2854, 2418) mot +/-60 for objektets
      // ovriga tolv punkter - den hamnar 9,9 km bort. Passade vi in alla
      // features skulle trakten krympa till en prick, just pa det objekt som
      // gatts i falt. Kartbildens bounds ar traktens sanna utstrackning.
      // Avvikaren ritas anda och "visa" centrerar pa den, sa datan doljs inte -
      // den far bara inte styra startvyn.
      const b2 = new window.maplibregl.LngLatBounds();
      let nagot = false;
      const bb = objekt.kartbild_bounds as [[number, number], [number, number]] | null;
      if (bb) {
        b2.extend([bb[0][1], bb[0][0]]);
        b2.extend([bb[1][1], bb[1][0]]);
        nagot = true;
      } else {
        for (const f of [...punktGeo.features, ...kontextGeo.features]) {
          const c = f.geometry.coordinates;
          if (f.geometry.type === 'Point') { b2.extend(c); nagot = true; }
          else for (const q of c) { b2.extend(q); nagot = true; }
        }
      }
      if (nagot) map.fitBounds(b2, { padding: 24, maxZoom: 16, duration: 0 });
      setLaddad(true);
    });

    return () => { try { map.remove(); } catch { /* noop */ } mapRef.current = null; setLaddad(false); };
  }, [mapReady, objekt, origo]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Uppdatera data nar status andras -----------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !laddad) return;
    map.getSource('ek-punkter')?.setData(punktGeo);
    map.getSource('ek-avvikelser')?.setData(avvikelseGeo);
    map.getSource('ek-provytor')?.setData(provyteGeo);
  }, [punktGeo, avvikelseGeo, provyteGeo, laddad]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !laddad) return;
    map.getSource('ek-jag')?.setData(
      minPosition
        ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: minPosition } }] }
        : TOM,
    );
  }, [minPosition, laddad]);

  // --- Centrera pa vald punkt ---------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !laddad) return;
    const id = valdPunktId ?? '';
    map.setFilter('ek-vald-linje', ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'id'], id]]);
    map.setFilter('ek-vald-symbol', ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'id'], id]]);
    if (!valdPunktId) return;
    const f = punktGeo.features.find((x: any) => x.properties.id === valdPunktId);
    if (!f) return;
    if (f.geometry.type === 'Point') {
      map.easeTo({ center: f.geometry.coordinates, zoom: Math.max(map.getZoom(), 16), duration: 450 });
    } else {
      const b = new window.maplibregl.LngLatBounds();
      for (const c of f.geometry.coordinates) b.extend(c);
      map.fitBounds(b, { padding: 40, maxZoom: 17, duration: 450 });
    }
  }, [valdPunktId, punktGeo, laddad]);

  // --- Tomma tillstand -----------------------------------------------------
  if (!objekt) return null;

  return (
    <div style={{ marginBottom: 12 }}>
      <div
        ref={containerRef}
        style={{ height: HOJD, borderRadius: 12, overflow: 'hidden', background: '#ECEDE7' }}
      />
      {/* Sag rakt ut vad kartan INTE kan har - anvandaren ska slippa prova sig fram. */}
      {!origo && (
        <div style={{ fontSize: 12.5, color: T.orange, lineHeight: 1.4, marginTop: 6 }}>
          Planeringens markeringar kan inte placeras på kartan för det här objektet.
          Kartan visar var du är, men tryck på en punkt centrerar ingenting.
        </div>
      )}
      {origo && positionsFel && (
        <button
          onClick={hamtaPosition}
          style={{
            marginTop: 6, minHeight: 44, width: '100%', borderRadius: 10,
            border: '1.5px solid rgba(255,255,255,0.14)', background: 'transparent',
            color: T.t2, fontSize: 14, fontFamily: T.ff,
          }}
        >
          Din position kunde inte hämtas — tryck för att försöka igen
        </button>
      )}
    </div>
  );
}
