'use client';
import React, { useState, useEffect } from 'react';
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

  // Hämta objekt från Supabase
  useEffect(() => {
    const fetchObjekt = async () => {
      const { data, error } = await supabase
        .from('objekt')
        .select('*')
        .order('namn', { ascending: true });

      if (error) {
        console.error('Fetch error:', error);
      } else {
        setObjekt(data || []);
      }
      setLoading(false);
    };

    fetchObjekt();
  }, []);

  // Hämta GPS-position
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setUserPos({ lat: 56.40, lng: 14.70 })
      );
    } else {
      setUserPos({ lat: 56.40, lng: 14.70 });
    }
  }, []);

  // Beräkna avstånd i km
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

  // Dela upp i oplanerade och planerade
  const oplanerade = objekt.filter(o => !o.ar || !o.manad);
  const planerade = objekt.filter(o => o.ar && o.manad);

  const allData = activeTab === 'oplanerade' ? oplanerade : planerade;

  // Filtrera och sortera på avstånd
  let lista = filter === 'alla'
    ? allData
    : allData.filter(o => o.typ === filter);

  if (userPos) {
    lista = [...lista].sort((a, b) => {
      const distA = getDistance(a.lat, a.lng) || 999;
      const distB = getDistance(b.lat, b.lng) || 999;
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
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #222' }}>
        <div style={{ fontSize: '11px', color: '#666', letterSpacing: '1px', marginBottom: '4px' }}>
          KOMPERSMÅLA SKOG
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
                padding: '20px',
                borderBottom: '1px solid #1a1a1a',
                cursor: 'pointer',
              }}
            >
              {/* Status-prick */}
              <div style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: activeTab === 'planerade' ? '#22c55e' : '#666',
                marginRight: '16px',
                flexShrink: 0,
              }} />

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
                <div style={{ fontSize: '13px', color: '#666' }}>
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
                <div style={{ fontSize: '16px', fontWeight: '500' }}>
                  {obj.volym || 0}
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

      {/* Modal för valt objekt */}
      {selectedObj && (
        <div
          onClick={() => setSelectedObj(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#111',
              borderRadius: '16px 16px 0 0',
              padding: '24px',
              width: '100%',
              maxWidth: '500px',
            }}
          >
            {/* Drag handle */}
            <div style={{
              width: '40px',
              height: '4px',
              backgroundColor: '#333',
              borderRadius: '2px',
              margin: '0 auto 20px',
            }} />

            <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: '600' }}>
              {selectedObj.namn}
            </h2>
            <p style={{ margin: '0 0 24px', color: '#666', fontSize: '14px' }}>
              {selectedObj.typ === 'slutavverkning' ? 'Slutavverkning' : 'Gallring'} · {selectedObj.volym || 0} m³
              {getDistance(selectedObj.lat, selectedObj.lng) !== null && (
                <> · {getDistance(selectedObj.lat, selectedObj.lng)!.toFixed(1)} km bort</>
              )}
            </p>

            {/* Knappar */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => {
                  if (selectedObj.lat && selectedObj.lng) {
                    onNavigera(selectedObj.lat, selectedObj.lng);
                  }
                  setSelectedObj(null);
                }}
                disabled={!selectedObj.lat || !selectedObj.lng}
                style={{
                  flex: 1,
                  padding: '16px',
                  borderRadius: '12px',
                  border: '1px solid #333',
                  background: 'transparent',
                  color: selectedObj.lat && selectedObj.lng ? '#fff' : '#666',
                  fontSize: '16px',
                  fontWeight: '500',
                  cursor: selectedObj.lat && selectedObj.lng ? 'pointer' : 'not-allowed',
                }}
              >
                Navigera
              </button>
              <button
                onClick={() => {
                  onSelectObjekt(selectedObj);
                  setSelectedObj(null);
                }}
                style={{
                  flex: 1,
                  padding: '16px',
                  borderRadius: '12px',
                  border: 'none',
                  background: '#fff',
                  color: '#000',
                  fontSize: '16px',
                  fontWeight: '500',
                  cursor: 'pointer',
                }}
              >
                Planera
              </button>
            </div>

            {/* Avbryt */}
            <button
              onClick={() => setSelectedObj(null)}
              style={{
                width: '100%',
                padding: '16px',
                marginTop: '12px',
                borderRadius: '12px',
                border: 'none',
                background: 'transparent',
                color: '#666',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Avbryt
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
