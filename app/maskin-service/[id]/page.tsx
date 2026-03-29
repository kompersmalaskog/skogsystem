'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const fonts = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', system-ui, sans-serif";

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

  // Form state
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
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, fontFamily: fonts }}>Laddar...</p>
    </div>
  );

  if (!maskin) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, fontFamily: fonts }}>Maskin hittades inte</p>
    </div>
  );

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 24px', paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '28px 0 8px' }}>
        <div>
          <button
            onClick={() => router.push('/maskin-service')}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              color: 'rgba(255,255,255,0.4)', fontSize: 14, fontFamily: fonts,
              marginBottom: 4, display: 'block',
            }}
          >
            ‹ Tillbaka
          </button>
          <h1 style={{ fontSize: 34, fontWeight: 700, color: '#fff', letterSpacing: -0.4, fontFamily: fonts, margin: 0 }}>
            {maskin.namn}
          </h1>
        </div>
        <button
          onClick={() => { setTimmar(drifttimmar.toString()); setShowForm(true); }}
          style={{
            width: 36, height: 36, borderRadius: '50%',
            backgroundColor: 'rgba(255,255,255,0.1)',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, color: 'rgba(255,255,255,0.7)', lineHeight: 1,
          }}
        >
          +
        </button>
      </div>

      {/* Maskininfo */}
      <div style={{
        display: 'flex', gap: 24, padding: '16px 0 28px',
      }}>
        <div>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: fonts }}>Typ</span>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.8)', fontFamily: fonts, margin: '2px 0 0' }}>{maskin.typ}</p>
        </div>
        <div>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: fonts }}>Drifttimmar</span>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.8)', fontFamily: fonts, margin: '2px 0 0' }}>{drifttimmar.toLocaleString('sv-SE')} h</p>
        </div>
        <div>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: fonts }}>Servicelogg</span>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.8)', fontFamily: fonts, margin: '2px 0 0' }}>{entries.length} poster</p>
        </div>
      </div>

      {/* Formulär (slide-down) */}
      {showForm && (
        <div style={{
          backgroundColor: '#2C2C2E', borderRadius: 14,
          padding: 20, marginBottom: 28,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 17, fontWeight: 600, color: '#fff', fontFamily: fonts }}>Ny åtgärd</span>
            <button
              onClick={resetForm}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 14, cursor: 'pointer', fontFamily: fonts }}
            >
              Avbryt
            </button>
          </div>

          {/* Kategorier */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {KATEGORIER.map(k => {
              const val = kategoriValue(k);
              const active = kategori === val;
              return (
                <button
                  key={k}
                  onClick={() => setKategori(val)}
                  style={{
                    padding: '7px 14px', borderRadius: 20,
                    backgroundColor: active ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
                    border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: active ? 600 : 400,
                    color: active ? '#fff' : 'rgba(255,255,255,0.45)',
                    fontFamily: fonts,
                  }}
                >
                  {k}
                </button>
              );
            })}
          </div>

          {/* Hjulväljare vid punktering */}
          {kategori === 'punktering' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0 16px' }}>
              <svg viewBox="0 0 160 240" style={{ width: 120, height: 'auto' }}>
                <rect x="45" y="20" width="70" height="200" rx="6" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
                <line x1="45" y1="120" x2="115" y2="120" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
                <text x="80" y="38" textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="9" fontWeight="500">FRAM</text>
                <text x="80" y="212" textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="9" fontWeight="500">BAK</text>
                {HJUL.map(h => (
                  <g key={h.id} onClick={() => { setSelectedWheel(h.id); setBeskrivning(`Punktering ${h.id}`); }} style={{ cursor: 'pointer' }}>
                    <circle cx={h.cx} cy={h.cy} r="18"
                      fill={selectedWheel === h.id ? 'rgba(255,255,255,0.15)' : 'none'}
                      stroke={selectedWheel === h.id ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)'}
                      strokeWidth="1.5"
                    />
                    <text x={h.cx} y={h.cy + 4} textAnchor="middle"
                      fill={selectedWheel === h.id ? '#fff' : 'rgba(255,255,255,0.4)'}
                      fontSize="11" fontWeight="500"
                    >{h.label}</text>
                  </g>
                ))}
              </svg>
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 8, fontFamily: fonts }}>
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
              width: '100%', padding: '10px 14px',
              backgroundColor: 'rgba(118,118,128,0.24)', borderRadius: 10,
              border: 'none', outline: 'none', resize: 'none',
              color: '#fff', fontSize: 15, fontFamily: fonts,
              boxSizing: 'border-box',
            }}
          />

          {/* Timmar + Datum */}
          <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: fonts, display: 'block', marginBottom: 6 }}>
                Timmar
              </label>
              <input
                type="number"
                value={timmar}
                onChange={e => setTimmar(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px',
                  backgroundColor: 'rgba(118,118,128,0.24)', borderRadius: 10,
                  border: 'none', outline: 'none',
                  color: '#fff', fontSize: 15, fontFamily: fonts,
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: fonts, display: 'block', marginBottom: 6 }}>
                Datum
              </label>
              <input
                type="date"
                value={datum}
                onChange={e => setDatum(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px',
                  backgroundColor: 'rgba(118,118,128,0.24)', borderRadius: 10,
                  border: 'none', outline: 'none',
                  color: '#fff', fontSize: 15, fontFamily: fonts,
                  boxSizing: 'border-box',
                  colorScheme: 'dark',
                }}
              />
            </div>
          </div>

          {/* Spara */}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              width: '100%', marginTop: 16, padding: '12px 0',
              backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 10,
              border: 'none', cursor: 'pointer',
              fontSize: 15, fontWeight: 600, color: '#fff', fontFamily: fonts,
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? 'Sparar...' : 'Spara'}
          </button>
        </div>
      )}

      {/* Historik */}
      {entries.length > 0 ? (
        <>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: fonts, display: 'block', marginBottom: 12 }}>
            Historik
          </span>
          <div style={{ backgroundColor: '#2C2C2E', borderRadius: 14, overflow: 'hidden' }}>
            {entries.map((e, i) => (
              <div key={e.id}>
                {i > 0 && (
                  <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.08)', margin: '0 20px' }} />
                )}
                <div style={{ padding: '14px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
                        <span style={{ fontSize: 15, fontWeight: 500, color: '#fff', fontFamily: fonts }}>
                          {kategoriLabel(e.kategori)}
                        </span>
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', fontFamily: fonts }}>
                          {new Date(e.datum).toLocaleDateString('sv-SE')}
                        </span>
                      </div>
                      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', fontFamily: fonts, margin: '2px 0 0' }}>
                        {e.beskrivning || '—'}
                      </p>
                      {e.timmar && (
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', fontFamily: fonts }}>
                          {e.timmar} h
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleDelete(e)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 12, color: 'rgba(255,255,255,0.2)', fontFamily: fonts,
                        padding: '4px 0 4px 12px',
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
      ) : !showForm && (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.3)', fontFamily: fonts }}>Ingen servicehistorik</p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)', fontFamily: fonts, marginTop: 4 }}>
            Tryck + för att lägga till
          </p>
        </div>
      )}
    </div>
  );
}
