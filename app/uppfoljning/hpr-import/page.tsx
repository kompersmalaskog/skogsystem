'use client';

/**
 * /uppfoljning/hpr-import — enkel drag-drop-uppladdning av .hpr-filer
 * till fördelningsuppföljningen (etapp 1). Vyn (etapp 2) byggs separat.
 */

import React, { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const V6_GREY = '#8e8e93';
const V6_CARD = '#1c1c1e';
const V6_SEP = 'rgba(255,255,255,0.06)';
const V6_WARN = '#ff9f0a';
const V6_DONE = '#30d158';
const V6_RED = '#ff453a';
const ff = "-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Inter',system-ui,sans-serif";

type ImportResult = {
  status: string;
  error?: string;
  objectKey?: string;
  objectStatus?: string;
  reopened?: boolean;
  validation?: { errors: string[]; warnings: string[]; logCount: number };
  summaries?: {
    product_key: string;
    grade_total_pct: number | null;
    grade_automatic_pct: number | null;
    forced_cut_share_pct: number;
    log_count: number;
    total_volume_m3: number;
  }[];
};

export default function HprImportPage() {
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<{ name: string; res: ImportResult }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const importFiles = useCallback(async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      setBusy(file.name);
      try {
        const fd = new FormData();
        fd.append('file', file);
        const r = await fetch('/api/hpr-import', { method: 'POST', body: fd });
        const res: ImportResult = await r.json().catch(() => ({ status: 'error', error: `HTTP ${r.status}` }));
        setResults((prev) => [{ name: file.name, res }, ...prev]);
      } catch (e: any) {
        setResults((prev) => [{ name: file.name, res: { status: 'error', error: String(e?.message || e) } }, ...prev]);
      }
    }
    setBusy(null);
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#fff', fontFamily: ff, padding: '16px 16px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0 16px' }}>
        <button
          onClick={() => router.push('/uppfoljning')}
          style={{ background: 'none', border: 'none', color: V6_GREY, fontSize: 15, cursor: 'pointer', padding: 4 }}
        >
          ‹ Uppföljning
        </button>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Importera hpr-filer</h1>
      <p style={{ color: V6_GREY, fontSize: 14, margin: '0 0 20px' }}>
        Produktionsfiler från skördaren. Samma fil två gånger är ofarligt — dubbletter hoppas över.
      </p>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) importFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `1.5px dashed ${dragging ? V6_DONE : 'rgba(255,255,255,0.2)'}`,
          borderRadius: 12,
          background: dragging ? 'rgba(48,209,88,0.06)' : V6_CARD,
          padding: '40px 20px',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'border-color 0.15s, background 0.15s',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".hpr"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => { if (e.target.files?.length) importFiles(e.target.files); e.target.value = ''; }}
        />
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
          {busy ? `Importerar ${busy}…` : 'Släpp .hpr-filer här'}
        </div>
        <div style={{ color: V6_GREY, fontSize: 13 }}>
          {busy ? 'Stora filer tar några sekunder' : 'eller tryck för att välja'}
        </div>
      </div>

      {results.map(({ name, res }, i) => {
        const failed = res.status === 'validation_failed' || res.status === 'error' || !!res.error;
        const dup = res.status === 'duplicate';
        return (
          <div key={i} style={{ background: V6_CARD, borderRadius: 12, padding: 14, marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
              <div style={{ fontSize: 13, fontWeight: 600, wordBreak: 'break-all' }}>{name}</div>
              <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', color: failed ? V6_RED : dup ? V6_GREY : V6_DONE }}>
                {failed ? 'Stoppad' : dup ? 'Redan importerad' : 'Importerad'}
              </div>
            </div>

            {res.error && (
              <div style={{ color: V6_RED, fontSize: 13, marginTop: 8 }}>{res.error}</div>
            )}
            {res.validation?.errors?.map((e, j) => (
              <div key={j} style={{ color: V6_RED, fontSize: 13, marginTop: 8 }}>{e}</div>
            ))}
            {res.validation?.warnings?.map((w, j) => (
              <div key={j} style={{ color: V6_WARN, fontSize: 13, marginTop: 8 }}>{w}</div>
            ))}

            {res.status === 'imported' && (
              <div style={{ borderTop: `1px solid ${V6_SEP}`, marginTop: 10, paddingTop: 10, fontSize: 13, color: V6_GREY }}>
                {res.validation?.logCount?.toLocaleString('sv-SE')} stockar
                {res.reopened && ' · objektet öppnades igen'}
                {res.objectStatus === 'completed' && ' · objektet avslutat'}
                {res.summaries?.map((s) => (
                  <div key={s.product_key} style={{ marginTop: 4, color: '#fff' }}>
                    {s.product_key}: {s.grade_total_pct != null ? `${String(s.grade_total_pct).replace('.', ',')} %` : '—'} ·{' '}
                    {Math.round(s.total_volume_m3)} m³
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
