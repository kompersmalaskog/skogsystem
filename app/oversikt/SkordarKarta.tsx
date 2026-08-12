'use client';

import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { buildForarkartaStyle, FORARKARTA_ATTRIBUTION } from './forarkarta-stil';
import { C } from './oversikt-types';

declare global {
  interface Window { maplibregl: any }
}

type Punkt = { lng: number; lat: number };

/* "Var skördaren kört" — HPR-stammar (hpr_stammar) som diskreta grå prickar på förarvyns
   lugna Lantmäteri-raster. INGEN volym, INGEN procent, INGEN gränspolygon — bara VAR
   maskinen kört, så man ser hur långt avverkningen kommit geografiskt.
   Källa (samma väg som planeringsvyn, men eget minimalt lager): hpr_filer.objekt_nyckel
   ('<maskin>:<vo>') → senaste filen (fil_datum) → hpr_stammar via hpr_fil_id.
   Renderar INGET (null) om objektet saknar HPR-stammar med koordinater. */
export default function SkordarKarta({ vo }: { vo?: string | null }) {
  const [punkter, setPunkter] = useState<Punkt[] | null>(null);   // null = laddar, [] = inga
  const [mapReady, setMapReady] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);

  // 1. Hämta stammar: senaste HPR-filen för vo:t → alla stammar med koordinater (paginerat).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const v = String(vo ?? '').trim();
      if (!/^\d+$/.test(v)) { if (!cancelled) setPunkter([]); return; }
      const { data: filer } = await supabase
        .from('hpr_filer')
        .select('id, fil_datum, objekt_nyckel')
        .order('fil_datum', { ascending: false, nullsFirst: false });
      // Exakt vo-segment (split ':' + ===), aldrig LIKE/mönster. Senaste = första (sorterat desc).
      const fil = (filer ?? []).find((f: any) => String(f.objekt_nyckel ?? '').split(':')[1] === v);
      if (!fil) { if (!cancelled) setPunkter([]); return; }
      const pts: Punkt[] = [];
      let offset = 0;
      while (true) {
        const { data, error } = await supabase
          .from('hpr_stammar')
          .select('lat, lng')
          .eq('hpr_fil_id', fil.id)
          .not('lat', 'is', null)
          .range(offset, offset + 999);
        if (error || !data || data.length === 0) break;
        for (const s of data as any[]) if (s.lat != null && s.lng != null) pts.push({ lng: s.lng, lat: s.lat });
        if (data.length < 1000) break;
        offset += 1000;
      }
      if (!cancelled) setPunkter(pts);
    })();
    return () => { cancelled = true; };
  }, [vo]);

  const harPunkter = punkter != null && punkter.length > 0;

  // 2. Ladda MapLibre CDN (samma injektion som OversiktKarta) — bara när det finns punkter.
  useEffect(() => {
    if (!harPunkter) return;
    if (!document.getElementById('maplibre-css-oversikt')) {
      const link = document.createElement('link');
      link.id = 'maplibre-css-oversikt';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
      document.head.appendChild(link);
    }
    if (window.maplibregl) { setMapReady(true); return; }
    let script = document.getElementById('maplibre-js-oversikt') as HTMLScriptElement | null;
    const onload = () => setMapReady(true);
    if (!script) {
      script = document.createElement('script');
      script.id = 'maplibre-js-oversikt';
      script.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
      document.head.appendChild(script);
    }
    script.addEventListener('load', onload);
    // Om scriptet redan laddat mellan check och listener:
    if (window.maplibregl) setMapReady(true);
    return () => { script?.removeEventListener('load', onload); };
  }, [harPunkter]);

  // 3. Init karta (en gång) — LM-raster + klustrade grå prickar, fitBounds till bbox.
  useEffect(() => {
    if (!mapReady || !harPunkter || !containerRef.current || mapRef.current) return;
    const pts = punkter!;
    const geojson = {
      type: 'FeatureCollection' as const,
      features: pts.map(p => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] }, properties: {} })),
    };
    const map = new window.maplibregl.Map({
      container: containerRef.current,
      style: buildForarkartaStyle(),
      center: [pts[0].lng, pts[0].lat], zoom: 12,
      maxPitch: 0, dragRotate: false, attributionControl: false,
    });
    mapRef.current = map;
    try { map.touchZoomRotate.disableRotation(); } catch { /* äldre maplibre */ }
    map.addControl(new window.maplibregl.AttributionControl({ customAttribution: FORARKARTA_ATTRIBUTION, compact: true }));

    map.on('load', () => {
      map.resize();
      map.addSource('stammar', { type: 'geojson', data: geojson, cluster: true, clusterRadius: 44, clusterMaxZoom: 15 });
      // Kluster: neutralgrå cirklar, storlek efter antal. Ingen sortimentfärg, inga siffror
      // (baskartans stil saknar glyphs) — färgdisciplinen: bara geografi, inget orange/grönt.
      map.addLayer({
        id: 'stam-cluster', type: 'circle', source: 'stammar', filter: ['has', 'point_count'],
        paint: {
          'circle-color': 'rgba(88,88,96,0.60)',
          'circle-radius': ['interpolate', ['linear'], ['get', 'point_count'], 2, 11, 25, 17, 200, 26],
          'circle-stroke-color': 'rgba(255,255,255,0.85)', 'circle-stroke-width': 1.5,
        },
      });
      // Enskilda stammar: små mörkgrå prickar.
      map.addLayer({
        id: 'stam-point', type: 'circle', source: 'stammar', filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': 'rgba(58,58,64,0.78)', 'circle-radius': 3.5,
          'circle-stroke-color': 'rgba(255,255,255,0.8)', 'circle-stroke-width': 1,
        },
      });
      const b = new window.maplibregl.LngLatBounds();
      pts.forEach(p => b.extend([p.lng, p.lat]));
      map.fitBounds(b, { padding: 28, maxZoom: 16, duration: 0 });
    });

    return () => { try { map.remove(); } catch { /* noop */ } mapRef.current = null; };
  }, [mapReady, harPunkter, punkter]);

  // Ingen sektion om inga stammar (laddar eller tomt) — inget tomt.
  if (punkter == null || punkter.length === 0) return null;

  return (
    <div style={{ marginBottom: 34 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.t3, marginBottom: 10 }}>Var skördaren kört</div>
      <div ref={containerRef} style={{ height: 280, borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}` }} />
      <div style={{ fontSize: 11.5, color: C.t3, marginTop: 6 }}>{punkter.length.toLocaleString('sv-SE')} avverkade stammar</div>
    </div>
  );
}
