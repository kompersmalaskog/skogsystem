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
  queueNum: number | null;   // null = no number (active pulses, klar has check, unqueued has dot)
  isHistoryKlar: boolean;
  showChips: boolean;         // show machine chip labels
}

/* ── Build a MapLibre marker DOM element ── */
function buildMarkerEl(
  info: MInfo,
  maskinKo: MaskinKoItem[],
  maskiner: Maskin[],
  isSelected: boolean,
  onClick: () => void,
): HTMLDivElement {
  const { obj, queueNum, isHistoryKlar, showChips } = info;
  const isActive = obj.status === 'pagaende' || obj.status === 'skordning' || obj.status === 'skotning';
  const tf = isHistoryKlar ? '#52525b' : (TF[obj.typ] || C.yellow);
  const st = ST[obj.status] || ST.planerad;
  const dotSize = isSelected ? 26 : isActive ? 22 : isHistoryKlar ? 14 : 16;
  const hitSize = Math.max(dotSize, 30);

  // Wrapper — no position property, MapLibre's .maplibregl-marker class handles it
  const w = document.createElement('div');
  w.className = 'ovk-marker';
  w.dataset.objektId = obj.id;
  w.style.cssText = `width:${hitSize}px;height:${hitSize}px;cursor:pointer;overflow:visible;opacity:${isHistoryKlar ? '0.3' : '1'}`;

  // Pulse ring on active objects
  if (isActive && !isHistoryKlar) {
    const p = document.createElement('div');
    p.style.cssText = `position:absolute;left:50%;top:50%;width:${dotSize}px;height:${dotSize}px;margin-left:-${dotSize / 2}px;margin-top:-${dotSize / 2}px;border-radius:50%;background:${tf};animation:pulseMarker 2.5s infinite;pointer-events:none`;
    w.appendChild(p);
  }

  // Dot circle
  const dot = document.createElement('div');
  if (isHistoryKlar) {
    // Klar in history mode: gray circle with checkmark
    dot.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:${dotSize}px;height:${dotSize}px;border-radius:50%;background:${C.bg};border:1.5px solid #52525b;display:flex;align-items:center;justify-content:center`;
    dot.innerHTML = `<span style="font-size:${Math.round(dotSize * 0.55)}px;color:#71717a;line-height:1">✓</span>`;
  } else if (queueNum !== null) {
    // Queued planned object: show number inside dot
    dot.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:${dotSize}px;height:${dotSize}px;border-radius:50%;background:${C.bg};border:2px solid ${tf};display:flex;align-items:center;justify-content:center;box-shadow:${isSelected ? `0 0 20px ${tf}25` : 'none'}`;
    dot.innerHTML = `<span style="font-size:${dotSize > 20 ? 11 : 9}px;font-weight:700;color:${tf};font-family:${ff}">${queueNum}</span>`;
  } else {
    // Active (pulsing) or unqueued: status inner dot
    const innerSize = isSelected ? 10 : isActive ? 8 : 6;
    dot.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:${dotSize}px;height:${dotSize}px;border-radius:50%;background:${C.bg};border:2px solid ${tf};display:flex;align-items:center;justify-content:center;box-shadow:${isSelected ? `0 0 20px ${tf}25` : 'none'}`;
    const inner = document.createElement('div');
    inner.style.cssText = `width:${innerSize}px;height:${innerSize}px;border-radius:50%;background:${st.c}`;
    dot.appendChild(inner);
  }
  w.appendChild(dot);

  // Name label below
  const lbl = document.createElement('div');
  lbl.style.cssText = `position:absolute;top:${hitSize / 2 + dotSize / 2 + 4}px;left:50%;transform:translateX(-50%);text-align:center;pointer-events:none;white-space:nowrap`;
  const fz = isSelected ? 13 : 12;
  const fw = isSelected ? 700 : 500;
  const clr = isHistoryKlar ? '#52525b' : isSelected ? C.t1 : C.t3;
  let html = `<div style="font-size:${fz}px;font-weight:${fw};color:${clr};text-shadow:0 1px 8px rgba(0,0,0,.95);font-family:${ff}">${obj.namn}</div>`;
  if (isHistoryKlar) {
    html += `<div style="font-size:9px;color:#71717a;font-family:${ff};margin-top:1px">Klar</div>`;
  }
  lbl.innerHTML = html;
  w.appendChild(lbl);

  // Machine chips above (only for active objects)
  if (showChips) {
    const koForObj = maskinKo.filter(k => k.objekt_id === obj.id);
    if (koForObj.length > 0) {
      const md = document.createElement('div');
      md.style.cssText = `position:absolute;bottom:${hitSize / 2 + dotSize / 2 + 6}px;left:50%;transform:translateX(-50%);display:flex;gap:3px;pointer-events:none;white-space:nowrap`;
      koForObj.forEach(k => {
        const m = maskiner.find(mm => mm.maskin_id === k.maskin_id);
        if (m) {
          const ch = document.createElement('div');
          ch.style.cssText = `background:rgba(0,0,0,.85);backdrop-filter:blur(12px);padding:3px 8px;border-radius:6px;border:1px solid ${C.border}`;
          ch.innerHTML = `<span style="font-size:9px;font-weight:600;color:${C.t2};font-family:${ff}">${getMaskinDisplayName(m)}</span>`;
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
  const [mapReady, setMapReady] = useState(false);
  const [mapStyleLoaded, setMapStyleLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filt, setFilt] = useState<'alla' | 'slutavverkning' | 'gallring'>('alla');
  const [showHist, setShowHist] = useState(false);
  const [maskinFilter, setMaskinFilter] = useState<string | null>(null);

  const selectedObj = selectedId ? objekt.find(o => o.id === selectedId) : null;
  const handleMarkerClick = useCallback((id: string) => {
    setSelectedId(prev => prev === id ? null : id);
  }, []);

  /* ── Machines that have at least one queued object ── */
  const queuedMaskiner = useMemo(() => {
    const ids = new Set(maskinKo.map(k => k.maskin_id));
    return maskiner.filter(m => ids.has(m.maskin_id));
  }, [maskiner, maskinKo]);

  /* ── Route data per machine: queue numbers + line coordinates ── */
  const routeData = useMemo(() => {
    const result: {
      maskinId: string;
      color: string;
      numbered: Record<string, number>;
      lineCoords: [number, number][];
    }[] = [];

    const relevant = maskinFilter
      ? queuedMaskiner.filter(m => m.maskin_id === maskinFilter)
      : queuedMaskiner;

    relevant.forEach((m, idx) => {
      const koItems = maskinKo
        .filter(k => k.maskin_id === m.maskin_id)
        .sort((a, b) => a.ordning - b.ordning);
      if (!koItems.length) return;

      const numbered: Record<string, number> = {};
      const lineCoords: [number, number][] = [];
      let num = 1;

      koItems.forEach(k => {
        const o = objekt.find(x => x.id === k.objekt_id);
        if (!o || !o.lat || !o.lng || o.status === 'klar') return;
        const isAct = o.status === 'pagaende' || o.status === 'skordning' || o.status === 'skotning';
        lineCoords.push([o.lng, o.lat]);
        if (!isAct) { numbered[o.id] = num; num++; }
        // Active objects pulse — no number
      });

      const color = maskinFilter
        ? (getMaskinTyp(m.typ) === 'skördare' ? C.yellow : C.orange)
        : RC[idx % RC.length];
      result.push({ maskinId: m.maskin_id, color, numbered, lineCoords });
    });
    return result;
  }, [queuedMaskiner, maskinKo, objekt, maskinFilter]);

  /* ── Merged queue‐number lookup: objId → number ── */
  const queueNums = useMemo(() => {
    const nums: Record<string, number> = {};
    routeData.forEach(rd => {
      Object.entries(rd.numbered).forEach(([id, n]) => { if (!(id in nums)) nums[id] = n; });
    });
    return nums;
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
    return {
      obj,
      queueNum: isK ? null : (queueNums[obj.id] ?? null),
      isHistoryKlar: isK,
      showChips: isA,
    };
  }, [queueNums]);

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
        paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-dasharray': [6, 4], 'line-opacity': 0.5 },
      });

      if (wc.length > 1) {
        const b = new window.maplibregl.LngLatBounds();
        wc.forEach(o => b.extend([o.lng!, o.lat!]));
        map.fitBounds(b, { padding: 60, maxZoom: 13 });
      }
      setMapStyleLoaded(true);
    });

    return () => {
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
    <div style={{ position: 'absolute', inset: 0 }} onClick={() => setSelectedId(null)}>
      <style>{`@keyframes pulseMarker{0%{transform:scale(1);opacity:.4}70%{transform:scale(2.5);opacity:0}100%{transform:scale(2.5);opacity:0}}`}</style>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {!mapReady && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, color: C.t3 }}>
          Laddar karta...
        </div>
      )}

      {/* ── Filter bar ── */}
      <div style={{
        position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', zIndex: 15,
      }} onClick={e => e.stopPropagation()}>
        {/* Type filter + history toggle */}
        <div style={{
          display: 'flex', gap: 4, background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(16px)',
          padding: 4, borderRadius: 12, border: `1px solid ${C.border}`,
        }}>
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
        </div>

        {/* Machine filter */}
        {queuedMaskiner.length > 0 && (
          <div style={{
            display: 'flex', gap: 3, background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(16px)',
            padding: 3, borderRadius: 10, border: `1px solid ${C.border}`,
            maxWidth: 'calc(100vw - 32px)', overflowX: 'auto',
          }}>
            <button onClick={() => { setMaskinFilter(null); setSelectedId(null); }} style={{
              padding: '5px 10px', background: !maskinFilter ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: !maskinFilter ? C.t1 : C.t3, border: 'none', borderRadius: 7, fontSize: 10,
              fontWeight: 500, cursor: 'pointer', fontFamily: ff, whiteSpace: 'nowrap',
            }}>Alla maskiner</button>
            {queuedMaskiner.map((m, i) => {
              const on = maskinFilter === m.maskin_id;
              return (
                <button key={m.maskin_id} onClick={() => { setMaskinFilter(on ? null : m.maskin_id); setSelectedId(null); }}
                  style={{
                    padding: '5px 10px', background: on ? 'rgba(255,255,255,0.1)' : 'transparent',
                    color: on ? C.t1 : C.t3, border: 'none', borderRadius: 7, fontSize: 10,
                    fontWeight: 500, cursor: 'pointer', fontFamily: ff, whiteSpace: 'nowrap',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: RC[i % RC.length], flexShrink: 0 }} />
                  {getMaskinDisplayName(m)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{
        position: 'absolute',
        ...(selectedObj ? { top: queuedMaskiner.length > 0 ? 120 : 70 } : { bottom: 16 }),
        left: 16, display: 'flex', gap: 10, background: 'rgba(0,0,0,.65)',
        backdropFilter: 'blur(12px)', padding: '6px 12px', borderRadius: 8, zIndex: 10,
      }}>
        {Object.entries(ST).filter(([k]) => ['planerad', 'pagaende', 'klar'].includes(k)).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: v.c, opacity: 0.7 }} />
            <span style={{ fontSize: 9, color: C.t3 }}>{v.l}</span>
          </div>
        ))}
      </div>

      {selectedObj && <ObjCard obj={selectedObj} />}
    </div>
  );
}
