'use client';

import { useEffect, useRef, useState } from 'react';

interface KartaVyProps {
  objekt: any;
  onTillbaka: () => void;
  onNavigera: (lat: number, lng: number) => void;
}

export default function KartaVy({ objekt, onTillbaka, onNavigera }: KartaVyProps) {
  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showMarkagare, setShowMarkagare] = useState(false);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    let cancelled = false;

    // Lägg till MapLibre CSS
    if (!document.getElementById('maplibre-css')) {
      const link = document.createElement('link');
      link.id = 'maplibre-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
      document.head.appendChild(link);
    }

    const loadScript = () => new Promise<void>((resolve) => {
      if ((window as any).maplibregl) { resolve(); return; }
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
      script.onload = () => resolve();
      document.head.appendChild(script);
    });

    loadScript().then(() => {
      if (cancelled || !mapContainerRef.current) return;
      const maplibregl = (window as any).maplibregl;
      if (!maplibregl) return;

      // Centrera på objektets koordinater eller standardposition
      const center: [number, number] = objekt.lat && objekt.lng
        ? [objekt.lng, objekt.lat]
        : [14.7, 56.5];

      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: {
          version: 8,
          sources: {
            satellite: {
              type: 'raster',
              tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
              tileSize: 256,
              maxzoom: 18,
              attribution: '&copy; Esri',
            },
            'terrain-dem': {
              type: 'raster-dem',
              tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
              tileSize: 256,
              maxzoom: 15,
              encoding: 'terrarium',
            },
          },
          layers: [
            { id: 'bg', type: 'background', paint: { 'background-color': '#0a0a0a' } },
            {
              id: 'satellite',
              type: 'raster',
              source: 'satellite',
              paint: {
                'raster-brightness-max': 0.7,
                'raster-contrast': 0.15,
                'raster-saturation': -0.1,
              },
            },
          ],
          sky: {
            'sky-color': '#000000',
            'horizon-color': '#111111',
            'sky-horizon-blend': 0.5,
          },
          terrain: {
            source: 'terrain-dem',
            exaggeration: 1.5,
          },
        },
        center,
        zoom: 15,
        pitch: 50,
        bearing: 20,
        attributionControl: false,
      });

      map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottomright');

      // Markör
      if (objekt.lat && objekt.lng) {
        const el = document.createElement('div');
        el.style.cssText = 'width:20px;height:20px;background:#7cba3f;border:2px solid #fff;border-radius:50%;box-shadow:0 0 10px rgba(124,186,63,0.6);';
        new maplibregl.Marker({ element: el })
          .setLngLat([objekt.lng, objekt.lat])
          .setPopup(new maplibregl.Popup({ offset: 10 }).setHTML(`<b>${objekt.namn}</b><br>${objekt.volym || 0} m³`))
          .addTo(map);
      }

      // Kartbild-overlay
      map.on('load', () => {
        if (objekt.kartbild_url && objekt.kartbild_bounds) {
          const bounds = objekt.kartbild_bounds;
          const sw: [number, number] = [bounds[0][1], bounds[0][0]]; // [lng, lat]
          const ne: [number, number] = [bounds[1][1], bounds[1][0]];
          const nw: [number, number] = [sw[0], ne[1]];
          const se: [number, number] = [ne[0], sw[1]];

          map.addSource('kartbild', {
            type: 'image',
            url: objekt.kartbild_url,
            coordinates: [nw, ne, se, sw],
          });
          map.addLayer({
            id: 'kartbild-layer',
            type: 'raster',
            source: 'kartbild',
            paint: { 'raster-opacity': 0.8 },
          });

          // Zooma till kartbildens bounds
          map.fitBounds([sw, ne], { padding: 20 });
        }
      });

      mapRef.current = map;
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [objekt]);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    }}>
      {/* Karta - tar hela skärmen */}
      <div
        ref={mapContainerRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      />

      {/* Objektnamn i vänster hörn */}
      <div style={{
        position: 'absolute',
        top: '16px',
        left: '16px',
        zIndex: 1000,
        backgroundColor: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: '12px',
        padding: '12px 16px',
        maxWidth: 'calc(100% - 80px)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{
          fontSize: '16px',
          fontWeight: '600',
          color: '#fff',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {objekt.namn}
        </div>
        <div style={{ fontSize: '12px', color: '#999' }}>
          {objekt.volym || 0} m³ · {objekt.typ === 'slutavverkning' ? 'Slutavverkning' : 'Gallring'}
        </div>
      </div>

      {/* Menyknapp i höger hörn */}
      <button
        onClick={() => setShowMenu(!showMenu)}
        style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          zIndex: 1000,
          width: '48px',
          height: '48px',
          backgroundColor: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px',
          color: '#fff',
          fontSize: '24px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ☰
      </button>

      {/* Dropdown-meny */}
      {showMenu && (
        <>
          <div
            onClick={() => setShowMenu(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 1001,
            }}
          />
          <div style={{
            position: 'absolute',
            top: '72px',
            right: '16px',
            zIndex: 1002,
            backgroundColor: 'rgba(0,0,0,0.95)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderRadius: '12px',
            overflow: 'hidden',
            minWidth: '180px',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <button
              onClick={() => { setShowMenu(false); onTillbaka(); }}
              style={{
                width: '100%', padding: '16px 20px', background: 'none',
                border: 'none', borderBottom: '1px solid #333',
                color: '#fff', fontSize: '16px', textAlign: 'left', cursor: 'pointer',
              }}
            >
              ← Tillbaka
            </button>
            <button
              onClick={() => { setShowMenu(false); onTillbaka(); }}
              style={{
                width: '100%', padding: '16px 20px', background: 'none',
                border: 'none', borderBottom: '1px solid #333',
                color: '#fff', fontSize: '16px', textAlign: 'left', cursor: 'pointer',
              }}
            >
              Byt objekt
            </button>
            {objekt.markagare && (
              <button
                onClick={() => { setShowMenu(false); setShowMarkagare(true); }}
                style={{
                  width: '100%', padding: '16px 20px', background: 'none',
                  border: 'none', borderBottom: '1px solid #333',
                  color: '#fff', fontSize: '16px', textAlign: 'left', cursor: 'pointer',
                }}
              >
                Markägare
              </button>
            )}
            {objekt.lat && objekt.lng && (
              <button
                onClick={() => { setShowMenu(false); onNavigera(objekt.lat, objekt.lng); }}
                style={{
                  width: '100%', padding: '16px 20px', background: 'none',
                  border: 'none', color: '#fff', fontSize: '16px', textAlign: 'left', cursor: 'pointer',
                }}
              >
                Navigera
              </button>
            )}
          </div>
        </>
      )}

      {/* Markägare-modal */}
      {showMarkagare && (
        <div
          onClick={() => setShowMarkagare(false)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 2000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#111',
              borderRadius: '16px',
              padding: '24px',
              margin: '20px',
              maxWidth: '400px',
              width: '100%',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <h3 style={{ margin: '0 0 16px', color: '#fff', fontSize: '18px' }}>
              Markägare
            </h3>
            <div style={{ color: '#fff', fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>
              {objekt.markagare}
            </div>
            {objekt.markagare_tel && (
              <a
                href={`tel:${objekt.markagare_tel}`}
                style={{
                  display: 'inline-block', padding: '12px 24px',
                  backgroundColor: '#7cba3f', color: '#fff', borderRadius: '8px',
                  textDecoration: 'none', fontSize: '18px', fontWeight: '600', marginTop: '8px',
                }}
              >
                {objekt.markagare_tel}
              </a>
            )}
            {objekt.markagare_epost && (
              <div style={{ color: '#999', fontSize: '14px', marginTop: '12px' }}>
                {objekt.markagare_epost}
              </div>
            )}
            <button
              onClick={() => setShowMarkagare(false)}
              style={{
                width: '100%', padding: '14px', marginTop: '20px',
                backgroundColor: '#333', border: 'none', borderRadius: '8px',
                color: '#fff', fontSize: '16px', cursor: 'pointer',
              }}
            >
              Stäng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
