'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const f = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', system-ui, sans-serif";
const card = { backgroundColor: '#1C1C1E', borderRadius: 16 } as const;
const labelStyle = { fontSize: 13, color: 'rgba(255,255,255,0.45)', fontFamily: f, fontWeight: 400 as const, letterSpacing: 0.2, margin: 0 };
const bigNum = { fontSize: 28, fontWeight: 700 as const, color: '#fff', fontFamily: f, letterSpacing: -0.5, margin: '6px 0 0' };

interface Maskin {
  id: string;
  maskin_id: string;
  namn: string;
  typ: string;
  marke: string;
  modell: string;
}

interface ServiceEntry {
  id: string;
  maskin_id: string;
  del: string;
  kategori: string;
  beskrivning: string;
  timmar: number | null;
  datum: string;
  skapad_at: string;
}

const KATEGORIER = ['Service', 'Hydraulik', 'Slang', 'Punktering', 'Motor', 'Kran', 'Aggregat', 'Elektrisk', 'Övrigt'];
const kategoriValue = (label: string) => label.toLowerCase().replace('ö', 'o');
const kategoriLabel = (val: string) => KATEGORIER.find(k => kategoriValue(k) === val) || val;

const HJUL = [
  { id: 'VF', label: 'VF', cx: 30, cy: 45 },
  { id: 'HF', label: 'HF', cx: 130, cy: 45 },
  { id: 'VB', label: 'VB', cx: 30, cy: 195 },
  { id: 'HB', label: 'HB', cx: 130, cy: 195 },
];

export default function MaskinDetailPage() {
  const params = useParams();
  const router = useRouter();
  const maskinId = params.id as string;

  const [maskin, setMaskin] = useState<Maskin | null>(null);
  const [entries, setEntries] = useState<ServiceEntry[]>([]);
  const [drifttimmar, setDrifttimmar] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [kategori, setKategori] = useState('service');
  const [beskrivning, setBeskrivning] = useState('');
  const [timmar, setTimmar] = useState('');
  const [datum, setDatum] = useState(new Date().toISOString().split('T')[0]);
  const [selectedWheel, setSelectedWheel] = useState('');

  const fetchData = useCallback(async () => {
    const [{ data: m }, { data: s }, { data: skift }] = await Promise.all([
      supabase.from('maskiner').select('*').eq('id', maskinId).single(),
      supabase.from('maskin_service').select('*').eq('maskin_id', maskinId).order('datum', { ascending: false }),
      supabase.from('fakt_skift').select('maskin_id, langd_sek'),
    ]);

    setMaskin(m);
    setEntries(s || []);

    if (skift && m) {
      const total = skift
        .filter(r => r.maskin_id === m.maskin_id)
        .reduce((sum, r) => sum + (r.langd_sek || 0), 0);
      setDrifttimmar(Math.round(total / 3600));
    }

    setLoading(false);
  }, [maskinId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const resetForm = () => {
    setKategori('service');
    setBeskrivning('');
    setTimmar(drifttimmar.toString());
    setDatum(new Date().toISOString().split('T')[0]);
    setSelectedWheel('');
    setShowForm(false);
  };

  const handleSave = async () => {
    if (!beskrivning.trim()) { alert('Beskrivning krävs'); return; }
    if (!timmar || !parseFloat(timmar)) { alert('Timräknare krävs'); return; }
    setSaving(true);

    const { error } = await supabase.from('maskin_service').insert({
      maskin_id: maskinId,
      del: kategori,
      kategori,
      beskrivning: beskrivning.trim(),
      timmar: parseFloat(timmar) || null,
      datum,
    });

    if (error) alert('Fel: ' + error.message);
    else { resetForm(); await fetchData(); }
    setSaving(false);
  };

  const handleDelete = async (entry: ServiceEntry) => {
    if (!confirm(`Ta bort "${entry.beskrivning || entry.kategori}"?`)) return;
    await supabase.from('maskin_service').delete().eq('id', entry.id);
    await fetchData();
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 15, fontFamily: f }}>Laddar...</p>
    </div>
  );

  if (!maskin) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 15, fontFamily: f }}>Maskin hittades inte</p>
    </div>
  );

  const lastService = entries.length > 0 ? new Date(entries[0].datum).toLocaleDateString('sv-SE') : '—';

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 20px', paddingBottom: 48 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '24px 0 24px' }}>
        <div>
          <button
            onClick={() => router.push('/maskin-service')}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              color: 'rgba(255,255,255,0.4)', fontSize: 15, fontFamily: f,
              marginBottom: 8, display: 'block',
            }}
          >
            ‹ Service
          </button>
          <h1 style={{ fontSize: 34, fontWeight: 700, color: '#fff', letterSpacing: -0.5, fontFamily: f, margin: 0 }}>
            {maskin.namn}
          </h1>
        </div>
        <button
          onClick={() => { setTimmar(drifttimmar.toString()); setShowForm(!showForm); }}
          style={{
            width: 34, height: 34, borderRadius: '50%', marginTop: 28,
            backgroundColor: showForm ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, color: 'rgba(255,255,255,0.6)', lineHeight: 1,
            transition: 'background-color 0.2s',
          }}
        >
          {showForm ? '×' : '+'}
        </button>
      </div>

      {/* Stat cards — grid som designinspirations-bilden */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
        <div style={{ ...card, padding: '18px 20px' }}>
          <p style={labelStyle}>{maskin.typ}</p>
          <p style={bigNum}>{drifttimmar.toLocaleString('sv-SE')} h</p>
          <p style={{ ...labelStyle, fontSize: 12, marginTop: 6 }}>Drifttimmar</p>
        </div>
        <div style={{ ...card, padding: '18px 20px' }}>
          <p style={labelStyle}>Senaste service</p>
          <p style={bigNum}>{entries.length}</p>
          <p style={{ ...labelStyle, fontSize: 12, marginTop: 6 }}>{lastService}</p>
        </div>
      </div>

      {/* Historik — visas alltid direkt */}
      {entries.length > 0 && (
        <>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#fff', fontFamily: f, letterSpacing: -0.3, margin: '0 0 12px' }}>
            Historik
          </h2>
          <div style={{ ...card, overflow: 'hidden', marginBottom: 24 }}>
            {entries.map((e, i) => (
              <div key={e.id}>
                {i > 0 && (
                  <div style={{ height: 0.5, backgroundColor: 'rgba(255,255,255,0.08)', margin: '0 20px' }} />
                )}
                <div style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 3 }}>
                        <span style={{ fontSize: 16, fontWeight: 600, color: '#fff', fontFamily: f }}>
                          {kategoriLabel(e.kategori)}
                        </span>
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', fontFamily: f }}>
                          {new Date(e.datum).toLocaleDateString('sv-SE')}
                        </span>
                      </div>
                      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', fontFamily: f, margin: '2px 0 0', lineHeight: 1.4 }}>
                        {e.beskrivning || '—'}
                      </p>
                      {e.timmar && (
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', fontFamily: f }}>
                          {e.timmar.toLocaleString('sv-SE')} h
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleDelete(e)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 12, color: 'rgba(255,255,255,0.15)', fontFamily: f,
                        padding: '4px 0 4px 16px', flexShrink: 0,
                      }}
                    >
                      Ta bort
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!entries.length && !showForm && (
        <div style={{ textAlign: 'center', padding: '56px 0' }}>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.25)', fontFamily: f }}>Ingen servicehistorik</p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.15)', fontFamily: f, marginTop: 6 }}>
            Tryck + för att lägga till
          </p>
        </div>
      )}

      {/* Formulär — dolt tills + trycks */}
      {showForm && (
        <div style={{ ...card, padding: '20px 20px 24px' }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#fff', fontFamily: f, letterSpacing: -0.3, margin: '0 0 18px' }}>
            Ny åtgärd
          </h2>

          {/* Kategorier — horisontell scroll, en rad */}
          <div style={{
            display: 'flex', gap: 8, marginBottom: 20,
            overflowX: 'auto', flexWrap: 'nowrap',
            marginLeft: -20, marginRight: -20, paddingLeft: 20, paddingRight: 20,
            WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
            msOverflowStyle: 'none' as any,
          }}>
            {KATEGORIER.map(k => {
              const val = kategoriValue(k);
              const active = kategori === val;
              return (
                <button
                  key={k}
                  onClick={() => setKategori(val)}
                  style={{
                    padding: '8px 16px', borderRadius: 20,
                    backgroundColor: active ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.04)',
                    border: active ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(255,255,255,0.06)',
                    cursor: 'pointer',
                    fontSize: 14, fontWeight: active ? 600 : 400,
                    color: active ? '#fff' : 'rgba(255,255,255,0.4)',
                    fontFamily: f,
                    whiteSpace: 'nowrap', flexShrink: 0,
                    transition: 'all 0.15s',
                  }}
                >
                  {k}
                </button>
              );
            })}
          </div>

          {/* Hjulväljare vid punktering */}
          {kategori === 'punktering' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 0 20px' }}>
              <svg viewBox="0 0 160 240" style={{ width: 110, height: 'auto' }}>
                <rect x="45" y="20" width="70" height="200" rx="6" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
                <line x1="45" y1="120" x2="115" y2="120" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
                <text x="80" y="38" textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize="9" fontWeight="500">FRAM</text>
                <text x="80" y="212" textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize="9" fontWeight="500">BAK</text>
                {HJUL.map(h => (
                  <g key={h.id} onClick={() => { setSelectedWheel(h.id); setBeskrivning(`Punktering ${h.id}`); }} style={{ cursor: 'pointer' }}>
                    <circle cx={h.cx} cy={h.cy} r="18"
                      fill={selectedWheel === h.id ? 'rgba(0,196,140,0.15)' : 'none'}
                      stroke={selectedWheel === h.id ? '#00c48c' : 'rgba(255,255,255,0.12)'}
                      strokeWidth="1.5"
                    />
                    <text x={h.cx} y={h.cy + 4} textAnchor="middle"
                      fill={selectedWheel === h.id ? '#00c48c' : 'rgba(255,255,255,0.35)'}
                      fontSize="11" fontWeight="500"
                    >{h.label}</text>
                  </g>
                ))}
              </svg>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 8, fontFamily: f }}>
                Vänster/höger = förarens perspektiv
              </p>
            </div>
          )}

          {/* Beskrivning */}
          <textarea
            value={beskrivning}
            onChange={e => setBeskrivning(e.target.value)}
            placeholder="Vad gjordes?"
            rows={3}
            style={{
              width: '100%', padding: '12px 16px',
              backgroundColor: 'rgba(118,118,128,0.18)', borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.04)',
              outline: 'none', resize: 'none',
              color: '#fff', fontSize: 15, fontFamily: f, lineHeight: 1.5,
              boxSizing: 'border-box',
            }}
          />

          {/* Timmar + Datum */}
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ ...labelStyle, fontSize: 12, display: 'block', marginBottom: 8 }}>Timmar</label>
              <input
                type="number"
                value={timmar}
                onChange={e => setTimmar(e.target.value)}
                style={{
                  width: '100%', padding: '12px 16px',
                  backgroundColor: 'rgba(118,118,128,0.18)', borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.04)',
                  outline: 'none',
                  color: '#fff', fontSize: 15, fontFamily: f,
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ ...labelStyle, fontSize: 12, display: 'block', marginBottom: 8 }}>Datum</label>
              <input
                type="date"
                value={datum}
                onChange={e => setDatum(e.target.value)}
                style={{
                  width: '100%', padding: '12px 16px',
                  backgroundColor: 'rgba(118,118,128,0.18)', borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.04)',
                  outline: 'none',
                  color: '#fff', fontSize: 15, fontFamily: f,
                  boxSizing: 'border-box',
                  colorScheme: 'dark',
                }}
              />
            </div>
          </div>

          {/* Spara — liten, grön, högerställd */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
            <button
              onClick={resetForm}
              style={{
                padding: '9px 20px', marginRight: 8,
                backgroundColor: 'transparent', borderRadius: 10,
                border: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.4)', fontFamily: f,
              }}
            >
              Avbryt
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '9px 22px',
                backgroundColor: '#00c48c', borderRadius: 10,
                border: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: 600, color: '#fff', fontFamily: f,
                opacity: saving ? 0.5 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              {saving ? 'Sparar...' : 'Spara'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
