'use client';
import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface ObjektValjareProps {
  onSelectObjekt: (objekt: any) => void;
  onNavigera: (lat: number, lng: number) => void;
}

export default function ObjektValjare({ onSelectObjekt, onNavigera }: ObjektValjareProps) {
  const [activeTab, setActiveTab] = useState<'oplanerade' | 'planerade'>('oplanerade');
  const [filter, setFilter] = useState<'alla' | 'slutavverkning' | 'gallring'>('alla');
  const [selectedObj, setSelectedObj] = useState<any>(null);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [objekt, setObjekt] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetVisible, setSheetVisible] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const touchCurrentY = useRef(0);

  useEffect(() => {
    const fetchObjekt = async () => {
      const { data, error } = await supabase
        .from('objekt')
        .select('*')
        .order('namn', { ascending: true });
      if (error) console.error('Fetch error:', error);
      else setObjekt(data || []);
      setLoading(false);
    };
    fetchObjekt();
  }, []);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setUserPos({ lat: 56.40, lng: 14.70 }),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
      );
    } else {
      setUserPos({ lat: 56.40, lng: 14.70 });
    }
  }, []);

  // Sheet open/close animation
  useEffect(() => {
    if (selectedObj) {
      requestAnimationFrame(() => setSheetVisible(true));
    }
  }, [selectedObj]);

  const closeSheet = () => {
    setSheetVisible(false);
    setTimeout(() => setSelectedObj(null), 300);
  };

  // Swipe-down to close
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchCurrentY.current = e.touches[0].clientY;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    touchCurrentY.current = e.touches[0].clientY;
    const dy = touchCurrentY.current - touchStartY.current;
    if (dy > 0 && sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${dy}px)`;
      sheetRef.current.style.transition = 'none';
    }
  };
  const handleTouchEnd = () => {
    const dy = touchCurrentY.current - touchStartY.current;
    if (sheetRef.current) {
      sheetRef.current.style.transition = '';
    }
    if (dy > 80) {
      closeSheet();
    } else if (sheetRef.current) {
      sheetRef.current.style.transform = '';
    }
  };

  const getDistance = (lat: number | null, lng: number | null) => {
    if (!userPos || !lat || !lng) return null;
    const R = 6371;
    const dLat = (lat - userPos.lat) * Math.PI / 180;
    const dLng = (lng - userPos.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(userPos.lat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const oplanerade = objekt.filter(o => !o.ar || !o.manad);
  const planerade = objekt.filter(o => o.ar && o.manad);
  const allData = activeTab === 'oplanerade' ? oplanerade : planerade;

  let lista = filter === 'alla' ? allData : allData.filter(o => o.typ === filter);
  if (userPos) {
    lista = [...lista].sort((a, b) => {
      const distA = getDistance(a.lat, a.lng) || 999;
      const distB = getDistance(b.lat, b.lng) || 999;
      return distA - distB;
    });
  }

  const filtreratTotal = lista.reduce((sum, o) => sum + (o.volym || 0), 0);

  // Status icon for typ
  const TypIcon = ({ typ }: { typ: string }) => {
    const isSlut = typ === 'slutavverkning';
    return (
      <div style={{
        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
        background: isSlut ? 'rgba(255,159,10,0.15)' : 'rgba(52,199,89,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {isSlut ? (
          // Tree stump icon for slutavverkning
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M8 1L3 7h3v4H2v2h12v-2h-4V7h3L8 1z" fill="#ff9f0a" />
          </svg>
        ) : (
          // Thinned trees icon for gallring
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M5 2L2 7h2v5h2V7h2L5 2z" fill="#34c759" />
            <path d="M11 4L9 8h1.5v4h2V8H14l-3-4z" fill="#34c759" opacity="0.6" />
          </svg>
        )}
      </div>
    );
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#000',
      color: '#fff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <style>{`
        @keyframes sheet-in {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>

      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #222' }}>
        <div style={{ fontSize: '11px', color: '#8e8e93', letterSpacing: '0.5px', marginBottom: '4px', textTransform: 'none' }}>
          Kompersmåla Skog
        </div>
        <div style={{ fontSize: '24px', fontWeight: '600' }}>
          Välj objekt
        </div>
      </div>

      {/* Filter */}
      <div style={{
        display: 'flex',
        gap: '8px',
        padding: '16px 20px',
        borderBottom: '1px solid #222',
      }}>
        {[
          { key: 'alla', label: 'Alla' },
          { key: 'slutavverkning', label: 'Slutavverkning' },
          { key: 'gallring', label: 'Gallring' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key as any)}
            style={{
              padding: '8px 16px',
              borderRadius: '20px',
              border: filter === f.key ? '1px solid #fff' : '1px solid #333',
              background: filter === f.key ? '#fff' : 'transparent',
              color: filter === f.key ? '#000' : '#fff',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid #222',
      }}>
        <button
          onClick={() => setActiveTab('oplanerade')}
          style={{
            flex: 1,
            padding: '16px',
            background: 'none',
            border: 'none',
            color: activeTab === 'oplanerade' ? '#fff' : '#666',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            borderBottom: activeTab === 'oplanerade' ? '2px solid #fff' : '2px solid transparent',
          }}
        >
          Oplanerade ({oplanerade.length})
        </button>
        <button
          onClick={() => setActiveTab('planerade')}
          style={{
            flex: 1,
            padding: '16px',
            background: 'none',
            border: 'none',
            color: activeTab === 'planerade' ? '#fff' : '#666',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            borderBottom: activeTab === 'planerade' ? '2px solid #fff' : '2px solid transparent',
          }}
        >
          Planerade ({planerade.length})
        </button>
      </div>

      {/* Lista */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {/* Förklaringstext för oplanerade */}
        {activeTab === 'oplanerade' && !loading && oplanerade.length > 0 && (
          <div style={{ padding: '12px 20px 4px', fontSize: '13px', color: '#8e8e93' }}>
            Välj ett objekt och tryck Planera för att lägga till volym
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#666' }}>
            Laddar...
          </div>
        ) : lista.map((obj: any) => {
          const dist = getDistance(obj.lat, obj.lng);
          return (
            <div
              key={obj.id}
              onClick={() => setSelectedObj(obj)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '16px 20px',
                borderBottom: '1px solid #1a1a1a',
                cursor: 'pointer',
              }}
            >
              {/* Typ-ikon */}
              <div style={{ marginRight: '14px' }}>
                <TypIcon typ={obj.typ || 'slutavverkning'} />
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '16px',
                  fontWeight: '500',
                  marginBottom: '4px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {obj.namn}
                </div>
                <div style={{ fontSize: '13px', color: '#666', textTransform: 'none' }}>
                  {obj.typ === 'slutavverkning' ? 'Slutavverkning' : 'Gallring'}
                  {obj.bolag && ` · ${obj.bolag}`}
                </div>
              </div>

              {/* Avstånd */}
              {dist !== null && (
                <div style={{ textAlign: 'right', marginLeft: '12px', flexShrink: 0 }}>
                  <div style={{ fontSize: '14px', color: '#666' }}>
                    {dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`}
                  </div>
                </div>
              )}

              {/* Volym */}
              <div style={{ textAlign: 'right', marginLeft: '16px', flexShrink: 0 }}>
                <div style={{ fontSize: '16px', fontWeight: '500', color: obj.volym ? '#fff' : '#666' }}>
                  {obj.volym ? obj.volym : '–'}
                </div>
                <div style={{ fontSize: '12px', color: '#666' }}>
                  m³
                </div>
              </div>

              {/* Pil */}
              <div style={{ marginLeft: '16px', color: '#666', fontSize: '20px' }}>
                ›
              </div>
            </div>
          );
        })}

        {/* Tom state */}
        {!loading && lista.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: '#666',
          }}>
            Inga objekt
          </div>
        )}
      </div>

      {/* Footer med total */}
      <div style={{
        padding: '20px',
        borderTop: '1px solid #222',
        backgroundColor: '#0a0a0a',
        textAlign: 'center',
      }}>
        <span style={{ color: '#666', fontSize: '14px' }}>
          {activeTab === 'oplanerade' ? 'Oplanerat' : 'Planerat'} totalt:{' '}
        </span>
        <span style={{ fontSize: '16px', fontWeight: '600' }}>
          {filtreratTotal.toLocaleString()} m³
        </span>
      </div>

      {/* Bottom Sheet */}
      {selectedObj && (
        <div
          onClick={closeSheet}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: sheetVisible ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0)',
            transition: 'background-color 0.3s ease',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            ref={sheetRef}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{
              backgroundColor: '#1c1c1e',
              borderRadius: '16px 16px 0 0',
              padding: '12px 24px 34px',
              width: '100%',
              maxWidth: '500px',
              transform: sheetVisible ? 'translateY(0)' : 'translateY(100%)',
              transition: 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
            }}
          >
            {/* Drag handle */}
            <div style={{
              width: '36px',
              height: '4px',
              backgroundColor: '#555',
              borderRadius: '2px',
              margin: '0 auto 20px',
            }} />

            {/* Objektnamn */}
            <h2 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: '600' }}>
              {selectedObj.namn}
            </h2>

            {/* Typ + volym + avstånd */}
            <p style={{ margin: '0 0 24px', color: '#8e8e93', fontSize: '13px' }}>
              {selectedObj.typ === 'slutavverkning' ? 'Slutavverkning' : 'Gallring'}
              {' · '}{selectedObj.volym ? `${selectedObj.volym} m³` : '–'}
              {getDistance(selectedObj.lat, selectedObj.lng) !== null && (
                <> · {getDistance(selectedObj.lat, selectedObj.lng)!.toFixed(1)} km bort</>
              )}
            </p>

            {/* Knappar — staplade vertikalt */}
            <button
              onClick={() => {
                onSelectObjekt(selectedObj);
                setSelectedObj(null);
              }}
              style={{
                width: '100%',
                padding: '0',
                height: '56px',
                borderRadius: '12px',
                border: 'none',
                background: '#34c759',
                color: '#fff',
                fontSize: '17px',
                fontWeight: '600',
                cursor: 'pointer',
                marginBottom: '10px',
              }}
            >
              Planera
            </button>
            <button
              onClick={() => {
                if (selectedObj.lat && selectedObj.lng) {
                  onNavigera(selectedObj.lat, selectedObj.lng);
                }
                closeSheet();
              }}
              disabled={!selectedObj.lat || !selectedObj.lng}
              style={{
                width: '100%',
                padding: '0',
                height: '50px',
                borderRadius: '12px',
                border: '1px solid #555',
                background: 'transparent',
                color: selectedObj.lat && selectedObj.lng ? '#fff' : '#555',
                fontSize: '16px',
                fontWeight: '500',
                cursor: selectedObj.lat && selectedObj.lng ? 'pointer' : 'not-allowed',
              }}
            >
              Navigera
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
