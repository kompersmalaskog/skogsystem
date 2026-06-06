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
  /** Sätts av planeringsvyn när inloggad är förare → filtrera listan på
   *  tilldelad till denna medarbetare + status ('planerad'|'pagaende'),
   *  och dölj Oplanerade/Planerade-tabs + filter-pills + footer-totalen. */
  forareFilter?: { medarbetareId: string };
  /** Sätts av planeringsvyn när inloggad är förare → visa grön Starta-cirkel
   *  istället för pil på rader med status='planerad'. Tap = starta+öppna
   *  (samma underliggande logik som kart-pillens "Starta körning"). */
  onStartObjekt?: (objekt: any) => void;
}

export default function ObjektValjare({ onSelectObjekt, onNavigera, forareFilter, onStartObjekt }: ObjektValjareProps) {
  // STEG 7: avslutade-flik tillagd. Default 'planerade' för förare (de har
  // inga oplanerade objekt), 'oplanerade' för admin (befintligt beteende).
  const [activeTab, setActiveTab] = useState<'oplanerade' | 'planerade' | 'avslutade'>(
    forareFilter ? 'planerade' : 'oplanerade'
  );
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

  // STEG 7: exkludera avslutade från Oplanerade/Planerade (annars dubblerade)
  const oplanerade = objekt.filter(o => (!o.ar || !o.manad) && o.status !== 'avslutat');
  const planerade = objekt.filter(o => o.ar && o.manad && o.status !== 'avslutat');
  const avslutade = objekt
    .filter(o => o.status === 'avslutat')
    .sort((a, b) => (b.avslutad_timestamp || '').localeCompare(a.avslutad_timestamp || ''));

  let lista: any[];
  if (forareFilter) {
    // Förar-läge: filtrera på tilldelad + status beroende på flik
    const baseFilter = (o: any) =>
      o.assigned_skordare_user_id === forareFilter.medarbetareId ||
      o.assigned_skotare_user_id === forareFilter.medarbetareId;
    if (activeTab === 'avslutade') {
      lista = objekt
        .filter(o => baseFilter(o) && o.status === 'avslutat')
        .sort((a, b) => (b.avslutad_timestamp || '').localeCompare(a.avslutad_timestamp || ''));
    } else {
      lista = objekt.filter(o => baseFilter(o) && (o.status === 'planerad' || o.status === 'pagaende'));
    }
  } else {
    let allData: any[];
    if (activeTab === 'avslutade') {
      allData = avslutade;
    } else {
      allData = activeTab === 'oplanerade' ? oplanerade : planerade;
    }
    lista = filter === 'alla' ? allData : allData.filter(o => o.typ === filter);
  }
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
        <div style={{ fontSize: '13px', color: '#8e8e93', letterSpacing: '0.5px', marginBottom: '4px', textTransform: 'none' }}>
          Kompersmåla Skog
        </div>
        <div style={{ fontSize: '24px', fontWeight: '600' }}>
          Välj objekt
        </div>
      </div>

      {/* Filter — döljs för förare */}
      {!forareFilter && (
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
                fontSize: '13px',
                fontWeight: '500',
                cursor: 'pointer',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* STEG 7: Tabs — alltid synliga. Admin: 3 (Oplanerade, Planerade, Avslutade).
          Förare: 2 (Planerade, Avslutade — Oplanerade-fliken dolds). */}
      <div style={{ display: 'flex', borderBottom: '1px solid #222' }}>
        {!forareFilter && (
          <button
            type="button"
            onClick={() => setActiveTab('oplanerade')}
            aria-pressed={activeTab === 'oplanerade'}
            style={{
              flex: 1,
              padding: '16px',
              background: 'none',
              border: 'none',
              color: activeTab === 'oplanerade' ? '#fff' : '#8e8e93',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
              borderBottom: activeTab === 'oplanerade' ? '2px solid #fff' : '2px solid transparent',
            }}
          >
            Oplanerade ({oplanerade.length})
          </button>
        )}
        <button
          type="button"
          onClick={() => setActiveTab('planerade')}
          aria-pressed={activeTab === 'planerade'}
          style={{
            flex: 1,
            padding: '16px',
            background: 'none',
            border: 'none',
            color: activeTab === 'planerade' ? '#fff' : '#8e8e93',
            fontSize: '13px',
            fontWeight: '500',
            cursor: 'pointer',
            borderBottom: activeTab === 'planerade' ? '2px solid #fff' : '2px solid transparent',
          }}
        >
          Planerade ({planerade.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('avslutade')}
          aria-pressed={activeTab === 'avslutade'}
          style={{
            flex: 1,
            padding: '16px',
            background: 'none',
            border: 'none',
            color: activeTab === 'avslutade' ? '#fff' : '#8e8e93',
            fontSize: '13px',
            fontWeight: '500',
            cursor: 'pointer',
            borderBottom: activeTab === 'avslutade' ? '2px solid #fff' : '2px solid transparent',
          }}
        >
          Avslutade ({avslutade.length})
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
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#8e8e93', fontSize: '13px' }}>
            Laddar...
          </div>
        ) : lista.map((obj: any) => {
          const dist = getDistance(obj.lat, obj.lng);
          const typLabel = obj.typ === 'slutavverkning' ? 'Slutavverkning' : 'Gallring';
          const volymLabel = obj.volym ? `${obj.volym} m³` : 'ingen volym angiven';
          // STEG 3 (förenklad): visa grön Starta-cirkel istället för pil på
          // förare-rader med status='planerad'. Yttre raden blir div role="button"
          // för att tillåta nestad <button> (knapp-i-knapp är ogiltig HTML).
          const visaStarta = !!(forareFilter && obj.status === 'planerad' && onStartObjekt);
          // STEG 7: avslutade rader dimm:as och visar avslutsdatum istället för avstånd
          const ärAvslutad = obj.status === 'avslutat';
          const avslutsdatum = ärAvslutad && obj.avslutad_timestamp
            ? obj.avslutad_timestamp.slice(0, 10) : null;
          return (
            <div
              key={obj.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedObj(obj)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedObj(obj);
                }
              }}
              aria-label={`${obj.namn}, ${typLabel}, ${volymLabel}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '16px 20px',
                borderBottom: '1px solid #1a1a1a',
                background: 'transparent',
                color: 'inherit',
                width: '100%',
                textAlign: 'left',
                font: 'inherit',
                cursor: 'pointer',
                opacity: ärAvslutad ? 0.7 : 1,
              }}
            >
              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '15px',
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
                  {obj.bolag && <span style={{ color: '#8e8e93' }}> · {obj.bolag}</span>}
                </div>
              </div>

              {/* Avstånd (aktiva) eller avslutsdatum (avslutade) */}
              {ärAvslutad ? (
                <div style={{ textAlign: 'right', marginLeft: '12px', flexShrink: 0 }}>
                  <div style={{ fontSize: '12px', color: '#8e8e93' }}>Avslutat</div>
                  <div style={{ fontSize: '13px', color: '#8e8e93', fontVariantNumeric: 'tabular-nums' }}>
                    {avslutsdatum || '—'}
                  </div>
                </div>
              ) : (dist !== null || roadDist[obj.id]) && (
                <div style={{ textAlign: 'right', marginLeft: '12px', flexShrink: 0 }}>
                  <div style={{ fontSize: '13px', color: '#8e8e93' }}>
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
                <div style={{ fontSize: '15px', fontWeight: '500', color: obj.volym ? '#fff' : '#8e8e93' }}>
                  {obj.volym ? obj.volym : '–'}
                </div>
                <div style={{ fontSize: '13px', color: '#8e8e93' }}>
                  m³
                </div>
              </div>

              {/* Starta-cirkel (förare + planerad) ELLER pil */}
              {visaStarta ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStartObjekt!(obj);
                  }}
                  aria-label={`Starta körning på ${obj.namn}`}
                  style={{
                    marginLeft: '16px',
                    width: 52,
                    height: 52,
                    borderRadius: '50%',
                    background: '#30d158',
                    border: 'none',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(48, 209, 88, 0.35)',
                    padding: 0,
                  }}
                >
                  <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '28px' }}>play_arrow</span>
                </button>
              ) : (
                <div style={{ marginLeft: '16px', color: '#8e8e93', fontSize: '20px' }} aria-hidden="true">
                  ›
                </div>
              )}
            </div>
          );
        })}

        {/* Tom state */}
        {!loading && lista.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: '#8e8e93',
            fontSize: '13px',
          }}>
            Inga objekt
          </div>
        )}
      </div>

      {/* Footer med total — döljs för förare (planerar-info, inte förar-info) */}
      {!forareFilter && (
        <div style={{
          padding: '16px 20px',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          backgroundColor: '#0a0a0a',
          textAlign: 'center',
        }}>
          <span style={{ color: '#8e8e93', fontSize: '15px' }}>
            {activeTab === 'oplanerade' ? 'Oplanerat' : activeTab === 'planerade' ? 'Planerat' : 'Avslutat'} totalt:{' '}
          </span>
          <span style={{ fontSize: '15px', fontWeight: '600', color: '#fff' }}>
            {filtreratTotal.toLocaleString()} m³
          </span>
        </div>
      )}

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
            <p style={{ margin: '0 0 24px', color: '#8e8e93', fontSize: '13px' }}>
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
                borderRadius: '16px',
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
                height: '56px',
                borderRadius: '16px',
                border: '1px solid #555',
                background: 'transparent',
                color: selectedObj.lat && selectedObj.lng ? '#fff' : '#8e8e93',
                fontSize: '15px',
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
