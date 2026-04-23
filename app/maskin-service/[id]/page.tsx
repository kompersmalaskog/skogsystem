'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

const f = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', system-ui, sans-serif";
const card = { backgroundColor: '#1c1c1e', borderRadius: 12 } as const;
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

const formatTyp = (typ: string) => {
  const map: Record<string, string> = {
    skordare: 'Skördare',
    skotare: 'Skotare',
  };
  return map[typ?.toLowerCase()] ?? typ?.charAt(0).toUpperCase() + typ?.slice(1) ?? '';
};

const KATEGORIER = ['Service', 'Reparation', 'Däck'];
const KATEGORI_MAP: Record<string, string> = {
  'Service': 'service',
  'Reparation': 'ovrigt',
  'Däck': 'punktering',
};
const kategoriValue = (label: string) => KATEGORI_MAP[label] ?? label.toLowerCase();
const KATEGORI_LABEL_MAP: Record<string, string> = {
  'service': 'Service',
  'ovrigt': 'Reparation',
  'punktering': 'Däck',
  'hydraulik': 'Reparation',
  'slang': 'Reparation',
  'motor': 'Reparation',
  'kran': 'Reparation',
  'aggregat': 'Reparation',
  'elektrisk': 'Reparation',
};
const kategoriLabel = (val: string) => KATEGORI_LABEL_MAP[val] ?? val;
const FILTER_TABS = ['Alla', ...KATEGORIER];

const HJUL = [
  { id: 'V1', label: 'V1', cx: 28, cy: 38 },
  { id: 'H1', label: 'H1', cx: 132, cy: 38 },
  { id: 'V2', label: 'V2', cx: 28, cy: 88 },
  { id: 'H2', label: 'H2', cx: 132, cy: 88 },
  { id: 'V3', label: 'V3', cx: 28, cy: 152 },
  { id: 'H3', label: 'H3', cx: 132, cy: 152 },
  { id: 'V4', label: 'V4', cx: 28, cy: 202 },
  { id: 'H4', label: 'H4', cx: 132, cy: 202 },
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
  const [errors, setErrors] = useState<{ beskrivning?: string; timmar?: string; datum?: string }>({});
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

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
    setErrors({});
    setShowForm(false);
  };

  const validate = () => {
    const e: { beskrivning?: string; timmar?: string; datum?: string } = {};
    if (!beskrivning.trim()) e.beskrivning = 'Beskrivning krävs';
    const t = parseFloat(timmar);
    if (!timmar || isNaN(t) || t <= 0) e.timmar = 'Ange ett positivt timvärde';
    if (!datum) e.datum = 'Datum krävs';
    return e;
  };

  const handleSave = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSaving(true);
    const { error } = await supabase.from('maskin_service').insert({
      maskin_id: maskinId,
      del: kategori,
      kategori,
      beskrivning: beskrivning.trim(),
      timmar: parseFloat(timmar) || null,
      datum,
    });

    if (error) {
      setToast({ msg: 'Kunde inte spara: ' + error.message, kind: 'err' });
    } else {
      if (kategori === 'service' && parseFloat(timmar)) {
        await supabase
          .from('service_paminnelser')
          .update({ senast_utford_timmar: parseFloat(timmar) })
          .eq('maskin_id', maskinId);
      }
      resetForm();
      await fetchData();
      setToast({ msg: 'Åtgärd sparad', kind: 'ok' });
    }
    setSaving(false);
  };

  if (loading) return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 24px', paddingBottom: 120 }}>
      <style>{`@keyframes skelShine { 0% { background-position: -200px 0; } 100% { background-position: calc(200px + 100%) 0; } }
        .skel { background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.04) 100%); background-size: 200px 100%; border-radius: 8px; animation: skelShine 1.4s ease-in-out infinite; }
      `}</style>
      <div style={{ padding: '28px 0 20px' }}>
        <div className="skel" style={{ height: 28, width: '60%', marginBottom: 10 }} />
        <div className="skel" style={{ height: 13, width: '40%' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        {[1, 2].map(i => (
          <div key={i} style={{ backgroundColor: '#1c1c1e', borderRadius: 12, padding: 16 }}>
            <div className="skel" style={{ height: 13, width: '50%', marginBottom: 12 }} />
            <div className="skel" style={{ height: 28, width: '70%' }} />
          </div>
        ))}
      </div>
      <div style={{ backgroundColor: '#1c1c1e', borderRadius: 12, padding: '4px 0' }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
            <div className="skel" style={{ height: 40, width: 40, borderRadius: 8, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div className="skel" style={{ height: 15, width: '70%', marginBottom: 6 }} />
              <div className="skel" style={{ height: 12, width: '40%' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (!maskin) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 15, fontFamily: f }}>Maskin hittades inte</p>
    </div>
  );

  const lastService = entries.length > 0 ? new Date(entries[0].datum).toLocaleDateString('sv-SE') : '—';

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 20px', paddingBottom: 100 }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)',
          background: toast.kind === 'ok' ? 'rgba(48,209,88,0.16)' : 'rgba(255,69,58,0.16)',
          border: `1px solid ${toast.kind === 'ok' ? 'rgba(48,209,88,0.38)' : 'rgba(255,69,58,0.38)'}`,
          color: toast.kind === 'ok' ? '#30d158' : '#ff453a',
          padding: '12px 20px', borderRadius: 12, fontSize: 15, fontFamily: f, fontWeight: 500,
          backdropFilter: 'saturate(180%) blur(20px)', WebkitBackdropFilter: 'saturate(180%) blur(20px)',
          zIndex: 1000, maxWidth: 'calc(100vw - 32px)',
        }}>{toast.msg}</div>
      )}

      {/* Header */}
      <div style={{ padding: '24px 0 24px' }}>
        <button
          onClick={() => router.push('/maskin-service')}
          style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            color: 'rgba(255,255,255,0.4)', fontSize: 15, fontFamily: f,
            marginBottom: 8, display: 'block',
          }}
        >
          ‹ Servicelogg
        </button>
        <h1 style={{ fontSize: 34, fontWeight: 700, color: '#fff', letterSpacing: -0.5, fontFamily: f, margin: 0 }}>
          {maskin.namn}
        </h1>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
        <div style={{ ...card, padding: '18px 20px' }}>
          <p style={labelStyle}>{formatTyp(maskin.typ)}</p>
          <p style={bigNum}>{drifttimmar.toLocaleString('sv-SE')} h</p>
          <p style={{ ...labelStyle, fontSize: 12, marginTop: 6 }}>Drifttimmar</p>
        </div>
        <div style={{ ...card, padding: '18px 20px' }}>
          <p style={labelStyle}>Senaste åtgärd</p>
          <p style={bigNum}>{lastService}</p>
          <p style={{ ...labelStyle, fontSize: 12, marginTop: 6 }}>{entries.length} poster</p>
        </div>
      </div>

      {/* Historik — senaste 5 */}
      {entries.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: '#fff', fontFamily: f, letterSpacing: -0.3, margin: 0 }}>
              Historik
            </h2>
          </div>

          <div style={{ ...card, overflow: 'hidden', marginBottom: 4 }}>
            {entries.slice(0, 5).map((e, i) => (
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
                  </div>
                </div>
              </div>
            ))}
          </div>

          {entries.length > 5 && (
            <Link href={`/maskin-service/${maskinId}/historik`} style={{
              display: 'block', textAlign: 'center', padding: '14px',
              color: 'rgba(255,255,255,0.4)', fontSize: 14, fontFamily: f,
              textDecoration: 'none', marginBottom: 24,
            }}>
              Visa all historik ({entries.length} poster) ›
            </Link>
          )}
        </>
      )}

      {!entries.length && (
        <div style={{ textAlign: 'center', padding: '56px 0' }}>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.25)', fontFamily: f }}>Ingen servicehistorik</p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.15)', fontFamily: f, marginTop: 6 }}>
            Tryck knappen nedan för att lägga till
          </p>
        </div>
      )}

      {/* Fixed bottom button */}
      {!showForm && (
        <button
          onClick={() => { setTimmar(drifttimmar.toString()); setShowForm(true); }}
          style={{
            position: 'fixed', bottom: 24, left: 20, right: 20,
            maxWidth: 440, margin: '0 auto',
            height: 52, borderRadius: 12,
            backgroundColor: '#30d158', border: 'none', cursor: 'pointer',
            fontSize: 16, fontWeight: 600, color: '#fff', fontFamily: f,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            zIndex: 50,
          }}
        >
          + Ny åtgärd
        </button>
      )}

      {/* Bottom sheet overlay */}
      {showForm && (
        <>
          {/* Backdrop */}
          <div
            onClick={resetForm}
            style={{
              position: 'fixed', inset: 0,
              backgroundColor: 'rgba(0,0,0,0.6)',
              zIndex: 99,
            }}
          />

          {/* Sheet */}
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            backgroundColor: '#1c1c1e',
            borderRadius: '20px 20px 0 0',
            padding: '24px 20px 40px',
            zIndex: 100,
            maxHeight: '85vh', overflowY: 'auto',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 20, fontWeight: 600, color: '#fff', fontFamily: f, letterSpacing: -0.3, margin: 0 }}>
                Ny åtgärd
              </h2>
              <button
                onClick={resetForm}
                aria-label="Stäng"
                style={{
                  width: 44, height: 44, borderRadius: '50%',
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, color: 'rgba(255,255,255,0.6)', lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            {/* Kategorier — segmenterad pill-rad */}
            <div style={{
              display: 'flex', backgroundColor: 'rgba(255,255,255,0.06)',
              borderRadius: 10, padding: 3, marginBottom: 20,
            }}>
              {KATEGORIER.map(k => {
                const val = kategoriValue(k);
                const active = kategori === val;
                return (
                  <button
                    key={k}
                    onClick={() => setKategori(val)}
                    style={{
                      flex: 1, minHeight: 44, padding: '0', borderRadius: 8,
                      backgroundColor: active ? 'rgba(255,255,255,0.18)' : 'transparent',
                      border: 'none', cursor: 'pointer',
                      fontSize: 14, fontWeight: active ? 600 : 400,
                      color: active ? '#fff' : 'rgba(255,255,255,0.4)',
                      fontFamily: f,
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
              <div style={{
                backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12,
                padding: 16, marginBottom: 20,
                display: 'flex', flexDirection: 'column', alignItems: 'center',
              }}>
                <svg viewBox="0 0 160 240" style={{ width: 140, height: 'auto' }}>
                  <rect x="48" y="18" width="64" height="204" rx="6" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
                  <line x1="48" y1="63" x2="112" y2="63" stroke="rgba(255,255,255,0.07)" strokeWidth="1" strokeDasharray="3 3" />
                  <line x1="48" y1="177" x2="112" y2="177" stroke="rgba(255,255,255,0.07)" strokeWidth="1" strokeDasharray="3 3" />
                  <line x1="80" y1="63" x2="80" y2="177" stroke="rgba(255,255,255,0.07)" strokeWidth="1" strokeDasharray="3 3" />
                  <text x="80" y="32" textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize="8" fontWeight="500">FRAM</text>
                  <text x="80" y="232" textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize="8" fontWeight="500">BAK</text>
                  {HJUL.map(h => (
                    <g key={h.id} onClick={() => { setSelectedWheel(h.id); setBeskrivning(`Punktering ${h.id}`); }} style={{ cursor: 'pointer' }}>
                      <circle cx={h.cx} cy={h.cy} r="17"
                        fill={selectedWheel === h.id ? 'rgba(48,209,88,0.15)' : 'none'}
                        stroke={selectedWheel === h.id ? '#30d158' : 'rgba(255,255,255,0.12)'}
                        strokeWidth="1.5"
                      />
                      <text x={h.cx} y={h.cy + 4} textAnchor="middle"
                        fill={selectedWheel === h.id ? '#30d158' : 'rgba(255,255,255,0.35)'}
                        fontSize="10" fontWeight="500"
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
              onChange={e => { setBeskrivning(e.target.value); if (errors.beskrivning) setErrors(x => ({ ...x, beskrivning: undefined })); }}
              placeholder="Vad gjordes?"
              rows={3}
              style={{
                width: '100%', padding: '12px 16px',
                backgroundColor: 'rgba(118,118,128,0.18)', borderRadius: 12,
                border: `1px solid ${errors.beskrivning ? '#ff453a' : 'rgba(255,255,255,0.04)'}`,
                outline: 'none', resize: 'none',
                color: '#fff', fontSize: 15, fontFamily: f, lineHeight: 1.5,
                boxSizing: 'border-box',
              }}
            />
            {errors.beskrivning && <div style={{ fontSize: 13, color: '#ff453a', marginTop: 6, fontFamily: f }}>{errors.beskrivning}</div>}

            {/* Timmar + Datum */}
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ ...labelStyle, fontSize: 12, display: 'block', marginBottom: 8 }}>Timmar</label>
                <input
                  type="number"
                  value={timmar}
                  onChange={e => { setTimmar(e.target.value); if (errors.timmar) setErrors(x => ({ ...x, timmar: undefined })); }}
                  style={{
                    width: '100%', padding: '12px 16px',
                    backgroundColor: 'rgba(118,118,128,0.18)', borderRadius: 12,
                    border: `1px solid ${errors.timmar ? '#ff453a' : 'rgba(255,255,255,0.04)'}`,
                    outline: 'none',
                    color: '#fff', fontSize: 15, fontFamily: f,
                    boxSizing: 'border-box',
                  }}
                />
                {errors.timmar && <div style={{ fontSize: 13, color: '#ff453a', marginTop: 6, fontFamily: f }}>{errors.timmar}</div>}
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ ...labelStyle, fontSize: 12, display: 'block', marginBottom: 8 }}>Datum</label>
                <input
                  type="date"
                  value={datum}
                  onChange={e => { setDatum(e.target.value); if (errors.datum) setErrors(x => ({ ...x, datum: undefined })); }}
                  style={{
                    width: '100%', padding: '12px 16px',
                    backgroundColor: 'rgba(118,118,128,0.18)', borderRadius: 12,
                    border: `1px solid ${errors.datum ? '#ff453a' : 'rgba(255,255,255,0.04)'}`,
                    outline: 'none',
                    color: '#fff', fontSize: 15, fontFamily: f,
                    boxSizing: 'border-box',
                    colorScheme: 'dark',
                  }}
                />
                {errors.datum && <div style={{ fontSize: 13, color: '#ff453a', marginTop: 6, fontFamily: f }}>{errors.datum}</div>}
              </div>
            </div>

            {/* Spara */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button
                onClick={resetForm}
                style={{
                  minHeight: 44, padding: '0 20px', marginRight: 8,
                  backgroundColor: 'transparent', borderRadius: 10,
                  border: 'none', cursor: 'pointer',
                  fontSize: 15, fontWeight: 500, color: 'rgba(255,255,255,0.55)', fontFamily: f,
                }}
              >
                Avbryt
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  minHeight: 44, padding: '0 24px',
                  backgroundColor: '#30d158', borderRadius: 10,
                  border: 'none', cursor: 'pointer',
                  fontSize: 15, fontWeight: 600, color: '#fff', fontFamily: f,
                  opacity: saving ? 0.5 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                {saving ? 'Sparar...' : 'Spara'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
