'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fixa Leaflet marker-ikon i Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface KartaVyProps {
  objekt: any;
  onTillbaka: () => void;
  onNavigera: (lat: number, lng: number) => void;
}

export default function KartaVy({ objekt, onTillbaka, onNavigera }: KartaVyProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showMarkagare, setShowMarkagare] = useState(false);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Centrera på objektets koordinater eller standardposition
    const center: [number, number] = objekt.lat && objekt.lng
      ? [objekt.lat, objekt.lng]
      : [56.5, 14.7];

    // Skapa kartan
    const map = L.map(mapContainerRef.current, {
      center,
      zoom: 15,
      zoomControl: false,
    });

    // Lägg till kartlager
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    // Lägg till zoom-kontroll nere till höger
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Markör för objektets position
    if (objekt.lat && objekt.lng) {
      const marker = L.marker([objekt.lat, objekt.lng]).addTo(map);
      marker.bindPopup(`<b>${objekt.namn}</b><br>${objekt.volym || 0} m³`);
    }

    // Lägg till kartbild-overlay om det finns
    if (objekt.kartbild_url && objekt.kartbild_bounds) {
      const bounds: L.LatLngBoundsExpression = [
        [objekt.kartbild_bounds[0][0], objekt.kartbild_bounds[0][1]],
        [objekt.kartbild_bounds[1][0], objekt.kartbild_bounds[1][1]]
      ];

      L.imageOverlay(objekt.kartbild_url, bounds, {
        opacity: 0.8,
      }).addTo(map);

      // Zooma till kartbildens bounds
      map.fitBounds(bounds, { padding: [20, 20] });
    }

    mapRef.current = map;

    return () => {
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
        borderRadius: '12px',
        padding: '12px 16px',
        maxWidth: 'calc(100% - 80px)',
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
          border: 'none',
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
          {/* Bakgrund för att stänga menyn */}
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
            borderRadius: '12px',
            overflow: 'hidden',
            minWidth: '180px',
          }}>
            <button
              onClick={() => {
                setShowMenu(false);
                onTillbaka();
              }}
              style={{
                width: '100%',
                padding: '16px 20px',
                background: 'none',
                border: 'none',
                borderBottom: '1px solid #333',
                color: '#fff',
                fontSize: '16px',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              ← Tillbaka
            </button>
            <button
              onClick={() => {
                setShowMenu(false);
                onTillbaka();
              }}
              style={{
                width: '100%',
                padding: '16px 20px',
                background: 'none',
                border: 'none',
                borderBottom: '1px solid #333',
                color: '#fff',
                fontSize: '16px',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              Byt objekt
            </button>
            {objekt.markagare && (
              <button
                onClick={() => {
                  setShowMenu(false);
                  setShowMarkagare(true);
                }}
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  background: 'none',
                  border: 'none',
                  borderBottom: '1px solid #333',
                  color: '#fff',
                  fontSize: '16px',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                Markägare
              </button>
            )}
            {objekt.lat && objekt.lng && (
              <button
                onClick={() => {
                  setShowMenu(false);
                  onNavigera(objekt.lat, objekt.lng);
                }}
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  background: 'none',
                  border: 'none',
                  color: '#fff',
                  fontSize: '16px',
                  textAlign: 'left',
                  cursor: 'pointer',
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
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
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
                  display: 'inline-block',
                  padding: '12px 24px',
                  backgroundColor: '#22c55e',
                  color: '#fff',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontSize: '18px',
                  fontWeight: '600',
                  marginTop: '8px',
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
                width: '100%',
                padding: '14px',
                marginTop: '20px',
                backgroundColor: '#333',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '16px',
                cursor: 'pointer',
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
