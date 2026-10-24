'use client';

// Kartan på besökssidan: flygfoto (Lantmäteriet via besökslänkens egen kartproxy), traktgränsen, maskinerna med en etikett ("Skördare"/"Skotare" — inget förarnamn) och en ring runt varje maskin
// (avstånd per typ i lib/besok/konstanter), samt ringar runt motorsågsplatser. Ringarna ritas i verkliga meter. Färg bär inte ensam: ringen är streckad och maskinen har sitt namn.

import React, { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { cirkelPolygon } from '@/lib/telefonGps';
import { BESOK_MASKINFARG } from '@/lib/besok/farg';
import { AVSTAND, FARG } from '@/lib/design/tokens';

/** Skogsgrönt bakom flygfotot medan rutorna laddas (en kartfärg, ingen UI-färg). */
const KART_BAKGRUND = '#1b2a17';
import { ROLL_NAMN, type MaskinRoll } from '@/lib/besok/sakerhet';

export type KartMaskin = { roll: MaskinRoll; lat: number; lng: number };
export type KartaData = {
  token: string;
  mitt: { lat: number; lng: number } | null;
  gran: [number, number][][] | null;
  maskiner: KartMaskin[];
  motorsag: { lat: number; lng: number }[];
  ringM: { skordare: number; skotare: number; motorsag: number };
};

const fc = (features: unknown[]) => ({ type: 'FeatureCollection', features }) as unknown as GeoJSON.FeatureCollection;

function ringar(d: KartaData) {
  const f: unknown[] = [];
  for (const m of d.maskiner) f.push({ type: 'Feature', properties: { typ: m.roll }, geometry: cirkelPolygon(m.lat, m.lng, d.ringM[m.roll]) });
  for (const s of d.motorsag) f.push({ type: 'Feature', properties: { typ: 'motorsag' }, geometry: cirkelPolygon(s.lat, s.lng, d.ringM.motorsag) });
  return fc(f);
}

function gransFc(d: KartaData) {
  return fc((d.gran ?? []).map((r) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: r } })));
}

function passa(map: maplibregl.Map, d: KartaData) {
  const b = new maplibregl.LngLatBounds();
  let n = 0;
  for (const r of d.gran ?? []) for (const p of r) { b.extend(p as [number, number]); n++; }
  for (const m of d.maskiner) { b.extend([m.lng, m.lat]); n++; }
  if (n === 0) { if (d.mitt) map.jumpTo({ center: [d.mitt.lng, d.mitt.lat], zoom: 15 }); return; }
  map.fitBounds(b, { padding: AVSTAND.xxl + AVSTAND.s, maxZoom: 17, duration: 0 });
}

export default function BesokKarta({ data, hojd = 340 }: { data: KartaData; hojd?: number }) {
  const behallare = useRef<HTMLDivElement>(null);
  const kartaRef = useRef<maplibregl.Map | null>(null);
  const markorer = useRef<maplibregl.Marker[]>([]);
  const klar = useRef(false);
  const forstaPassning = useRef(false);
  const senaste = useRef(data);
  senaste.current = data;

  useEffect(() => {
    if (!behallare.current) return;
    const start = senaste.current.mitt ?? { lat: 56.35, lng: 15.05 };
    const map = new maplibregl.Map({
      container: behallare.current,
      center: [start.lng, start.lat],
      zoom: 14,
      attributionControl: { compact: true },
      style: {
        version: 8,
        sources: { foto: { type: 'raster', tiles: [`${location.origin}/api/besok/${senaste.current.token}/karta?z={z}&x={x}&y={y}`], tileSize: 256, maxzoom: 18, attribution: '© Lantmäteriet' } },
        layers: [{ id: 'bg', type: 'background', paint: { 'background-color': KART_BAKGRUND } }, { id: 'foto', type: 'raster', source: 'foto', paint: { 'raster-brightness-max': 0.85 } }],
      },
    });
    kartaRef.current = map;
    map.on('load', () => {
      map.addSource('gran', { type: 'geojson', data: gransFc(senaste.current) });
      map.addSource('ringar', { type: 'geojson', data: ringar(senaste.current) });
      map.addLayer({ id: 'gran-kant', type: 'line', source: 'gran', paint: { 'line-color': FARG.bg, 'line-width': 5, 'line-opacity': 0.7 } });
      map.addLayer({ id: 'gran', type: 'line', source: 'gran', paint: { 'line-color': '#fff', 'line-width': 2.5, 'line-dasharray': [2, 1.2] } });
      map.addLayer({ id: 'ringar-fyll', type: 'fill', source: 'ringar', paint: { 'fill-color': FARG.rod, 'fill-opacity': 0.14 } });
      map.addLayer({ id: 'ringar-linje', type: 'line', source: 'ringar', paint: { 'line-color': FARG.rod, 'line-width': 2.5, 'line-dasharray': [2, 1.5] } });
      klar.current = true;
      if (!forstaPassning.current) { forstaPassning.current = true; passa(map, senaste.current); }
      uppdateraMarkorer(map);
    });
    return () => { markorer.current.forEach((m) => m.remove()); markorer.current = []; map.remove(); kartaRef.current = null; klar.current = false; };
    // kartan byggs en gång per token
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.token]);

  function uppdateraMarkorer(map: maplibregl.Map) {
    markorer.current.forEach((m) => m.remove());
    markorer.current = senaste.current.maskiner.map((m) => {
      const farg = BESOK_MASKINFARG[m.roll];
      const el = document.createElement('div');
      el.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px;pointer-events:none';
      el.innerHTML = `<div style="padding:3px 8px;border-radius:10px;background:#000c;color:#fff;font:600 13px/1.2 Inter,system-ui,sans-serif;white-space:nowrap">${ROLL_NAMN[m.roll]}</div><div style="width:16px;height:16px;border-radius:50%;background:${farg};border:3px solid #fff;box-shadow:0 0 0 1px #0007"></div>`;
      return new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([m.lng, m.lat]).addTo(map);
    });
  }

  // Nya positioner: flytta ringar och etiketter, passa inte om kartan (besökaren kan ha panorerat).
  useEffect(() => {
    const map = kartaRef.current;
    if (!map || !klar.current) return;
    (map.getSource('gran') as maplibregl.GeoJSONSource | undefined)?.setData(gransFc(data));
    (map.getSource('ringar') as maplibregl.GeoJSONSource | undefined)?.setData(ringar(data));
    uppdateraMarkorer(map);
    if (!forstaPassning.current && (data.gran || data.maskiner.length)) { forstaPassning.current = true; passa(map, data); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.gran, data.maskiner, data.motorsag, data.ringM]);

  return <div ref={behallare} data-testid="besok-karta" style={{ width: '100%', height: hojd, borderRadius: 12, overflow: 'hidden', background: KART_BAKGRUND }} />;
}
