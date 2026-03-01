'use client';

import React, { useState, useEffect, useRef } from 'react';
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

/* Small reusable components */
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

/* ObjCard popup */
function ObjCard({ obj, onClose }: { obj: OversiktObjekt; onClose: () => void }) {
  const o = obj;
  const tf = TF[o.typ] || C.yellow;
  const skP = pc(0, o.volym); // We don't have production data yet
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
      {/* Gradient top */}
      <div style={{ height: 2, background: `linear-gradient(90deg,${tf},transparent)` }} />
      <div style={{ padding: 16, maxHeight: '60vh', overflowY: 'auto' }}>
        {/* Header */}
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

        {/* Dual progress */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          {[
            { l: 'Skördare', v: 0, p: skP },
            { l: 'Skotare', v: 0, p: stP },
          ].map((r, i) => (
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

        {/* Tags */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
          {o.skordare_maskin && <Tag>{o.skordare_maskin}{o.skordare_band ? ` · Band ${o.skordare_band_par || ''}p` : ''}</Tag>}
          {o.skotare_maskin && <Tag>{o.skotare_maskin}{o.skotare_band ? ` · Band ${o.skotare_band_par || ''}p` : ''}</Tag>}
          {o.skotare_lastreder_breddat && <Tag>Brett lastrede</Tag>}
          {o.skotare_ris_direkt && <Tag>GROT direkt</Tag>}
          {o.skordare_manuell_fallning && <Tag w>Manuell fällning</Tag>}
          {o.markagare_ska_ha_ved && <Tag>Ved</Tag>}
        </div>

        {/* Terrain row */}
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

        {/* Action button */}
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

export default function OversiktKarta({ objekt, maskiner, maskinKo }: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filt, setFilt] = useState<'alla' | 'slutavverkning' | 'gallring'>('alla');
  const [showGrot, setShowGrot] = useState(false);
  const [showHist, setShowHist] = useState(false);

  const vis = objekt.filter(o =>
    (filt === 'alla' || o.typ === filt) &&
    (showHist || o.status !== 'klar')
  );

  const selectedObj = selectedId ? objekt.find(o => o.id === selectedId) : null;

  // Load MapLibre CDN
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

  // Init map
  useEffect(() => {
    if (!mapReady || !mapContainerRef.current || mapRef.current) return;

    const withCoords = objekt.filter(o => o.lat && o.lng);
    const center = withCoords.length > 0
      ? [withCoords.reduce((s, o) => s + o.lng!, 0) / withCoords.length, withCoords.reduce((s, o) => s + o.lat!, 0) / withCoords.length]
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
      if (withCoords.length > 1) {
        const bounds = new window.maplibregl.LngLatBounds();
        withCoords.forEach(o => bounds.extend([o.lng!, o.lat!]));
        map.fitBounds(bounds, { padding: 60, maxZoom: 13 });
      }
    });

    return () => { mapRef.current?.remove(); mapRef.current = null; };
  }, [mapReady]);

  // Update markers when filter changes
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;

    // Remove old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const withCoords = vis.filter(o => o.lat && o.lng);
    withCoords.forEach((obj) => {
      const tf = TF[obj.typ] || C.yellow;
      const st = ST[obj.status] || ST.planerad;
      const isActive = obj.status === 'pagaende' || obj.status === 'skordning' || obj.status === 'skotning';
      const isKlar = obj.status === 'klar';

      const container = document.createElement('div');
      container.style.cssText = `position:relative;cursor:pointer;opacity:${isKlar ? '0.25' : '1'};transition:opacity 0.2s`;

      // Pulse for active
      if (isActive) {
        const pulse = document.createElement('div');
        pulse.style.cssText = `position:absolute;inset:-7px;border-radius:50%;background:${tf};animation:pulse 2.5s infinite;pointer-events:none`;
        container.appendChild(pulse);
      }

      // Dot
      const dot = document.createElement('div');
      dot.style.cssText = `width:${isActive ? 16 : 12}px;height:${isActive ? 16 : 12}px;border-radius:50%;background:${C.bg};border:2px solid ${tf};display:flex;align-items:center;justify-content:center`;
      const inner = document.createElement('div');
      inner.style.cssText = `width:${isActive ? 6 : 4}px;height:${isActive ? 6 : 4}px;border-radius:50%;background:${st.c}`;
      dot.appendChild(inner);
      container.appendChild(dot);

      // Label
      const label = document.createElement('div');
      label.style.cssText = `position:absolute;top:calc(100% + 6px);left:50%;transform:translateX(-50%);text-align:center;pointer-events:none;white-space:nowrap`;
      label.innerHTML = `<div style="font-size:10px;font-weight:500;color:${isKlar ? C.t4 : C.t3};text-shadow:0 1px 8px rgba(0,0,0,.95);font-family:${ff}">${obj.namn}</div>`;
      container.appendChild(label);

      // Machine label above
      const activeMachines = maskinKo.filter(k => k.objekt_id === obj.id);
      if (activeMachines.length > 0) {
        const mlDiv = document.createElement('div');
        mlDiv.style.cssText = `position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);display:flex;gap:3px;pointer-events:none`;
        activeMachines.forEach(k => {
          const m = maskiner.find(mm => mm.maskin_id === k.maskin_id);
          if (m) {
            const chip = document.createElement('div');
            chip.style.cssText = `background:rgba(0,0,0,.85);backdrop-filter:blur(12px);padding:3px 8px;border-radius:6px;border:1px solid ${C.border}`;
            chip.innerHTML = `<span style="font-size:9px;font-weight:600;color:${C.t2};font-family:${ff}">${getMaskinDisplayName(m)}</span>`;
            mlDiv.appendChild(chip);
          }
        });
        container.appendChild(mlDiv);
      }

      container.addEventListener('click', (e) => {
        e.stopPropagation();
        setSelectedId(prev => prev === obj.id ? null : obj.id);
      });

      const marker = new window.maplibregl.Marker({ element: container, anchor: 'center' })
        .setLngLat([obj.lng!, obj.lat!])
        .addTo(mapRef.current);
      markersRef.current.push(marker);
    });
  }, [vis, mapReady, maskiner, maskinKo]);

  return (
    <div style={{ position: 'absolute', inset: 0 }} onClick={() => setSelectedId(null)}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {!mapReady && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, color: C.t3 }}>
          Laddar karta...
        </div>
      )}

      {/* Filter bar */}
      <div style={{
        position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 4, background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(16px)',
        padding: 4, borderRadius: 12, zIndex: 15, border: `1px solid ${C.border}`,
      }}>
        {[
          { k: 'alla' as const, l: 'Alla' },
          { k: 'slutavverkning' as const, l: 'Slutavverkning' },
          { k: 'gallring' as const, l: 'Gallring' },
        ].map(f => (
          <button key={f.k} onClick={() => { setFilt(f.k); setSelectedId(null); }} style={{
            padding: '6px 14px', background: filt === f.k ? 'rgba(255,255,255,0.1)' : 'transparent',
            color: filt === f.k ? C.t1 : C.t3, border: 'none', borderRadius: 8, fontSize: 11,
            fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s', fontFamily: ff,
          }}>{f.l}</button>
        ))}
        <div style={{ width: 1, background: C.border, margin: '4px 2px' }} />
        <button onClick={() => setShowHist(!showHist)} style={{
          padding: '6px 12px', background: showHist ? 'rgba(255,255,255,0.08)' : 'transparent',
          color: showHist ? C.t1 : C.t3, border: 'none', borderRadius: 8, fontSize: 11,
          fontWeight: 500, cursor: 'pointer', fontFamily: ff,
        }}>Historik</button>
      </div>

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: selectedObj ? 'auto' : 16, top: selectedObj ? 'auto' : 'auto',
        ...(selectedObj ? { top: 70 } : { bottom: 16 }),
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

      {/* Selected object card */}
      {selectedObj && <ObjCard obj={selectedObj} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
