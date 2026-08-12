'use client';

import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { buildForarkartaStyle, FORARKARTA_ATTRIBUTION } from './forarkarta-stil';
import { markeringSub } from './markeringar';
import { C } from './oversikt-types';

declare global {
  interface Window { maplibregl: any }
}

type Punkt = { lng: number; lat: number };
type Linje = [number, number][];   // [[lng,lat], ...]

/* Origo för objektets SVG-markörer. Replikerar planeringsvyns objektKartCenter + svgToLatLon
   (app/planering/page.tsx) EXAKT — traktgränsen sparas i skärm-koordinater (path {x,y})
   relativt objektets center, så den måste konverteras med SAMMA origo/skala som där, annars
   hamnar den flera mil fel (origo-buggfamiljen). Saknas origo → placera INTE gränsen. */
type Origo = { lat: number; lng: number; zoom: number };
function objektKartCenter(o: { lat?: number | null; lng?: number | null; kartbild_bounds?: any }): Origo | null {
  const b = o.kartbild_bounds;
  if (b && Array.isArray(b) && Array.isArray(b[0]) && Array.isArray(b[1]) && b[0][0] != null && b[1][0] != null)
    return { lat: (b[0][0] + b[1][0]) / 2, lng: (b[0][1] + b[1][1]) / 2, zoom: 15 };
  if (o.lat != null && o.lng != null) return { lat: o.lat, lng: o.lng, zoom: 16 };
  return null;
}
function svgToLatLon(x: number, y: number, c: Origo): Punkt {
  const scale = 156543.03392 * Math.cos(c.lat * Math.PI / 180) / Math.pow(2, c.zoom);
  const mPerDegLon = 111320 * Math.cos(c.lat * Math.PI / 180);
  return { lat: c.lat + (-y * scale) / 111320, lng: c.lng + (x * scale) / mPerDegLon };
}

/* "Var skördaren kört" — HPR-stammar (hpr_stammar) som diskreta grå prickar på förarvyns
   lugna LM-raster, MOT en streckad ungefärlig traktgräns. Läsning: prickarna mot gränsen =
   så här mycket är gjort, resten innanför är kvar. INGEN volym, INGEN procent (skördaren har
   inget pålitligt Y). Renderar INGET om objektet saknar HPR-stammar med koordinater.
   Rör ALDRIG planeringsvyn — läser samma källor, eget minimalt lager. */
export default function SkordarKarta({ vo, objektId }: { vo?: string | null; objektId?: string | null }) {
  // null = laddar; { punkter, grans } = klart. punkter=[] → ingen sektion.
  const [data, setData] = useState<{ punkter: Punkt[]; grans: Linje[] } | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);

  // 1. Hämta stammar (senaste HPR-fil via vo) + traktgräns (planering_markeringar + objektets origo).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const v = String(vo ?? '').trim();
      const punkter: Punkt[] = [];
      if (/^\d+$/.test(v)) {
        const { data: filer } = await supabase
          .from('hpr_filer').select('id, fil_datum, objekt_nyckel')
          .order('fil_datum', { ascending: false, nullsFirst: false });
        const fil = (filer ?? []).find((f: any) => String(f.objekt_nyckel ?? '').split(':')[1] === v);
        if (fil) {
          let offset = 0;
          while (true) {
            const { data: d, error } = await supabase
              .from('hpr_stammar').select('lat, lng').eq('hpr_fil_id', fil.id).not('lat', 'is', null)
              .range(offset, offset + 999);
            if (error || !d || d.length === 0) break;
            for (const s of d as any[]) if (s.lat != null && s.lng != null) punkter.push({ lng: s.lng, lat: s.lat });
            if (d.length < 1000) break;
            offset += 1000;
          }
        }
      }
      if (cancelled) return;
      if (punkter.length === 0) { setData({ punkter: [], grans: [] }); return; }   // ingen sektion

      // Traktgräns — bara om objektet har härledbart origo OCH en boundary-markering.
      const grans: Linje[] = [];
      const id = String(objektId ?? '').trim();
      if (id) {
        const [objRes, markRes] = await Promise.all([
          supabase.from('objekt').select('lat, lng, kartbild_bounds').eq('id', id).maybeSingle(),
          supabase.from('planering_markeringar').select('data').eq('objekt_id', id),
        ]);
        const origo = objRes.data ? objektKartCenter(objRes.data as any) : null;
        if (origo && Array.isArray(markRes.data)) {
          for (const m of markRes.data as any[]) {
            if (markeringSub(m.data) !== 'boundary') continue;
            const path = m.data?.path;
            if (!Array.isArray(path)) continue;
            const linje: Linje = path
              .filter((p: any) => p && p.x != null && p.y != null)
              .map((p: any) => { const g = svgToLatLon(p.x, p.y, origo); return [g.lng, g.lat] as [number, number]; });
            if (linje.length >= 2) grans.push(linje);
          }
        }
      }
      if (!cancelled) setData({ punkter, grans });
    })();
    return () => { cancelled = true; };
  }, [vo, objektId]);

  const harPunkter = data != null && data.punkter.length > 0;

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
    if (window.maplibregl) setMapReady(true);
    return () => { script?.removeEventListener('load', onload); };
  }, [harPunkter]);

  // 3. Init karta (en gång): LM-raster + streckad grå gräns (under) + klustrade grå prickar (över).
  useEffect(() => {
    if (!mapReady || !harPunkter || !containerRef.current || mapRef.current) return;
    const pts = data!.punkter;
    const grans = data!.grans;
    const stamGeo = {
      type: 'FeatureCollection' as const,
      features: pts.map(p => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] }, properties: {} })),
    };
    const gransGeo = {
      type: 'FeatureCollection' as const,
      features: grans.map(linje => ({ type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: linje }, properties: {} })),
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
      // Traktgräns UNDER stammarna — STRECKAD, tunn, dämpad grå, INGEN fyllnad. Formspråket
      // säger "ungefär här går trakten", inte "exakt". Ritas bara om den finns.
      if (grans.length) {
        map.addSource('grans', { type: 'geojson', data: gransGeo });
        map.addLayer({
          id: 'grans', type: 'line', source: 'grans',
          layout: { 'line-join': 'round' },
          paint: { 'line-color': 'rgba(84,84,92,0.75)', 'line-width': 1.5, 'line-dasharray': [3, 3] },
        });
      }
      // Stammar: neutralgrå kluster + prickar (ingen sortimentfärg, inget orange/grönt).
      map.addSource('stammar', { type: 'geojson', data: stamGeo, cluster: true, clusterRadius: 44, clusterMaxZoom: 15 });
      map.addLayer({
        id: 'stam-cluster', type: 'circle', source: 'stammar', filter: ['has', 'point_count'],
        paint: {
          'circle-color': 'rgba(88,88,96,0.60)',
          'circle-radius': ['interpolate', ['linear'], ['get', 'point_count'], 2, 11, 25, 17, 200, 26],
          'circle-stroke-color': 'rgba(255,255,255,0.85)', 'circle-stroke-width': 1.5,
        },
      });
      map.addLayer({
        id: 'stam-point', type: 'circle', source: 'stammar', filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': 'rgba(58,58,64,0.78)', 'circle-radius': 3.5,
          'circle-stroke-color': 'rgba(255,255,255,0.8)', 'circle-stroke-width': 1,
        },
      });
      // fitBounds till stammar OCH gräns tillsammans → båda syns alltid.
      const b = new window.maplibregl.LngLatBounds();
      pts.forEach(p => b.extend([p.lng, p.lat]));
      grans.forEach(linje => linje.forEach(coord => b.extend(coord)));
      map.fitBounds(b, { padding: 28, maxZoom: 16, duration: 0 });
    });

    return () => { try { map.remove(); } catch { /* noop */ } mapRef.current = null; };
  }, [mapReady, harPunkter, data]);

  if (data == null || data.punkter.length === 0) return null;

  return (
    <div style={{ marginBottom: 34 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.t3, marginBottom: 10 }}>Var skördaren kört</div>
      <div ref={containerRef} style={{ height: 280, borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}` }} />
      <div style={{ fontSize: 11.5, color: C.t3, marginTop: 6 }}>
        {data.punkter.length.toLocaleString('sv-SE')} avverkade stammar
        {data.grans.length > 0 ? ' · streckad linje = ungefärlig traktgräns' : ''}
      </div>
    </div>
  );
}
