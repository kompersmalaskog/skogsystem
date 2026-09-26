'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import BottomNav from '@/components/BottomNav';
import ListGroup from '@/components/ListGroup';
import ListRow from '@/components/ListRow';
import SectionHeader from '@/components/SectionHeader';
import { Sheet, ConfirmDialog } from '@/components/Sheet';
import NyUtbildningSheet from '@/components/utbildning/NyUtbildningSheet';
import { UtbHeader, LoadingView, ErrorView, EmptyView, KravtypBadge, PrimaryButton } from '@/components/utbildning/ui';
import {
  T,
  KRAVTYP_ORDNING,
  KRAVTYP_META,
  fornyelseText,
  omfattningText,
  dagManad,
  type UtbildningTyp,
  type Medarbetare,
} from '@/lib/utbildning';

function kravtypRang(t: UtbildningTyp): number {
  const i = KRAVTYP_ORDNING.indexOf(t.kravtyp);
  return i === -1 ? 99 : i;
}

export default function KatalogPage() {
  const [typer, setTyper] = useState<UtbildningTyp[] | null>(null);
  const [medarbetare, setMedarbetare] = useState<Medarbetare[]>([]);
  const [kravAntal, setKravAntal] = useState<Record<string, number>>({});
  const [bevisAntal, setBevisAntal] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [ny, setNy] = useState(false);
  const [vald, setVald] = useState<UtbildningTyp | null>(null);
  const [bekraftaInaktivera, setBekraftaInaktivera] = useState(false);
  const [andrar, setAndrar] = useState(false);
  const [andraFel, setAndraFel] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [typR, medR, kravR, bevisR] = await Promise.all([
      supabase.from('utbildning_typ').select('*').order('namn'),
      supabase.from('medarbetare').select('id, namn, roll, aktiv').eq('aktiv', true).order('namn'),
      supabase.from('utbildning_krav').select('utbildning_typ_id'),
      supabase.from('utbildning_bevis').select('utbildning_typ_id').eq('aktiv', true),
    ]);
    const felet = typR.error || medR.error || kravR.error || bevisR.error;
    if (felet) {
      setError(felet.message);
      setLoading(false);
      return;
    }
    const krav: Record<string, number> = {};
    for (const r of (kravR.data as { utbildning_typ_id: string }[]) ?? []) krav[r.utbildning_typ_id] = (krav[r.utbildning_typ_id] ?? 0) + 1;
    const bevis: Record<string, number> = {};
    for (const r of (bevisR.data as { utbildning_typ_id: string }[]) ?? []) bevis[r.utbildning_typ_id] = (bevis[r.utbildning_typ_id] ?? 0) + 1;
    setKravAntal(krav);
    setBevisAntal(bevis);
    setTyper((typR.data as UtbildningTyp[]) ?? []);
    setMedarbetare((medR.data as Medarbetare[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function settAktiv(typ: UtbildningTyp, aktiv: boolean) {
    setAndrar(true);
    setAndraFel(null);
    const { error: err } = await supabase.from('utbildning_typ').update({ aktiv }).eq('id', typ.id);
    if (err) {
      setAndraFel(err.message);
      setAndrar(false);
      return;
    }
    setAndrar(false);
    setBekraftaInaktivera(false);
    setVald(null);
    load();
  }

  const aktiva = (typer ?? [])
    .filter((t) => t.aktiv)
    .sort((a, b) => kravtypRang(a) - kravtypRang(b) || a.namn.localeCompare(b.namn, 'sv'));
  const inaktiva = (typer ?? []).filter((t) => !t.aktiv);

  function aktivUnderrad(t: UtbildningTyp): string {
    return `${KRAVTYP_META[t.kravtyp].label} · ${fornyelseText(t.giltighet_manader)} · ${omfattningText(t.galler_alla, kravAntal[t.id] ?? 0)}`;
  }

  function inaktivUnderrad(t: UtbildningTyp): string {
    const n = bevisAntal[t.id] ?? 0;
    return `inaktiverad ${dagManad(t.uppdaterad)} · ${n} bevis ${n === 1 ? 'sparat' : 'sparade'}`;
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.t1, fontFamily: T.ff, paddingBottom: 120, marginTop: 'calc(-56px - env(safe-area-inset-top))' }}>
      <UtbHeader
        title="Katalog"
        subtitle={typer ? `${aktiva.length} aktiva utbildningar` : undefined}
        back={{ href: '/utbildning', label: 'Utbildningar' }}
        action={
          <button onClick={() => setNy(true)} aria-label="Ny utbildning" style={{ background: 'none', border: 'none', color: T.blue, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', padding: 4, marginRight: -4 }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 26 }}>add</span>
          </button>
        }
      />

      {loading && <LoadingView />}
      {!loading && error && <ErrorView error={error} onRetry={load} />}

      {!loading && !error && typer && (
        <>
          {typer.length === 0 && <EmptyView text="Katalogen är tom. Tryck + för att lägga till." />}

          {aktiva.length > 0 && (
            <>
              <SectionHeader>Aktiva</SectionHeader>
              <div style={{ padding: '0 16px' }}>
                <ListGroup>
                  {aktiva.map((t) => (
                    <ListRow key={t.id} title={t.namn} subtitle={aktivUnderrad(t)} onClick={() => { setVald(t); setAndraFel(null); }} />
                  ))}
                </ListGroup>
              </div>
            </>
          )}

          {inaktiva.length > 0 && (
            <>
              <SectionHeader>Inaktiva</SectionHeader>
              <div style={{ padding: '0 16px' }}>
                <ListGroup>
                  {inaktiva.map((t) => (
                    <ListRow
                      key={t.id}
                      title={<span style={{ color: T.t2 }}>{t.namn}</span>}
                      subtitle={inaktivUnderrad(t)}
                      onClick={() => { setVald(t); setAndraFel(null); }}
                    />
                  ))}
                </ListGroup>
                <div style={{ fontSize: 13, color: T.t2, padding: '7px 16px 0', fontFamily: T.ff }}>
                  Inaktiverade utbildningar visas inte i listorna, men behåller sina sparade bevis.
                </div>
              </div>
            </>
          )}
        </>
      )}

      <BottomNav />

      {/* Typ-detalj */}
      <Sheet open={!!vald} onClose={() => setVald(null)} title={vald ? vald.namn : ''}>
        {vald && (
          <>
            <ListGroup>
              <ListRow title="Kravtyp" chevron={false} trailing={<KravtypBadge kravtyp={vald.kravtyp} />} />
              <ListRow title="Förnyelse" chevron={false} value={fornyelseText(vald.giltighet_manader)} />
              <ListRow title="Gäller" chevron={false} value={omfattningText(vald.galler_alla, kravAntal[vald.id] ?? 0)} />
            </ListGroup>

            {(vald.beskrivning || vald.anteckning) && (
              <div style={{ padding: '12px 0 0' }}>
                <ListGroup>
                  {vald.beskrivning && <div style={{ padding: '11px 16px', fontSize: 15, color: T.t1 }}>{vald.beskrivning}</div>}
                  {vald.anteckning && <div style={{ padding: '11px 16px', fontSize: 14, color: T.t2 }}>{vald.anteckning}</div>}
                </ListGroup>
              </div>
            )}

            {andraFel && <div style={{ fontSize: 13, color: T.red, margin: '12px 0 0' }}>Kunde inte ändra: {andraFel}</div>}

            <div style={{ padding: '20px 0 0' }}>
              {vald.aktiv ? (
                <PrimaryButton onClick={() => setBekraftaInaktivera(true)} color={T.red} disabled={andrar}>
                  Inaktivera utbildning
                </PrimaryButton>
              ) : (
                <PrimaryButton onClick={() => settAktiv(vald, true)} disabled={andrar}>
                  {andrar ? 'Aktiverar…' : 'Aktivera utbildning'}
                </PrimaryButton>
              )}
            </div>
          </>
        )}
      </Sheet>

      <ConfirmDialog
        open={bekraftaInaktivera}
        title="Inaktivera utbildning?"
        message="Den slutar gälla för alla och döljs från listorna. Du kan aktivera den igen senare."
        confirmLabel="Inaktivera"
        busy={andrar}
        onConfirm={() => vald && settAktiv(vald, false)}
        onCancel={() => setBekraftaInaktivera(false)}
      />

      <NyUtbildningSheet
        open={ny}
        onClose={() => setNy(false)}
        onSaved={() => { setNy(false); load(); }}
        medarbetare={medarbetare}
      />
    </div>
  );
}
