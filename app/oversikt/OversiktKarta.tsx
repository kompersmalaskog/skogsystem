'use client';

import React, { useState, useEffect, useRef } from 'react';
import { OversiktObjekt } from './oversikt-types';

declare global {
  interface Window {
    maplibregl: any;
  }
}

interface Props {
  objekt: OversiktObjekt[];
}

export default function OversiktKarta({ objekt }: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);

  // Ladda MapLibre via CDN
  useEffect(() => {
    if (!document.getElementById('maplibre-css-oversikt')) {
      const link = document.createElement('link');
      link.id = 'maplibre-css-oversikt';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
      document.head.appendChild(link);
    }

    if (!window.maplibregl) {
      const existing = document.getElementById('maplibre-js-oversikt');
      if (existing) {
        existing.addEventListener('load', () => setMapReady(true));
        return;
      }
      const script = document.createElement('script');
      script.id = 'maplibre-js-oversikt';
      script.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
      script.onload = () => setMapReady(true);
      document.head.appendChild(script);
    } else {
      setMapReady(true);
    }
  }, []);

  // Initiera karta
  useEffect(() => {
    if (!mapReady || !mapContainerRef.current || mapRef.current) return;

    const objektWithCoords = objekt.filter(o => o.lat && o.lng);
    const center = objektWithCoords.length > 0
      ? [
          objektWithCoords.reduce((s, o) => s + o.lng!, 0) / objektWithCoords.length,
          objektWithCoords.reduce((s, o) => s + o.lat!, 0) / objektWithCoords.length,
        ]
      : [14.70, 56.40];

    const map = new window.maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors',
          },
        },
        layers: [{
          id: 'osm',
          type: 'raster',
          source: 'osm',
        }],
      },
      center: center,
      zoom: 10,
    });

    mapRef.current = map;

    map.on('load', () => {
      // Lägg till markers
      objektWithCoords.forEach((obj) => {
        const color = obj.typ === 'slutavverkning' ? '#f97316' : '#22c55e';

        const el = document.createElement('div');
        el.style.width = '16px';
        el.style.height = '16px';
        el.style.borderRadius = '50%';
        el.style.backgroundColor = color;
        el.style.border = '2px solid #fff';
        el.style.cursor = 'pointer';
        el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.4)';

        const popup = new window.maplibregl.Popup({ offset: 10, closeButton: false })
          .setHTML(`
            <div style="color:#000;font-family:system-ui;font-size:13px;padding:4px;">
              <div style="font-weight:600;margin-bottom:4px;">${obj.namn}</div>
              <div style="color:#666;margin-bottom:6px;">
                ${obj.typ === 'slutavverkning' ? 'Slutavverkning' : 'Gallring'} · ${obj.volym || 0} m³
              </div>
              <a href="/planering?objekt=${obj.id}"
                 style="color:#3b82f6;text-decoration:none;font-weight:500;">
                Öppna planering →
              </a>
            </div>
          `);

        new window.maplibregl.Marker({ element: el })
          .setLngLat([obj.lng!, obj.lat!])
          .setPopup(popup)
          .addTo(map);
      });

      // Zoom to fit
      if (objektWithCoords.length > 1) {
        const bounds = new window.maplibregl.LngLatBounds();
        objektWithCoords.forEach(o => bounds.extend([o.lng!, o.lat!]));
        map.fitBounds(bounds, { padding: 50, maxZoom: 14 });
      }
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [mapReady, objekt]);

  return (
    <div style={{ position: 'relative', height: 'calc(100vh - 220px)' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {!mapReady && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#000', color: '#666',
        }}>
          Laddar karta...
        </div>
      )}

      {/* Legend */}
      <div style={{
        position: 'absolute',
        bottom: '16px',
        left: '16px',
        background: 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(8px)',
        borderRadius: '10px',
        padding: '10px 14px',
        fontSize: '12px',
        display: 'flex',
        gap: '14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f97316' }} />
          <span style={{ color: '#ccc' }}>Slutavv.</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#22c55e' }} />
          <span style={{ color: '#ccc' }}>Gallring</span>
        </div>
      </div>
    </div>
  );
}
