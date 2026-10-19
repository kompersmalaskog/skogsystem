'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fornyelseText, type Kravtyp, type Medarbetare } from '@/lib/utbildning';
import { AVSTAND, FARG, TYP } from '@/lib/design/tokens';
import Ark from '@/components/design/Ark';
import Sektion from '@/components/design/Sektion';
import { BockRad, PersonChecklist, PrimaryButton, SegmentedControl, inputStyle, FieldLabel } from './ui';

// Lägg till en ny utbildning i katalogen (utbildning_typ).
//
// Samma form som Registrera bevis: `Ark` med Avbryt uppe och EN vit knapp fast
// i foten, rader i stället för staplade versala etiketter, och "gäller alla
// eller vissa" som ett val man SER — inte en brytare vars motsats är osynlig.
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

  const allaEllerInga = (vald: boolean) =>
    setValda(vald ? new Set(medarbetare.map((m) => m.id)) : new Set());

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

  if (!open) return null;

  return (
    <Ark
      rubrik="Ny utbildning"
      onStang={onClose}
      fot={
        <>
          {error && <p style={{ ...TYP.meta, color: FARG.rod, margin: 0 }}>{error}</p>}
          <PrimaryButton onClick={save} disabled={saving || !namn.trim()}>
            {saving ? 'Sparar…' : 'Lägg till utbildning'}
          </PrimaryButton>
        </>
      }
    >
      <FieldLabel>Namn</FieldLabel>
      <input
        value={namn}
        onChange={(e) => setNamn(e.target.value)}
        placeholder="t.ex. YKB"
        style={{ ...inputStyle, marginBottom: AVSTAND.xl }}
        aria-label="Namn"
      />

      <FieldLabel>Kravtyp</FieldLabel>
      <div style={{ marginBottom: AVSTAND.xl }}>
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

      <Sektion
        rubrik="Förnyelse"
        kort={false}
        not={ingenUtgang ? undefined : `Visas som: ${fornyelseText(parseInt(manader, 10) || null)}`}
      >
        <BockRad
          titel="Ingen utgång"
          under="Gäller tills vidare"
          vald={ingenUtgang}
          sista={ingenUtgang}
          onToggle={() => setIngenUtgang((v) => !v)}
        />
        {!ingenUtgang && (
          <div style={{ padding: `${AVSTAND.m}px 0 0` }}>
            <FieldLabel>Giltighet (månader)</FieldLabel>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={manader}
              onChange={(e) => setManader(e.target.value)}
              style={inputStyle}
              aria-label="Giltighet i månader"
            />
          </div>
        )}
      </Sektion>

      <Sektion rubrik="Vem gäller den?" kort={false}>
        <BockRad titel="Alla i företaget" vald={gallerAlla} onToggle={() => setGallerAlla(true)} />
        <BockRad
          titel="Bara vissa"
          vald={!gallerAlla}
          sista={gallerAlla}
          onToggle={() => setGallerAlla(false)}
        />
        {!gallerAlla && (
          <PersonChecklist medarbetare={medarbetare} valda={valda} onToggle={toggle} onAlla={allaEllerInga} />
        )}
      </Sektion>

      <FieldLabel>Beskrivning (valfritt)</FieldLabel>
      <textarea
        value={beskrivning}
        onChange={(e) => setBeskrivning(e.target.value)}
        rows={2}
        style={{ ...inputStyle, resize: 'vertical', marginBottom: AVSTAND.xl }}
        aria-label="Beskrivning"
      />

      <FieldLabel>Anteckning (valfritt)</FieldLabel>
      <textarea
        value={anteckning}
        onChange={(e) => setAnteckning(e.target.value)}
        rows={2}
        style={{ ...inputStyle, resize: 'vertical' }}
        aria-label="Anteckning"
      />
    </Ark>
  );
}
