'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCurrentMedarbetare } from '@/lib/CurrentMedarbetareContext';
import { datumMedAr, fornyelseText, type UtbildningTyp, type Medarbetare } from '@/lib/utbildning';
import { AVSTAND, FARG, IKON, TYP } from '@/lib/design/tokens';
import Ark from '@/components/design/Ark';
import Sektion from '@/components/design/Sektion';
import Ikon from '@/components/design/Ikon';
import { Rad, BockRad, FallUtYta, PersonChecklist, PrimaryButton, Toggle, inputStyle, FieldLabel } from './ui';

const BUCKET = 'utbildningsbevis';

function idag(): string {
  return new Date().toISOString().split('T')[0];
}

type Vy = 'form' | 'utbildning' | 'datum';

// Registrera ett bevis för en utbildning, för en eller flera personer.
//
// Formen är appens: ett `Ark` (grepp, rubrik vänster, Avbryt höger, innehållet
// scrollar, EN vit knapp FAST i foten). Utbildning och datum är rader med
// chevron som öppnar sin egen väljare i SAMMA ark — inga <select>, inga
// versala etiketter staplade på varandra. PDF-avläsningen ligger FÖRST, för
// den fyller i allt det andra. Antalet valda står på knappen i foten, aldrig
// gömt i en etikett ("PERSONER (0 VALDA)").
//
// Blått finns inte här: en knapp som skapar data är aldrig blå, och gamla
// arkets blå "Klar" uppe till höger (som stängde UTAN att spara) är borta.
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

  const [vy, setVy] = useState<Vy>('form');
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
    setVy('form');
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

  const allaEllerInga = (vald: boolean) =>
    setValda(vald ? new Set(medarbetare.map((m) => m.id)) : new Set());

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

  if (!open) return null;

  const antal = valda.size;
  const valdTyp = typer.find((t) => t.id === valTypId) ?? null;

  // Väljarna är egna vyer i SAMMA ark — Avbryt/Esc/tryck utanför tar tillbaka
  // till formuläret i stället för att kasta allt man fyllt i.
  if (vy === 'utbildning') {
    return (
      <Ark rubrik="Välj utbildning" onStang={() => setVy('form')}>
        {typer.length === 0 ? (
          <p style={{ ...TYP.text, color: FARG.text2, margin: `${AVSTAND.m}px 0` }}>
            Katalogen är tom. Lägg till en utbildning under Katalog först.
          </p>
        ) : (
          <Sektion rubrik="Utbildningar" kort={false}>
            {typer.map((t, i) => (
              <BockRad
                key={t.id}
                titel={t.namn}
                under={fornyelseText(t.giltighet_manader)}
                vald={t.id === valTypId}
                sista={i === typer.length - 1}
                onToggle={() => { setValTypId(t.id); setVy('form'); }}
              />
            ))}
          </Sektion>
        )}
      </Ark>
    );
  }

  if (vy === 'datum') {
    return (
      <Ark
        rubrik="Datum genomfört"
        onStang={() => setVy('form')}
        fot={<PrimaryButton onClick={() => setVy('form')}>Klar</PrimaryButton>}
      >
        <Sektion rubrik="Snabbval" kort={false}>
          <BockRad titel="I dag" vald={datum === idag()} sista onToggle={() => setDatum(idag())} />
        </Sektion>
        <FieldLabel>Annat datum</FieldLabel>
        <input
          type="date"
          value={datum}
          max={idag()}
          onChange={(e) => setDatum(e.target.value)}
          style={inputStyle}
          aria-label="Datum genomfört"
        />
      </Ark>
    );
  }

  return (
    <Ark
      rubrik="Registrera bevis"
      onStang={onClose}
      fot={
        <>
          {saveError && (
            <p style={{ ...TYP.meta, color: FARG.rod, margin: 0 }}>Kunde inte spara: {saveError}</p>
          )}
          <PrimaryButton onClick={save} disabled={saving || !valTypId || antal === 0}>
            {saving ? 'Sparar…' : antal <= 1 ? 'Registrera bevis' : `Registrera för ${antal} personer`}
          </PrimaryButton>
        </>
      }
    >
      {/* PDF:en först — den fyller i utbildning, datum och person åt dig. */}
      <Sektion
        rubrik="Beviset"
        kort={false}
        not={pdfError ? undefined : 'En PDF fyller i utbildning, datum och person åt dig.'}
      >
        <Rad
          titel={pdfBusy ? 'Läser av och laddar upp…' : pdfName ? 'Bevis (PDF)' : 'Läs av bevis (PDF)'}
          under={pdfName ?? undefined}
          onClick={() => { if (!pdfBusy) fileRef.current?.click(); }}
          varde={
            pdfUrl ? <Ikon namn="check_circle" storlek={IKON.rad} farg={FARG.text} /> : pdfBusy ? undefined : 'Valfritt'
          }
        />
        <Rad
          titel="Utbildning"
          varde={valdTyp ? valdTyp.namn : 'Katalogen är tom'}
          vardeFarg={valdTyp ? FARG.text : FARG.rod}
          onClick={() => setVy('utbildning')}
        />
        <Rad titel="Datum genomfört" varde={datumMedAr(datum)} sista onClick={() => setVy('datum')} />
        <input
          ref={fileRef}
          type="file"
          accept=".pdf"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePdf(f); }}
        />
      </Sektion>

      {pdfError && (
        <p style={{ ...TYP.meta, color: FARG.rod, margin: `0 ${AVSTAND.xs}px ${AVSTAND.xl}px` }}>
          {pdfError}{' '}
          <button
            type="button"
            onClick={() => { setPdfError(null); setPdfName(null); setPdfUrl(null); }}
            style={{ background: 'none', border: 'none', color: FARG.text2, ...TYP.meta, cursor: 'pointer', fontFamily: 'inherit', padding: 0, textDecoration: 'underline' }}
          >
            Rensa
          </button>
        </p>
      )}

      <Sektion rubrik="Vem har gått den?" kort={false}>
        <PersonChecklist medarbetare={medarbetare} valda={valda} onToggle={toggle} onAlla={allaEllerInga} />
      </Sektion>

      {/* Det som bara rör ett fåtal bevis ligger undan, som "i ordning" gör på sidorna. */}
      <Sektion rubrik="Mer" kort={false}>
        <FallUtYta etikett="Anteckning och avvikande giltighet">
          <FieldLabel>Anteckning</FieldLabel>
          <textarea
            value={anteckning}
            onChange={(e) => setAnteckning(e.target.value)}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical', marginBottom: AVSTAND.l }}
            aria-label="Anteckning"
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.m }}>
            <div>
              <div style={{ ...TYP.text, color: FARG.text }}>Avvikande giltighetsdatum</div>
              <div style={{ ...TYP.meta, color: FARG.text2 }}>Bara om utgången skiljer sig från intervallet</div>
            </div>
            <Toggle checked={avvikande} onChange={setAvvikande} />
          </div>
          {avvikande && (
            <input
              type="date"
              value={giltigManuell}
              onChange={(e) => setGiltigManuell(e.target.value)}
              style={{ ...inputStyle, marginTop: AVSTAND.m }}
              aria-label="Giltig till"
            />
          )}
        </FallUtYta>
      </Sektion>
    </Ark>
  );
}
