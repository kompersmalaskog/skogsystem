'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';

const ff = "-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text',system-ui,sans-serif";
const C = {
  bg: '#111110', surface: '#1C1C1E', surface2: '#1C1C1E', surface3: '#2C2C2E',
  border: 'rgba(255,255,255,0.08)', borderStrong: 'rgba(255,255,255,0.15)',
  t1: '#ffffff', t2: 'rgba(255,255,255,0.7)', t3: 'rgba(255,255,255,0.4)', t4: 'rgba(255,255,255,0.2)',
  green: '#22c55e', greenDim: 'rgba(34,197,94,0.15)',
  red: '#ef4444', redDim: 'rgba(239,68,68,0.15)',
  yellow: '#eab308', yellowDim: 'rgba(234,179,8,0.15)',
  blue: '#3b82f6', blueDim: 'rgba(59,130,246,0.15)',
  accent: '#3b82f6',
};

const ANSTÄLLDA = ['Martin', 'Oskar', 'Stefan', 'Peter', 'Erik', 'Jonas'];

const PREDEFINED_UTBILDNINGAR: { namn: string; giltighetÅr: number }[] = [
  { namn: 'YKB (Yrkeskompetensbevis)', giltighetÅr: 5 },
  { namn: 'Skötselskolan Avverkning', giltighetÅr: 1 },
  { namn: 'Skötselskolan Plantering', giltighetÅr: 1 },
  { namn: 'Skötselskolan Röjning', giltighetÅr: 1 },
  { namn: 'Skötselskolan Miljö', giltighetÅr: 1 },
  { namn: 'Första hjälpen', giltighetÅr: 3 },
  { namn: 'Truckkort', giltighetÅr: 5 },
  { namn: 'Krankörkort', giltighetÅr: 5 },
  { namn: 'Kemikaliehantering', giltighetÅr: 1 },
];

type Utbildning = {
  id: string;
  user_id: string;
  namn: string;
  datum_genomford: string;
  giltig_till: string | null;
  skapad_av: string | null;
  skapad_datum: string;
  status: 'approved' | 'pending' | 'rejected';
  pdf_url: string | null;
  inskickad_av: string | null;
  godkand_av: string | null;
};

type CsvRow = {
  namn: string;
  utbildning: string;
  datum_genomford: string;
  giltig_till: string;
};

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function statusColor(giltigTill: string | null): string {
  if (!giltigTill) return C.green;
  const days = daysUntil(giltigTill);
  if (days === null) return C.green;
  if (days < 0) return C.red;
  if (days <= 90) return C.yellow;
  return C.green;
}

function statusLabel(giltigTill: string | null): string {
  if (!giltigTill) return 'Giltig';
  const days = daysUntil(giltigTill);
  if (days === null) return 'Giltig';
  if (days < 0) return 'UTGÅNGEN';
  if (days <= 90) return `${days} dagar kvar`;
  return `${days} dagar kvar`;
}

function formatDate(d: string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('sv-SE');
}

function addYears(dateStr: string, years: number): string {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().split('T')[0];
}

export default function UtbildningPage() {
  const [tab, setTab] = useState<'mina' | 'översikt' | 'hantera'>('mina');
  const [utbildningar, setUtbildningar] = useState<Utbildning[]>([]);
  const [loading, setLoading] = useState(true);
  const [valdAnvändare, setValdAnvändare] = useState(ANSTÄLLDA[0]);

  // Hantera tab state
  const [formPerson, setFormPerson] = useState(ANSTÄLLDA[0]);
  const [formUtbildning, setFormUtbildning] = useState(PREDEFINED_UTBILDNINGAR[0].namn);
  const [formAnnanNamn, setFormAnnanNamn] = useState('');
  const [formDatum, setFormDatum] = useState(new Date().toISOString().split('T')[0]);
  const [formGiltighet, setFormGiltighet] = useState<number | null>(PREDEFINED_UTBILDNINGAR[0].giltighetÅr);
  const [saving, setSaving] = useState(false);

  // CSV
  const [csvRows, setCsvRows] = useState<CsvRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // PDF upload
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfParsing, setPdfParsing] = useState(false);
  const [pdfResult, setPdfResult] = useState<{ namn: string; datum: string; kurs: string } | null>(null);
  const [pdfGiltighet, setPdfGiltighet] = useState<number | null>(1);
  const [pdfSaving, setPdfSaving] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfDragging, setPdfDragging] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Översikt filter
  const [filter, setFilter] = useState<'alla' | 'utgångna' | 'snart'>('alla');

  const fetchUtbildningar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('utbildningar')
      .select('*')
      .order('giltig_till', { ascending: true });
    setUtbildningar(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchUtbildningar(); }, [fetchUtbildningar]);

  // Update default giltighet when selecting a predefined utbildning
  useEffect(() => {
    if (formUtbildning === 'Annan') {
      setFormGiltighet(1);
    } else {
      const found = PREDEFINED_UTBILDNINGAR.find(u => u.namn === formUtbildning);
      if (found) setFormGiltighet(found.giltighetÅr);
    }
  }, [formUtbildning]);

  const computedGiltigTill = formGiltighet !== null ? addYears(formDatum, formGiltighet) : null;

  const handleSave = async () => {
    const namn = formUtbildning === 'Annan' ? formAnnanNamn.trim() : formUtbildning;
    if (!namn) return;
    setSaving(true);
    await supabase.from('utbildningar').insert({
      user_id: formPerson,
      namn,
      datum_genomford: formDatum,
      giltig_till: computedGiltigTill,
      skapad_av: formPerson,
    });
    await fetchUtbildningar();
    setSaving(false);
    setFormAnnanNamn('');
  };

  const handleDelete = async (id: string) => {
    await supabase.from('utbildningar').delete().eq('id', id);
    await fetchUtbildningar();
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      // skip header
      const rows: CsvRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map(s => s.trim());
        if (parts.length >= 4) {
          rows.push({
            namn: parts[0],
            utbildning: parts[1],
            datum_genomford: parts[2],
            giltig_till: parts[3],
          });
        }
      }
      setCsvRows(rows);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!csvRows) return;
    setImporting(true);
    const inserts = csvRows.map(r => ({
      user_id: r.namn,
      namn: r.utbildning,
      datum_genomford: r.datum_genomford,
      giltig_till: r.giltig_till || null,
      skapad_av: 'CSV-import',
    }));
    await supabase.from('utbildningar').insert(inserts);
    await fetchUtbildningar();
    setCsvRows(null);
    setImporting(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  // PDF upload and parse
  const handlePdfSelect = async (file: File) => {
    setPdfFile(file);
    setPdfError(null);
    setPdfResult(null);
    setPdfParsing(true);

    try {
      const buffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      const res = await fetch('/api/parse-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mediaType: 'application/pdf' }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Kunde inte läsa PDF');
      }

      const data = await res.json();
      setPdfResult({
        namn: data.namn || '',
        datum: data.datum || new Date().toISOString().split('T')[0],
        kurs: data.kurs || '',
      });

      // Try to match a predefined utbildning for default giltighet
      const match = PREDEFINED_UTBILDNINGAR.find(u =>
        data.kurs && u.namn.toLowerCase().includes(data.kurs.toLowerCase())
      );
      setPdfGiltighet(match ? match.giltighetÅr : 1);
    } catch (err: any) {
      setPdfError(err.message || 'Fel vid avläsning');
    }
    setPdfParsing(false);
  };

  const handlePdfSave = async () => {
    if (!pdfResult || !pdfFile) return;
    setPdfSaving(true);

    // Upload PDF to Supabase Storage
    const fileName = `${Date.now()}_${pdfFile.name}`;
    const { data: uploadData } = await supabase.storage
      .from('utbildningsbevis')
      .upload(fileName, pdfFile, { contentType: 'application/pdf' });

    const pdfUrl = uploadData?.path
      ? supabase.storage.from('utbildningsbevis').getPublicUrl(uploadData.path).data.publicUrl
      : null;

    const giltigTill = pdfGiltighet !== null ? addYears(pdfResult.datum, pdfGiltighet) : null;

    await supabase.from('utbildningar').insert({
      user_id: valdAnvändare,
      namn: pdfResult.kurs,
      datum_genomford: pdfResult.datum,
      giltig_till: giltigTill,
      skapad_av: valdAnvändare,
      status: 'pending',
      pdf_url: pdfUrl,
      inskickad_av: valdAnvändare,
    });

    await fetchUtbildningar();
    setPdfSaving(false);
    setShowPdfModal(false);
    setPdfFile(null);
    setPdfResult(null);
  };

  const handleApprove = async (id: string) => {
    await supabase.from('utbildningar').update({ status: 'approved', godkand_av: 'Chef' }).eq('id', id);
    await fetchUtbildningar();
  };

  const handleReject = async (id: string) => {
    await supabase.from('utbildningar').update({ status: 'rejected', godkand_av: 'Chef' }).eq('id', id);
    await fetchUtbildningar();
  };

  // Derived data
  const minaUtbildningar = utbildningar.filter(u => u.user_id === valdAnvändare && u.status !== 'rejected');
  const pendingUtbildningar = utbildningar.filter(u => u.status === 'pending');

  const allUtbildningsNamn = [...new Set(approvedUtbildningar.map(u => u.namn))];
  const approvedUtbildningar = utbildningar.filter(u => u.status === 'approved');
  const utgångna = approvedUtbildningar.filter(u => u.giltig_till && daysUntil(u.giltig_till)! < 0);
  const snartUtgående = approvedUtbildningar.filter(u => {
    if (!u.giltig_till) return false;
    const d = daysUntil(u.giltig_till)!;
    return d >= 0 && d <= 90;
  });

  const inputStyle: React.CSSProperties = {
    background: 'rgba(118,118,128,0.18)',
    borderRadius: 10,
    border: `1px solid ${C.border}`,
    color: C.t1,
    padding: '10px 14px',
    fontSize: 15,
    fontFamily: ff,
    outline: 'none',
    width: '100%',
    colorScheme: 'dark',
  };

  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 18px',
    borderRadius: 10,
    border: 'none',
    background: active ? C.accent : C.surface3,
    color: active ? '#fff' : C.t2,
    fontFamily: ff,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  });

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'mina', label: 'Mina utbildningar' },
    { key: 'översikt', label: 'Översikt' },
    { key: 'hantera', label: 'Hantera' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: ff, color: C.t1 }}>
      {/* Header */}
      <div style={{ padding: '16px 20px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
        <a href="/" style={{ color: C.t3, textDecoration: 'none', fontSize: 22 }}>&#8592;</a>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Utbildningar</h1>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, margin: '12px 20px 0' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              flex: 1,
              padding: '12px 0',
              background: 'none',
              border: 'none',
              borderBottom: tab === t.key ? `2px solid ${C.accent}` : '2px solid transparent',
              color: tab === t.key ? C.t1 : C.t3,
              fontFamily: ff,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '16px 20px 100px' }}>
        {loading && <p style={{ color: C.t3 }}>Laddar...</p>}

        {/* ===== TAB: MINA UTBILDNINGAR ===== */}
        {tab === 'mina' && !loading && (
          <>
            {/* Person pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {ANSTÄLLDA.map(name => (
                <button
                  key={name}
                  onClick={() => setValdAnvändare(name)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 20,
                    border: valdAnvändare === name ? `2px solid ${C.accent}` : `1px solid ${C.border}`,
                    background: valdAnvändare === name ? C.blueDim : C.surface,
                    color: valdAnvändare === name ? C.t1 : C.t2,
                    fontFamily: ff,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {name}
                </button>
              ))}
            </div>

            {/* PDF upload button */}
            <button
              onClick={() => { setShowPdfModal(true); setPdfFile(null); setPdfResult(null); setPdfError(null); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                width: '100%', padding: '14px 0', borderRadius: 12, marginBottom: 20,
                background: 'rgba(255,255,255,0.06)', border: `1px dashed ${C.borderStrong}`,
                color: C.t2, fontSize: 14, fontWeight: 600, fontFamily: ff, cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 18 }}>+</span> Ladda upp bevis (PDF)
            </button>

            {/* Pending items */}
            {minaUtbildningar.filter(u => u.status === 'pending').length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.yellow, letterSpacing: 1, marginBottom: 8 }}>VÄNTAR PÅ GODKÄNNANDE</div>
                {minaUtbildningar.filter(u => u.status === 'pending').map(u => (
                  <div key={u.id} style={{
                    background: C.surface, border: `1px solid ${C.border}`, borderLeft: `4px solid ${C.yellow}`,
                    borderRadius: 12, padding: '14px 18px', marginBottom: 8,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>{u.namn}</div>
                      <div style={{ fontSize: 12, color: C.t3 }}>Genomförd: {formatDate(u.datum_genomford)}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: C.yellow, padding: '3px 10px', borderRadius: 20, background: C.yellowDim }}>Väntar</span>
                  </div>
                ))}
              </div>
            )}

            {minaUtbildningar.filter(u => u.status === 'approved').length === 0 && minaUtbildningar.filter(u => u.status === 'pending').length === 0 && (
              <p style={{ color: C.t3, textAlign: 'center', marginTop: 40 }}>
                Inga utbildningar registrerade för {valdAnvändare}
              </p>
            )}

            {minaUtbildningar.filter(u => u.status === 'approved').map(u => {
              const color = statusColor(u.giltig_till);
              const label = statusLabel(u.giltig_till);
              const expired = u.giltig_till && daysUntil(u.giltig_till)! < 0;
              return (
                <div
                  key={u.id}
                  style={{
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                    borderLeft: `4px solid ${color}`,
                    borderRadius: 12,
                    padding: '16px 18px',
                    marginBottom: 12,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{u.namn}</div>
                    <div style={{ fontSize: 13, color: C.t3 }}>
                      Genomförd: {formatDate(u.datum_genomford)}
                    </div>
                    <div style={{ fontSize: 13, color: C.t3 }}>
                      Giltig t.o.m.: {u.giltig_till ? formatDate(u.giltig_till) : 'Ingen utgångsdatum'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color,
                      padding: '4px 10px',
                      borderRadius: 8,
                      background: expired ? C.redDim : color === C.yellow ? C.yellowDim : C.greenDim,
                    }}>
                      {label}
                    </div>
                    <button
                      onClick={() => handleDelete(u.id)}
                      style={{
                        marginTop: 8,
                        background: 'none',
                        border: 'none',
                        color: C.t4,
                        fontSize: 12,
                        cursor: 'pointer',
                        fontFamily: ff,
                      }}
                    >
                      Ta bort
                    </button>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* PDF Upload Modal */}
        {showPdfModal && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 5000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <div onClick={() => setShowPdfModal(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
            <div style={{
              position: 'relative', width: '100%', maxWidth: 480,
              background: C.surface, borderRadius: '20px 20px 0 0', padding: '24px 20px 32px',
              maxHeight: '85vh', overflowY: 'auto',
            }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: C.t4, margin: '0 auto 20px' }} />
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px', color: C.t1 }}>Ladda upp bevis</h2>

              {/* Drop zone */}
              {!pdfResult && !pdfParsing && (
                <div
                  onDragOver={e => { e.preventDefault(); setPdfDragging(true); }}
                  onDragLeave={() => setPdfDragging(false)}
                  onDrop={e => { e.preventDefault(); setPdfDragging(false); const f = e.dataTransfer.files[0]; if (f) handlePdfSelect(f); }}
                  onClick={() => pdfInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${pdfDragging ? C.accent : C.borderStrong}`,
                    borderRadius: 14, padding: '40px 20px', textAlign: 'center',
                    cursor: 'pointer', background: pdfDragging ? C.blueDim : 'transparent',
                    transition: 'all 0.2s', marginBottom: 16,
                  }}
                >
                  <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
                  <div style={{ fontSize: 14, color: C.t2, fontWeight: 500 }}>Dra och släpp PDF här</div>
                  <div style={{ fontSize: 12, color: C.t3, marginTop: 4 }}>eller klicka för att välja fil</div>
                  <input ref={pdfInputRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfSelect(f); }} />
                </div>
              )}

              {/* Loading */}
              {pdfParsing && (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <div style={{ fontSize: 32, marginBottom: 12, animation: 'spin 1s linear infinite' }}>🔄</div>
                  <div style={{ fontSize: 14, color: C.t2 }}>Claude läser av beviset...</div>
                  <div style={{ fontSize: 12, color: C.t3, marginTop: 4 }}>{pdfFile?.name}</div>
                  <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                </div>
              )}

              {/* Error */}
              {pdfError && (
                <div style={{ background: C.redDim, border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
                  <span style={{ fontSize: 13, color: C.red }}>{pdfError}</span>
                  <button onClick={() => { setPdfError(null); setPdfFile(null); }} style={{ display: 'block', marginTop: 8, background: 'none', border: 'none', color: C.t2, fontSize: 13, cursor: 'pointer', fontFamily: ff }}>Försök igen</button>
                </div>
              )}

              {/* Parsed result form */}
              {pdfResult && (
                <>
                  <div style={{ background: C.greenDim, borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>✓</span>
                    <span style={{ fontSize: 13, color: C.green, fontWeight: 500 }}>Avläsning klar — kontrollera uppgifterna</span>
                  </div>

                  <label style={{ fontSize: 12, color: C.t3, display: 'block', marginBottom: 4 }}>Person</label>
                  <input type="text" value={valdAnvändare} readOnly style={{ ...inputStyle, marginBottom: 12, opacity: 0.6 }} />

                  <label style={{ fontSize: 12, color: C.t3, display: 'block', marginBottom: 4 }}>Kursnamn</label>
                  <input type="text" value={pdfResult.kurs} onChange={e => setPdfResult({ ...pdfResult, kurs: e.target.value })} style={{ ...inputStyle, marginBottom: 12 }} />

                  <label style={{ fontSize: 12, color: C.t3, display: 'block', marginBottom: 4 }}>Datum genomfört</label>
                  <input type="date" value={pdfResult.datum} onChange={e => setPdfResult({ ...pdfResult, datum: e.target.value })} style={{ ...inputStyle, marginBottom: 12 }} />

                  <label style={{ fontSize: 12, color: C.t3, display: 'block', marginBottom: 6 }}>Giltighetstid</label>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                    {[1, 2, 3, 5].map(y => (
                      <button key={y} onClick={() => setPdfGiltighet(y)} style={btnStyle(pdfGiltighet === y)}>{y} år</button>
                    ))}
                    <button onClick={() => setPdfGiltighet(null)} style={btnStyle(pdfGiltighet === null)}>Ingen</button>
                  </div>

                  <div style={{ fontSize: 13, color: C.t3, padding: '8px 14px', background: C.surface3, borderRadius: 8, marginBottom: 16 }}>
                    Giltig t.o.m.: {pdfGiltighet !== null ? formatDate(addYears(pdfResult.datum, pdfGiltighet)) : 'Ingen utgångsdatum'}
                  </div>

                  <button
                    onClick={handlePdfSave}
                    disabled={pdfSaving || !pdfResult.kurs.trim()}
                    style={{
                      width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
                      background: C.accent, color: '#fff', fontSize: 15, fontWeight: 700,
                      fontFamily: ff, cursor: 'pointer', opacity: (pdfSaving || !pdfResult.kurs.trim()) ? 0.5 : 1,
                    }}
                  >
                    {pdfSaving ? 'Skickar...' : 'Skicka in för godkännande'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ===== TAB: ÖVERSIKT ===== */}
        {tab === 'översikt' && !loading && (
          <>
            {/* Summary bar */}
            <div style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: '14px 18px',
              marginBottom: 16,
              display: 'flex',
              gap: 20,
              flexWrap: 'wrap',
            }}>
              <span style={{ color: C.red, fontWeight: 600, fontSize: 14 }}>
                {utgångna.length} utbildningar utgångna
              </span>
              <span style={{ color: C.t4 }}>·</span>
              <span style={{ color: C.yellow, fontWeight: 600, fontSize: 14 }}>
                {snartUtgående.length} går ut inom 3 mån
              </span>
            </div>

            {/* Filter buttons */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {([['alla', 'Alla'], ['utgångna', 'Utgångna'], ['snart', 'Snart utgående']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setFilter(key)} style={btnStyle(filter === key)}>
                  {label}
                </button>
              ))}
            </div>

            {/* Matrix table */}
            <div style={{ overflowX: 'auto', borderRadius: 12, border: `1px solid ${C.border}` }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: allUtbildningsNamn.length * 120 }}>
                <thead>
                  <tr>
                    <th style={{
                      position: 'sticky', left: 0, background: C.surface3, padding: '12px 14px',
                      textAlign: 'left', fontSize: 13, color: C.t2, fontFamily: ff, borderBottom: `1px solid ${C.border}`,
                      zIndex: 2, minWidth: 100,
                    }}>
                      Person
                    </th>
                    {allUtbildningsNamn.map(namn => (
                      <th key={namn} style={{
                        padding: '12px 10px', textAlign: 'center', fontSize: 12, color: C.t3,
                        fontFamily: ff, borderBottom: `1px solid ${C.border}`, background: C.surface3,
                        whiteSpace: 'nowrap', minWidth: 100,
                      }}>
                        {namn}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ANSTÄLLDA.map(person => {
                    const personUtb = approvedUtbildningar.filter(u => u.user_id === person);
                    // Filter logic
                    if (filter === 'utgångna') {
                      const hasExpired = personUtb.some(u => u.giltig_till && daysUntil(u.giltig_till)! < 0);
                      if (!hasExpired) return null;
                    }
                    if (filter === 'snart') {
                      const hasSoon = personUtb.some(u => {
                        if (!u.giltig_till) return false;
                        const d = daysUntil(u.giltig_till)!;
                        return d >= 0 && d <= 90;
                      });
                      if (!hasSoon) return null;
                    }

                    return (
                      <tr key={person}>
                        <td style={{
                          position: 'sticky', left: 0, background: C.surface, padding: '12px 14px',
                          fontSize: 14, fontWeight: 600, fontFamily: ff, borderBottom: `1px solid ${C.border}`,
                          zIndex: 1,
                        }}>
                          {person}
                        </td>
                        {allUtbildningsNamn.map(namn => {
                          const match = personUtb.find(u => u.namn === namn);
                          let symbol = '—';
                          let symbolColor = C.t4;
                          if (match) {
                            const color = statusColor(match.giltig_till);
                            if (color === C.green) { symbol = '✓'; symbolColor = C.green; }
                            else if (color === C.yellow) { symbol = '⚠'; symbolColor = C.yellow; }
                            else { symbol = '✗'; symbolColor = C.red; }
                          }
                          return (
                            <td key={namn} style={{
                              padding: '12px 10px', textAlign: 'center', fontSize: 18,
                              borderBottom: `1px solid ${C.border}`, background: C.surface,
                            }}>
                              <span style={{ color: symbolColor }}>{symbol}</span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {allUtbildningsNamn.length === 0 && (
              <p style={{ color: C.t3, textAlign: 'center', marginTop: 40 }}>
                Inga utbildningar registrerade ännu
              </p>
            )}
          </>
        )}

        {/* ===== TAB: HANTERA ===== */}
        {tab === 'hantera' && (
          <>
            {/* Section: Pending approvals */}
            {pendingUtbildningar.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: C.yellow, letterSpacing: 1, margin: '0 0 12px' }}>
                  VÄNTANDE BEVIS ({pendingUtbildningar.length})
                </h3>
                {pendingUtbildningar.map(u => (
                  <div key={u.id} style={{
                    background: C.surface, border: `1px solid ${C.border}`, borderLeft: `4px solid ${C.yellow}`,
                    borderRadius: 12, padding: '14px 18px', marginBottom: 10,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>{u.user_id}</div>
                        <div style={{ fontSize: 14, color: C.t2, marginBottom: 2 }}>{u.namn}</div>
                        <div style={{ fontSize: 12, color: C.t3 }}>
                          Genomförd: {formatDate(u.datum_genomford)} · Giltig t.o.m.: {u.giltig_till ? formatDate(u.giltig_till) : 'Ingen'}
                        </div>
                      </div>
                      {u.pdf_url && (
                        <a href={u.pdf_url} target="_blank" rel="noopener noreferrer" style={{
                          fontSize: 12, color: C.accent, fontWeight: 500, textDecoration: 'none', flexShrink: 0,
                        }}>
                          Visa PDF
                        </a>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => handleApprove(u.id)} style={{
                        flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
                        background: C.green, color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: ff, cursor: 'pointer',
                      }}>
                        Godkänn
                      </button>
                      <button onClick={() => handleReject(u.id)} style={{
                        flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
                        background: C.surface3, color: C.t2, fontSize: 13, fontWeight: 600, fontFamily: ff, cursor: 'pointer',
                      }}>
                        Neka
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Section: Add */}
            <div style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: '20px 18px',
              marginBottom: 24,
            }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: C.t3, letterSpacing: 1, marginTop: 0, marginBottom: 16 }}>
                LÄGG TILL UTBILDNING
              </h3>

              {/* Person */}
              <label style={{ fontSize: 13, color: C.t3, display: 'block', marginBottom: 6 }}>Person</label>
              <select
                value={formPerson}
                onChange={e => setFormPerson(e.target.value)}
                style={{ ...inputStyle, marginBottom: 14 }}
              >
                {ANSTÄLLDA.map(n => <option key={n} value={n}>{n}</option>)}
              </select>

              {/* Utbildning */}
              <label style={{ fontSize: 13, color: C.t3, display: 'block', marginBottom: 6 }}>Utbildning</label>
              <select
                value={formUtbildning}
                onChange={e => setFormUtbildning(e.target.value)}
                style={{ ...inputStyle, marginBottom: formUtbildning === 'Annan' ? 8 : 14 }}
              >
                {PREDEFINED_UTBILDNINGAR.map(u => (
                  <option key={u.namn} value={u.namn}>{u.namn}</option>
                ))}
                <option value="Annan">Annan...</option>
              </select>

              {formUtbildning === 'Annan' && (
                <input
                  type="text"
                  placeholder="Namn på utbildning"
                  value={formAnnanNamn}
                  onChange={e => setFormAnnanNamn(e.target.value)}
                  style={{ ...inputStyle, marginBottom: 14 }}
                />
              )}

              {/* Datum genomförd */}
              <label style={{ fontSize: 13, color: C.t3, display: 'block', marginBottom: 6 }}>Datum genomförd</label>
              <input
                type="date"
                value={formDatum}
                onChange={e => setFormDatum(e.target.value)}
                style={{ ...inputStyle, marginBottom: 14 }}
              />

              {/* Giltighetstid */}
              <label style={{ fontSize: 13, color: C.t3, display: 'block', marginBottom: 8 }}>Giltighetstid</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                {[1, 2, 3, 5].map(y => (
                  <button
                    key={y}
                    onClick={() => setFormGiltighet(y)}
                    style={btnStyle(formGiltighet === y)}
                  >
                    {y} år
                  </button>
                ))}
                <button
                  onClick={() => setFormGiltighet(null)}
                  style={btnStyle(formGiltighet === null)}
                >
                  Ingen
                </button>
              </div>

              {/* Computed giltig t.o.m. */}
              <div style={{
                fontSize: 14, color: C.t2, marginBottom: 18,
                padding: '10px 14px', background: C.surface3, borderRadius: 10,
              }}>
                Giltig t.o.m.: {computedGiltigTill ? formatDate(computedGiltigTill) : 'Ingen utgångsdatum'}
              </div>

              <button
                onClick={handleSave}
                disabled={saving || (formUtbildning === 'Annan' && !formAnnanNamn.trim())}
                style={{
                  width: '100%',
                  padding: '14px 0',
                  borderRadius: 12,
                  border: 'none',
                  background: C.accent,
                  color: '#fff',
                  fontSize: 16,
                  fontWeight: 700,
                  fontFamily: ff,
                  cursor: 'pointer',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? 'Sparar...' : 'Spara utbildning'}
              </button>
            </div>

            {/* Section: CSV Import */}
            <div style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: '20px 18px',
            }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: C.t3, letterSpacing: 1, marginTop: 0, marginBottom: 16 }}>
                IMPORTERA CSV
              </h3>
              <p style={{ fontSize: 13, color: C.t3, marginTop: 0, marginBottom: 12 }}>
                Format: namn,utbildning,datum_genomförd,giltig_till
              </p>

              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                onChange={handleCsvUpload}
                style={{
                  ...inputStyle,
                  padding: '12px 14px',
                  marginBottom: 14,
                }}
              />

              {csvRows && csvRows.length > 0 && (
                <>
                  <div style={{ overflowX: 'auto', marginBottom: 14, borderRadius: 10, border: `1px solid ${C.border}` }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr>
                          {['Namn', 'Utbildning', 'Datum', 'Giltig till'].map(h => (
                            <th key={h} style={{
                              padding: '10px 12px', textAlign: 'left', color: C.t3,
                              borderBottom: `1px solid ${C.border}`, background: C.surface3, fontFamily: ff,
                            }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvRows.map((r, i) => (
                          <tr key={i}>
                            <td style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}`, color: C.t1 }}>{r.namn}</td>
                            <td style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}`, color: C.t1 }}>{r.utbildning}</td>
                            <td style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}`, color: C.t2 }}>{r.datum_genomford}</td>
                            <td style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}`, color: C.t2 }}>{r.giltig_till}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <button
                    onClick={handleImport}
                    disabled={importing}
                    style={{
                      width: '100%',
                      padding: '14px 0',
                      borderRadius: 12,
                      border: 'none',
                      background: C.green,
                      color: '#fff',
                      fontSize: 16,
                      fontWeight: 700,
                      fontFamily: ff,
                      cursor: 'pointer',
                      opacity: importing ? 0.6 : 1,
                    }}
                  >
                    {importing ? 'Importerar...' : `Importera ${csvRows.length} rader`}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
