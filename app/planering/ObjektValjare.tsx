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
  const [roadDist, setRoadDist] = useState<Record<string, number | 'loading'>>({});
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

  // Fetch road distances one by one via OSRM
  useEffect(() => {
    if (!userPos || objekt.length === 0) return;
    let cancelled = false;

    const fetchRoadDistances = async () => {
      const withCoords = objekt.filter(o => o.lat && o.lng);
      // Sort by straight-line distance so nearest load first
      const sorted = [...withCoords].sort((a, b) => {
        return (getDistance(a.lat, a.lng) || 999) - (getDistance(b.lat, b.lng) || 999);
      });

      for (const obj of sorted) {
        if (cancelled) break;
        const key = obj.id;
        setRoadDist(prev => ({ ...prev, [key]: 'loading' }));
        try {
          const url = `https://router.project-osrm.org/route/v1/driving/${userPos.lng},${userPos.lat};${obj.lng},${obj.lat}?overview=false`;
          const res = await fetch(url);
          const data = await res.json();
          if (!cancelled && data.routes?.[0]) {
            const km = Math.round(data.routes[0].distance / 100) / 10; // 1 decimal
            setRoadDist(prev => ({ ...prev, [key]: km }));
          }
        } catch {
          // Silently fail — straight-line fallback will show
          if (!cancelled) setRoadDist(prev => { const n = { ...prev }; delete n[key]; return n; });
        }
      }
    };

    fetchRoadDistances();
    return () => { cancelled = true; };
  }, [userPos, objekt]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const distA = (typeof roadDist[a.id] === 'number' ? roadDist[a.id] as number : null) ?? getDistance(a.lat, a.lng) ?? 999;
      const distB = (typeof roadDist[b.id] === 'number' ? roadDist[b.id] as number : null) ?? getDistance(b.lat, b.lng) ?? 999;
      return distA - distB;
    });
  }

  const filtreratTotal = lista.reduce((sum, o) => sum + (o.volym || 0), 0);

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
        <div style={{ fontSize: '13px', color: '#a8a8ad', letterSpacing: '0.5px', marginBottom: '4px', textTransform: 'none' }}>
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
            type="button"
            onClick={() => setFilter(f.key as any)}
            aria-pressed={filter === f.key}
            style={{
              minHeight: '44px',
              padding: '10px 20px',
              borderRadius: '22px',
              border: filter === f.key ? '1px solid #fff' : '1px solid #555',
              background: filter === f.key ? '#fff' : 'transparent',
              color: filter === f.key ? '#000' : '#fff',
              fontSize: '14px',
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
          type="button"
          onClick={() => setActiveTab('oplanerade')}
          aria-pressed={activeTab === 'oplanerade'}
          style={{
            flex: 1,
            padding: '16px',
            background: 'none',
            border: 'none',
            color: activeTab === 'oplanerade' ? '#fff' : '#a8a8ad',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            borderBottom: activeTab === 'oplanerade' ? '2px solid #fff' : '2px solid transparent',
          }}
        >
          Oplanerade ({oplanerade.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('planerade')}
          aria-pressed={activeTab === 'planerade'}
          style={{
            flex: 1,
            padding: '16px',
            background: 'none',
            border: 'none',
            color: activeTab === 'planerade' ? '#fff' : '#a8a8ad',
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
          <div style={{ padding: '12px 20px 4px', fontSize: '13px', color: '#a8a8ad' }}>
            Välj ett objekt och tryck Planera för att lägga till volym
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#a8a8ad', fontSize: '14px' }}>
            Laddar...
          </div>
        ) : lista.map((obj: any) => {
          const dist = getDistance(obj.lat, obj.lng);
          const typLabel = obj.typ === 'slutavverkning' ? 'Slutavverkning' : 'Gallring';
          const volymLabel = obj.volym ? `${obj.volym} m³` : 'ingen volym angiven';
          return (
            <button
              key={obj.id}
              type="button"
              onClick={() => setSelectedObj(obj)}
              aria-label={`${obj.namn}, ${typLabel}, ${volymLabel}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '16px 20px',
                borderBottom: '1px solid #1a1a1a',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                background: 'transparent',
                color: 'inherit',
                width: '100%',
                textAlign: 'left',
                font: 'inherit',
                cursor: 'pointer',
              }}
            >
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
                <div style={{ fontSize: '13px' }}>
                  <span style={{ color: 'rgba(255,255,255,0.85)' }}>{typLabel}</span>
                  {obj.bolag && <span style={{ color: '#a8a8ad' }}> · {obj.bolag}</span>}
                </div>
              </div>

              {/* Avstånd */}
              {(dist !== null || roadDist[obj.id]) && (
                <div style={{ textAlign: 'right', marginLeft: '12px', flexShrink: 0 }}>
                  <div style={{ fontSize: '14px', color: '#a8a8ad' }}>
                    {typeof roadDist[obj.id] === 'number'
                      ? `${roadDist[obj.id]} km`
                      : roadDist[obj.id] === 'loading'
                        ? (dist !== null ? `~${dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`}` : '...')
                        : dist !== null
                          ? (dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`)
                          : ''}
                  </div>
                </div>
              )}

              {/* Volym */}
              <div style={{ textAlign: 'right', marginLeft: '16px', flexShrink: 0 }}>
                <div style={{ fontSize: '16px', fontWeight: '500', color: obj.volym ? '#fff' : '#a8a8ad' }}>
                  {obj.volym ? obj.volym : '–'}
                </div>
                <div style={{ fontSize: '13px', color: '#a8a8ad' }}>
                  m³
                </div>
              </div>

              {/* Pil */}
              <div style={{ marginLeft: '16px', color: '#a8a8ad', fontSize: '20px' }} aria-hidden="true">
                ›
              </div>
            </button>
          );
        })}

        {/* Tom state */}
        {!loading && lista.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: '#a8a8ad',
            fontSize: '14px',
          }}>
            Inga objekt
          </div>
        )}
      </div>

      {/* Footer med total */}
      <div style={{
        padding: '16px 20px',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        backgroundColor: '#0a0a0a',
        textAlign: 'center',
      }}>
        <span style={{ color: '#a8a8ad', fontSize: '15px' }}>
          {activeTab === 'oplanerade' ? 'Oplanerat' : 'Planerat'} totalt:{' '}
        </span>
        <span style={{ fontSize: '15px', fontWeight: '600', color: '#fff' }}>
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
              padding: '12px 24px calc(24px + env(safe-area-inset-bottom, 10px))',
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
            <p style={{ margin: '0 0 24px', color: '#a8a8ad', fontSize: '13px' }}>
              {selectedObj.typ === 'slutavverkning' ? 'Slutavverkning' : 'Gallring'}
              {' · '}{selectedObj.volym ? `${selectedObj.volym} m³` : '–'}
              {typeof roadDist[selectedObj.id] === 'number'
                ? <> · {roadDist[selectedObj.id]} km</>
                : getDistance(selectedObj.lat, selectedObj.lng) !== null
                  ? <> · ~{getDistance(selectedObj.lat, selectedObj.lng)!.toFixed(1)} km</>
                  : null}
            </p>

            {/* Knappar — staplade vertikalt */}
            <button
              type="button"
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
                background: '#30d158',
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
              type="button"
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
                color: selectedObj.lat && selectedObj.lng ? '#fff' : '#a8a8ad',
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
