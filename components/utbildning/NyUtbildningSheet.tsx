'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { T, type Kravtyp, type Medarbetare } from '@/lib/utbildning';
import { Sheet } from '@/components/Sheet';
import { FieldLabel, inputStyle, SegmentedControl, Toggle, PrimaryButton, PersonChecklist } from './ui';

// Skärm 5 — lägg till en ny utbildning i katalogen (utbildning_typ).
export default function NyUtbildningSheet({
  open,
  onClose,
  onSaved,
  medarbetare,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  medarbetare: Medarbetare[];
}) {
  const [namn, setNamn] = useState('');
  const [kravtyp, setKravtyp] = useState<Kravtyp>('lag');
  const [ingenUtgang, setIngenUtgang] = useState(false);
  const [manader, setManader] = useState('12');
  const [gallerAlla, setGallerAlla] = useState(true);
  const [valda, setValda] = useState<Set<string>>(new Set());
  const [beskrivning, setBeskrivning] = useState('');
  const [anteckning, setAnteckning] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNamn('');
    setKravtyp('lag');
    setIngenUtgang(false);
    setManader('12');
    setGallerAlla(true);
    setValda(new Set());
    setBeskrivning('');
    setAnteckning('');
    setError(null);
  }, [open]);

  const toggle = (id: string) =>
    setValda((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  async function save() {
    if (!namn.trim()) return;
    const giltighet = ingenUtgang ? null : parseInt(manader, 10);
    if (!ingenUtgang && (isNaN(giltighet as number) || (giltighet as number) <= 0)) {
      setError('Ange giltighet i månader, eller välj ingen utgång.');
      return;
    }
    setSaving(true);
    setError(null);

    const { data, error: insErr } = await supabase
      .from('utbildning_typ')
      .insert({
        namn: namn.trim(),
        kravtyp,
        giltighet_manader: giltighet,
        galler_alla: gallerAlla,
        beskrivning: beskrivning.trim() || null,
        anteckning: anteckning.trim() || null,
        aktiv: true,
      })
      .select('id')
      .single();

    if (insErr || !data) {
      setError(insErr?.message || 'Kunde inte spara utbildningen.');
      setSaving(false);
      return;
    }

    if (!gallerAlla && valda.size > 0) {
      const krav = Array.from(valda).map((mid) => ({ utbildning_typ_id: data.id, medarbetare_id: mid }));
      const { error: kravErr } = await supabase.from('utbildning_krav').insert(krav);
      if (kravErr) {
        // Typen skapades men kraven kunde inte kopplas — var ärlig om det.
        setError(`Utbildningen skapades, men vem den gäller kunde inte sparas: ${kravErr.message}`);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    onSaved();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Ny utbildning">
      <FieldLabel>Namn</FieldLabel>
      <input value={namn} onChange={(e) => setNamn(e.target.value)} placeholder="t.ex. YKB" style={{ ...inputStyle, marginBottom: 16 }} />

      <FieldLabel>Kravtyp</FieldLabel>
      <div style={{ marginBottom: 16 }}>
        <SegmentedControl<Kravtyp>
          value={kravtyp}
          onChange={setKravtyp}
          options={[
            { value: 'lag', label: 'Lag' },
            { value: 'certifiering', label: 'Certifiering' },
            { value: 'bestallare', label: 'Beställare' },
          ]}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: ingenUtgang ? 16 : 10 }}>
        <div style={{ fontSize: 16, color: T.t1, fontFamily: T.ff }}>Ingen utgång</div>
        <Toggle checked={ingenUtgang} onChange={setIngenUtgang} />
      </div>
      {!ingenUtgang && (
        <>
          <FieldLabel>Giltighet (månader)</FieldLabel>
          <input type="number" inputMode="numeric" min={1} value={manader} onChange={(e) => setManader(e.target.value)} style={{ ...inputStyle, marginBottom: 16 }} />
        </>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: gallerAlla ? 16 : 10 }}>
        <div>
          <div style={{ fontSize: 16, color: T.t1, fontFamily: T.ff }}>Gäller alla</div>
          <div style={{ fontSize: 13, color: T.t2, fontFamily: T.ff }}>Annars väljer du vilka den gäller</div>
        </div>
        <Toggle checked={gallerAlla} onChange={setGallerAlla} />
      </div>
      {!gallerAlla && (
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Gäller ({valda.size} valda)</FieldLabel>
          <PersonChecklist medarbetare={medarbetare} valda={valda} onToggle={toggle} />
        </div>
      )}

      <FieldLabel>Beskrivning (valfritt)</FieldLabel>
      <textarea value={beskrivning} onChange={(e) => setBeskrivning(e.target.value)} rows={2} style={{ ...inputStyle, marginBottom: 16, resize: 'vertical' }} />

      <FieldLabel>Anteckning (valfritt)</FieldLabel>
      <textarea value={anteckning} onChange={(e) => setAnteckning(e.target.value)} rows={2} style={{ ...inputStyle, marginBottom: 20, resize: 'vertical' }} />

      {error && <div style={{ fontSize: 13, color: T.red, marginBottom: 12 }}>{error}</div>}

      <PrimaryButton onClick={save} disabled={saving || !namn.trim()}>
        {saving ? 'Sparar…' : 'Lägg till utbildning'}
      </PrimaryButton>
    </Sheet>
  );
}
