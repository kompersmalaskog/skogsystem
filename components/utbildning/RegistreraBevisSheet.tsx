'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCurrentMedarbetare } from '@/lib/CurrentMedarbetareContext';
import { T, type UtbildningTyp, type Medarbetare } from '@/lib/utbildning';
import { Sheet } from '@/components/Sheet';
import { FieldLabel, inputStyle, Toggle, PrimaryButton, PersonChecklist } from './ui';

const BUCKET = 'utbildningsbevis';

function idag(): string {
  return new Date().toISOString().split('T')[0];
}

// Skärm 6 — registrera ett bevis för en utbildning, för en eller flera personer.
export default function RegistreraBevisSheet({
  open,
  onClose,
  onSaved,
  typer,
  medarbetare,
  forvaldTypId,
  forvaldMedarbetareId,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  typer: UtbildningTyp[];
  medarbetare: Medarbetare[];
  forvaldTypId?: string;
  forvaldMedarbetareId?: string;
}) {
  const { medarbetare: current } = useCurrentMedarbetare();

  const [valTypId, setValTypId] = useState('');
  const [datum, setDatum] = useState(idag());
  const [valda, setValda] = useState<Set<string>>(new Set());
  const [avvikande, setAvvikande] = useState(false);
  const [giltigManuell, setGiltigManuell] = useState('');
  const [anteckning, setAnteckning] = useState('');

  const [pdfName, setPdfName] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Återställ vid varje öppning.
  useEffect(() => {
    if (!open) return;
    setValTypId(forvaldTypId ?? (typer[0]?.id ?? ''));
    setDatum(idag());
    setValda(new Set(forvaldMedarbetareId ? [forvaldMedarbetareId] : []));
    setAvvikande(false);
    setGiltigManuell('');
    setAnteckning('');
    setPdfName(null);
    setPdfUrl(null);
    setPdfError(null);
    setSaveError(null);
  }, [open, forvaldTypId, forvaldMedarbetareId, typer]);

  const toggle = (id: string) =>
    setValda((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  async function handlePdf(file: File) {
    setPdfBusy(true);
    setPdfError(null);
    setPdfName(file.name);
    const buffer = await file.arrayBuffer();
    const base64 = btoa(new Uint8Array(buffer).reduce((d, b) => d + String.fromCharCode(b), ''));

    // 1. Avläsning → förifyll (best-effort, blockerar inte).
    try {
      const res = await fetch('/api/parse-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mediaType: 'application/pdf', typer: typer.map((t) => t.namn) }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d.typ_namn) {
          const t = typer.find((x) => x.namn === d.typ_namn);
          if (t) setValTypId(t.id);
        }
        if (d.datum) setDatum(d.datum);
        if (d.namn) {
          const m = medarbetare.find((x) => (x.namn ?? '').toLowerCase() === String(d.namn).toLowerCase());
          if (m) setValda((prev) => new Set(prev).add(m.id));
        }
      } else {
        const e = await res.json();
        setPdfError(e.error || 'Kunde inte läsa av PDF');
      }
    } catch (e: any) {
      setPdfError(e?.message || 'Kunde inte läsa av PDF');
    }

    // 2. Uppladdning till storage (valfri — fel visas men blockerar inte).
    const fileName = `${Date.now()}_${file.name}`;
    const { data: up, error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, file, { contentType: 'application/pdf' });
    if (upErr) {
      setPdfError(`Kunde inte ladda upp PDF: ${upErr.message}`);
      setPdfUrl(null);
    } else if (up?.path) {
      // Bucketen är privat — spara STORAGE-SÖKVÄGEN, inte en publik URL.
      // Beviset visas via en tillfällig signerad länk (createSignedUrl).
      setPdfUrl(up.path);
    }
    setPdfBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function save() {
    if (!valTypId || valda.size === 0) return;
    setSaving(true);
    setSaveError(null);
    const rows = Array.from(valda).map((mid) => ({
      utbildning_typ_id: valTypId,
      medarbetare_id: mid,
      genomford_datum: datum,
      giltig_till_manuell: avvikande ? giltigManuell || null : null,
      pdf_url: pdfUrl,
      anteckning: anteckning.trim() || null,
      skapad_av: current?.id ?? null,
    }));
    const { error } = await supabase.from('utbildning_bevis').insert(rows);
    if (error) {
      setSaveError(error.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    onSaved();
  }

  const antal = valda.size;

  return (
    <Sheet open={open} onClose={onClose} title="Registrera bevis">
      {/* Utbildning */}
      <FieldLabel>Utbildning</FieldLabel>
      <select value={valTypId} onChange={(e) => setValTypId(e.target.value)} style={{ ...inputStyle, marginBottom: 16 }}>
        {typer.length === 0 && <option value="">Inga utbildningar i katalogen</option>}
        {typer.map((t) => (
          <option key={t.id} value={t.id}>{t.namn}</option>
        ))}
      </select>

      {/* PDF-avläsning */}
      <FieldLabel>Bevis (PDF, valfritt)</FieldLabel>
      <div
        onClick={() => !pdfBusy && fileRef.current?.click()}
        style={{
          border: `1.5px dashed ${T.sep}`,
          borderRadius: 10,
          padding: '14px 16px',
          textAlign: 'center',
          cursor: pdfBusy ? 'default' : 'pointer',
          marginBottom: pdfError ? 8 : 16,
        }}
      >
        {pdfBusy ? (
          <span style={{ fontSize: 14, color: T.t2 }}>Läser av och laddar upp…</span>
        ) : pdfName ? (
          <span style={{ fontSize: 14, color: T.t1 }}>
            📄 {pdfName} {pdfUrl ? '✓' : ''}
          </span>
        ) : (
          <span style={{ fontSize: 14, color: T.t2 }}>Klicka för att välja PDF — fälten förifylls</span>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".pdf"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePdf(f); }}
        />
      </div>
      {pdfError && (
        <div style={{ fontSize: 13, color: T.red, marginBottom: 16 }}>
          {pdfError}
          <button onClick={() => { setPdfError(null); setPdfName(null); setPdfUrl(null); }} style={{ display: 'block', marginTop: 4, background: 'none', border: 'none', color: T.t2, fontSize: 13, cursor: 'pointer', fontFamily: T.ff }}>
            Rensa
          </button>
        </div>
      )}

      {/* Datum */}
      <FieldLabel>Datum genomfört</FieldLabel>
      <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} style={{ ...inputStyle, marginBottom: 16 }} />

      {/* Personer */}
      <FieldLabel>Personer ({antal} valda)</FieldLabel>
      <div style={{ marginBottom: 16 }}>
        <PersonChecklist medarbetare={medarbetare} valda={valda} onToggle={toggle} />
      </div>

      {/* Avvikande giltighet */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: avvikande ? 10 : 16 }}>
        <div>
          <div style={{ fontSize: 16, color: T.t1, fontFamily: T.ff }}>Avvikande giltighetsdatum</div>
          <div style={{ fontSize: 13, color: T.t2, fontFamily: T.ff }}>Sätts bara om utgången avviker från intervallet</div>
        </div>
        <Toggle checked={avvikande} onChange={setAvvikande} />
      </div>
      {avvikande && (
        <input type="date" value={giltigManuell} onChange={(e) => setGiltigManuell(e.target.value)} style={{ ...inputStyle, marginBottom: 16 }} />
      )}

      {/* Anteckning */}
      <FieldLabel>Anteckning (valfritt)</FieldLabel>
      <textarea value={anteckning} onChange={(e) => setAnteckning(e.target.value)} rows={2} style={{ ...inputStyle, marginBottom: 20, resize: 'vertical' }} />

      {saveError && (
        <div style={{ fontSize: 13, color: T.red, marginBottom: 12 }}>Kunde inte spara: {saveError}</div>
      )}

      <PrimaryButton onClick={save} disabled={saving || !valTypId || antal === 0}>
        {saving ? 'Sparar…' : antal <= 1 ? 'Registrera bevis' : `Registrera för ${antal} personer`}
      </PrimaryButton>
    </Sheet>
  );
}
