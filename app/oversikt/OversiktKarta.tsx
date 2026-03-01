'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { OversiktObjekt, Maskin, MaskinKoItem, C, ST, TF } from './oversikt-types';
import { ff } from './oversikt-styles';
import { formatVolym, pc, getMaskinDisplayName, getMaskinTyp } from './oversikt-utils';

declare global {
  interface Window { maplibregl: any; }
}

interface Props {
  objekt: OversiktObjekt[];
  maskiner: Maskin[];
  maskinKo: MaskinKoItem[];
}

/* ── Haversine distance in km (with decimals) ── */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const r = (x: number) => x * Math.PI / 180;
  const dLat = r(lat2 - lat1);
  const dLng = r(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ── Small reusable components ── */
function Tag({ children, w }: { children: React.ReactNode; w?: boolean }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 500, color: w ? C.yellow : C.t2, padding: '3px 8px', background: w ? C.yd : 'rgba(255,255,255,0.04)', borderRadius: 6, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

function InfoRow({ label, val, warn }: { label: string; val: string; warn?: boolean }) {
  return (
    <div style={{ flex: 1, background: 'rgba(255,255,255,0.025)', padding: '6px 4px', textAlign: 'center' }}>
      <div style={{ fontSize: 8, color: C.t4, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: warn ? C.yellow : C.t2 }}>{val}</div>
    </div>
  );
}

/* ── ObjCard popup (positioned fixed at screen bottom) ── */
function ObjCard({ obj }: { obj: OversiktObjekt }) {
  const o = obj;
  const tf = TF[o.typ] || C.yellow;
  const skP = pc(0, o.volym);
  const stP = pc(0, o.volym);
  const wb = (v?: string) => v === 'Dålig' || v === 'Brant' || v === 'Nej';

  return (
    <div onClick={(e) => e.stopPropagation()} style={{
      position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
      width: 370, maxWidth: 'calc(100% - 24px)',
      background: 'rgba(13,13,15,.97)', backdropFilter: 'blur(24px)',
      borderRadius: 16, overflow: 'hidden', border: `1px solid ${C.border}`, zIndex: 20,
      animation: 'fadeUp .2s ease-out',
    }}>
      <div style={{ height: 2, background: `linear-gradient(90deg,${tf},transparent)` }} />
      <div style={{ padding: 16, maxHeight: '60vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>{o.namn}</div>
            <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
              {o.bolag || '–'} · {o.atgard || (o.typ === 'slutavverkning' ? 'Slutavv.' : 'Gallring')} · {o.areal || '–'} ha
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em' }}>{formatVolym(o.volym || 0)}</div>
            <div style={{ fontSize: 10, color: C.t4 }}>m³</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          {[{ l: 'Skördare', v: 0, p: skP }, { l: 'Skotare', v: 0, p: stP }].map((r, i) => (
            <div key={i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: C.t3 }}>{r.l}</span>
                <span style={{ fontSize: 11, fontWeight: 600 }}>{r.v ? `${r.v} m³` : '–'}</span>
              </div>
              <div style={{ height: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${r.p}%`, height: '100%', background: tf, borderRadius: 2, opacity: 0.65, transition: 'width 0.5s ease' }} />
              </div>
              {r.v > 0 && <div style={{ fontSize: 9, color: C.t4, textAlign: 'right', marginTop: 2 }}>{r.p}%</div>}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
          {o.skordare_maskin && <Tag>{o.skordare_maskin}{o.skordare_band ? ` · Band ${o.skordare_band_par || ''}p` : ''}</Tag>}
          {o.skotare_maskin && <Tag>{o.skotare_maskin}{o.skotare_band ? ` · Band ${o.skotare_band_par || ''}p` : ''}</Tag>}
          {o.skotare_lastreder_breddat && <Tag>Brett lastrede</Tag>}
          {o.skotare_ris_direkt && <Tag>GROT direkt</Tag>}
          {o.skordare_manuell_fallning && <Tag w>Manuell fällning</Tag>}
          {o.markagare_ska_ha_ved && <Tag>Ved</Tag>}
        </div>

        {(o.barighet || o.terrang || o.transport_trailer_in !== undefined) && (
          <div style={{ display: 'flex', gap: 2, borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
            <InfoRow label="Bärighet" val={o.barighet || '–'} warn={wb(o.barighet)} />
            <InfoRow label="Terräng" val={o.terrang || '–'} warn={wb(o.terrang)} />
            <InfoRow label="Trailer in" val={o.transport_trailer_in === true ? 'Ja' : o.transport_trailer_in === false ? 'Nej' : '–'} warn={o.transport_trailer_in === false} />
          </div>
        )}

        {o.transport_kommentar && <div style={{ fontSize: 10, color: C.t3, marginBottom: 4 }}>🚚 {o.transport_kommentar}</div>}
        {o.skordare_manuell_fallning && o.skordare_manuell_fallning_text && <div style={{ fontSize: 10, color: C.t3, marginBottom: 4 }}>✋ {o.skordare_manuell_fallning_text}</div>}
        {o.markagare_ska_ha_ved && o.markagare_ved_text && <div style={{ fontSize: 10, color: C.t3, marginBottom: 4 }}>🪵 {o.markagare_ved_text}</div>}
        {o.info_anteckningar && <div style={{ fontSize: 10, color: C.t3, padding: '8px 0 0', borderTop: `1px solid ${C.border}` }}>📝 {o.info_anteckningar}</div>}

        <button onClick={() => window.location.href = `/planering?objekt=${o.id}`} style={{
          width: '100%', marginTop: 12, padding: '10px 0', background: 'rgba(255,255,255,0.06)',
          border: `1px solid ${C.border}`, borderRadius: 10, color: C.t2, fontSize: 12, fontWeight: 600,
          cursor: 'pointer', fontFamily: ff, transition: 'background 0.15s',
        }}>
          Visa avverkning →
        </button>
      </div>
    </div>
  );
}

/* ── Route colors per machine ── */
const RC = ['#3b82f6', '#f97316', '#22c55e', '#a855f7', '#ec4899', '#06b6d4'];

/* ── Marker info passed to builder ── */
interface MInfo {
  obj: OversiktObjekt;
  queueNum: number | null;
  isHistoryKlar: boolean;
  showChips: boolean;
  maskinName: string | null;
}

/* ── Build a MapLibre marker DOM element ── */
function buildMarkerEl(
  info: MInfo,
  maskinKo: MaskinKoItem[],
  maskiner: Maskin[],
  isSelected: boolean,
  onClick: () => void,
): HTMLDivElement {
  const { obj, queueNum, isHistoryKlar, showChips, maskinName } = info;
  const isActive = obj.status === 'pagaende' || obj.status === 'skordning' || obj.status === 'skotning';
  const tf = isHistoryKlar ? '#52525b' : (TF[obj.typ] || C.yellow);
  const st = ST[obj.status] || ST.planerad;
  const dotSize = isSelected ? 34 : isActive ? 30 : isHistoryKlar ? 16 : 24;
  const hitSize = 34; // constant so MapLibre anchor never shifts

  // Wrapper — no position property, MapLibre's .maplibregl-marker class handles it
  const w = document.createElement('div');
  w.className = 'ovk-marker';
  w.dataset.objektId = obj.id;
  w.style.cssText = `width:${hitSize}px;height:${hitSize}px;cursor:pointer;overflow:visible;opacity:${isHistoryKlar ? '0.3' : '1'}`;

  // Pulse ring on active objects (ring that expands and fades out)
  if (isActive && !isHistoryKlar) {
    const p = document.createElement('div');
    p.style.cssText = `position:absolute;left:50%;top:50%;width:${dotSize}px;height:${dotSize}px;margin-left:-${dotSize / 2}px;margin-top:-${dotSize / 2}px;border-radius:50%;border:3px solid ${tf};animation:pulseMarker 2.5s infinite;pointer-events:none`;
    w.appendChild(p);
  }

  // Dot circle
  const dot = document.createElement('div');
  if (isHistoryKlar) {
    // Klar in history mode: gray circle with checkmark
    dot.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:${dotSize}px;height:${dotSize}px;border-radius:50%;background:${C.bg};border:1.5px solid #52525b;display:flex;align-items:center;justify-content:center`;
    dot.innerHTML = `<span style="font-size:${Math.round(dotSize * 0.55)}px;color:#71717a;line-height:1">✓</span>`;
  } else if (queueNum !== null) {
    // Queued planned object: filled type-color circle with WHITE number
    dot.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:${dotSize}px;height:${dotSize}px;border-radius:50%;background:${tf};display:flex;align-items:center;justify-content:center;box-shadow:${isSelected ? `0 0 20px ${tf}40` : '0 2px 8px rgba(0,0,0,.5)'}`;
    dot.innerHTML = `<span style="font-size:${dotSize >= 24 ? 13 : 10}px;font-weight:700;color:#fff;font-family:${ff};text-shadow:0 1px 2px rgba(0,0,0,.3)">${queueNum}</span>`;
  } else {
    // Active (pulsing) or unqueued: status inner dot
    const innerSize = isSelected ? 10 : isActive ? 8 : 6;
    dot.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:${dotSize}px;height:${dotSize}px;border-radius:50%;background:${C.bg};border:2px solid ${tf};display:flex;align-items:center;justify-content:center;box-shadow:${isSelected ? `0 0 20px ${tf}25` : 'none'}`;
    const inner = document.createElement('div');
    inner.style.cssText = `width:${innerSize}px;height:${innerSize}px;border-radius:50%;background:${st.c}`;
    dot.appendChild(inner);
  }
  w.appendChild(dot);

  // Name label below — dark background for readability
  const lbl = document.createElement('div');
  lbl.style.cssText = `position:absolute;top:${hitSize / 2 + dotSize / 2 + 4}px;left:50%;transform:translateX(-50%);text-align:center;pointer-events:none;white-space:nowrap`;
  const clr = isHistoryKlar ? '#71717a' : '#fff';
  let html = `<div style="font-size:13px;font-weight:600;color:${clr};font-family:${ff};background:rgba(0,0,0,0.75);padding:3px 8px;border-radius:6px">${obj.namn}</div>`;
  if (isHistoryKlar) {
    html += `<div style="font-size:9px;color:#71717a;font-family:${ff};margin-top:2px;background:rgba(0,0,0,0.6);padding:1px 6px;border-radius:4px;display:inline-block">Klar</div>`;
  }
  lbl.innerHTML = html;
  w.appendChild(lbl);

  // Machine name above active prick (when maskinFilter is active)
  if (maskinName) {
    const md = document.createElement('div');
    md.style.cssText = `position:absolute;bottom:${hitSize / 2 + dotSize / 2 + 6}px;left:50%;transform:translateX(-50%);pointer-events:none;white-space:nowrap`;
    md.innerHTML = `<div style="background:rgba(0,0,0,0.85);padding:3px 8px;border-radius:6px;font-size:10px;font-weight:600;color:#fff;font-family:${ff}">${maskinName}</div>`;
    w.appendChild(md);
  } else if (showChips) {
    // Machine chips for active objects (no maskinFilter)
    const koForObj = maskinKo.filter(k => k.objekt_id === obj.id);
    if (koForObj.length > 0) {
      const md = document.createElement('div');
      md.style.cssText = `position:absolute;bottom:${hitSize / 2 + dotSize / 2 + 6}px;left:50%;transform:translateX(-50%);display:flex;gap:3px;pointer-events:none;white-space:nowrap`;
      koForObj.forEach(k => {
        const m = maskiner.find(mm => mm.maskin_id === k.maskin_id);
        if (m) {
          const ch = document.createElement('div');
          ch.style.cssText = `background:rgba(0,0,0,.85);padding:3px 8px;border-radius:6px`;
          ch.innerHTML = `<span style="font-size:10px;font-weight:600;color:#fff;font-family:${ff}">${getMaskinDisplayName(m)}</span>`;
          md.appendChild(ch);
        }
      });
      w.appendChild(md);
    }
  }

  w.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return w;
}

/* ════════════════════════════════════════════════════════════════ */
export default function OversiktKarta({ objekt, maskiner, maskinKo }: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersMapRef = useRef<Map<string, any>>(new Map());
  const distMarkersRef = useRef<any[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapStyleLoaded, setMapStyleLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filt, setFilt] = useState<'alla' | 'slutavverkning' | 'gallring'>('alla');
  const [showHist, setShowHist] = useState(false);
  const [maskinFilter, setMaskinFilter] = useState<string | null>(null);
  const [showMaskinDrop, setShowMaskinDrop] = useState(false);

  const selectedObj = selectedId ? objekt.find(o => o.id === selectedId) : null;
  const handleMarkerClick = useCallback((id: string) => {
    setSelectedId(prev => prev === id ? null : id);
  }, []);

  /* ── Machines that have at least one queued object (for route computation) ── */
  const queuedMaskiner = useMemo(() => {
    const ids = new Set(maskinKo.map(k => k.maskin_id));
    return maskiner.filter(m => ids.has(m.maskin_id));
  }, [maskiner, maskinKo]);

  /* ── Route data: ONLY when a specific machine is filtered ── */
  const routeData = useMemo(() => {
    // "Alla maskiner" = no numbering, no route lines
    if (!maskinFilter) return [];
    const m = queuedMaskiner.find(x => x.maskin_id === maskinFilter);
    if (!m) return [];

    const koItems = maskinKo
      .filter(k => k.maskin_id === maskinFilter)
      .sort((a, b) => a.ordning - b.ordning);
    if (!koItems.length) return [];

    const numbered: Record<string, number> = {};
    const lineCoords: [number, number][] = [];
    let num = 1;

    koItems.forEach(k => {
      const o = objekt.find(x => x.id === k.objekt_id);
      if (!o || !o.lat || !o.lng || o.status === 'klar') return;
      const isAct = o.status === 'pagaende' || o.status === 'skordning' || o.status === 'skotning';
      lineCoords.push([o.lng, o.lat]);
      if (!isAct) { numbered[o.id] = num; num++; }
    });

    const color = getMaskinTyp(m.typ) === 'skördare' ? C.yellow : C.orange;
    return [{ maskinId: m.maskin_id, color, numbered, lineCoords }];
  }, [queuedMaskiner, maskinKo, objekt, maskinFilter]);

  /* ── Merged queue-number lookup: objId → number ── */
  const queueNums = useMemo(() => {
    const nums: Record<string, number> = {};
    routeData.forEach(rd => {
      Object.entries(rd.numbered).forEach(([id, n]) => { if (!(id in nums)) nums[id] = n; });
    });
    return nums;
  }, [routeData]);

  /* ── Total route distance ── */
  const totalDistance = useMemo(() => {
    let total = 0;
    routeData.forEach(rd => {
      for (let i = 0; i < rd.lineCoords.length - 1; i++) {
        const [lng1, lat1] = rd.lineCoords[i];
        const [lng2, lat2] = rd.lineCoords[i + 1];
        total += haversineKm(lat1, lng1, lat2, lng2);
      }
    });
    return total;
  }, [routeData]);

  /* ── Visible object IDs ── */
  const visIds = useMemo(() => {
    let list = objekt.filter(o => o.lat && o.lng);
    if (filt !== 'alla') list = list.filter(o => o.typ === filt);
    if (maskinFilter) {
      const ids = new Set(maskinKo.filter(k => k.maskin_id === maskinFilter).map(k => k.objekt_id));
      list = list.filter(o => ids.has(o.id));
    }
    if (!showHist) list = list.filter(o => o.status !== 'klar');
    return list.map(o => o.id);
  }, [objekt, filt, maskinFilter, maskinKo, showHist]);

  /* ── Helper: build marker info ── */
  const mkInfo = useCallback((obj: OversiktObjekt): MInfo => {
    const isK = obj.status === 'klar';
    const isA = obj.status === 'pagaende' || obj.status === 'skordning' || obj.status === 'skotning';

    let maskinName: string | null = null;
    if (maskinFilter && isA) {
      const m = maskiner.find(x => x.maskin_id === maskinFilter);
      if (m) maskinName = getMaskinDisplayName(m);
    }

    return {
      obj,
      // Numbers only when a specific machine is filtered
      queueNum: (maskinFilter && !isK) ? (queueNums[obj.id] ?? null) : null,
      isHistoryKlar: isK,
      showChips: isA,
      maskinName,
    };
  }, [queueNums, maskinFilter, maskiner]);

  /* ── Load MapLibre CDN ── */
  useEffect(() => {
    if (!document.getElementById('maplibre-css-oversikt')) {
      const link = document.createElement('link');
      link.id = 'maplibre-css-oversikt';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
      document.head.appendChild(link);
    }
    if (!window.maplibregl) {
      const script = document.createElement('script');
      script.id = 'maplibre-js-oversikt';
      script.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
      script.onload = () => setMapReady(true);
      document.head.appendChild(script);
    } else {
      setMapReady(true);
    }
  }, []);

  /* ── Init map (once) ── */
  useEffect(() => {
    if (!mapReady || !mapContainerRef.current || mapRef.current) return;

    const wc = objekt.filter(o => o.lat && o.lng);
    const center: [number, number] = wc.length
      ? [wc.reduce((s, o) => s + o.lng!, 0) / wc.length, wc.reduce((s, o) => s + o.lat!, 0) / wc.length]
      : [14.70, 56.40];

    const map = new window.maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '&copy; OSM' } },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center, zoom: 10,
    });
    mapRef.current = map;

    map.on('load', () => {
      // Route line layer (GeoJSON — follows map natively)
      map.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'routes', type: 'line', source: 'routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 2.5, 'line-dasharray': [6, 4], 'line-opacity': 0.6 },
      });

      if (wc.length > 1) {
        const b = new window.maplibregl.LngLatBounds();
        wc.forEach(o => b.extend([o.lng!, o.lat!]));
        map.fitBounds(b, { padding: 60, maxZoom: 13 });
      }
      setMapStyleLoaded(true);
    });

    return () => {
      distMarkersRef.current.forEach(m => m.remove());
      distMarkersRef.current = [];
      markersMapRef.current.forEach(m => m.remove());
      markersMapRef.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
      setMapStyleLoaded(false);
    };
  }, [mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Update route lines when route data changes ── */
  useEffect(() => {
    if (!mapRef.current || !mapStyleLoaded) return;
    const src = mapRef.current.getSource('routes');
    if (!src) return;

    const features = routeData
      .filter(rd => rd.lineCoords.length >= 2)
      .map(rd => ({
        type: 'Feature' as const,
        properties: { color: rd.color },
        geometry: { type: 'LineString' as const, coordinates: rd.lineCoords },
      }));
    src.setData({ type: 'FeatureCollection', features });
  }, [routeData, mapStyleLoaded]);

  /* ── Distance labels on route segments ── */
  useEffect(() => {
    distMarkersRef.current.forEach(m => m.remove());
    distMarkersRef.current = [];

    if (!mapRef.current || !mapStyleLoaded) return;

    routeData.forEach(rd => {
      for (let i = 0; i < rd.lineCoords.length - 1; i++) {
        const [lng1, lat1] = rd.lineCoords[i];
        const [lng2, lat2] = rd.lineCoords[i + 1];
        const midLng = (lng1 + lng2) / 2;
        const midLat = (lat1 + lat2) / 2;
        const dist = haversineKm(lat1, lng1, lat2, lng2);
        const label = dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`;

        // Perpendicular pixel offset: push label to the right of the line direction
        // so it doesn't overlap object names near the dots
        const angle = Math.atan2(lat2 - lat1, lng2 - lng1); // line direction
        const perpX = -Math.sin(angle); // perpendicular (rotated 90° clockwise)
        const perpY = Math.cos(angle);
        const push = dist < 5 ? 50 : dist < 15 ? 30 : 0;
        const ox = Math.round(perpX * push);
        const oy = Math.round(-perpY * push); // negate Y because screen Y is inverted

        const el = document.createElement('div');
        el.style.cssText = `background:rgba(0,0,0,0.7);color:#fff;font-size:9px;font-weight:500;font-family:${ff};padding:2px 6px;border-radius:4px;pointer-events:none;white-space:nowrap`;
        el.textContent = label;

        const marker = new window.maplibregl.Marker({ element: el, anchor: 'center', offset: [ox, oy] })
          .setLngLat([midLng, midLat])
          .addTo(mapRef.current);
        distMarkersRef.current.push(marker);
      }
    });
  }, [routeData, mapStyleLoaded]);

  /* ── Sync markers: add new, remove stale ── */
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const want = new Set(visIds);
    const have = new Set(markersMapRef.current.keys());

    have.forEach(id => {
      if (!want.has(id)) { markersMapRef.current.get(id)?.remove(); markersMapRef.current.delete(id); }
    });
    visIds.forEach(id => {
      if (!have.has(id)) {
        const o = objekt.find(x => x.id === id);
        if (!o || !o.lat || !o.lng) return;
        const el = buildMarkerEl(mkInfo(o), maskinKo, maskiner, false, () => handleMarkerClick(id));
        const marker = new window.maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([o.lng, o.lat]).addTo(mapRef.current);
        markersMapRef.current.set(id, marker);
      }
    });
  }, [visIds, mapReady, objekt, maskiner, maskinKo, handleMarkerClick, mkInfo]);

  /* ── Update marker content (selection, numbers, history state) ── */
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    markersMapRef.current.forEach((marker, id) => {
      const o = objekt.find(x => x.id === id);
      if (!o) return;
      const info = mkInfo(o);
      const newEl = buildMarkerEl(info, maskinKo, maskiner, selectedId === id, () => handleMarkerClick(id));
      const el = marker.getElement();
      // Replace children only — preserve MapLibre's transform on the wrapper
      while (el.lastChild) el.removeChild(el.lastChild);
      while (newEl.firstChild) el.appendChild(newEl.firstChild);
      el.style.opacity = info.isHistoryKlar ? '0.3' : '1';
    });
  }, [selectedId, queueNums, showHist, maskinFilter, objekt, maskinKo, maskiner, mapReady, handleMarkerClick, mkInfo]);

  return (
    <div style={{ position: 'absolute', inset: 0 }} onClick={() => { setSelectedId(null); setShowMaskinDrop(false); }}>
      <style>{`
        @keyframes pulseMarker{0%{transform:scale(1);opacity:.6}70%{transform:scale(2.5);opacity:0}100%{transform:scale(2.5);opacity:0}}
        @keyframes fadeUp{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
      `}</style>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {!mapReady && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, color: C.t3 }}>
          Laddar karta...
        </div>
      )}

      {/* ── Filter bar (single compact row) ── */}
      <div style={{
        position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 4, alignItems: 'center', zIndex: 15,
        background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(16px)',
        padding: 4, borderRadius: 12, border: `1px solid ${C.border}`,
      }} onClick={e => e.stopPropagation()}>
        {/* Type filter */}
        {([
          { k: 'alla' as const, l: 'Alla' },
          { k: 'slutavverkning' as const, l: 'Slutavverkning' },
          { k: 'gallring' as const, l: 'Gallring' },
        ]).map(f => (
          <button key={f.k} onClick={() => { setFilt(f.k); setSelectedId(null); }} style={{
            padding: '6px 14px', background: filt === f.k ? 'rgba(255,255,255,0.1)' : 'transparent',
            color: filt === f.k ? C.t1 : C.t3, border: 'none', borderRadius: 8, fontSize: 11,
            fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s', fontFamily: ff,
          }}>{f.l}</button>
        ))}
        <div style={{ width: 1, background: C.border, margin: '4px 2px' }} />
        <button onClick={() => setShowHist(h => !h)} style={{
          padding: '6px 12px', background: showHist ? 'rgba(255,255,255,0.08)' : 'transparent',
          color: showHist ? C.t1 : C.t3, border: 'none', borderRadius: 8, fontSize: 11,
          fontWeight: 500, cursor: 'pointer', fontFamily: ff,
        }}>Historik</button>

        {/* Machine dropdown */}
        {maskiner.length > 0 && (<>
          <div style={{ width: 1, background: C.border, margin: '4px 2px' }} />
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowMaskinDrop(v => !v)} style={{
              padding: '6px 12px', background: maskinFilter ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: maskinFilter ? C.t1 : C.t3, border: 'none', borderRadius: 8, fontSize: 11,
              fontWeight: 500, cursor: 'pointer', fontFamily: ff, whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {maskinFilter ? (() => {
                const m = maskiner.find(x => x.maskin_id === maskinFilter);
                if (!m) return 'Alla maskiner';
                const tc = getMaskinTyp(m.typ) === 'skördare' ? C.yellow : C.green;
                return (<>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: tc, flexShrink: 0 }} />
                  {getMaskinDisplayName(m)}
                </>);
              })() : 'Alla maskiner'}
              <span style={{ fontSize: 8, marginLeft: 2 }}>{showMaskinDrop ? '▲' : '▼'}</span>
            </button>

            {showMaskinDrop && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 220,
                background: 'rgba(13,13,15,.97)', backdropFilter: 'blur(24px)',
                borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden',
                boxShadow: '0 8px 32px rgba(0,0,0,.6)',
              }}>
                {/* Alla maskiner */}
                <button onClick={() => { setMaskinFilter(null); setSelectedId(null); setShowMaskinDrop(false); }} style={{
                  width: '100%', padding: '10px 14px', background: !maskinFilter ? 'rgba(255,255,255,0.06)' : 'transparent',
                  color: !maskinFilter ? C.t1 : C.t2, border: 'none', borderBottom: `1px solid ${C.border}`,
                  fontSize: 11, fontWeight: !maskinFilter ? 600 : 400, cursor: 'pointer', fontFamily: ff,
                  textAlign: 'left',
                }}>Alla maskiner</button>

                {/* Grouped by typ */}
                {(['skördare', 'skotare'] as const).map(typ => {
                  const group = maskiner.filter(m => getMaskinTyp(m.typ) === typ);
                  if (!group.length) return null;
                  const tc = typ === 'skördare' ? C.yellow : C.green;
                  return (
                    <div key={typ}>
                      <div style={{
                        padding: '8px 14px 4px', fontSize: 9, fontWeight: 600, color: C.t4,
                        textTransform: 'uppercase', letterSpacing: '0.06em',
                      }}>{typ}</div>
                      {group.map(m => {
                        const on = maskinFilter === m.maskin_id;
                        return (
                          <button key={m.maskin_id} onClick={() => { setMaskinFilter(m.maskin_id); setSelectedId(null); setShowMaskinDrop(false); }}
                            style={{
                              width: '100%', padding: '8px 14px', background: on ? 'rgba(255,255,255,0.06)' : 'transparent',
                              color: on ? C.t1 : C.t2, border: 'none', fontSize: 11, fontWeight: on ? 600 : 400,
                              cursor: 'pointer', fontFamily: ff, textAlign: 'left',
                              display: 'flex', alignItems: 'center', gap: 8,
                            }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: tc, flexShrink: 0 }} />
                            {getMaskinDisplayName(m)}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>)}
      </div>

      {/* Legend + total distance */}
      <div style={{
        position: 'absolute',
        ...(selectedObj ? { top: 70 } : { bottom: 16 }),
        left: 16, display: 'flex', gap: 10, background: 'rgba(0,0,0,.65)',
        backdropFilter: 'blur(12px)', padding: '6px 12px', borderRadius: 8, zIndex: 10,
        alignItems: 'center',
      }}>
        {Object.entries(ST).filter(([k]) => ['planerad', 'pagaende', 'klar'].includes(k)).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: v.c, opacity: 0.7 }} />
            <span style={{ fontSize: 9, color: C.t3 }}>{v.l}</span>
          </div>
        ))}
        {totalDistance > 0 && (
          <>
            <div style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.1)' }} />
            <span style={{ fontSize: 9, color: C.t2, fontWeight: 600, fontFamily: ff }}>
              Total rutt: {totalDistance < 1 ? `${Math.round(totalDistance * 1000)} m` : `${totalDistance.toFixed(1)} km`}
            </span>
          </>
        )}
      </div>

      {selectedObj && <ObjCard obj={selectedObj} />}
    </div>
  );
}
