'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

interface Maskin {
  id: string;
  maskin_id: string;
  namn: string;
  typ: string;
  marke: string;
  modell: string;
  aktiv: boolean;
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

const HJUL = [
  { id: 'VF', label: 'VF', cx: 30, cy: 45 },
  { id: 'HF', label: 'HF', cx: 130, cy: 45 },
  { id: 'VB', label: 'VB', cx: 30, cy: 195 },
  { id: 'HB', label: 'HB', cx: 130, cy: 195 },
];

function HjulValjare({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  return (
    <div className="p-hjul-wrap">
      <svg viewBox="0 0 160 240" className="p-hjul-svg">
        {/* Chassi */}
        <rect x="45" y="20" width="70" height="200" rx="6" fill="none" stroke="#222" strokeWidth="1" />
        {/* Led */}
        <line x1="45" y1="120" x2="115" y2="120" stroke="#1a1a1a" strokeWidth="1" />
        {/* FRAM / BAK */}
        <text x="80" y="38" textAnchor="middle" fill="#333" fontSize="9" fontWeight="500">FRAM</text>
        <text x="80" y="212" textAnchor="middle" fill="#333" fontSize="9" fontWeight="500">BAK</text>

        {HJUL.map(h => (
          <g key={h.id} onClick={() => onSelect(h.id)} style={{ cursor: 'pointer' }}>
            <circle cx={h.cx} cy={h.cy} r="18" fill={selected === h.id ? '#1a1a1a' : 'none'} stroke={selected === h.id ? '#555' : '#222'} strokeWidth="1.5" />
            <text x={h.cx} y={h.cy + 4} textAnchor="middle" fill={selected === h.id ? '#e5e5e5' : '#444'} fontSize="11" fontWeight="500">{h.label}</text>
          </g>
        ))}
      </svg>
      <div className="p-hjul-note">Vänster/höger = förarens perspektiv i hytten</div>
    </div>
  );
}

export default function MaskinServicePage() {
  const [maskiner, setMaskiner] = useState<Maskin[]>([]);
  const [selectedMaskin, setSelectedMaskin] = useState<Maskin | null>(null);
  const [entries, setEntries] = useState<ServiceEntry[]>([]);
  const [maskinTimmar, setMaskinTimmar] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [kategori, setKategori] = useState('service');
  const [beskrivning, setBeskrivning] = useState('');
  const [timmar, setTimmar] = useState('');
  const [datum, setDatum] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedWheel, setSelectedWheel] = useState('');

  const fetchData = useCallback(async () => {
    setError(null);
    const { data: m, error: e1 } = await supabase.from('maskiner').select('*').eq('aktiv', true).order('namn');
    if (e1) { setError(e1.message); setLoading(false); return; }
    setMaskiner(m || []);

    const { data: s, error: e2 } = await supabase.from('maskin_service').select('*').order('datum', { ascending: false });
    if (e2) { setError(e2.message); setLoading(false); return; }
    setEntries(s || []);

    const { data: skift } = await supabase.from('fakt_skift').select('maskin_id, langd_sek');
    if (skift) {
      const map: Record<string, number> = {};
      for (const r of skift) map[r.maskin_id] = (map[r.maskin_id] || 0) + (r.langd_sek || 0);
      for (const k in map) map[k] = Math.round(map[k] / 3600);
      setMaskinTimmar(map);
    }

    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getTimmar = (m: Maskin) => maskinTimmar[m.maskin_id] || 0;

  const maskinEntries = useMemo(() =>
    selectedMaskin ? entries.filter(e => e.maskin_id === selectedMaskin.id) : [],
    [selectedMaskin, entries]
  );

  const resetForm = () => {
    setEditingId(null);
    setKategori('service');
    setBeskrivning('');
    setTimmar(selectedMaskin ? getTimmar(selectedMaskin).toString() : '');
    setDatum(new Date().toISOString().split('T')[0]);
    setSelectedWheel('');
  };

  useEffect(() => {
    if (selectedMaskin) {
      resetForm();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMaskin]);

  const startEdit = (entry: ServiceEntry) => {
    setEditingId(entry.id);
    setKategori(entry.kategori);
    setBeskrivning(entry.beskrivning || '');
    setTimmar(entry.timmar?.toString() || '');
    setDatum(entry.datum);
  };

  const cancelEdit = () => resetForm();

  const handleDelete = async (entry: ServiceEntry) => {
    if (!confirm(`Ta bort "${entry.beskrivning || entry.kategori}" (${new Date(entry.datum).toLocaleDateString('sv-SE')})?`)) return;
    await supabase.from('maskin_service').delete().eq('id', entry.id);
    await fetchData();
  };

  const handleSave = async () => {
    if (!selectedMaskin) return;
    if (!beskrivning.trim()) { alert('Beskrivning krävs'); return; }
    if (!timmar || !parseFloat(timmar)) { alert('Timräknare krävs'); return; }
    if (!datum) { alert('Datum krävs'); return; }
    setSaving(true);
    const payload = {
      maskin_id: selectedMaskin.id,
      del: kategori,
      kategori,
      beskrivning: beskrivning.trim(),
      timmar: parseFloat(timmar) || null,
      datum,
    };
    const { error: err } = editingId
      ? await supabase.from('maskin_service').update(payload).eq('id', editingId)
      : await supabase.from('maskin_service').insert(payload);
    if (err) alert('Fel: ' + err.message);
    else { resetForm(); await fetchData(); }
    setSaving(false);
  };

  if (loading) return (
    <>
      <style jsx global>{styles}</style>
      <div className="p"><div className="p-load">Laddar...</div></div>
    </>
  );

  if (error) return (
    <>
      <style jsx global>{styles}</style>
      <div className="p"><div className="p-load"><span style={{ color: '#999' }}>{error}</span><button className="p-retry" onClick={() => { setLoading(true); fetchData(); }}>Försök igen</button></div></div>
    </>
  );

  return (
    <>
      <style jsx global>{styles}</style>
      <div className="p">
        <header className="p-head">
          <h1 className="p-h1">Service</h1>
        </header>

        {/* Maskinväljare */}
        <div className="p-machines">
          {maskiner.map(m => (
            <button
              key={m.id}
              className={`p-machine ${selectedMaskin?.id === m.id ? 'active' : ''}`}
              onClick={() => setSelectedMaskin(m)}
            >
              <span className="p-machine-name">{m.namn}</span>
              {getTimmar(m) > 0 && <span className="p-machine-h">{getTimmar(m).toLocaleString('sv-SE')} h</span>}
            </button>
          ))}
        </div>

        {selectedMaskin && (
          <>
            {/* Formulär */}
            <section className="p-form-section">
              <div className="p-pills">
                {KATEGORIER.map(k => (
                  <button
                    key={k}
                    className={`p-pill ${kategori === kategoriValue(k) ? 'active' : ''}`}
                    onClick={() => setKategori(kategoriValue(k))}
                  >
                    {k}
                  </button>
                ))}
              </div>

              {kategori === 'punktering' && (
                <HjulValjare selected={selectedWheel} onSelect={(id) => {
                  setSelectedWheel(id);
                  setBeskrivning(`Punktering ${id}`);
                }} />
              )}

              <textarea
                className="p-textarea"
                value={beskrivning}
                onChange={e => setBeskrivning(e.target.value)}
                placeholder="Vad gjordes?"
                rows={3}
              />

              <div className="p-row">
                <div className="p-field">
                  <label className="p-label">Timmar</label>
                  <input type="number" className="p-input" value={timmar} onChange={e => setTimmar(e.target.value)} />
                </div>
                <div className="p-field">
                  <label className="p-label">Datum</label>
                  <input type="date" className="p-input" value={datum} onChange={e => setDatum(e.target.value)} />
                </div>
              </div>

              <div className="p-form-foot">
                {editingId && <button className="p-link" onClick={cancelEdit}>Avbryt</button>}
                <button className="p-save" onClick={handleSave} disabled={saving}>
                  {saving ? 'Sparar...' : editingId ? 'Uppdatera' : 'Spara'}
                </button>
              </div>
            </section>

            {/* Lista */}
            {maskinEntries.length > 0 && (
              <section className="p-list-section">
                <div className="p-list-head">Historik</div>
                {maskinEntries.map(e => (
                  <div key={e.id} className={`p-entry ${editingId === e.id ? 'editing' : ''}`}>
                    <div className="p-entry-main">
                      <span className="p-entry-kat">{KATEGORIER.find(k => kategoriValue(k) === e.kategori) || e.kategori}</span>
                      <span className="p-entry-sep" />
                      <span className="p-entry-desc">{e.beskrivning || '—'}</span>
                    </div>
                    <div className="p-entry-meta">
                      {new Date(e.datum).toLocaleDateString('sv-SE')}
                      {e.timmar ? ` · ${e.timmar} h` : ''}
                      <span className="p-entry-sep" />
                      <button className="p-link" onClick={() => startEdit(e)}>Redigera</button>
                      <button className="p-link p-link-del" onClick={() => handleDelete(e)}>Ta bort</button>
                    </div>
                  </div>
                ))}
              </section>
            )}
          </>
        )}

        {!selectedMaskin && (
          <div className="p-empty">Välj en maskin ovan</div>
        )}
      </div>
    </>
  );
}

const styles = `
  *{box-sizing:border-box}
  .p{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',sans-serif;background:#000;color:#e5e5e5;min-height:100vh;-webkit-font-smoothing:antialiased;max-width:600px;margin:0 auto;padding:20px 16px 80px}

  .p-load{display:flex;flex-direction:column;align-items:center;gap:16px;padding:80px 0;color:#555;font-size:14px}
  .p-retry{background:none;border:1px solid #333;color:#888;padding:6px 16px;border-radius:6px;font-size:13px;cursor:pointer}

  .p-head{padding:24px 0 20px}
  .p-h1{font-size:28px;font-weight:600;letter-spacing:-0.03em;color:#f5f5f5;margin:0}

  /* Machine selector */
  .p-machines{display:flex;gap:0;overflow-x:auto;-webkit-overflow-scrolling:touch;border-bottom:1px solid #1a1a1a;margin-bottom:32px}
  .p-machine{display:flex;flex-direction:column;align-items:center;gap:2px;padding:12px 20px 10px;background:none;border:none;border-bottom:2px solid transparent;color:#555;font-size:13px;cursor:pointer;white-space:nowrap;transition:all 0.15s}
  .p-machine.active{color:#e5e5e5;border-bottom-color:#e5e5e5}
  .p-machine-name{font-weight:500}
  .p-machine-h{font-size:11px;color:#444}
  .p-machine.active .p-machine-h{color:#666}

  /* Form */
  .p-form-section{margin-bottom:40px}
  .p-pills{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px}
  .p-pill{padding:5px 14px;border-radius:980px;font-size:12px;font-weight:450;color:#555;background:none;border:1px solid #222;cursor:pointer;transition:all 0.15s}
  .p-pill.active{color:#e5e5e5;background:#1a1a1a;border-color:#333}

  /* Wheel picker */
  .p-hjul-wrap{display:flex;flex-direction:column;align-items:center;padding:16px 0 8px}
  .p-hjul-svg{width:120px;height:auto}
  .p-hjul-note{font-size:10px;color:#333;margin-top:8px}

  .p-textarea{width:100%;padding:12px 0;background:none;border:none;border-bottom:1px solid #1a1a1a;font-size:15px;color:#e5e5e5;outline:none;resize:none;font-family:inherit;line-height:1.5;margin-bottom:12px}
  .p-textarea::placeholder{color:#333}
  .p-textarea:focus{border-bottom-color:#333}

  .p-row{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:16px}
  .p-field{display:flex;flex-direction:column;gap:4px}
  .p-label{font-size:11px;font-weight:500;color:#444;text-transform:uppercase;letter-spacing:0.05em}
  .p-input{padding:8px 0;background:none;border:none;border-bottom:1px solid #1a1a1a;font-size:14px;color:#e5e5e5;outline:none;font-family:inherit}
  .p-input:focus{border-bottom-color:#333}

  .p-form-foot{display:flex;justify-content:flex-end;align-items:center;gap:16px;padding-top:4px}
  .p-save{padding:6px 20px;background:#1a1a1a;color:#888;border:1px solid #222;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;transition:all 0.15s;font-family:inherit}
  .p-save:hover{color:#ccc;border-color:#333}
  .p-save:disabled{opacity:0.3;cursor:default}

  /* List */
  .p-list-section{border-top:1px solid #111;padding-top:24px}
  .p-list-head{font-size:11px;font-weight:500;color:#444;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:16px}

  .p-entry{padding:12px 0;border-bottom:1px solid #0d0d0d}
  .p-entry:last-child{border-bottom:none}
  .p-entry.editing{opacity:0.4}
  .p-entry-main{display:flex;align-items:baseline;gap:0;margin-bottom:4px;font-size:14px}
  .p-entry-kat{color:#666;font-weight:500;flex-shrink:0}
  .p-entry-sep{width:1px;height:10px;background:#222;margin:0 10px;flex-shrink:0;display:inline-block;vertical-align:middle}
  .p-entry-desc{color:#999;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .p-entry-meta{font-size:12px;color:#333;display:flex;align-items:center;gap:0}

  .p-link{background:none;border:none;color:#444;font-size:12px;cursor:pointer;padding:0;font-family:inherit;transition:color 0.1s}
  .p-link:hover{color:#888}
  .p-link-del{color:#333}
  .p-link-del:hover{color:#aa3333}

  .p-empty{color:#333;font-size:14px;text-align:center;padding:60px 0}

  @media(max-width:480px){.p-h1{font-size:24px}.p-pills{gap:4px}}
`;
